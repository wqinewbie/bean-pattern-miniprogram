/**
 * 水印配置工具类
 * 仅从 app.globalData 读取缓存，统一由 app.js 管理加载
 */

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

function getWatermarkConfig() {
  const app = getApp();
  if (app && app.globalData && app.globalData.watermarkConfigLoaded) {
    return {
      appName: app.globalData.appName || DEFAULT_CONFIG.appName,
      watermarkConfig: app.globalData.watermarkConfig || DEFAULT_CONFIG.watermarkConfig
    };
  }
  return DEFAULT_CONFIG;
}

module.exports = {
  getWatermarkConfig
};
