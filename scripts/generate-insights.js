const fs = require('fs/promises');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const INSIGHTS_DIR = path.join(ROOT, 'insights');
const SITE_URL = 'https://www.moji-lamcompany.com';
const FEED_URL = process.env.INSIGHTS_FEED_URL || '';
const FEED_TOKEN = process.env.INSIGHTS_FEED_TOKEN || '';
const TODAY = new Date().toISOString().slice(0, 10);

const MANUAL_ARTICLES = [
  {
    slug: 'how-to-make-ai-stick-after-introduction',
    title: 'AI導入後に、社員が使い続ける会社にするには',
    description: '導入して終わりにしないために、業務整理、試す期間、社内ルール、改善の流れをどうつなぐかを整理します。',
    eyebrow: 'AI ADOPTION',
    publishedAt: '2026-07-21',
  },
  {
    slug: 'ai-automation-examples-for-small-businesses',
    title: '中小企業のAI活用と、業務自動化の具体例',
    description: 'メール、議事録、社内文書、投稿案、定型業務など、現場で試しやすいAIと自動化の使い方をまとめます。',
    eyebrow: 'AI USE CASES',
    publishedAt: '2026-07-21',
  },
  {
    slug: 'why-ai-training-doesnt-stick',
    title: 'AI研修を受けても、社員が使い続けない7つの理由',
    description: '研修の満足度と社内定着は別です。実務で試す期間、利用ルール、共有方法、改善体制のどこで止まるかを整理します。',
    eyebrow: 'AI TRAINING',
    publishedAt: '2026-07-20',
  },
  {
    slug: 'how-small-businesses-start-ai',
    title: '中小企業のAI導入は、何から始めるべきか',
    description: '最初にツールを選ぶ必要はありません。業務整理から小規模実証、社員研修、ルール整備、改善まで、失敗しにくい7つの手順を紹介します。',
    eyebrow: 'AI STRATEGY',
    publishedAt: '2026-07-20',
  },
  {
    slug: 'why-employees-dont-use-chatgpt',
    title: 'ChatGPTを導入しても、社員が使わない7つの理由',
    description: 'ツールを用意し、使うように伝えても社内に広がらないのは、社員の意欲だけが原因ではありません。業務、ルール、研修、運用の観点から原因を整理します。',
    eyebrow: 'AI ADOPTION',
    publishedAt: '2026-07-20',
  },
];

async function buildInsightsSite() {
  const feedArticles = await loadFeedArticles();
  const mergedArticles = mergeArticles(MANUAL_ARTICLES, feedArticles);
  const allArticles = mergedArticles.sort(sortByDateDesc);

  await ensureDir(INSIGHTS_DIR);
  await writeFile(path.join(INSIGHTS_DIR, 'index.html'), renderIndex(allArticles));
  await writeSitemap(allArticles);
  await writeGeneratedArticles(mergedArticles, feedArticles);
}

