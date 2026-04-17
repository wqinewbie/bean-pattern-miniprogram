/**
 * 全局弹窗管理器
 * 在首页onShow时调用 CheckAndShowPopup() 检查并显示弹窗
 */

const request = require('./request');

let currentPopup = null;
let popupComponent = null;

// 设置弹窗组件实例
function setPopupComponent(comp) {
  popupComponent = comp;
}

// 检查并显示弹窗
async function checkAndShowPopup() {
  // 检查登录状态
  const sessionId = wx.getStorageSync('sessionId');
  if (!sessionId) return;

  try {
    const popups = await request.get('/popup/active');
    if (!popups || !Array.isArray(popups) || popups.length === 0) return;

    // 获取"不再显示"和"展示间隔"配置
    const hidden = wx.getStorageSync('popupHidden') || {};
    const lastShown = wx.getStorageSync('popupLastShown') || {};
    const now = Date.now();

    // 按优先级排序，找到第一个应该显示的
    for (const popup of popups) {
      const key = popup.key;
      
      // 检查是否在"不再显示"列表中
      if (hidden[key]) {
        continue;
      }
      
      // 检查展示间隔
      if (popup.showInterval && popup.showInterval > 0) {
        const last = lastShown[key];
        if (last) {
          const intervalMs = popup.showInterval * 24 * 60 * 60 * 1000;
          if (now - last < intervalMs) {
            continue; // 还在间隔期内
          }
        }
      }
      
      // 显示弹窗
      currentPopup = popup;
      if (popupComponent) {
        popupComponent.show(key, popup);
      }
      break;
    }
  } catch (e) {
    console.error('检查弹窗失败', e);
  }
}

// 获取当前弹窗配置
function getCurrentPopup() {
  return currentPopup;
}

// 关闭当前弹窗
function closePopup() {
  if (popupComponent) {
    popupComponent.hide();
  }
  currentPopup = null;
}

module.exports = {
  setPopupComponent,
  checkAndShowPopup,
  getCurrentPopup,
  closePopup
};
