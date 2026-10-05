import type { DiscordRoleEnv, QueueMessage } from '../src/types';

export const contact: QueueMessage = {
	name: '山田 太郎',
	email: 'taro@example.com',
	company_or_group_name: 'テスト団体',
	body: 'お問い合わせ本文',
	departmentId: 'participantRelations',
	security: false,
};
export const receivedAt = new Date('2026-10-05T03:00:00.000Z');
export const env: DiscordRoleEnv = {
	DISCORD_ROLE_IDS: {
		participantRelations: '100000000000000001',
		officialEvents: '100000000000000002',
		corporateRelations: '100000000000000003',
		mediaRelations: '100000000000000004',
		localRelations: '100000000000000005',
		lostAndFound: '100000000000000006',
		technical: '100000000000000007',
		other: '100000000000000008',
	},
	DISCORD_ERROR_ROLE_ID: '100000000000000009',
};
export const webhooks = {
	publicUrl: 'https://discord.com/api/webhooks/public/test-token?wait=false',
	privateUrl: 'https://discord.com/api/webhooks/private/test-token',
};
