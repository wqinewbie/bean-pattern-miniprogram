/**
 * Canvas 2D 控制器 — 函数式工具
 *
 * 提供页面级别的 canvas 2d 组件操作：等待就绪、渲染、导出。
 * 所有函数都不持有状态，由调用方（页面）管理业务状态。
 */

var DEFAULT_COMP_RETRY = 12;
var DEFAULT_CTX_RETRY = 20;
var DEFAULT_RETRY_DELAY = 80;

/**
 * 等待 bead-canvas2d 组件就绪（组件挂载 + context 可用）
 *
 * @param {Object} pageInstance - 页面或组件实例（需要有 selectComponent 方法）
 * @param {string} compId - 组件 id（不含 #）
 * @param {Object} [options]
 * @param {number} [options.maxCompRetry=12] - 组件获取最大重试次数
 * @param {number} [options.maxCtxRetry=20] - context 就绪最大重试次数
 * @param {number} [options.delay=80] - 重试间隔(ms)
 * @param {string} [options.label] - 日志标签
 * @returns {Promise<{comp, ctx, canvas}>}
 */
function waitCanvas2dReady(pageInstance, compId, options) {
  var maxCompRetry = (options && options.maxCompRetry != null) ? options.maxCompRetry : DEFAULT_COMP_RETRY;
  var maxCtxRetry = (options && options.maxCtxRetry != null) ? options.maxCtxRetry : DEFAULT_CTX_RETRY;
  var delay = (options && options.delay != null) ? options.delay : DEFAULT_RETRY_DELAY;
  var label = (options && options.label) || compId;
  var compRetry = 0;
  var ctxRetry = 0;

  return new Promise(function tryResolve(resolve, reject) {
    var comp = pageInstance.selectComponent('#' + compId);
    if (!comp || typeof comp.getContext !== 'function') {
      compRetry++;
      if (compRetry <= maxCompRetry) {
        setTimeout(function () { tryResolve(resolve, reject); }, delay);
        return;
      }
      reject(new Error('[' + label + '] component not ready after ' + maxCompRetry + ' retries'));
      return;
    }

    var context = comp.getContext();
    if (!context || !context.ready || !context.ctx) {
      ctxRetry++;
      if (ctxRetry <= maxCtxRetry) {
        setTimeout(function () { tryResolve(resolve, reject); }, delay);
        return;
      }
      reject(new Error('[' + label + '] context not ready after ' + maxCtxRetry + ' retries'));
      return;
    }

    resolve({ comp: comp, ctx: context.ctx, canvas: context.canvas });
  });
}

/**
 * 获取页面元素尺寸（用于确定 canvas 预览/导出尺寸）
 *
 * @param {string} selector - CSS 选择器
 * @returns {Promise<{width, height}>}
 */
function queryElementRect(selector) {
  return new Promise(function (resolve) {
    var query = wx.createSelectorQuery();
    query.select(selector).boundingClientRect(function (rect) {
      resolve({
        width: (rect && rect.width) || 0,
        height: (rect && rect.height) || 0
      });
    }).exec();
  });
}

module.exports = {
  waitCanvas2dReady: waitCanvas2dReady,
  queryElementRect: queryElementRect
};