async function loadFeedArticles() {
  if (!FEED_URL) return [];
  const url = new URL(FEED_URL);
  if (FEED_TOKEN && !url.searchParams.has('token')) {
    url.searchParams.set('token', FEED_TOKEN);
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load insights feed: ${response.status}`);
  }
  const json = await response.json();
  return Array.isArray(json.articles) ? json.articles : [];
}

function mergeArticles(manualArticles, feedArticles) {
  const bySlug = new Map();
  manualArticles.forEach((article) => {
    bySlug.set(article.slug, normalizeArticle(article));
  });
  feedArticles.forEach((article) => {
    const normalized = normalizeArticle(article);
    if (!normalized.slug) return;
    if (!bySlug.has(normalized.slug)) {
      bySlug.set(normalized.slug, normalized);
    }
  });
  return Array.from(bySlug.values());
}

function normalizeArticle(article) {
  const slug = slugify(article.slug || article.title || '');
  return {
    slug,
    title: String(article.title || slug),
    description: String(article.description || ''),
    eyebrow: String(article.eyebrow || 'INSIGHT'),
    lead: String(article.lead || article.description || ''),
    publishedAt: String(article.publishedAt || article.datePublished || TODAY),
    keywords: Array.isArray(article.keywords) ? article.keywords : [],
    ctaLabel: String(article.ctaLabel || '相談する'),
    ctaHref: String(article.ctaHref || '/#contact'),
    sections: Array.isArray(article.sections) ? article.sections : [],
  };
}

function sortByDateDesc(a, b) {
  return String(b.publishedAt || '').localeCompare(String(a.publishedAt || '')) || a.title.localeCompare(b.title);
}

function renderIndex(articles) {
  const cards = articles.map(renderCard).join('\n');
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>中小企業のAI導入・業務改善コラム｜LAM COMPANY</title>
<meta name="description" content="IT担当者がいない中小企業のAI導入、社員研修、業務効率化、社内定着について、現場での実践をもとに解説します。">
<meta name="robots" content="index,follow">
<link rel="canonical" href="${SITE_URL}/insights">
<meta property="og:type" content="website">
<meta property="og:title" content="中小企業のAI導入・業務改善コラム｜LAM COMPANY">
<meta property="og:description" content="中小企業のAI導入と社内定着を、現場での実践をもとに解説します。">
<meta property="og:url" content="${SITE_URL}/insights">
<meta property="og:site_name" content="株式会社LAM COMPANY">
<meta property="og:image" content="${SITE_URL}/images/hero-consulting.webp">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@700;900&family=Noto+Sans+JP:wght@400;500;700&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/insights/insights.css">
<script async src="https://www.googletagmanager.com/gtag/js?id=G-B4BQKPZNR9"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','G-B4BQKPZNR9');</script>
</head>
<body>
<a class="skip" href="#main">本文へ移動</a>
<header class="site-header"><div class="wrap header-inner"><a class="brand" href="/"><strong>株式会社LAM COMPANY</strong><small>中小企業のAI導入・定着支援</small></a><nav class="header-nav" aria-label="メインナビゲーション"><a href="/">法人トップ</a><a class="header-cta" href="/#contact">相談する</a></nav></div></header>
<main id="main">
<section class="index-hero"><div class="wrap"><span class="eyebrow">INSIGHTS</span><h1>中小企業のAI導入を、<br>現場の言葉で考える。</h1><p>AIを導入して終わりにしないために。社員研修、業務整理、社内ルール、業務効率化について、実際の店舗経営と支援現場で得た知見を紹介します。</p></div></section>
<section class="article-list"><div class="wrap">
${cards}
<aside class="coming"><h2>今後取り上げるテーマ</h2><p>IT担当者がいない会社の進め方、業務アプリ・自動化、現場でのAI活用事例などを順次公開します。</p></aside>
</div></section>
</main>
<footer><div class="wrap footer-inner"><span>© LAM COMPANY. All rights reserved.</span><nav class="footer-links" aria-label="フッターナビゲーション"><a href="/">法人トップ</a><a href="/story">代表者について</a><a href="/privacy">プライバシーポリシー</a></nav></div></footer>
</body>
</html>
`;
}

function renderCard(article) {
  const date = article.publishedAt.replace(/-/g, '.');
  const excerpt = escapeHtml(article.description || article.lead || '');
  return `<a class="article-card" href="/insights/${article.slug}"><div class="article-meta"><time datetime="${escapeAttr(article.publishedAt)}">${escapeHtml(date)}</time><br>${escapeHtml(article.eyebrow)}</div><div><h2>${escapeHtml(article.title)}</h2><p>${excerpt}</p><span class="read">記事を読む →</span></div></a>`;
}

async function writeGeneratedArticles(allArticles, feedArticles) {
  const feedSlugs = new Set(feedArticles.map((item) => slugify(item.slug || item.title || '')));
  for (const article of allArticles) {
    if (!feedSlugs.has(article.slug)) continue;
    const file = path.join(INSIGHTS_DIR, `${article.slug}.html`);
    await writeFile(file, renderArticle(article));
  }
}

function renderArticle(article) {
  const sections = article.sections.length ? article.sections : [{ heading: '本文', body: [article.lead || article.description || ''] }];
  const toc = sections.map((section) => `<a href="#${slugify(section.heading)}">${escapeHtml(section.heading)}</a>`).join('');
  const body = sections.map((section) => renderSection(section)).join('\n');
  const published = article.publishedAt || TODAY;
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${escapeHtml(article.title)}｜LAM COMPANY</title>
<meta name="description" content="${escapeAttr(article.description || article.lead || '')}">
<meta name="robots" content="index,follow">
<link rel="canonical" href="${SITE_URL}/insights/${article.slug}">
<meta property="og:type" content="article">
<meta property="og:title" content="${escapeAttr(article.title)}">
<meta property="og:description" content="${escapeAttr(article.description || article.lead || '')}">
<meta property="og:url" content="${SITE_URL}/insights/${article.slug}">
<meta property="og:site_name" content="株式会社LAM COMPANY">
<meta property="og:image" content="${SITE_URL}/images/hero-consulting.webp">
<meta property="article:published_time" content="${escapeAttr(published)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@700;900&family=Noto+Sans+JP:wght@400;500;700&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/insights/insights.css">
<script async src="https://www.googletagmanager.com/gtag/js?id=G-B4BQKPZNR9"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','G-B4BQKPZNR9');</script>
<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    description: article.description || article.lead || '',
    datePublished: published,
    dateModified: published,
    inLanguage: 'ja',
    mainEntityOfPage: `${SITE_URL}/insights/${article.slug}`,
    image: `${SITE_URL}/images/hero-consulting.webp`,
    author: { '@type': 'Person', name: '篠崎友寿', url: `${SITE_URL}/story` },
    publisher: { '@type': 'Organization', name: '株式会社LAM COMPANY', url: `${SITE_URL}/` },
  })}</script>
