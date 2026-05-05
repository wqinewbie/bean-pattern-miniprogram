const request = require('./utils/request');

App({
  globalData: {
    prefetch: {
      profile: null,
      stats: null,
      profileAt: 0,
    },
    // 结果页数据缓存：key = resultToken
    resultDataMap: {}
  },

  _silentLoginPromise: null,

  onLaunch() {
    const sessionId = wx.getStorageSync('sessionId');
    if (!sessionId) {
      this.silentLogin();
    }
    this.preloadTabPages();
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

  prefetchProfileData() {
    const sessionId = wx.getStorageSync('sessionId');
    if (!sessionId) return;
    Promise.all([
      request.get('/user/profile'),
      request.get('/user/stats')
    ])
      .then(([profile, stats]) => {
        this.globalData.prefetch.profile = profile || null;
        this.globalData.prefetch.stats = stats || null;
        this.globalData.prefetch.profileAt = Date.now();
      })
      .catch(() => {});
  },

  ensureSession() {
    const cached = wx.getStorageSync('sessionId');
    if (cached) return Promise.resolve(cached);
    if (this._silentLoginPromise) return this._silentLoginPromise;

    this._silentLoginPromise = new Promise((resolve, reject) => {
      wx.login({
        success: (res) => {
          if (!res.code) {
            reject(new Error('wx.login no code'));
            return;
          }
          request.post('/auth/login', { code: res.code })
            .then((data) => {
              const sessionId = data.sessionId || data.token;
              if (!sessionId) {
                reject(new Error('no session id'));
                return;
              }
              wx.setStorageSync('sessionId', sessionId);
              this.prefetchProfileData();
              resolve(sessionId);
            })
            .catch((err) => {
              reject(err || new Error('silent login failed'));
            });
        },
        fail: (err) => {
          reject(err || new Error('wx.login failed'));
        }
      });
    }).finally(() => {
      this._silentLoginPromise = null;
    });

    return this._silentLoginPromise;
  },

  // 静默登录：只换取 sessionId，不强制用户填资料
  silentLogin() {
    this.ensureSession().catch(() => {
      console.warn('silentLogin failed');
    });
  }
});
