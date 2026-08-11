# Gmail Approval Flow — セットアップガイド

記事テーマをGmailで承認し、Claude AIで記事を自動生成してVercelにデプロイする仕組みです。

---

## 仕組みの全体像

```
① sendApprovalDigest()  → メールで記事候補3件を送信（2週間ごと）
② あなたが返信「2」     → テーマを選ぶ
③ pollApprovalReplies() → 返信を検出して記事生成（5分以内）
④ Claude Sonnet が記事生成 → Google Sheetに保存
⑤ Deploy Hook が起動   → Vercelが再ビルド
⑥ generate-insights.js → INSIGHTS_FEED_URLからデータ取得してHTML生成
⑦ www.moji-lamcompany.com/insights に公開
```

---

## Script Properties の設定値

Google Apps Script の「プロジェクトの設定 → スクリプト プロパティ」に以下を設定します。

| プロパティ名 | 設定値 |
|---|---|
| `OWNER_EMAIL` | `shinozaki@meolabo.com` |
| `SHEET_ID` | Googleスプレッドシートの ID |
| `SHEET_NAME` | `article_approvals` |
| `ANTHROPIC_API_KEY` | Anthropic APIキー |
| `ANTHROPIC_MODEL` | `claude-sonnet-4-6` |
| `FEED_TOKEN` | 任意の長い文字列（Vercel側と同じ値） |
| `DEPLOY_HOOK_URL` | `https://api.vercel.com/v1/integrations/deploy/prj_o5OxFMduA12503TL5f9nPdnQuqnO/96zZn2t98s` |

> **DEPLOY_HOOK_URL は設定済み**  
> 上記のURLをそのままコピーして設定してください。このURLにPOSTするとVercelが自動再ビルドします。

---

## トリガー設定（重要）

「トリガーを追加」から以下の2つを設定します。

| 関数名 | トリガーの種類 | 間隔 |
|---|---|---|
| `sendApprovalDigest` | 時間主導型 → 週タイマー | 月曜日の午前8〜9時 |
| `pollApprovalReplies` | 時間主導型 → 分タイマー | **5分ごと** |

> **`pollApprovalReplies` は5分間隔が重要**  
> 以前は30分間隔の設定でしたが、返信から最大30分待たされていました。  
> 5分間隔にすることで、メール返信後5分以内に記事生成が始まります。

---

## Vercel 環境変数（設定済み）

以下はすでにVercelに設定されています。確認のみ。

| 変数名 | 用途 |
|---|---|
| `INSIGHTS_FEED_URL` | Apps Script の doGet() URL |
| `INSIGHTS_FEED_TOKEN` | フィード認証トークン |
| `ANTHROPIC_API_KEY` | Claude API キー |

---

## 初回セットアップ手順

1. Google Apps Script を新規作成
2. `Code.gs` と `appsscript.json` を貼り付ける
3. Script Properties を上記の表のとおり設定する
4. `setupApprovalSheet()` を1回手動実行してシートを初期化
5. `doGet()` を「ウェブアプリとしてデプロイ」する（アクセスできるユーザー：全員）
6. 発行されたURLをVercelの `INSIGHTS_FEED_URL` に設定（既設定なら確認のみ）
7. トリガーを上記の設定で追加する
8. `sendApprovalDigest()` を1回手動実行してテストメールを確認

---

## 運用手順（毎週）

1. 月曜日の朝にメール「[LAM-ARTICLE-APPROVAL] 次回記事候補」が届く
2. 返信は数字1文字のみ（例：`2`）
3. 5分以内に記事生成が始まり、Vercelが自動デプロイ
4. `www.moji-lamcompany.com/insights` に新記事が公開される

---

## 生成される記事の品質設定

`Code.gs` の `generateArticleDraft_()` 関数で以下を設定済み：

- **モデル**：`claude-sonnet-4-6`（高品質・長文対応）
- **最大トークン**：`4096`（十分な文字量）
- **セクション数**：7〜9個（各3〜5文の具体的な内容）
- **トーン**：IT担当者不在の中小企業経営者・管理職向け、現場目線の実用記事

---

## よくある問題

**Q: 返信したのに記事が生成されない**  
A1: `pollApprovalReplies` のトリガーが5分間隔になっているか確認する  
A2: Script Properties の `SHEET_ID` が正しく設定されているか確認する  
A3: Apps Script の実行ログ（「実行数」タブ）でエラーが出ていないか確認する

**Q: Vercelが再デプロイされない**  
A: `DEPLOY_HOOK_URL` がScript Propertiesに正しく設定されているか確認する

**Q: 記事の内容が薄い**  
A: `ANTHROPIC_MODEL` が `claude-sonnet-4-6` になっているか確認する（claude-haiku は使わない）

---

## DEFAULT_TOPICS の更新

`Code.gs` の `DEFAULT_TOPICS` 配列に記事候補を追加・変更できます。  
slot は `'1'`〜`'3'` の3枠。新テーマに差し替えて保存するだけで次回の候補メールに反映されます。
