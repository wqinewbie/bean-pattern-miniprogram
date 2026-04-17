const app = getApp();

Page({
  data: {
    videoUrl: '',
    title: '',
    description: '',
    showError: false,
  },

  onLoad(options) {
    if (options.url) {
      this.setData({ videoUrl: decodeURIComponent(options.url) });
    }
    if (options.title) {
      this.setData({ title: decodeURIComponent(options.title) });
    }
    if (options.desc) {
      this.setData({ description: decodeURIComponent(options.desc) });
    }
  },

  onVideoError(e) {
    console.error('Video error:', e.detail);
    this.setData({ showError: true });
  },

  onVideoLoaded(e) {
    console.log('Video loaded');
  },
});
