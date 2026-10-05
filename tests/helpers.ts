export async function withMockFetch(implementation: typeof fetch, run: () => Promise<void>): Promise<void> {
	const originalFetch = globalThis.fetch;
	globalThis.fetch = implementation;
	try {
		await run();
	} finally {
		globalThis.fetch = originalFetch;
	}
}
