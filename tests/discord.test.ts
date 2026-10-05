import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as v from 'valibot';
import { buildDiscordMessage, DiscordWebhookError, sendDiscordMessage } from '../src/discord';
import { discordRoleEnvSchema, type QueueMessage } from '../src/types';
import { contact, env, receivedAt, webhooks } from './fixtures';
import { withMockFetch } from './helpers';

const routes: [QueueMessage['departmentId'], string, boolean][] = [
	['participantRelations', '100000000000000001', false],
	['lostAndFound', '100000000000000006', false],
	['officialEvents', '100000000000000002', false],
	['mediaRelations', '100000000000000004', true],
	['corporateRelations', '100000000000000003', false],
	['localRelations', '100000000000000005', false],
	['technical', '100000000000000007', false],
	['other', '100000000000000008', false],
];

for (const [departmentId, roleId, isPrivate] of routes) {
	test(`${departmentId}に環境変数のロールとGASと同じ公開範囲を適用する`, () => {
		const message = buildDiscordMessage({ ...contact, departmentId }, env, { receivedAt });
		assert.equal(message.isPrivate, isPrivate);
		assert.equal(message.payload.content, `<@&${roleId}>`);
		assert.deepEqual(message.payload.allowed_mentions, { parse: [], roles: [roleId] });
		if (isPrivate) {
			assert.equal('thread_name' in message.payload, false);
		} else {
			assert.equal(message.payload.thread_name, 'テスト団体 山田 太郎 からのお問い合わせ');
		}
	});
}

test('送信者名・アバター・受信日時を指定して日本語の埋め込みを組み立てる', () => {
	const { payload } = buildDiscordMessage(contact, env, {
		receivedAt,
		embedColor: 0,
		username: 'お問い合わせ',
		avatarUrl: 'https://example.com/avatar.png',
	});
	assert.equal(payload.username, 'お問い合わせ');
	assert.equal(payload.avatar_url, 'https://example.com/avatar.png');
	assert.deepEqual(payload.embeds, [
		{
			title: 'ℹ️ お問い合わせ',
			description: '新しいお問い合わせが届きました',
			color: 0,
			timestamp: receivedAt.toISOString(),
			fields: [
				{ name: 'お名前', value: contact.name },
				{ name: '企業・団体名', value: contact.company_or_group_name },
				{ name: 'ご連絡用メールアドレス', value: contact.email },
				{ name: 'お問い合わせ内容', value: contact.body },
			],
			footer: { text: '受信日時: 2026/10/5 12:00:00' },
		},
	]);
});

test('セキュリティに関する問い合わせは部門に関係なく担当ロール宛ての非公開通知にする', () => {
	for (const [departmentId] of routes) {
		const message = buildDiscordMessage({ ...contact, departmentId, security: true }, env);
		assert.equal(message.isPrivate, true);
		assert.equal(message.payload.content, '<@&100000000000000008>');
		assert.equal('thread_name' in message.payload, false);
	}
});

test('不明な部門IDにはネットワーク局のロールを使用する', () => {
	for (const departmentId of ['unknown', '__proto__', '']) {
		const message = buildDiscordMessage({ ...contact, departmentId }, env);
		assert.equal(message.payload.content, '<@&100000000000000007>');
	}
});

test('分類失敗時は非公開設定を維持してロールと通知文を上書きする', () => {
	const message = buildDiscordMessage({ ...contact, security: true }, env, { error: true });
	assert.equal(message.payload.content, '<@&100000000000000009> 問い合わせの自動振り分けに失敗しました。');
	assert.deepEqual(message.payload.allowed_mentions.roles, ['100000000000000009']);
	assert.equal(message.isPrivate, true);
	assert.equal('thread_name' in message.payload, false);
});

