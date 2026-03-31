Page({
  data: {
    statusBarHeight: 20,
  },

  onLoad() {
    wx.getSystemInfo({
      success: (res) => {
        this.setData({ statusBarHeight: res.statusBarHeight || 20 });
      }
    });
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
