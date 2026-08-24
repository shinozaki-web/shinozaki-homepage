import crypto from 'node:crypto';

const REPO_OWNER = 'shinozaki-web';
const REPO_NAME = 'shinozaki-homepage';
const REPO_BRANCH = 'master';
const DATA_PATH = 'portfolio-data.json';
const IMAGE_DIR = 'images/portfolio';
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const CATEGORIES = new Set(['物語', 'ゲーム', '絵', 'クイズ', 'レポート', 'その他']);
const GRADES = new Set(['小学4年生', '小学5年生', '小学6年生', '中学1年生', '中学2年生', '中学3年生', '高校1年生', '高校2年生']);
const requestLog = new Map();

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  return String(Array.isArray(forwarded) ? forwarded[0] : forwarded || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
}

function isAllowedOrigin(req) {
  const origin = req.headers.origin;
  const allowed = new Set(['https://www.moji-lamcompany.com', 'https://moji-lamcompany.com', 'http://localhost:3000', 'http://localhost:8000']);
  if (process.env.VERCEL_URL) allowed.add(`https://${process.env.VERCEL_URL}`);
  if (origin) return allowed.has(origin);

  // Same-origin GET requests do not always include an Origin header.
  if (req.method !== 'GET' || req.headers['sec-fetch-site'] !== 'same-origin') return false;
  const forwardedHost = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  const protocol = forwardedHost.startsWith('localhost:') ? 'http' : 'https';
  return allowed.has(`${protocol}://${forwardedHost}`);
}

function isRateLimited(ip) {
  const now = Date.now();
  const recent = (requestLog.get(ip) || []).filter((time) => now - time < 15 * 60 * 1000);
  if (recent.length >= 20) return true;
  recent.push(now);
  requestLog.set(ip, recent);
  if (requestLog.size > 5000) requestLog.clear();
  return false;
}

function isAuthorized(req) {
  const expected = process.env.PORTFOLIO_ADMIN_PASSWORD || '';
  const supplied = String(req.headers['x-portfolio-password'] || '');
  if (!expected || !supplied) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function githubHeaders() {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${process.env.PORTFOLIO_GITHUB_TOKEN}`,
    'Content-Type': 'application/json',
    'X-GitHub-Api-Version': '2022-11-28'
  };
}

function githubPath(path) {
  return encodeURIComponent(path).replaceAll('%2F', '/');
}

async function getGithubFile(path) {
  const response = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${githubPath(path)}?ref=${REPO_BRANCH}`, { headers: githubHeaders() });
  if (!response.ok) throw new Error(`GitHub read failed: ${response.status}`);
  return response.json();
}

async function putGithubFile(path, content, message, sha) {
  const response = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${githubPath(path)}`, {
    method: 'PUT',
    headers: githubHeaders(),
    body: JSON.stringify({ message, branch: REPO_BRANCH, content: Buffer.from(content).toString('base64'), ...(sha ? { sha } : {}) })
  });
  if (!response.ok) throw new Error(`GitHub write failed: ${response.status}`);
}

async function deleteGithubFile(path, message, sha) {
  const response = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${githubPath(path)}`, {
    method: 'DELETE',
    headers: githubHeaders(),
    body: JSON.stringify({ message, branch: REPO_BRANCH, sha })
  });
  if (!response.ok) throw new Error(`GitHub delete failed: ${response.status}`);
}

function cleanText(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function safeHttpUrl(value) {
  const candidate = cleanText(value, 500);
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

function parseImage(image) {
  if (!image) return null;
  const match = /^data:(image\/(?:jpeg|png|gif|webp));base64,([A-Za-z0-9+/=]+)$/.exec(image);
  if (!match) throw new Error('画像形式が正しくありません');
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) throw new Error('画像は3MB以下にしてください');
  const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp' }[match[1]];
  return { buffer, extension };
}

async function readWorks() {
  const file = await getGithubFile(DATA_PATH);
  const parsed = JSON.parse(Buffer.from(file.content.replace(/\n/g, ''), 'base64').toString('utf8'));
  if (!Array.isArray(parsed)) throw new Error('作品データが不正です');
  return { works: parsed, sha: file.sha };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (!['GET', 'POST', 'DELETE'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });
  if (!isAllowedOrigin(req) || req.headers['sec-fetch-site'] === 'cross-site') return res.status(403).json({ error: 'このサイトからのみ利用できます' });
  if (isRateLimited(getClientIp(req))) return res.status(429).json({ error: '操作回数が多すぎます。時間をおいてください' });
  if (!isAuthorized(req)) return res.status(401).json({ error: '管理パスワードが違います' });
  if (!process.env.PORTFOLIO_GITHUB_TOKEN) return res.status(503).json({ error: '管理機能を利用できません' });
  if (req.method === 'GET') return res.status(204).end();

  try {
    const { works, sha: dataSha } = await readWorks();
    if (req.method === 'POST') {
      const title = cleanText(req.body?.title, 80);
      const studentName = cleanText(req.body?.student_name, 30);
      const grade = cleanText(req.body?.grade, 20);
      const category = cleanText(req.body?.category, 20);
      if (!title || !studentName || !GRADES.has(grade) || !CATEGORIES.has(category)) return res.status(400).json({ error: '必須項目を確認してください' });

      const id = crypto.randomUUID();
      const parsedImage = parseImage(req.body?.image);
      let imagePath = null;
      if (parsedImage) {
        imagePath = `${IMAGE_DIR}/${id}.${parsedImage.extension}`;
        await putGithubFile(imagePath, parsedImage.buffer, `作品画像を追加: ${title}`);
      }
      const work = {
        id,
        title,
        student_name: studentName,
        grade,
        category,
        description: cleanText(req.body?.description, 300) || null,
        image_url: imagePath ? `/${imagePath}` : null,
        image_path: imagePath,
        work_url: safeHttpUrl(req.body?.work_url),
        suzuri_url: safeHttpUrl(req.body?.suzuri_url),
        created_at: new Date().toISOString()
      };
      await putGithubFile(DATA_PATH, `${JSON.stringify([work, ...works], null, 2)}\n`, `作品を公開: ${title}`, dataSha);
      return res.status(201).json({ work });
    }

    const id = cleanText(req.body?.id, 80);
    const work = works.find((item) => item.id === id);
    if (!work) return res.status(404).json({ error: '作品が見つかりません' });
    if (work.image_path) {
      try {
        const imageFile = await getGithubFile(work.image_path);
        await deleteGithubFile(work.image_path, `作品画像を削除: ${work.title}`, imageFile.sha);
      } catch (error) {
        console.error('Portfolio image delete skipped:', error?.message || 'unknown');
      }
    }
    const latestData = await getGithubFile(DATA_PATH);
    await putGithubFile(DATA_PATH, `${JSON.stringify(works.filter((item) => item.id !== id), null, 2)}\n`, `作品を削除: ${work.title}`, latestData.sha);
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Portfolio operation failed:', error?.message || 'unknown');
    const message = /画像|必須/.test(error?.message || '') ? error.message : '保存に失敗しました。少し待って再試行してください';
    return res.status(502).json({ error: message });
  }
}
