const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('analytics.js', 'utf8');

function load(hostname = 'www.moji-lamcompany.com', forms = [], sections = {}) {
  const listeners = {};
  const headChildren = [];
  const observers = [];
  const canonical = { href: 'https://www.moji-lamcompany.com/' };
  const document = {
    title: 'Test page',
    readyState: 'complete',
    currentScript: { dataset: { measurementId: 'G-B4BQKPZNR9' } },
    body: { scrollHeight: 2000 },
    documentElement: { scrollHeight: 2000 },
    head: { appendChild: (node) => headChildren.push(node) },
    createElement: () => ({}),
    querySelector: (selector) => selector === 'link[rel="canonical"]' ? canonical : null,
    querySelectorAll: (selector) => selector === 'form' ? forms : [],
    getElementById: (id) => sections[id] || null,
    addEventListener: (name, fn) => { listeners[name] = fn; }
  };
  const window = {
    location: { hostname, pathname: '/', href: `https://${hostname}/`, origin: `https://${hostname}` },
    innerHeight: 1000,
    scrollY: 0,
    addEventListener: (name, fn) => { listeners[name] = fn; },
    IntersectionObserver: function (callback) {
      this.callback = callback;
      this.observe = () => {};
      this.unobserve = () => {};
      observers.push(this);
    }
  };
  const context = { window, document, URL, Set, Object, Date, encodeURIComponent, clearTimeout, setTimeout, IntersectionObserver: window.IntersectionObserver };
  vm.runInNewContext(source, context);
  return { window, document, listeners, headChildren, observers };
}

test('productionだけでGA4を初期化し、開発ホストでは送信しない', () => {
  const production = load();
  assert.equal(production.headChildren.length, 1);
  assert.equal(production.window.LamAnalytics.track('cta_click', { cta_id: 'test' }), true);
  assert.equal(production.window.dataLayer.filter((item) => item[0] === 'event').length, 1);

  const preview = load('project-git-branch.vercel.app');
  assert.equal(preview.headChildren.length, 0);
  assert.equal(preview.window.LamAnalytics.track('cta_click', { cta_id: 'test' }), false);
  assert.equal(preview.window.dataLayer, undefined);
});

test('同じonceKeyのイベントは1ページにつき1回だけ送信する', () => {
  const { window } = load();
  window.LamAnalytics.track('scroll_depth', { scroll_percent: 50 }, '50');
  window.LamAnalytics.track('scroll_depth', { scroll_percent: 50 }, '50');
  const events = window.dataLayer.filter((item) => item[0] === 'event');
  assert.equal(events.length, 1);
  assert.equal(events[0][1], 'scroll_depth');
  assert.equal(events[0][2].scroll_percent, 50);
  assert.equal(events[0][2].event_version, 2);
});

test('同じスクロール深度はスクロールし直しても1回だけ送信する', () => {
  const { window, listeners } = load();
  window.scrollY = 500;
  listeners.scroll();
  listeners.scroll();
  assert.equal(window.dataLayer.filter((item) => item[1] === 'scroll_depth' && item[2].scroll_percent === 50).length, 1);
});

test('セクションが50%以上で1秒続いた時だけ1回送信する', async () => {
  const section = {};
  const { window, observers } = load('www.moji-lamcompany.com', [], { projects: section });
  observers[0].callback([{ target: section, intersectionRatio: 0.5 }]);
  await new Promise((resolve) => setTimeout(resolve, 1050));
  observers[0].callback([{ target: section, intersectionRatio: 0.5 }]);
  await new Promise((resolve) => setTimeout(resolve, 1050));
  const events = window.dataLayer.filter((item) => item[1] === 'section_view');
  assert.equal(events.length, 1);
  assert.equal(events[0][2].section_id, 'current_projects');
});

