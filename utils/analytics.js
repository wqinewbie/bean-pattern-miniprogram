const request = require('./request');
const storage = require('./storage');

const MAX_QUEUE_SIZE = 100;
const FLUSH_BATCH_SIZE = 20;
const FLUSH_INTERVAL_MS = 10000;
const SESSION_KEY = storage.KEYS.ANALYTICS_SESSION_ID;
const QUEUE_KEY = storage.KEYS.ANALYTICS_QUEUE;

const PAGE_VIEW_EVENTS = {
  'pages/index/index': 'page_home_view',
  'pages/convert/convert': 'page_convert_view',
  'pages/ai-generate/ai-generate': 'page_ai_generate_view',
  'pages/preview/preview': 'page_preview_view',
  'pages/result/result': 'page_preview_view',
  'pages/ai-result/ai-result': 'page_preview_view',
  'pages/draw/draw': 'page_draw_view',
  'pages/focus-mode/focus-mode': 'page_focus_view',
  'pages/my-patterns/my-patterns': 'page_pattern_box_view',
  'pages/history/history': 'page_history_view',
  'pages/draft/draft': 'page_draft_view',
  'pages/profile/profile': 'page_profile_view',
};

let queue = storage.getJSON(QUEUE_KEY, []);
let flushing = false;
let flushTimer = null;
let pageInstalled = false;

function now() {
  return Date.now();
}

function randomId(prefix) {
  return `${prefix}_${now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function getSessionId() {
  let sessionId = storage.get(SESSION_KEY, '');
  if (!sessionId) {
    sessionId = randomId('as');
    storage.set(SESSION_KEY, sessionId);
  }
  return sessionId;
}

function currentPagePath() {
  try {
    const pages = getCurrentPages();
    const current = pages && pages.length ? pages[pages.length - 1] : null;
    return current && current.route ? current.route : '';
  } catch (_) {
    return '';
  }
}

function previousPagePath() {
  try {
    const pages = getCurrentPages();
    const previous = pages && pages.length > 1 ? pages[pages.length - 2] : null;
    return previous && previous.route ? previous.route : '';
  } catch (_) {
    return '';
  }
}

function isLogin() {
  return !!storage.get(storage.KEYS.SESSION_ID, '');
}

function normalizeParams(params) {
  if (!params || typeof params !== 'object' || Array.isArray(params)) return {};
  const output = {};
  Object.keys(params).forEach((key) => {
    const value = params[key];
    if (value === undefined || typeof value === 'function') return;
    output[key] = value;
  });
  return output;
}

function persistQueue() {
  storage.setJSON(QUEUE_KEY, queue.slice(-MAX_QUEUE_SIZE));
}

function track(eventName, params = {}, options = {}) {
  if (!eventName) return;
  const normalized = normalizeParams(params);
  const page = options.page || currentPagePath() || 'unknown';
  const event = {
    clientEventId: randomId('evt'),
    eventName,
    eventTime: now(),
    page,
    referPage: options.referPage || previousPagePath() || '',
    isLogin: isLogin(),
    isVip: normalized.is_vip,
    vipLevel: normalized.vip_level,
    aiQuota: normalized.ai_quota,
    source: normalized.source,
    patternId: normalized.pattern_id,
    patternSource: normalized.pattern_source,
    result: normalized.result,
    failReason: normalized.fail_reason,
    params: normalized,
  };
  queue.push(event);
  if (queue.length > MAX_QUEUE_SIZE) {
    queue = queue.slice(-MAX_QUEUE_SIZE);
  }
  persistQueue();
  scheduleFlush();
  if (options.immediate) flush();
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flush();
  }, FLUSH_INTERVAL_MS);
}

function flush() {
  if (flushing || !queue.length) return Promise.resolve();
  flushing = true;
  const batch = queue.slice(0, FLUSH_BATCH_SIZE);
  return request.post('/analytics/events', {
    sessionId: getSessionId(),
    events: batch,
  }).then(() => {
    queue = queue.slice(batch.length);
    persistQueue();
    flushing = false;
    if (queue.length) scheduleFlush();
  }).catch(() => {
    flushing = false;
    persistQueue();
  });
}

function trackPageView(route, pageInstance) {
  const eventName = PAGE_VIEW_EVENTS[route];
  if (!eventName) return;
  const data = (pageInstance && pageInstance.data) || {};
  track(eventName, {
    source: data.source || '',
    pattern_id: data.patternId || data.id || '',
    pattern_source: data.patternSource || data.sourceType || '',
    progress_percent: data.progressPercent,
    used_count: data.usedCount,
    capacity_limit: data.capacityLimit,
    ai_quota: data.magicCount,
  }, { page: route });
}

function installPageTracking() {
  if (pageInstalled || typeof Page !== 'function') return;
  pageInstalled = true;
  const originalPage = Page;
  Page = function patchedPage(config) {
    const originalOnShow = config.onShow;
    const originalShare = config.onShareAppMessage;
    config.onShow = function patchedOnShow(...args) {
      if (typeof originalOnShow === 'function') {
        originalOnShow.apply(this, args);
      }
      trackPageView(this.route || currentPagePath(), this);
    };
    if (typeof originalShare === 'function') {
      config.onShareAppMessage = function patchedShare(...args) {
        const result = originalShare.apply(this, args) || {};
        track('share_initiate', {
          share_scene: result.shareScene || result.scene || 'unknown',
          target_id: result.targetId || '',
        }, { page: this.route || currentPagePath(), immediate: true });
        return result;
      };
    }
    return originalPage(config);
  };
}

function captureLaunch(options) {
  const query = (options && options.query) || {};
  const shareRecordId = query.shareRecordId || query.share_record_id || '';
  const shareUserId = query.shareUserId || query.share_user_id || '';
  const inviteCode = query.inviteCode || query.invite_code || '';
  if (shareRecordId || inviteCode) {
    track('share_visit', {
      share_scene: inviteCode ? 'invite' : 'unknown',
      share_record_id: shareRecordId,
      share_user_id: shareUserId,
      invite_code: inviteCode,
      is_new_user: !isLogin(),
    }, { immediate: true });
  }
}

module.exports = {
  track,
  flush,
  installPageTracking,
  captureLaunch,
};
