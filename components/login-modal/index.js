const request = require('../../utils/request');
const storage = require('../../utils/storage');
const { cacheProfile } = require('../../utils/profile-guard');

Component({
  data: {
    visible: false,
    isFirstLogin: true,
    submitting: false
  },

  methods: {
    show(options = {}) {
      const everRegistered = storage.get(storage.KEYS.EVER_REGISTERED, '');
      this._loginCallback = options.callback || null;
      this.setData({
        visible: true,
        isFirstLogin: !everRegistered,
        submitting: false
      });
    },

    hide() {
      this._loginCallback = null;
      this.setData({ visible: false, submitting: false });
    },

    onClose() {
      const app = getApp();
      if (app && typeof app.suppressSilentLogin === 'function') {
        app.suppressSilentLogin();
      }
      this.hide();
      this.triggerEvent('close');
    },

    onWxLogin() {
      if (this.data.submitting) return;
      this.setData({ submitting: true });

      const app = getApp();

      new Promise((resolve, reject) => {
        wx.login({
          success: (res) => {
            if (!res.code) {
              reject(new Error('NO_CODE'));
              return;
            }
            resolve(res.code);
          },
          fail: (err) => reject(err || new Error('WX_LOGIN_FAILED'))
        });
      })
        .then((code) => request.post('/auth/login', { code }))
        .then((ret) => {
          const sessionId = ret && ret.sessionId;
          if (!sessionId) throw new Error('NO_SESSION');

          storage.set(storage.KEYS.SESSION_ID, sessionId);
          storage.set(storage.KEYS.EVER_REGISTERED, true);
          if (app && typeof app.resumeSilentLogin === 'function') {
            app.resumeSilentLogin();
          }

          const profile = ret.profile || {};
          if (profile.nickName) storage.set(storage.KEYS.NICK_NAME, profile.nickName);
          if (profile.avatarUrl) storage.set(storage.KEYS.AVATAR_URL, profile.avatarUrl);
          cacheProfile(profile);

          const vipExpire = profile.vipExpireAt || profile.vipExpire || '';
          if (vipExpire) storage.set(storage.KEYS.VIP_EXPIRE, vipExpire);

          const aiQuota = Number(profile.aiQuota !== undefined ? profile.aiQuota : profile.magicCount);
          const magicCount = Number.isNaN(aiQuota) ? 0 : aiQuota;
          storage.set(storage.KEYS.MAGIC_COUNT, magicCount);

          this.setData({ visible: false, submitting: false });
          wx.showToast({ title: '登录成功', icon: 'success' });

          if (app && typeof app.fetchWatermarkConfig === 'function') {
            app.fetchWatermarkConfig();
          }

          this.triggerEvent('loginsuccess', { profile });

          if (typeof this._loginCallback === 'function') {
            const cb = this._loginCallback;
            this._loginCallback = null;
            setTimeout(() => cb(), 100);
          }
        })
        .catch(() => {
          wx.showToast({ title: '登录失败，请重试', icon: 'none' });
        })
        .finally(() => {
          this.setData({ submitting: false });
        });
    }
  }
});
