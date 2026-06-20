const { getSafeAreaLayout } = require('../../utils/safe-area');
const { hasSession } = require('../../utils/profile-guard');
const loginTrigger = require('../../utils/login-trigger');
const analytics = require('../../utils/analytics');

Page({
  syncTabBar() {
    const tabBar = this.getTabBar && this.getTabBar();
    if (tabBar && typeof tabBar.setSelected === 'function') {
      tabBar.setSelected(1);
    }
  },

  data: {
    statusBarHeight: 20,
  },

  onLoad() {
    const layout = getSafeAreaLayout();
    this.setData({ statusBarHeight: layout.statusBarHeight });
  },

  onShow() {
    this.syncTabBar();
  },

  onChooseImage() {
    analytics.track('convert_image_upload_click', { source: 'convert' });
    if (!hasSession()) {
      loginTrigger.showLogin();
      return;
    }
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const filePath = res.tempFiles[0].tempFilePath;
        analytics.track('convert_image_upload_result', { result: 'success', source: 'convert' }, { immediate: true });
        wx.navigateTo({
          url: '/pages/generate/generate?imageUrl=' + encodeURIComponent(filePath)
        });
      },
      fail: () => {
        analytics.track('convert_image_upload_result', { result: 'cancel', fail_reason: 'unknown', source: 'convert' });
      }
    });
  }
});
