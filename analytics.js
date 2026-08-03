(function (window, document) {
  'use strict';

  /**
   * @typedef {'scroll_depth'|'section_view'|'project_click'|'cta_click'|'content_click'|'social_click'|'form_start'|'form_submit_success'|'form_submit_error'|'diagnosis_start'|'diagnosis_complete'|'diagnosis_error'|'training_detail_open'|'faq_open'} AnalyticsEventName
   * @typedef {Record<string, string|number|boolean>} AnalyticsParams
   */

  var VERSION = 2;
  var sent = new Set();
  var initialized = false;
  var internalSend = false;

  function canonicalHost() {
    var canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) return '';
    try { return new URL(canonical.href).hostname; } catch (_) { return ''; }
  }

  function isProduction() {
    var host = window.location && window.location.hostname;
    return Boolean(host && canonicalHost() && host === canonicalHost());
  }

  function pageType(path) {
    if (path === '/' || path === '') return 'service';
    if (path.indexOf('/story/contact') === 0) return 'contact';
    if (path.indexOf('/story') === 0) return 'personal';
    if (path.indexOf('/coworking') === 0) return 'coworking';
    if (path.indexOf('/classroom') === 0) return 'classroom';
    if (path.indexOf('/insights') === 0) return 'content';
    return 'service';
  }

  function commonParams() {
    return {
      page_path: window.location.pathname,
      page_title: document.title,
      page_type: pageType(window.location.pathname),
      event_version: VERSION
    };
  }

  function safeParams(params) {
    var blocked = /^(email|e-mail|mail|name|phone|tel|message|body|inquiry|challenge|input|link_text|question_text|field_name)$/i;
    var clean = {};
    Object.keys(params || {}).forEach(function (key) {
      if (!blocked.test(key) && params[key] !== undefined && params[key] !== null) clean[key] = params[key];
    });
    return clean;
  }

  /** @param {AnalyticsEventName} name @param {AnalyticsParams=} params @param {string=} onceKey */
  function track(name, params, onceKey) {
    try {
      if (!isProduction() || typeof window.gtag !== 'function') return false;
      var key = onceKey ? name + ':' + onceKey : '';
      if (key && sent.has(key)) return false;
      if (key) sent.add(key);
      internalSend = true;
      window.gtag('event', name, Object.assign(commonParams(), safeParams(params)));
      internalSend = false;
      return true;
    } catch (_) { return false; }
  }

  function initGtag() {
    if (initialized || !isProduction()) return;
    var script = document.currentScript || document.querySelector('script[src$="/analytics.js"]');
    var measurementId = script && script.dataset.measurementId;
    if (!measurementId) return;
    initialized = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () {
      if (arguments[0] === 'event' && !internalSend) return;
      window.dataLayer.push(arguments);
    };
    window.gtag('js', new Date());
    window.gtag('config', measurementId);
    var loader = document.createElement('script');
    loader.async = true;
    loader.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(measurementId);
    document.head.appendChild(loader);
  }

  function destination(el) {
    var href = el.href || el.getAttribute('href') || '';
    if (!href) return '';
    try {
      var url = new URL(href, window.location.href);
      if (url.protocol === 'mailto:') return 'email';
      if (url.protocol === 'tel:') return 'phone';
      if (url.hash && url.origin === window.location.origin && url.pathname === window.location.pathname) return 'anchor';
      return url.origin === window.location.origin ? 'internal' : 'external';
    } catch (_) { return 'unknown'; }
  }

  var oldEventMap = {
    click_coworking_project: ['project_click', { project_id: 'coworking' }],
    click_coworking_concept: ['project_click', { project_id: 'coworking' }],
    click_home_restaurant: ['project_click', { project_id: 'home_restaurant' }],
    click_meo_support: ['project_click', { project_id: 'meo_support' }],
    click_programming_class: ['project_click', { project_id: 'programming_class' }],
    click_contact: ['cta_click', { cta_id: 'contact' }],
    click_coworking_contact: ['cta_click', { cta_id: 'coworking_contact' }],
    click_hero_current_projects: ['cta_click', { cta_id: 'current_projects', cta_location: 'hero' }],
    click_full_story: ['content_click', { content_id: 'full_story', content_type: 'story' }],
    click_company_site: ['content_click', { content_id: 'company_site', content_type: 'website' }],
    click_bongo: ['content_click', { content_id: 'bongo', content_type: 'website' }],
    click_facebook: ['social_click', { social_platform: 'facebook', account_id: 'shinozaki_tomohisa' }],
    click_instagram: ['social_click', { social_platform: 'instagram', account_id: 'mojiko_sakaemachinomirai' }],
    click_youtube: ['social_click', { social_platform: 'youtube', account_id: 'bongo_moji' }],
    click_coworking_facebook: ['social_click', { social_platform: 'facebook', account_id: 'shinozaki_tomohisa' }],
    click_coworking_instagram: ['social_click', { social_platform: 'instagram', account_id: 'mojiko_sakaemachinomirai' }]
  };

  function clickLocation(el) {
    if (el.closest('header, nav')) return 'navigation';
    if (el.classList.contains('mobile-cta') || el.closest('.mobile-cta')) return 'sticky';
    if (el.closest('footer')) return 'footer';
    if (el.closest('.hero')) return 'hero';
    if (el.closest('.final-cta, #contact, .contact')) return 'final';
    if (el.closest('[data-project], #projects')) return 'project_section';
    return 'content';
  }

  function onClick(event) {
    var el = event.target.closest('a,button,[data-event],[data-insight-open]');
    if (!el) return;
    if (el.matches('button[type="submit"],input[type="submit"]') && el.closest('form')) return;
    var url = el.href || '';
    var location = clickLocation(el);
    var params;

    if (el.dataset.analyticsSocial) {
      track('social_click', { social_platform: el.dataset.analyticsSocial, account_id: el.dataset.analyticsAccount || '', click_location: location, destination_url: url });
      return;
    }
    if (el.dataset.event && oldEventMap[el.dataset.event]) {
      var mapped = oldEventMap[el.dataset.event];
      params = Object.assign({}, mapped[1], { click_location: location, destination_url: url });
      if (mapped[0] === 'project_click') params.click_location = location;
      track(mapped[0], params);
      return;
    }
    if (el.hasAttribute('data-insight-open')) {
      track('content_click', { content_id: 'mojiko_honest_thoughts', content_type: 'dialog', click_location: location, destination_url: '' });
      return;
    }
    var ctaLocation = el.dataset.ctaLocation || el.dataset.trainingCta || el.dataset.articleCta;
    if (!ctaLocation && window.location.pathname.indexOf('/classroom') === 0 && el.getAttribute('href') === '#application') ctaLocation = location;
    if (ctaLocation) {
      track('cta_click', {
        cta_id: el.id || ctaLocation,
        cta_location: ctaLocation === 'nav' ? 'navigation' : ctaLocation,
        cta_text: (el.textContent || '').trim().slice(0, 100),
        destination: destination(el),
        destination_url: url
      });
    }
  }

  function initScrollDepth() {
    var reached = {};
    function check() {
      var height = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
      var max = height - window.innerHeight;
      if (max <= 0) return;
      var percent = Math.round(window.scrollY / max * 100);
      [50, 75, 90].forEach(function (depth) {
        if (percent >= depth && !reached[depth]) {
          reached[depth] = true;
          track('scroll_depth', { scroll_percent: depth }, String(depth));
        }
      });
    }
    window.addEventListener('scroll', check, { passive: true });
  }

  function initSections() {
    if (!window.IntersectionObserver) return;
    ['projects', 'future', 'contact'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      var timer;
      var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          clearTimeout(timer);
          if (entry.intersectionRatio >= 0.5) {
            timer = setTimeout(function () {
              track('section_view', { section_id: id === 'projects' ? 'current_projects' : id }, id);
              observer.unobserve(el);
            }, 1000);
          }
        });
      }, { threshold: [0, 0.5] });
      observer.observe(el);
    });
  }

  function formId(form) { return form.id || form.getAttribute('name') || 'contact_form'; }

  function initForms() {
    document.querySelectorAll('form').forEach(function (form) {
      if (form.method && form.method.toLowerCase() === 'dialog') return;
      function start(event) {
        if (!event.target.matches('input,select,textarea')) return;
        track('form_start', { form_id: formId(form) }, formId(form));
      }
      form.addEventListener('input', start);
      form.addEventListener('change', start);
    });
  }

  window.LamAnalytics = {
    track: track,
    formSuccess: function (form, submissionId) {
      var params = { form_id: formId(form) };
      if (submissionId) params.submission_id = submissionId;
      return track('form_submit_success', params);
    },
    formError: function (form, errorType, errorField) {
      var params = { form_id: formId(form), error_type: errorType || 'unknown' };
      if (errorField) params.error_field = errorField;
      return track('form_submit_error', params);
    },
    _test: { isProduction: isProduction, pageType: pageType, safeParams: safeParams }
  };

  initGtag();
  function init() { document.addEventListener('click', onClick, true); initScrollDepth(); initSections(); initForms(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window, document);
