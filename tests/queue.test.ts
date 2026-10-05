import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as v from 'valibot';
import worker from '../src/index';
import { discordWebhookPayloadSchema } from '../src/discordTypes';
import type { QueueMessage } from '../src/types';
import { contact, env, receivedAt, webhooks } from './fixtures';
import { withMockFetch } from './helpers';

function mockQueue(send: (message: unknown) => Promise<void>): Queue {
	return {
		async send(message) {
			await send(message);
			return { metadata: { metrics: { backlogCount: 1, backlogBytes: 100 } } };
		},
		async sendBatch() {
			assert.fail('Unexpected batch send');
		},
		async metrics() {
			assert.fail('Unexpected queue metrics request');
		},
	};
}

// Other bindings are not used by these queue handler tests.
const queueEnv = {
	...env,
	DISCORD_PUBLIC_WEBHOOK_URL: webhooks.publicUrl,
	DISCORD_PRIVATE_WEBHOOK_URL: webhooks.privateUrl,
	CONTACT_DLQ: mockQueue(async () => {
		assert.fail('Unexpected DLQ send');
	}),
} as Env;

function queueBatch(body: unknown, attempts = 1) {
	const batch = {
		queue: 'contact-queue',
		messages: [
			{
				id: 'message-1',
				timestamp: receivedAt,
				body,
				attempts,
				ack(): void {
					batch.acknowledged++;
				},
				retry(options?: QueueRetryOptions): void {
					batch.retries.push(options ?? {});
				},
			},
		],
		metadata: { metrics: { backlogCount: 1, backlogBytes: 100 } },
		ackAll() {},
		retryAll() {},
		acknowledged: 0,
		retries: [] as QueueRetryOptions[],
	};
	return batch;
}

test('Queue consumerはWebhookのシークレット・部門別の振り分け・キューの受信日時を使用する', async () => {
	const cases: [QueueMessage, string, string, boolean][] = [
		[contact, 'public', env.DISCORD_ROLE_IDS.participantRelations, false],
		[{ ...contact, departmentId: 'mediaRelations' }, 'private', env.DISCORD_ROLE_IDS.mediaRelations, true],
		[{ ...contact, security: true }, 'private', env.DISCORD_ROLE_IDS.other, true],
	];
	for (const [message, destination, roleId, isPrivate] of cases) {
		let calls = 0;
		const batch = queueBatch(message);
		await withMockFetch(
			async (input, init) => {
				calls++;
				assert.equal(new URL(String(input)).pathname, `/api/webhooks/${destination}/test-token`);
				const payload = v.parse(discordWebhookPayloadSchema, JSON.parse(String(init?.body)));
				assert.equal(payload.content, `<@&${roleId}>`);
				assert.equal(payload.embeds[0].timestamp, receivedAt.toISOString());
				assert.equal('thread_name' in payload, !isPrivate);
				return Response.json({ id: 'sent-message' });
			},
			() => worker.queue(batch, queueEnv),
		);
		assert.equal(calls, 1);
		assert.equal(batch.acknowledged, 1);
		assert.deepEqual(batch.retries, []);
	}
});

test('Queue consumerはDiscordへの送信完了を待ってACKし、処理を終了する', async () => {
	const started = Promise.withResolvers<void>();
	const pendingResponse = Promise.withResolvers<Response>();
	const batch = queueBatch(contact);
	await withMockFetch(
		async () => {
			started.resolve();
			return pendingResponse.promise;
		},
		async () => {
			let finished = false;
			const processing = worker.queue(batch, queueEnv).then(() => {
				finished = true;
			});
			await started.promise;
			await Promise.resolve();
			assert.equal(finished, false);
			assert.equal(batch.acknowledged, 0);
			pendingResponse.resolve(Response.json({ id: 'sent-message' }));
			await processing;
			assert.equal(finished, true);
			assert.equal(batch.acknowledged, 1);
		},
	);
});

test('Queue consumerは1〜5回目のHTTP・ネットワークエラーを指数バックオフで再試行する', async () => {
	for (const status of [400, 503, 'network'] as const) {
		for (const attempts of [1, 2, 3, 4, 5]) {
			const batch = queueBatch(contact, attempts);
			let calls = 0;
			await withMockFetch(
				async () => {
					calls++;
					if (status === 'network') throw new Error('Network unavailable');
					return new Response('Unavailable', { status, headers: { 'Retry-After': '100' } });
				},
				() => worker.queue(batch, queueEnv),
			);
			assert.equal(calls, 1);
			assert.equal(batch.acknowledged, 0);
			assert.deepEqual(batch.retries, [{ delaySeconds: 30 * 2 ** (attempts - 1) }]);
		}
	}
});

