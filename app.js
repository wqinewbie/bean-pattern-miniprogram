const request = require('./utils/request');

App({
  globalData: {
    prefetch: {
      templates: null,
      templatesAt: 0,
      profile: null,
      stats: null,
      profileAt: 0,
    }
  },

  onLaunch() {
    const sessionId = wx.getStorageSync('sessionId');
    if (!sessionId) {
      this.silentLogin();
    }
    this.preloadTabPages();
    this.prefetchHomeData();
    if (sessionId) {
      this.prefetchProfileData();
    }
  },

  onShow() {
    const sessionId = wx.getStorageSync('sessionId');
    if (!sessionId) {
      this.silentLogin();
      return;
    }
    this.prefetchProfileData();
  },

  preloadTabPages() {
    if (typeof wx.preloadPage !== 'function') return;
    setTimeout(() => {
      wx.preloadPage({ url: '/pages/convert/convert' });
      wx.preloadPage({ url: '/pages/ai-generate/ai-generate' });
      wx.preloadPage({ url: '/pages/profile/profile' });
    }, 300);
  },

  prefetchHomeData() {
    request.get('/api/creator/patterns?limit=100')
      .then((data) => {
        this.globalData.prefetch.templates = Array.isArray(data) ? data : [];
        this.globalData.prefetch.templatesAt = Date.now();
      })
      .catch(() => {});
  },

  prefetchProfileData() {
    const sessionId = wx.getStorageSync('sessionId');
    if (!sessionId) return;
    Promise.all([
      request.get('/api/user/profile'),
      request.get('/api/user/stats')
    ])
      .then(([profile, stats]) => {
        this.globalData.prefetch.profile = profile || null;
        this.globalData.prefetch.stats = stats || null;
        this.globalData.prefetch.profileAt = Date.now();
      })
      .catch(() => {});
  },

  // 静默登录：只换取 sessionId，不强制用户填资料
  silentLogin() {
    wx.login({
      success: (res) => {
        if (!res.code) return;
        request.post('/api/auth/login', { code: res.code })
          .then((data) => {
            const sessionId = data.sessionId || data.token;
            if (sessionId) {
              wx.setStorageSync('sessionId', sessionId);
              this.prefetchProfileData();
            }
          })
          .catch(() => {
            console.warn('silentLogin failed');
          });
      }
    });
  }
});
