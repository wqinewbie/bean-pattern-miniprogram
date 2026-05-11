/**
 * 水印配置工具类
 * 提供统一的水印配置获取方法
 */

const request = require('./request');

/**
 * 获取水印配置
 * 优先使用 app.globalData，如果未加载则调用接口获取
 *
 * @returns {Promise<{appName: string, watermarkConfig: object}>}
 */
async function getWatermarkConfig() {
  const app = getApp();

  // 默认配置（兜底）
  const defaultConfig = {
    appName: '拼豆精灵',
    watermarkConfig: {
      enabled: true,
      text: '拼豆精灵',
      fontSize: 36,
      color: 'rgba(100,100,100,0.15)',
      angle: -30,
      spacingXRatio: 0.22,
      spacingYRatio: 0.18
    }
  };

  // 优先使用 globalData（如果已加载）
  if (app && app.globalData && app.globalData.watermarkConfigLoaded) {
    console.log('[watermark-helper] 使用 globalData 水印配置');
    return {
      appName: app.globalData.appName || defaultConfig.appName,
      watermarkConfig: app.globalData.watermarkConfig || defaultConfig.watermarkConfig
    };
  }

  // globalData 未加载，调用接口获取
  try {
    const config = await request.get('/watermark/user-config');

    const result = {
      appName: config.appName || defaultConfig.appName,
      watermarkConfig: {
        enabled: config.watermark?.enabled ?? true,
        text: config.watermark?.text || config.appName || defaultConfig.appName,
        fontSize: config.watermark?.fontSize || 36,
        color: config.watermark?.color || 'rgba(100,100,100,0.15)',
        angle: config.watermark?.angle || -30,
        spacingXRatio: config.watermark?.spacingXRatio || 0.22,
        spacingYRatio: config.watermark?.spacingYRatio || 0.18
      }
    };

    // 更新到 globalData
    if (app && app.updateWatermarkConfig) {
      app.updateWatermarkConfig(config);
    }

    console.log('[watermark-helper] 从接口获取水印配置');
    return result;
  } catch (e) {
    console.warn('[watermark-helper] 获取水印配置失败，使用默认配置', e);
    return defaultConfig;
  }
}

module.exports = {
  getWatermarkConfig
};