</head>
<body>
<a class="skip" href="#article">本文へ移動</a>
<header class="site-header"><div class="wrap header-inner"><a class="brand" href="/"><strong>株式会社LAM COMPANY</strong><small>中小企業のAI導入・定着支援</small></a><nav class="header-nav" aria-label="メインナビゲーション"><a href="/insights">記事一覧</a><a class="header-cta" href="/#contact" data-article-cta="header">相談する</a></nav></div></header>
<main>
<header class="article-hero"><div class="wrap article-hero-inner"><nav class="breadcrumb" aria-label="パンくずリスト"><a href="/">法人トップ</a> ／ <a href="/insights">記事一覧</a></nav><span class="eyebrow">${escapeHtml(article.eyebrow)}</span><h1>${escapeHtml(article.title)}</h1><p class="article-lead">${escapeHtml(article.lead || article.description || '')}</p><div class="byline"><span>執筆：篠崎友寿</span><time datetime="${escapeAttr(published)}">公開：${escapeHtml(formatDateJa(published))}</time><span>読了目安：8分</span></div></div></header>
<div class="wrap article-layout"><article class="article-body" id="article">
${body}
<aside class="article-cta"><span class="eyebrow">NEXT STEP</span><h2>自社の場合にどう進めるか整理します。</h2><p>現在困っている業務を入力すると、AIで取り組めることを簡易的に整理できます。導入や研修、定着支援については、相談フォームからお問い合わせください。</p><div class="cta-actions"><a class="button button-primary" href="${escapeAttr(article.ctaHref || '/#contact')}" data-article-cta="contact">${escapeHtml(article.ctaLabel || '相談する')}</a></div></aside>
</article><nav class="toc" aria-label="記事内の目次"><strong>この記事の内容</strong>${toc}</nav></div>
</main>
<footer><div class="wrap footer-inner"><span>© LAM COMPANY. All rights reserved.</span><nav class="footer-links" aria-label="フッターナビゲーション"><a href="/">法人トップ</a><a href="/insights">記事一覧</a><a href="/story">代表者について</a><a href="/privacy">プライバシーポリシー</a></nav></div></footer>
<script>document.querySelectorAll('[data-article-cta]').forEach(function(link){link.addEventListener('click',function(){if(typeof window.gtag==='function'){gtag('event','insight_cta_click',{cta_location:link.getAttribute('data-article-cta'),article_slug:'${escapeJs(article.slug)}'})}})});</script>
</body>
</html>`;
}

function renderSection(section) {
  const heading = String(section.heading || '本文');
  const body = Array.isArray(section.body) ? section.body : [String(section.body || '')];
  const paragraphs = body.map((item) => `<p>${escapeHtml(item)}</p>`).join('');
  return `<h2 id="${slugify(heading)}">${escapeHtml(heading)}</h2>${paragraphs}`;
}

async function writeSitemap(articles) {
  const urls = [
    { loc: `${SITE_URL}/`, lastmod: TODAY },
    { loc: `${SITE_URL}/story`, lastmod: TODAY },
    { loc: `${SITE_URL}/story/history`, lastmod: TODAY },
    { loc: `${SITE_URL}/coworking`, lastmod: TODAY },
    { loc: `${SITE_URL}/classroom`, lastmod: TODAY },
    { loc: `${SITE_URL}/ai-training`, lastmod: TODAY },
    { loc: `${SITE_URL}/insights`, lastmod: TODAY },
    ...articles.map((article) => ({
      loc: `${SITE_URL}/insights/${article.slug}`,
      lastmod: article.publishedAt || TODAY,
    })),
  ];
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((entry) => `  <url><loc>${entry.loc}</loc><lastmod>${entry.lastmod}</lastmod></url>`).join('\n')}
</urlset>
`;
  await writeFile(path.join(ROOT, 'sitemap.xml'), sitemap);
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function writeFile(file, content) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content, 'utf8');
}

function slugify(input) {
  return String(input || '')
    .toLowerCase()
    .replace(/[^\w\u3040-\u30ff\u4e00-\u9faf]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || `article-${Date.now()}`;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

function escapeJs(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function formatDateJa(isoDate) {
  const [y, m, d] = String(isoDate).split('-');
  if (!y || !m || !d) return isoDate;
  return `${Number(y)}年${Number(m)}月${Number(d)}日`;
}

module.exports = { buildInsightsSite };