test('Queue consumerはメッセージが不正またはWebhookのシークレットが未設定の場合、送信せず再試行する', async () => {
	let calls = 0;
	await withMockFetch(
		async () => {
			calls++;
			return Response.json({ id: 'unexpected-message' });
		},
		async () => {
			for (const [body, bindings] of [
				[{ ...contact, departmentId: 'invalid' }, queueEnv],
				[contact, { ...queueEnv, DISCORD_PUBLIC_WEBHOOK_URL: '' }],
				[contact, { ...queueEnv, DISCORD_PRIVATE_WEBHOOK_URL: '' }],
			] as const) {
				const batch = queueBatch(body);
				await worker.queue(batch, bindings);
				assert.equal(batch.acknowledged, 0);
				assert.deepEqual(batch.retries, [{ delaySeconds: 30 }]);
			}
		},
	);
	assert.equal(calls, 0);
});

test('Queue consumerはレート制限ヘッダーを優先し、JSONへのフォールバックと待ち時間の制限を適用する', async () => {
	const cases: [string | undefined, string, number][] = [
		['2.5', '{"retry_after":10}', 3],
		['0', '{"retry_after":10}', 1],
		['90000', '{}', 86400],
		[undefined, '{"retry_after":4.1}', 5],
		['invalid', '{"retry_after":5.1}', 6],
		['-1', '{"retry_after":7.1}', 8],
		['', '{"retry_after":8.1}', 9],
		[undefined, 'not JSON', 60],
		['invalid', '{}', 60],
		[undefined, '{"retry_after":-1}', 60],
		[undefined, '{"retry_after":"5"}', 60],
		[undefined, '{"retry_after":1e400}', 60],
	];
	for (const [retryAfter, body, delaySeconds] of cases) {
		const batch = queueBatch(contact, 2);
		await withMockFetch(
			async () => new Response(body, { status: 429, headers: retryAfter === undefined ? {} : { 'Retry-After': retryAfter } }),
			() => worker.queue(batch, queueEnv),
		);
		assert.equal(batch.acknowledged, 0);
		assert.deepEqual(batch.retries, [{ delaySeconds }]);
	}
});

test('Queue consumerはHTTP日時形式のRetry-Afterヘッダーに対応する', async () => {
	const originalNow = Date.now;
	Date.now = () => receivedAt.getTime();
	try {
		for (const offsetSeconds of [90, -90]) {
			const batch = queueBatch(contact);
			await withMockFetch(
				async () =>
					new Response('', {
						status: 429,
						headers: { 'Retry-After': new Date(receivedAt.getTime() + offsetSeconds * 1000).toUTCString() },
					}),
				() => worker.queue(batch, queueEnv),
			);
			assert.equal(batch.acknowledged, 0);
			assert.deepEqual(batch.retries, [{ delaySeconds: Math.max(1, offsetSeconds) }]);
		}
	} finally {
		Date.now = originalNow;
	}
});

test('Queue consumerは試行回数が5回を超えたメッセージを、不正なものも含めて元の本文のままDLQへ転送する', async () => {
	await withMockFetch(
		async () => {
			throw new Error('Discord must not be called after five attempts');
		},
		async () => {
			for (const body of [contact, { invalid: 'message' }]) {
				const batch = queueBatch(body, 6);
				const sent: unknown[] = [];
				await worker.queue(batch, {
					...queueEnv,
					CONTACT_DLQ: mockQueue(async (message) => {
						sent.push(message);
					}),
				});
				assert.deepEqual(sent, [body]);
				assert.equal(batch.acknowledged, 1);
				assert.deepEqual(batch.retries, []);
			}
		},
	);
});

test('Queue consumerはDLQへの転送成功を待ってACKする', async () => {
	const batch = queueBatch(contact, 6);
	const started = Promise.withResolvers<void>();
	const sent = Promise.withResolvers<void>();
	const processing = worker.queue(batch, {
		...queueEnv,
		CONTACT_DLQ: mockQueue(async () => {
			started.resolve();
			await sent.promise;
		}),
	});
	await started.promise;
	assert.equal(batch.acknowledged, 0);
	sent.resolve();
	await processing;
	assert.equal(batch.acknowledged, 1);
	assert.deepEqual(batch.retries, []);
});

test('Queue consumerはDLQへの転送失敗時に元のメッセージをACKせず再試行する', async () => {
	const batch = queueBatch(contact, 6);
	let calls = 0;
	await worker.queue(batch, {
		...queueEnv,
		CONTACT_DLQ: mockQueue(async () => {
			calls++;
			throw new Error('DLQ unavailable');
		}),
	});
	assert.equal(calls, 1);
	assert.equal(batch.acknowledged, 0);
	assert.deepEqual(batch.retries, [{ delaySeconds: 600 }]);
});
