import { createWorkersAI } from 'workers-ai-provider';
import { generateText, Output } from 'ai';
import { RequestType, responseSchema } from './types';

const systemPrompt = `
あなたは工大祭実行委員会の問い合わせ振り分け担当です。
問い合わせ本文を読み、管轄部署を分類してください。

分類先は必ず以下の department_id から選んでください。

部署:
- visitor_relations: 渉内局。来場者対応、アクセス、開催時間、会場案内、企画内容、および学内の参加団体（模擬店企画・一般企画・研究室企画）からの出展・参加・申込に関する問い合わせ
- official_events: 企画局。公式企画「のど自慢・ファッションショー・工大王」への参加申込、出演希望、応募に関する問い合わせ（この3企画のみ）
- corporate_relations: 渉外局企業担当。学外の企業・団体からの問い合わせ全般（協賛、広告掲載、企業連携、営業提案、ブース出展、サービスのPR・告知、後援・受託事業の広報など）
- media_relations: 渉外局企業担当。取材、広報、プレス、メディア掲載に関する問い合わせ
- local_relations: 渉外局商店街担当。寄付、地域・商店街関係、フリーマーケット、美術作品展に関する問い合わせ
- lost_and_found: 渉内局。落とし物、忘れ物に関する問い合わせ
- security: 委員長。脅迫、爆破予告、危険物、暴力示唆、迷惑行為、安全管理上の重大な連絡
- network: ネットワーク局。Webサイト、フォーム、メール、システムの不具合に関する問い合わせ
- other: どれにも該当しない問い合わせ

分類ルール:
- 脅迫、爆破予告、危険物、暴力示唆、自傷他害、重大な迷惑行為は必ず security とする
- 商店街、町内会、自治会、地域団体など地域・商店街関係の問い合わせは、寄付・出展・連携など目的を問わず local_relations にする
- フリーマーケット、美術作品展は商店街担当が運営する企画であり、参加・出展・申込・応募の希望であっても local_relations にする
- 取材・掲載・広報・プレス・メディア対応に関する内容は、外部の企業・団体からであっても media_relations にする
- 上記（local_relations・media_relations）に該当しない学外の企業・団体（外部組織、行政・行政受託事業者、他団体など）からの問い合わせは、出展・参加・申込・PR・告知・広報などの目的を問わず corporate_relations にする
- official_events は「のど自慢・ファッションショー・工大王」の3企画への参加・出演・応募・申込に関する内容のみとする
- 学内の参加団体（模擬店企画・一般企画・研究室企画）からの出展・参加・申込に関する問い合わせは visitor_relations にする
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
			model: workersAI('@cf/meta/llama-3.3-70b-instruct-fp8-fast'),
			system: systemPrompt,
			prompt: JSON.stringify(req),
			output: Output.object({
				schema: responseSchema
			})
		});
		return Response.json(result.output);
	}
} satisfies ExportedHandler<Env>;
