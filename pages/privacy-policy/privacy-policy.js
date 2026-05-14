const { getSafeAreaLayout } = require('../../utils/safe-area');

Page({
  data: {
    statusBarHeight: 44,
    navHeight: 88,
  },

  onLoad() {
    this.calcSafeAreas();
  },

  calcSafeAreas() {
    try {
      const layout = getSafeAreaLayout();
      this.setData({
        statusBarHeight: layout.statusBarHeight || 44,
        navHeight: layout.navHeight || 88,
      });
    } catch (e) {
      const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : {};
      const appBaseInfo = wx.getAppBaseInfo ? wx.getAppBaseInfo() : {};
      this.setData({ statusBarHeight: windowInfo.statusBarHeight || appBaseInfo.statusBarHeight || 44 });
    }
  },

  onBack() {
    wx.navigateBack();
  },
});
