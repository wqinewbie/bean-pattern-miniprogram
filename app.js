const request = require('./utils/request');

App({
  globalData: {
    appName: '拼豆精灵',
    watermarkConfig: {
      enabled: true,
      text: '拼豆精灵',
      fontSize: 36,
      color: 'rgba(100,100,100,0.15)',
      angle: -30,
      spacingXRatio: 0.22,
      spacingYRatio: 0.18
    },
    watermarkConfigLoaded: false, // 标记是否已加载水印配置
    prefetch: {
      profile: null,
      stats: null,
      profileAt: 0,
    },
    // 结果页数据缓存：key = resultToken
    resultDataMap: {}
  },

  _silentLoginPromise: null,

  onLaunch(options) {
    this.captureInviteCode(options);
    const sessionId = wx.getStorageSync('sessionId');
    if (!sessionId) {
      this.silentLogin();
    }
    this.preloadTabPages();
    if (sessionId) {
      this.prefetchProfileData();
      this.fetchWatermarkConfig();
    }
  },

  onShow(options) {
    this.captureInviteCode(options);
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

  captureInviteCode(options) {
    const query = (options && options.query) || {};
    const inviteCode = query.inviteCode || query.invite_code || '';
    if (inviteCode) {
      wx.setStorageSync('pendingInviteCode', inviteCode);
    }
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
          const inviteCode = wx.getStorageSync('pendingInviteCode') || '';
          request.post('/auth/login', { code: res.code, inviteCode })
            .then((data) => {
              const sessionId = data.sessionId || data.token;
              if (!sessionId) {
                reject(new Error('no session id'));
                return;
              }
              wx.setStorageSync('sessionId', sessionId);
              if (data.inviteCode) wx.setStorageSync('myInviteCode', data.inviteCode);
              wx.removeStorageSync('pendingInviteCode');
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
  },

  // 获取水印配置（包含用户个人配置）
  fetchWatermarkConfig() {
    request.get('/watermark/user-config')
      .then((config) => {
        this.updateWatermarkConfig(config);
      })
      .catch((err) => {
        console.warn('[app] 获取水印配置失败', err);
      });
  },

  // 更新水印配置到 globalData
  updateWatermarkConfig(config) {
    if (!config) return;

    this.globalData.appName = config.appName || this.globalData.appName;
    this.globalData.watermarkConfig = {
      enabled: config.watermark?.enabled ?? true,
      text: config.watermark?.text || config.appName || this.globalData.appName,
      fontSize: config.watermark?.fontSize || 36,
      color: config.watermark?.color || 'rgba(100,100,100,0.15)',
      angle: config.watermark?.angle || -30,
      spacingXRatio: config.watermark?.spacingXRatio || 0.22,
      spacingYRatio: config.watermark?.spacingYRatio || 0.18
    };
    this.globalData.watermarkConfigLoaded = true;

    console.log('[app] 水印配置已更新', {
      appName: this.globalData.appName,
      watermarkEnabled: this.globalData.watermarkConfig.enabled,
      watermarkText: this.globalData.watermarkConfig.text
    });
  }
});
