/**
 * profile.js 面板数据逻辑提取
 * 减少 profile.js 行数，面板渲染逻辑统一管理
 */

const request = require('../utils/request');
const storage = require('../utils/storage');

/**
 * 加载魔法次数面板数据
 */
function loadMagicData(page) {
  return request.get('/user/stats').then(stats => {
    const quota = (stats && typeof stats.aiQuota === 'number') ? stats.aiQuota : 0;
    page.setData({ magicCount: quota });
    storage.set(storage.KEYS.MAGIC_COUNT, quota);
    return stats;
  });
}

/**
 * 加载礼品面板数据
 */
function loadGiftData(page) {
  return request.get('/gift/my').then(gifts => {
    if (!Array.isArray(gifts)) return;
    const normalized = gifts.map(g => ({
      ...g,
      status: g.status === undefined ? 0 : g.status,
      expireAt: g.expireAt || null,
    }));
    storage.setJSON(storage.KEYS.GIFTS, normalized);
    const visible = page.filterGiftsByTab ? page.filterGiftsByTab(normalized, page.data.giftTab || 'all') : normalized;
    page.setData({ gifts: normalized, visibleGifts: visible });
  }).catch(() => {});
}

module.exports = { loadMagicData, loadGiftData };
