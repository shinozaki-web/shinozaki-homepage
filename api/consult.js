const WINDOW_MS = 15 * 60 * 1000;
const MAX_REQUESTS = 5;
const requestsByIp = new Map();

const SYSTEM_PROMPT = `あなたは株式会社 LAM COMPANYの「AI活用整理ミニ診断」です。
中小企業の経営者が入力した課題を、専門用語を避けて簡潔に整理してください。

必ず次の4項目を、この順序と見出しで出力してください。
1. 現在の課題
2. AIを活用しやすい業務
3. 最初に試すこと
4. 合いそうな支援メニュー

支援メニューは次から最も近いものを1つだけ選んでください。
- AI活用整理・導入設計（5万〜10万円・税別）
- 社員向けAI実践研修（10万〜20万円／社・税別）
- AI導入・定着3か月伴走支援（33万円〜・税別）
- 業務アプリ・自動化開発（30万円〜・税別）

各項目は2〜3文、全体で500文字以内にしてください。
Markdown記号（#、*、-など）は使わず、見出しと本文だけのプレーンテキストで出力してください。
「過去データをAIに学習させる」と安易に表現せず、テンプレート化、参照、下書き作成など現実的な方法を示してください。
断定や成果保証を避け、入力に個人情報や機密情報が含まれていても繰り返さないでください。`;

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  return String(Array.isArray(forwarded) ? forwarded[0] : forwarded || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
}

function isAllowedOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return false;
  const allowed = new Set([
    'https://www.moji-lamcompany.com',
    'https://moji-lamcompany.com',
    'http://localhost:3000',
    'http://localhost:8000'
  ]);
  if (process.env.VERCEL_URL) allowed.add(`https://${process.env.VERCEL_URL}`);
  return allowed.has(origin);
}

function isRateLimited(ip) {
  const now = Date.now();
  if (requestsByIp.size > 5000) requestsByIp.clear();
  const recent = (requestsByIp.get(ip) || []).filter((time) => now - time < WINDOW_MS);
  if (recent.length >= MAX_REQUESTS) {
    requestsByIp.set(ip, recent);
    return true;
  }
  recent.push(now);
  requestsByIp.set(ip, recent);
  return false;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!isAllowedOrigin(req) || req.headers['sec-fetch-site'] === 'cross-site') {
    return res.status(403).json({ error: 'このサイトからのみ利用できます' });
  }

  const contentLength = Number(req.headers['content-length'] || 0);
  if (contentLength > 3000) return res.status(413).json({ error: '入力内容が長すぎます' });

  const challenge = typeof req.body?.challenge === 'string' ? req.body.challenge.trim() : '';
  const website = typeof req.body?.website === 'string' ? req.body.website.trim() : '';
  if (website) return res.status(400).json({ error: '入力内容を確認してください' });
  if (challenge.length < 20 || challenge.length > 400) {
    return res.status(400).json({ error: '課題を20〜400文字で入力してください' });
  }

  const ip = getClientIp(req);
  if (isRateLimited(ip)) {
    res.setHeader('Retry-After', '900');
    return res.status(429).json({ error: '利用回数の上限に達しました。時間をおいてお試しください' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(503).json({ error: '現在、診断を利用できません' });

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
        max_tokens: 700,
        temperature: 0.2,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: challenge }]
      })
    });

    if (!upstream.ok) {
      console.error('Diagnosis upstream error:', upstream.status);
      return res.status(502).json({ error: '現在、診断を利用できません' });
    }

    const data = await upstream.json();
    const result = data.content?.find((item) => item.type === 'text')?.text?.trim();
    if (!result) return res.status(502).json({ error: '診断結果を取得できませんでした' });
    return res.status(200).json({ result });
  } catch (error) {
    console.error('Diagnosis request failed:', error?.message || 'unknown');
    return res.status(502).json({ error: '現在、診断を利用できません' });
  }
}
