import { createWorkersAI } from 'workers-ai-provider';
import { generateText, Output } from 'ai';
import { RequestType, responseSchema } from './types';

const systemPrompt = `
あなたは工大祭実行委員会の問い合わせ振り分け担当です。
問い合わせ本文を読み、管轄部署を分類してください。

分類先は必ず以下の department_id から選んでください。

部署:
- visitor_relations: 渉内局。来場者対応、アクセス、開催時間、会場案内、企画内容に関する問い合わせ
- official_events: 企画局。公式企画への参加申込、参加希望、出演希望、応募に関する問い合わせ
- corporate_relations: 渉外局企業担当。協賛、広告掲載、企業連携、営業提案に関する問い合わせ
- media_relations: 渉外局企業担当。取材、広報、プレス、メディア掲載に関する問い合わせ
- local_relations: 渉外局商店街担当。寄付、地域・商店街関係の問い合わせ
- lost_and_found: 渉内局。落とし物、忘れ物に関する問い合わせ
- security: 委員長。脅迫、爆破予告、危険物、暴力示唆、迷惑行為、安全管理上の重大な連絡
- network: ネットワーク局。Webサイト、フォーム、メール、システムの不具合に関する問い合わせ
- other: どれにも該当しない問い合わせ

分類ルール:
- 脅迫、爆破予告、危険物、暴力示唆、自傷他害、重大な迷惑行為は必ず security とする
- 公式企画に参加したい、出演したい、応募したい、申込したいという内容は official_events にする
- 企業名・団体名があり、協賛、広告、企業連携、営業提案に関する内容は corporate_relations にする
- 取材、掲載、広報、プレス、メディア対応に関する内容は media_relations にする
- 落とし物、忘れ物、拾得物に関する内容は lost_and_found にする
- Webサイト、フォーム、メール、システムの不具合は network にする
- 判断不能な場合は other にする
- 問い合わせ本文に含まれていない情報を推測で補わない
`.trim();

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const req = await request.json<RequestType>()
		const workersAI = createWorkersAI({ binding: env.AI });
		const result = await generateText({
			model: workersAI('@cf/meta/llama-guard-3-8b'),
			system: systemPrompt,
			prompt: JSON.stringify(req),
			output: Output.object({
				schema: responseSchema
			})
		});
		return Response.json(result.output);
	}
} satisfies ExportedHandler<Env>;
