/**
 * 水印配置工具类
 * 优先使用 app.globalData 缓存；未加载时主动拉取后端配置，避免导出色号图时用旧水印。
 */

const request = require('./request');
const storage = require('./storage');

const DEFAULT_CONFIG = {
  appName: '拼豆魔法屋',
  watermarkConfig: {
    enabled: true,
    text: '拼豆魔法屋出品',
    fontSize: 36,
    color: 'rgba(100,100,100,0.15)',
    angle: -30,
    spacingXRatio: 0.22,
    spacingYRatio: 0.18
  }
};

function normalizeConfig(config) {
  const watermark = {
    ...DEFAULT_CONFIG.watermarkConfig,
    ...((config && config.watermark) || (config && config.watermarkConfig) || {})
  };
  if (config && config.isVip !== undefined) watermark.isVip = !!config.isVip;
  if (config && config.canCustomize !== undefined) watermark.canCustomize = !!config.canCustomize;
  return {
    appName: (config && config.appName) || DEFAULT_CONFIG.appName,
    watermarkConfig: watermark
  };
}

function getCachedConfig() {
  const app = getApp();
  if (app && app.globalData && app.globalData.watermarkConfigLoaded) {
    return normalizeConfig({
      appName: app.globalData.appName || DEFAULT_CONFIG.appName,
      watermarkConfig: app.globalData.watermarkConfig || DEFAULT_CONFIG.watermarkConfig
    });
  }
  return normalizeConfig(DEFAULT_CONFIG);
}

async function getWatermarkConfig(options = {}) {
  const app = getApp();
  if (!options.force && app && app.globalData && app.globalData.watermarkConfigLoaded) {
    return getCachedConfig();
  }

  const sessionId = storage.get(storage.KEYS.SESSION_ID, '');
  if (!sessionId) return getCachedConfig();

  try {
    const config = await request.get('/watermark/user-config');
    if (app && typeof app.updateWatermarkConfig === 'function') {
      app.updateWatermarkConfig(config);
    }
    return normalizeConfig(config);
  } catch (e) {
    return getCachedConfig();
  }
}

module.exports = {
  getWatermarkConfig
};
