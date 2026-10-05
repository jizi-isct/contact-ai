import * as v from 'valibot';

export const discordRoleIdSchema = v.pipe(v.string(), v.regex(/^\d+$/));

export const discordColorSchema = v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(0xffffff));

export const discordEmbedSchema = v.object({
	title: v.pipe(v.string(), v.maxLength(256)),
	description: v.pipe(v.string(), v.maxLength(4096)),
	color: discordColorSchema,
	timestamp: v.pipe(v.string(), v.isoTimestamp()),
	fields: v.pipe(
		v.array(
			v.object({
				name: v.pipe(v.string(), v.minLength(1), v.maxLength(256)),
				value: v.pipe(v.string(), v.minLength(1), v.maxLength(1024)),
			}),
		),
		v.maxLength(25),
	),
	footer: v.object({ text: v.pipe(v.string(), v.maxLength(2048)) }),
});

export type DiscordEmbed = v.InferOutput<typeof discordEmbedSchema>;

export const discordWebhookPayloadSchema = v.object({
	username: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(80))),
	avatar_url: v.optional(v.pipe(v.string(), v.url())),
	content: v.pipe(v.string(), v.maxLength(2000)),
	embeds: v.pipe(v.array(discordEmbedSchema), v.minLength(1), v.maxLength(10)),
	allowed_mentions: v.object({
		parse: v.array(v.never()),
		roles: v.array(v.string()),
	}),
	thread_name: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(100))),
});

export type DiscordWebhookPayload = v.InferOutput<typeof discordWebhookPayloadSchema>;

export const discordRateLimitResponseSchema = v.object({
	retry_after: v.pipe(v.number(), v.finite(), v.minValue(0)),
});

export type DiscordRateLimitResponse = v.InferOutput<typeof discordRateLimitResponseSchema>;
