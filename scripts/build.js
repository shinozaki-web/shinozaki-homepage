const fs = require('fs/promises');
const path = require('path');
const { buildInsightsSite } = require('./generate-insights');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');

async function main() {
  await buildInsightsSite();
  await mirrorPublicSite();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function mirrorPublicSite() {
  await fs.rm(PUBLIC_DIR, { recursive: true, force: true });
  await fs.mkdir(PUBLIC_DIR, { recursive: true });

  const files = [
    'index.html',
    'story.html',
    'ai-training.html',
    'coworking.html',
    'classroom.html',
    'privacy.html',
    'robots.txt',
    'sitemap.xml',
  ];

  const dirs = ['images', 'insights', 'story'];

  for (const file of files) {
    const src = path.join(ROOT, file);
    try {
      await fs.access(src);
      await fs.cp(src, path.join(PUBLIC_DIR, file), { recursive: true });
    } catch {
      // file not present (untracked), skip
    }
  }

  for (const dir of dirs) {
    await fs.cp(path.join(ROOT, dir), path.join(PUBLIC_DIR, dir), { recursive: true });
  }
}
