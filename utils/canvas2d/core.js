const DEFAULT_DPR = 1;
const INIT_MAX_RETRY = 5;
const INIT_RETRY_DELAY = 60;
const INIT_TIMEOUT = 8000;

function getDpr() {
  try {
    const deviceInfo = wx.getDeviceInfo ? wx.getDeviceInfo() : null;
    return (deviceInfo && deviceInfo.pixelRatio) ? deviceInfo.pixelRatio : DEFAULT_DPR;
  } catch (_) {
    return DEFAULT_DPR;
  }
}

function selectCanvasNode(component, selector, timeout) {
  const limit = Number(timeout) || INIT_TIMEOUT;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('selectCanvasNode timeout: ' + selector));
    }, limit);

    try {
      component
        .createSelectorQuery()
        .select(selector)
        .fields({ node: true, size: true })
        .exec((res) => {
          clearTimeout(timer);
          const item = res && res[0];
          if (!item || !item.node) {
            reject(new Error('canvas node not found: ' + selector));
            return;
          }
          resolve(item);
        });
    } catch (err) {
      clearTimeout(timer);
      reject(err);
    }
  });
}

function _initOnce(component, selector) {
  return selectCanvasNode(component, selector).then((item) => {
    const canvas = item.node;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('2d context unavailable');
    }
    const dpr = getDpr();
    return { canvas, ctx, dpr, size: { width: item.width || 0, height: item.height || 0 } };
  });
}

async function init2dCanvas(component, selector, options) {
  const maxRetry = (options && options.maxRetry != null) ? options.maxRetry : INIT_MAX_RETRY;
  const retryDelay = (options && options.retryDelay != null) ? options.retryDelay : INIT_RETRY_DELAY;
  let lastErr;
  for (let attempt = 0; attempt <= maxRetry; attempt++) {
    try {
      return await _initOnce(component, selector);
    } catch (err) {
      lastErr = err;
      if (attempt < maxRetry) {
        await new Promise((r) => setTimeout(r, retryDelay * (attempt + 1)));
      }
    }
  }
  throw lastErr || new Error('init2dCanvas failed after retries');
}

function resize2dCanvas({ canvas, ctx, width, height, dpr }) {
  if (!canvas || !ctx) return;
  const w = Math.max(1, Math.floor(Number(width) || 1));
  const h = Math.max(1, Math.floor(Number(height) || 1));
  const ratio = Math.max(1, Number(dpr) || 1);

  canvas.width = Math.max(1, Math.floor(w * ratio));
  canvas.height = Math.max(1, Math.floor(h * ratio));

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(ratio, ratio);
}

function clear2dCanvas(ctx, width, height) {
  if (!ctx) return;
  const w = Math.max(1, Math.floor(Number(width) || 1));
  const h = Math.max(1, Math.floor(Number(height) || 1));
  ctx.clearRect(0, 0, w, h);
}

module.exports = {
  getDpr,
  init2dCanvas,
  resize2dCanvas,
  clear2dCanvas
};
