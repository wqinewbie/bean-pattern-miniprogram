const { getSafeAreaLayout } = require('../../utils/safe-area');

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
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const filePath = res.tempFiles[0].tempFilePath;
        wx.navigateTo({
          url: '/pages/generate/generate?imageUrl=' + encodeURIComponent(filePath)
        });
      },
      fail: () => {}
    });
  }
});
