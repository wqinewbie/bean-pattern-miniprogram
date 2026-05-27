const request = require('./utils/request');
const storage = require('./utils/storage');
const store = require('./utils/store');

App({
  globalData: {
    appName: '拼豆魔法屋',
    watermarkConfig: {
      enabled: true,
      text: '拼豆魔法屋出品',
      fontSize: 36,
      color: 'rgba(100,100,100,0.15)',
      angle: -30,
      spacingXRatio: 0.22,
      spacingYRatio: 0.18
    },
    watermarkConfigLoaded: false,
    prefetch: {
      profile: null,
      stats: null,
      profileAt: 0,
    },
    resultDataMap: {}
  },

  _silentLoginPromise: null,
  _suppressSilentLogin: false,
  _silentLoginToken: 0,

  onLaunch(options) {
    this.captureInviteCode(options);
    const sessionId = storage.get(storage.KEYS.SESSION_ID, '');
    this.preloadTabPages();
    if (sessionId) {
      this.prefetchProfileData();
      this.fetchWatermarkConfig();
    }
  },

  onShow(options) {
    this.captureInviteCode(options);
    const sessionId = storage.get(storage.KEYS.SESSION_ID, '');
    if (sessionId) this.prefetchProfileData();
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
    const sessionId = storage.get(storage.KEYS.SESSION_ID, '');
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
      storage.set(storage.KEYS.PENDING_INVITE_CODE, inviteCode);
    }
  },

  ensureSession() {
    const cached = storage.get(storage.KEYS.SESSION_ID, '');
    if (cached) return Promise.resolve(cached);
    if (this._suppressSilentLogin) return Promise.reject(new Error('silent login suppressed'));
    if (this._silentLoginPromise) return this._silentLoginPromise;
    const loginToken = ++this._silentLoginToken;

    this._silentLoginPromise = new Promise((resolve, reject) => {
      wx.login({
        success: (res) => {
          if (!res.code) {
            reject(new Error('wx.login no code'));
            return;
          }
          const inviteCode = storage.get(storage.KEYS.PENDING_INVITE_CODE, '');
          request.post('/auth/login', { code: res.code, inviteCode })
            .then((data) => {
              if (this._suppressSilentLogin || loginToken !== this._silentLoginToken) {
                reject(new Error('silent login cancelled'));
                return;
              }
              const sessionId = data.sessionId || data.token;
              if (!sessionId) {
                reject(new Error('no session id'));
                return;
              }
              storage.set(storage.KEYS.SESSION_ID, sessionId);
              this._suppressSilentLogin = false;
              if (data.inviteCode) storage.set(storage.KEYS.MY_INVITE_CODE, data.inviteCode);
              storage.remove(storage.KEYS.PENDING_INVITE_CODE);
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
    });

    return this._silentLoginPromise;
  },

  updateWatermarkConfig(config) {
    if (!config) return;
    const appName = config.appName || this.globalData.appName;
    this.globalData.appName = appName;
    store.set('appName', appName);
    if (config.watermark) {
      this.globalData.watermarkConfig = { ...this.globalData.watermarkConfig, ...config.watermark };
      this.globalData.watermarkConfig.isVip = !!config.isVip;
      this.globalData.watermarkConfig.canCustomize = !!config.canCustomize;
      store.set('watermarkConfig', this.globalData.watermarkConfig);
    }
    store.set('canCustomizeWatermark', !!config.canCustomize);
    this.globalData.watermarkConfigLoaded = true;
    store.set('watermarkConfigLoaded', true);
  },

  fetchWatermarkConfig() {
    request.get('/watermark/user-config')
      .then(config => this.updateWatermarkConfig(config))
      .catch(() => {});
  },

  suppressSilentLogin() {
    this._suppressSilentLogin = true;
    this._silentLoginPromise = null;
    this._silentLoginToken += 1;
  },

  resumeSilentLogin() {
    this._suppressSilentLogin = false;
  },

  silentLogin() {
    if (this._silentLoginPromise) return this._silentLoginPromise;
    this._silentLoginPromise = this.ensureSession()
      .catch(() => {
        this._silentLoginPromise = null;
      });
    return this._silentLoginPromise;
  },
});
