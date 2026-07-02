export const config = { runtime: 'edge' };

const SYSTEM_PROMPT = `あなたは篠崎友寿のAI導入支援サイトに設置されたデモAIです。
訪問者が入力した経営・業務の課題に対して、AIを使えばどこまで解決できるかを具体的に示してください。

【回答のルール】
- 日本語で、中小企業の経営者が読んでわかる言葉で書く
- 専門用語・英語・絵文字は使わない
- 構成：①課題を1文で整理 → ②AIでできること3〜4点（箇条書き）→ ③締めの1文
- 各箇条書きは「どんなAI機能を使うか」「業務がどう変わるか」を必ず含める
- 締めの文は必ず「ただし、ツールの選定より"業務への組み込み方"の設計が成否を分けます。」にする
- 全体で350〜400文字に収める`;

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors() });
  }
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  let challenge;
  try {
    const body = await req.json();
    challenge = body.challenge?.trim();
  } catch {
    return new Response(JSON.stringify({ error: '入力が不正です' }), { status: 400, headers: cors() });
  }

  if (!challenge || challenge.length < 5 || challenge.length > 400) {
    return new Response(JSON.stringify({ error: '課題を5〜400文字で入力してください' }), { status: 400, headers: cors() });
  }

  const upstream = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 700,
      stream: true,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `課題：${challenge}` }],
    }),
  });

  if (!upstream.ok) {
    return new Response(JSON.stringify({ error: 'AI応答の取得に失敗しました' }), { status: 500, headers: cors() });
  }

  return new Response(upstream.body, {
    headers: { ...cors(), 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
  });
}

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}
