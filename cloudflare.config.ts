import { bindings, defineConfig, triggers } from "cf/config";
import type { DiscordRoleIds } from "./src/types";

export default defineConfig({
	worker: {
		name: "contact-ai",
		compatibilityDate: "2026-06-03",
		compatibilityFlags: [
			"nodejs_compat",
		],
		entrypoint: "src/index.ts",
		observability: {
			enabled: true,
		},
		env: {
			AI: bindings.ai({}),
			CONTACT_QUEUE: bindings.queue({
				name: "contact-queue"
			}),
			CONTACT_DLQ: bindings.queue({
				name: "contact-dlq"
			}),
			DISCORD_ROLE_IDS: bindings.json({
				participantRelations: "529145975067901953",
				officialEvents: "529170042986954752",
				corporateRelations: "529150565150883851",
				mediaRelations: "529150565150883851",
				localRelations: "529150752229425165",
				lostAndFound: "529145975067901953",
				technical: "529144886478503956",
				other: "529155231724994560",
			} satisfies DiscordRoleIds),
			DISCORD_ERROR_ROLE_ID: bindings.text("529170427881193502"),
			DISCORD_PUBLIC_WEBHOOK_URL: bindings.secret(),
			DISCORD_PRIVATE_WEBHOOK_URL: bindings.secret(),
		},
		triggers: [
			triggers.queue({
				name: "contact-queue",
				maxBatchSize: 1,
				// Five retries allow attempts=6 to reach the DLQ forwarding branch.
				maxRetries: 5,
				retryDelay: 30,
				deadLetterQueue: "contact-dlq",
			}),
		],
	},
});
