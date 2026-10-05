# contact-ai

## 初期設定

GitHubのRepository secretsに`CLOUDFLARE_API_TOKEN`と`CLOUDFLARE_ACCOUNT_ID`を登録してください。

`CLOUDFLARE_API_TOKEN`は対象アカウント（`CLOUDFLARE_ACCOUNT_ID`）だけに限定し、以下の権限を付与してください。

- Workers：`contact-ai`に対する`Editor`。Workerを新規作成する初回のみ、Workers製品スコープの`Admin`が必要です（[権限の詳細](https://developers.cloudflare.com/workers/authorization/workers/)）。
- Account → Queues → Edit（Read＋Write）：Queue・DLQの作成とconsumerの設定用（[権限の詳細](https://developers.cloudflare.com/queues/configuration/pull-consumers/#create-api-tokens)）。

Discord Webhookは公開用にフォーラムチャンネル、非公開用に非公開テキストチャンネルのものを用意し、URLをWorkerのsecretsに登録してください。
