const { getSafeAreaLayout } = require('../../utils/safe-area');

Page({
  data: {
    statusBarHeight: 20,
  },

  onLoad() {
    const layout = getSafeAreaLayout();
    this.setData({ statusBarHeight: layout.statusBarHeight });
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setSelected(1);
    }
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
