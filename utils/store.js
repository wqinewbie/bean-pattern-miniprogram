/**
 * 轻量全局状态管理
 * 替代 app.globalData 的直接读写，提供响应式更新
 */

const _store = {};
const _watchers = {};

function get(key, defaultValue) {
  const app = getApp();
  if (app && app.globalData && app.globalData[key] !== undefined) {
    return app.globalData[key];
  }
  return defaultValue;
}

function set(key, value) {
  const app = getApp();
  if (!app) return;
  if (!app.globalData) app.globalData = {};
  app.globalData[key] = value;
}

module.exports = { get, set };
