import { bindings, defineConfig } from "cf/config";

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
		},
	},
});
