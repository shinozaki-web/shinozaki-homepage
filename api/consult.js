const SYSTEM_PROMPT = `あなたは篠崎友寿のAI導入支援サイトに設置されたデモAIです。
訪問者が入力した経営・業務の課題に対して、AIを使えばどこまで解決できるかを具体的に示してください。

【回答のルール】
- 日本語で、中小企業の経営者が読んでわかる言葉で書く
- 専門用語・英語・絵文字は使わない
- 構成：①課題を1文で整理 → ②AIでできること3〜4点（箇条書き）→ ③締めの1文
- 各箇条書きは「どんなAI機能を使うか」「業務がどう変わるか」を必ず含める
- 締めの文は必ず「ただし、ツールの選定より"業務への組み込み方"の設計が成否を分けます。」にする
- 全体で350〜400文字に収める`;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { challenge } = req.body || {};
  const text = challenge?.trim();

  if (!text || text.length < 5 || text.length > 400) {
    return res.status(400).json({ error: '課題を5〜400文字で入力してください' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'APIキーが設定されていません' });
  }

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 700,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: `課題：${text}` }],
      }),
    });

    if (!upstream.ok) {
      const err = await upstream.text();
      console.error('Anthropic error:', upstream.status, err);
      return res.status(500).json({ error: `API error: ${upstream.status}` });
    }

    const data = await upstream.json();
    const result = data.content?.[0]?.text ?? '';

    // スプレッドシートに記録（レスポンス前に完了させる）
    const webhookUrl = process.env.SHEETS_WEBHOOK_URL;
    if (webhookUrl) {
      try {
        const r1 = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ challenge: text, result }),
          redirect: 'manual',
        });
        const location = r1.headers.get('location');
        if (location) {
          const redirectUrl = new URL(location);
          const allowed = ['script.google.com', 'script.googleusercontent.com'];
          if (allowed.includes(redirectUrl.hostname) && redirectUrl.protocol === 'https:') {
            await fetch(redirectUrl.toString());
          } else {
            console.error('Sheets redirect blocked:', location);
          }
        }
      } catch (err) {
        console.error('Sheets error:', err);
      }
    }

    return res.status(200).json({ result });

  } catch (err) {
    console.error('Fetch error:', err);
    return res.status(500).json({ error: err.message });
  }
}
