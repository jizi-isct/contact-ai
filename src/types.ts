import * as v from 'valibot';
import { discordColorSchema, discordRoleIdSchema, discordWebhookPayloadSchema } from './discordTypes';

export const requestSchema = v.object({
	name: v.string(),
	email: v.string(),
	company_or_group_name: v.optional(v.string()),
	body: v.string(),
});

export type RequestType = v.InferOutput<typeof requestSchema>;

export const departmentIds = [
	'participantRelations',
	'officialEvents',
	'corporateRelations',
	'mediaRelations',
	'localRelations',
	'lostAndFound',
	'technical',
	'other',
] as const;

export const queueMessageSchema = v.object({
	...requestSchema.entries,
	security: v.boolean(),
	departmentId: v.picklist(departmentIds),
});

export type QueueMessage = v.InferOutput<typeof queueMessageSchema>;

export const clefResponseSchema = v.object({
	answers: v.object({
		security: v.object({
			type: v.literal("noul"),
			noul: v.number(),
		}),
		team: v.object({
			type: v.literal('choice'),
			choice: v.picklist(departmentIds),
		}),
	}),
});

export const discordContactSchema = v.object({
	...queueMessageSchema.entries,
	// Unknown departments use the technical team's fallback mention.
	departmentId: v.string(),
});

export type DiscordContact = v.InferOutput<typeof discordContactSchema>;

export const discordRoleIdsSchema = v.object(v.entriesFromList(departmentIds, discordRoleIdSchema));

export type DiscordRoleIds = v.InferOutput<typeof discordRoleIdsSchema>;

export const discordRoleEnvSchema = v.object({
	DISCORD_ROLE_IDS: discordRoleIdsSchema,
	DISCORD_ERROR_ROLE_ID: discordRoleIdSchema,
});

export type DiscordRoleEnv = v.InferOutput<typeof discordRoleEnvSchema>;

export const discordMessageOptionsSchema = v.object({
	embedColor: v.optional(discordColorSchema),
	username: v.optional(v.string()),
	avatarUrl: v.optional(v.string()),
	receivedAt: v.optional(v.date()),
	error: v.optional(v.boolean()),
});

export type DiscordMessageOptions = v.InferOutput<typeof discordMessageOptionsSchema>;

export const discordMessageSchema = v.object({
	isPrivate: v.boolean(),
	payload: discordWebhookPayloadSchema,
});

export type DiscordMessage = v.InferOutput<typeof discordMessageSchema>;

export const discordWebhookConfigSchema = v.object({
	publicUrl: v.pipe(v.string(), v.url()),
	privateUrl: v.pipe(v.string(), v.url()),
});

export type DiscordWebhookConfig = v.InferOutput<typeof discordWebhookConfigSchema>;
