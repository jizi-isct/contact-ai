import * as v from 'valibot';
import { discordRateLimitResponseSchema, type DiscordWebhookPayload } from './discordTypes';
import {
	discordContactSchema,
	discordMessageOptionsSchema,
	discordMessageSchema,
	discordRoleEnvSchema,
	discordWebhookConfigSchema,
	type DiscordContact,
	type DiscordMessage,
	type DiscordMessageOptions,
	type DiscordRoleEnv,
	type DiscordWebhookConfig,
} from './types';

export class DiscordWebhookError extends Error {
	constructor(
		readonly status: number,
		readonly retryAfterSeconds?: number,
	) {
		super(`Discord webhook request failed (HTTP ${status}).`);
		this.name = 'DiscordWebhookError';
	}
}

async function getRetryAfterSeconds(response: Response): Promise<number | undefined> {
	const retryAfter = response.headers.get('Retry-After')?.trim();
	if (retryAfter) {
		const seconds = Number(retryAfter);
		if (Number.isFinite(seconds)) {
			if (seconds >= 0) return seconds;
		} else {
			const retryAt = Date.parse(retryAfter);
			if (Number.isFinite(retryAt)) return Math.max(0, (retryAt - Date.now()) / 1000);
		}
	}

	try {
		const result = v.safeParse(discordRateLimitResponseSchema, await response.json());
		return result.success ? result.output.retry_after : undefined;
	} catch {
		return undefined;
	}
}

function truncate(value: string, maxLength: number): string {
	if (value.length <= maxLength) return value;
	// Avoid splitting an emoji's UTF-16 surrogate pair.
	return `${value.slice(0, maxLength - 1).replace(/[\uD800-\uDBFF]$/u, '')}…`;
}

/** Build a notification without sending it. Pass the queue timestamp as receivedAt. */
export function buildDiscordMessage(input: DiscordContact, env: DiscordRoleEnv, options: DiscordMessageOptions = {}): DiscordMessage {
	const contact = v.parse(discordContactSchema, input);
	const config = v.parse(discordMessageOptionsSchema, options);
	const roleEnv = v.parse(discordRoleEnvSchema, env);
	const departmentRoleIds = roleEnv.DISCORD_ROLE_IDS;
	const roleIds = new Map<string, string>(Object.entries(departmentRoleIds));
	const isPrivate = contact.security || contact.departmentId === 'mediaRelations';
	const departmentRoleId = contact.security ? departmentRoleIds.other : (roleIds.get(contact.departmentId) ?? departmentRoleIds.technical);
	const mentionTo = config.error ? roleEnv.DISCORD_ERROR_ROLE_ID : departmentRoleId;
	const receivedAt = config.receivedAt ?? new Date();
	const payload: DiscordWebhookPayload = {
		username: config.username || undefined,
		avatar_url: config.avatarUrl || undefined,
		content: config.error ? `<@&${mentionTo}> 問い合わせの自動振り分けに失敗しました。` : `<@&${mentionTo}>`,
		allowed_mentions: { parse: [], roles: [mentionTo] },
		embeds: [
			{
				title: 'ℹ️ お問い合わせ',
				description: '新しいお問い合わせが届きました',
				color: config.embedColor ?? 0x5865f2,
				timestamp: receivedAt.toISOString(),
				fields: [
					{ name: 'お名前', value: truncate(contact.name.trim() || 'なし', 1024) },
					{ name: '企業・団体名', value: truncate(contact.company_or_group_name?.trim() || 'なし', 1024) },
					{ name: 'ご連絡用メールアドレス', value: truncate(contact.email.trim() || 'なし', 1024) },
					{ name: 'お問い合わせ内容', value: truncate(contact.body.trim() || 'なし', 1024) },
				],
				footer: { text: `受信日時: ${receivedAt.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}` },
			},
		],
	};

	if (!isPrivate) {
		const sender = [contact.company_or_group_name?.trim(), contact.name.trim()].filter(Boolean).join(' ');
		payload.thread_name = truncate(`${sender} からのお問い合わせ`.trim(), 100);
	}

	return v.parse(discordMessageSchema, { isPrivate, payload });
}

/** Public notifications use a forum webhook; private ones use a private text-channel webhook. */
export async function sendDiscordMessage(message: DiscordMessage, webhooks: DiscordWebhookConfig): Promise<void> {
	const config = v.parse(discordWebhookConfigSchema, webhooks);
	const { isPrivate, payload } = v.parse(discordMessageSchema, message);
	const url = new URL(isPrivate ? config.privateUrl : config.publicUrl);
	url.searchParams.set('wait', 'true');
	const response = await fetch(url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(payload),
	});

	if (!response.ok) {
		const retryAfterSeconds = response.status === 429 ? await getRetryAfterSeconds(response) : undefined;
		throw new DiscordWebhookError(response.status, retryAfterSeconds);
	}
}