test('企業・団体名が未指定でも組み立てられ、空の送信者名とアバターは省略する', () => {
	const { payload } = buildDiscordMessage({ ...contact, company_or_group_name: undefined }, env, { username: '', avatarUrl: '' });
	assert.equal(payload.embeds[0].fields[1].value, 'なし');
	assert.equal(payload.thread_name, '山田 太郎 からのお問い合わせ');
	assert.doesNotMatch(payload.thread_name, /false|undefined/);
	const serialized = JSON.parse(JSON.stringify(payload));
	assert.equal('username' in serialized, false);
	assert.equal('avatar_url' in serialized, false);
});

test('空のフィールドを補完し、絵文字を分断せずにフィールドとスレッド名を切り詰める', () => {
	const longText = `${'あ'.repeat(1022)}😀末尾`;
	const { payload } = buildDiscordMessage(
		{
			...contact,
			name: `${'あ'.repeat(98)}😀末尾`,
			company_or_group_name: '',
			email: ' ',
			body: longText,
		},
		env,
	);
	assert.equal(payload.embeds[0].fields[2].value, 'なし');
	const body = payload.embeds[0].fields[3].value;
	assert.ok(body.length <= 1024);
	assert.ok(body.endsWith('…'));
	assert.ok(body.isWellFormed());
	assert.ok(payload.thread_name);
	assert.ok(payload.thread_name.length <= 100);
	assert.ok(payload.thread_name.isWellFormed());
});

test('不正な埋め込み色は送信前に拒否する', () => {
	assert.throws(() => buildDiscordMessage(contact, env, { embedColor: 0x1000000 }));
	assert.throws(() => buildDiscordMessage(contact, env, { embedColor: -1 }));
});

test('ロールIDをキャッシュせず呼び出しごとに渡された環境変数を使用する', () => {
	const nextEnv = { ...env, DISCORD_ROLE_IDS: { ...env.DISCORD_ROLE_IDS, participantRelations: '200000000000000001' } };
	assert.equal(buildDiscordMessage(contact, nextEnv).payload.content, '<@&200000000000000001>');
	assert.equal(buildDiscordMessage(contact, env).payload.content, '<@&100000000000000001>');
});

test('全ての部門のロールを必須とし、不正なIDを拒否する', () => {
	const { technical, ...missingTechnical } = env.DISCORD_ROLE_IDS;
	assert.equal(v.safeParse(discordRoleEnvSchema, { ...env, DISCORD_ROLE_IDS: missingTechnical }).success, false);
	assert.throws(() => buildDiscordMessage(contact, { ...env, DISCORD_ERROR_ROLE_ID: '' }));
	assert.throws(() => buildDiscordMessage(contact, { ...env, DISCORD_ROLE_IDS: { ...env.DISCORD_ROLE_IDS, technical: 'not-a-role-id' } }));
});

test('公開・非公開それぞれのWebhookに送信し、送信完了を確認する', async () => {
	for (const security of [false, true]) {
		const message = buildDiscordMessage({ ...contact, security }, env, { receivedAt });
		let calls = 0;
		await withMockFetch(
			async (input, init) => {
				calls++;
				const url = new URL(String(input));
				assert.equal(url.pathname, `/api/webhooks/${security ? 'private' : 'public'}/test-token`);
				assert.equal(url.searchParams.get('wait'), 'true');
				assert.equal(init?.method, 'POST');
				assert.equal(new Headers(init?.headers).get('Content-Type'), 'application/json');
				assert.equal(init?.body, JSON.stringify(message.payload));
				return Response.json({ id: 'sent-message' });
			},
			() => sendDiscordMessage(message, webhooks),
		);
		assert.equal(calls, 1);
	}
});

test('Webhookの認証情報を出力せずHTTPエラーとネットワークエラーを呼び出し元に伝える', async () => {
	const message = buildDiscordMessage(contact, env);
	for (const status of [400, 429, 500]) {
		await withMockFetch(
			async () => new Response('failure', { status }),
			() => assert.rejects(() => sendDiscordMessage(message, webhooks), new DiscordWebhookError(status)),
		);
	}
	const networkError = new Error('Network unavailable');
	await withMockFetch(
		async () => {
			throw networkError;
		},
		() => assert.rejects(() => sendDiscordMessage(message, webhooks), networkError),
	);
});
