import * as v from 'valibot';
import { buildDiscordMessage, DiscordWebhookError, sendDiscordMessage } from './discord';
import { clefResponseSchema, departmentIds, queueMessageSchema, type RequestType, type QueueMessage } from './types';

export default {
	async fetch(request, env): Promise<Response> {
		const req = await request.json<RequestType>();
		const response = await env.AI.run('@cf/cloudflare/clef', {
			model: 'clef',
			state: req,
			questions: {
				security: {
					type: 'noul',
					instructions: '脅迫、爆破予告、危険物、暴力示唆、迷惑行為、安全管理上の重大な連絡',
				},
				team: {
					type: 'choice',
					instructions: 'どの部署がこの問い合わせを処理しますか？',
					criteria: {
						participantRelations:
							'渉内局。来場者対応、アクセス、開催時間、会場案内、企画内容、および学内の参加団体（模擬店企画・一般企画・研究室企画）からの出展・参加・申込に関する問い合わせ',
						officialEvents:
							'企画局。公式企画「のど自慢・ファッションショー・工大王」への参加申込、出演希望、応募に関する問い合わせ（この3企画のみ）',
						corporateRelations:
							'渉外局企業担当。学外の企業・団体からの問い合わせ全般（協賛、広告掲載、企業連携、営業提案、ブース出展、サービスのPR・告知、後援・受託事業の広報など）',
						mediaRelations: '渉外局企業担当。取材、広報、プレス、メディア掲載に関する問い合わせ',
						localRelations: '渉外局商店街担当。寄付、地域・商店街関係、フリーマーケット、美術作品展に関する問い合わせ',
						lostAndFound: '渉内局。落とし物、忘れ物に関する問い合わせ',
						technical: 'ネットワーク局。Webサイト、フォーム、メール、システムの不具合に関する問い合わせ',
						other: 'どれにも該当しないお問い合せ',
					} satisfies Record<(typeof departmentIds)[number], string>,
				},
			},
		});
		const result = v.parse(clefResponseSchema, response);
		console.log({ req, result });
		const message = {
			departmentId: result.answers.team.choice,
			security: result.answers.security.noul >= 0.5,
			name: req.name,
			email: req.email,
			company_or_group_name: req.company_or_group_name,
			body: req.body,
		} satisfies QueueMessage;
		await env.CONTACT_QUEUE.send(message);

		return new Response('OK');
	},
	async queue(batch, env): Promise<void> {
		for (const queuedMessage of batch.messages) {
			try {
				if (queuedMessage.attempts > 5) {
					await env.CONTACT_DLQ.send(queuedMessage.body);
				} else {
					const message = v.parse(queueMessageSchema, queuedMessage.body);
					const notification = buildDiscordMessage(message, env, {
						receivedAt: queuedMessage.timestamp,
					});
					await sendDiscordMessage(notification, {
						publicUrl: env.DISCORD_PUBLIC_WEBHOOK_URL,
						privateUrl: env.DISCORD_PRIVATE_WEBHOOK_URL,
					});
				}
				queuedMessage.ack();
			} catch (error) {
				const backoffSeconds = Math.min(30 * 2 ** (queuedMessage.attempts - 1), 600);
				const retryAfterSeconds = error instanceof DiscordWebhookError && error.status === 429 ? error.retryAfterSeconds : undefined;
				// Queue delays must be whole seconds and cannot exceed 24 hours.
				const delaySeconds = Math.min(86400, Math.max(1, Math.ceil(retryAfterSeconds ?? backoffSeconds)));
				queuedMessage.retry({ delaySeconds });
			}
		}
	},
} satisfies ExportedHandler<Env>;