test('フォーム開始は複数入力しても1回だけ送信する', () => {
  const handlers = {};
  const form = {
    id: 'contactForm', method: 'post',
    addEventListener: (name, fn) => { handlers[name] = fn; },
    getAttribute: () => null
  };
  const { window } = load('www.moji-lamcompany.com', [form]);
  const field = { matches: () => true };
  handlers.input({ target: field });
  handlers.input({ target: field });
  assert.equal(window.dataLayer.filter((item) => item[1] === 'form_start').length, 1);
});

test('CTAクリック1回でcta_clickを1回だけ送信する', () => {
  const { window, listeners } = load();
  const el = {
    id: 'heroCta', href: 'https://www.moji-lamcompany.com/#contact',
    dataset: { ctaLocation: 'hero' }, textContent: '相談する',
    classList: { contains: () => false },
    getAttribute: (name) => name === 'href' ? '#contact' : null,
    matches: () => false,
    closest: (selector) => selector === 'a,button,[data-event],[data-insight-open]' ? el : selector === '.hero' ? {} : null,
    hasAttribute: () => false
  };
  listeners.click({ target: el });
  assert.equal(window.dataLayer.filter((item) => item[1] === 'cta_click').length, 1);
});

test('旧プロジェクト属性のクリックをproject_clickへ統合する', () => {
  const { window, listeners } = load();
  const el = {
    id: '', href: 'https://www.moji-lamcompany.com/coworking',
    dataset: { event: 'click_coworking_concept' }, textContent: 'プロジェクトの構想を見る',
    classList: { contains: () => false },
    getAttribute: () => null,
    matches: () => false,
    closest: (selector) => selector === 'a,button,[data-event],[data-insight-open]' ? el : null,
    hasAttribute: () => false
  };
  listeners.click({ target: el });
  const events = window.dataLayer.filter((item) => item[1] === 'project_click');
  assert.equal(events.length, 1);
  assert.equal(events[0][2].project_id, 'coworking');
});

test('project_id属性のクリックをproject_clickとして送信する', () => {
  const { window, listeners } = load();
  const el = {
    id: '', href: 'https://www.moji-lamcompany.com/coworking#concept',
    dataset: { projectId: 'coworking' }, textContent: 'プロジェクトの構想を見る',
    classList: { contains: () => false },
    getAttribute: () => null,
    matches: () => false,
    closest: (selector) => selector === 'a,button,[data-event],[data-insight-open]' ? el : selector === '.hero' ? {} : null,
    hasAttribute: () => false
  };
  listeners.click({ target: el });
  const events = window.dataLayer.filter((item) => item[1] === 'project_click');
  assert.equal(events.length, 1);
  assert.equal(events[0][2].project_id, 'coworking');
  assert.equal(events[0][2].click_location, 'hero');
});

test('個人情報になり得るパラメータを除外する', () => {
  const { window } = load();
  window.LamAnalytics.track('form_submit_error', {
    form_id: 'contactForm', email: 'person@example.com', phone: '000', message: 'secret', error_type: 'validation'
  });
  const params = window.dataLayer.find((item) => item[0] === 'event')[2];
  assert.equal(params.email, undefined);
  assert.equal(params.phone, undefined);
  assert.equal(params.message, undefined);
  assert.equal(params.form_id, 'contactForm');
});

test('フォーム成功は呼び出された時だけ送信され、送信ボタン操作だけでは送られない', () => {
  const { window } = load();
  const form = { id: 'contactForm', getAttribute: () => null };
  assert.equal(window.dataLayer.filter((item) => item[1] === 'form_submit_success').length, 0);
  window.LamAnalytics.formSuccess(form);
  assert.equal(window.dataLayer.filter((item) => item[1] === 'form_submit_success').length, 1);
});

test('page_typeをパスから一貫して分類する', () => {
  const { window } = load();
  const classify = window.LamAnalytics._test.pageType;
  assert.equal(classify('/story'), 'personal');
  assert.equal(classify('/story/contact'), 'contact');
  assert.equal(classify('/coworking'), 'coworking');
  assert.equal(classify('/classroom'), 'classroom');
  assert.equal(classify('/insights/example'), 'content');
});
