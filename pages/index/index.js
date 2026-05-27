const request = require('../../utils/request');
const { requireLogin, cacheProfile, hasSession } = require('../../utils/profile-guard');
const popupManager = require('../../utils/popup-manager');
const storage = require('../../utils/storage');

const app = getApp();


Page({
  syncTabBar() {
    const tabBar = this.getTabBar && this.getTabBar();
    if (tabBar && typeof tabBar.setSelected === 'function') {
      tabBar.setSelected(0);
    }
  },

  data: {
    loading: false,
    loadingText: '处理中...',
    showLoginModal: false,
    isFirstLogin: true,
    loginSubmitting: false,
    nickName: '',
    avatarUrl: '',
    isLoggedIn: false,
    isVip: false,
    magicCount: 0,
    statusBarHeight: 44,
    bannerTop: 120,
    bannerList: [],
    activeBanner: 0,
    currentBanner: {
      title: '初夏限定拼豆',
      subTitle: '一键生成专属图纸',
      tagText: '魔法上新',
      imageUrl: '',
      linkType: 'NONE',
      linkValue: ''
    },
    tutorials: [],
    currentPopup: {},
  },

  onLoad() {
    const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : {};
    const appBaseInfo = wx.getAppBaseInfo ? wx.getAppBaseInfo() : {};
    const statusBarHeight = windowInfo.statusBarHeight || appBaseInfo.statusBarHeight || 20;
    let bannerTop = 120;
    const menuButton = wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : null;
    if (menuButton && menuButton.bottom) {
      bannerTop = menuButton.bottom + 24;
    } else {
      bannerTop = statusBarHeight + 84;
    }
    this.setData({ statusBarHeight, bannerTop });
    this.loadBanners();
    this.loadTutorials();
  },

  onShow() {
    this.syncTabBar();
    const loggedIn = hasSession();
    const nickName = storage.get(storage.KEYS.NICK_NAME, '');
    const avatarUrl = storage.get(storage.KEYS.AVATAR_URL, '');
    const vipExpire = storage.get(storage.KEYS.VIP_EXPIRE, '');
    const isVip = vipExpire && new Date(vipExpire) > new Date();
    const magicCount = storage.get(storage.KEYS.MAGIC_COUNT, 0);
    this.setData({
      isLoggedIn: loggedIn,
      nickName,
      avatarUrl,
      isVip,
      magicCount
    });
    if (!loggedIn) {
      this.openLoginModal();
    } else {
      this.closeLoginModal();
      this.refreshUserProfile();
    }
  },

  refreshUserProfile() {
    const _apply = (profile) => {
      cacheProfile(profile);
      const vipExpire = profile.vipExpireAt || profile.vipExpire || '';
      const isVip = !!(vipExpire && new Date(vipExpire) > new Date());
      const aiQuota = Number(profile.aiQuota !== undefined ? profile.aiQuota : profile.magicCount);
      const magicCount = Number.isNaN(aiQuota) ? 0 : aiQuota;
      this.setData({
        nickName: profile.nickName || this.data.nickName,
        avatarUrl: profile.avatarUrl || this.data.avatarUrl,
        isVip,
        magicCount,
      });
    };

    const _showPopup = () => {
      popupManager.setPopupComponent(this.selectComponent('#globalPopup'));
      popupManager.checkAndShowPopup();
    };

    const prefetched = (app && app.globalData && app.globalData.prefetch) || {};
    const isFresh = prefetched.profileAt && (Date.now() - prefetched.profileAt < 30000);

    if (isFresh && prefetched.profile) {
      _apply(prefetched.profile);
      _showPopup();
      return;
    }

    request.get('/user/profile')
      .then((profile) => {
        _apply(profile || {});
      })
      .catch(() => {})
      .finally(() => {
        _showPopup();
      });
  },

  openLoginModal() {
    if (this._loginModalTimer) clearTimeout(this._loginModalTimer);
    const everRegistered = storage.get(storage.KEYS.EVER_REGISTERED, '');
    this._loginModalTimer = setTimeout(() => {
      this._loginModalTimer = null;
      if (hasSession()) return;
      this.setData({
        showLoginModal: true,
        isFirstLogin: !everRegistered,
      });
    }, 400);
  },

  closeLoginModal() {
    const app = getApp();
    if (app && typeof app.suppressSilentLogin === 'function') {
      app.suppressSilentLogin();
    }
    if (this._loginModalTimer) {
      clearTimeout(this._loginModalTimer);
      this._loginModalTimer = null;
    }
    if (this.data.showLoginModal || this.data.loginSubmitting) {
      this.setData({ showLoginModal: false, loginSubmitting: false });
    }
  },

  loadBanners() {
    const pickText = (value, fallback) => {
      if (typeof value !== 'string') return fallback;
      const t = value.trim();
      if (!t) return fallback;
      if(/[�]/.test(t) || /[À-ÿ]{3,}/.test(t)) return fallback;
      return t;
    };

    request.get('/banner/list')
      .then((data) => {
        const raw = Array.isArray(data) ? data : [];
        if (raw.length > 0) {
          console.log('[index][banner/list] first item =', raw[0]);
        }
        const list = raw.map((item) => {
          const rawBg = (item && (item.bgColor || item.bg_color || item.backgroundColor || ''));
          const bgColor = (typeof rawBg === 'string') ? rawBg.trim() : '';
          return {
            ...item,
            bgColor,
            bannerBgColor: bgColor || '#FF9800'
          };
        });
        if (!list.length) {
          this.setData({
            bannerList: [],
            activeBanner: 0,
            currentBanner: null
          });
          return;
        }
        const first = list[0] || {};
        this.setData({
          bannerList: list,
          activeBanner: 0,
          currentBanner: {
            title: pickText(first.title, '初夏限定拼豆'),
            subTitle: pickText(first.subTitle, '一键生成专属图纸'),
            tagText: pickText(first.tagText, '魔法上新'),
            imageUrl: first.imageUrl || '',
            linkType: first.linkType || 'NONE',
            linkValue: first.linkValue || ''
          }
        });
      })
      .catch(() => {});
  },

  loadTutorials() {
    request.get('/tutorial/list')
      .then((data) => {
        this.setData({ tutorials: Array.isArray(data) ? data : [] });
      })
      .catch(() => {});
  },

  onTutorialTap(e) {
    const tutorial = e.currentTarget.dataset.tutorial;
    if (tutorial && tutorial.videoUrl) {
      wx.navigateTo({
        url: `/pages/tutorial-play/tutorial-play?url=${encodeURIComponent(tutorial.videoUrl)}&title=${encodeURIComponent(tutorial.title || '')}&desc=${encodeURIComponent(tutorial.description || '')}`
      });
    }
  },

  onBannerChange(e) {
    const current = (e.detail && typeof e.detail.current === 'number') ? e.detail.current : 0;
    this.setData({ activeBanner: current });
  },

  onBannerTap(e) {
    const b = e.currentTarget.dataset.banner || {};
    const actionType = (b.actionType || b.linkType || 'NONE').toUpperCase();
    const linkValue = b.linkValue || '';
    const actionConfig = b.actionConfig || '';

    if (!linkValue && !actionConfig) return;

    // 处理不同的动作类型
    switch (actionType) {
      case 'NAVIGATE':
        // 小程序内跳转
        if (linkValue.indexOf('/pages/') === 0) {
          wx.navigateTo({ url: linkValue });
        } else {
          wx.showToast({ title: '页面配置无效', icon: 'none' });
        }
        break;

      case 'ACTIVITY':
        // 跳转到活动详情页
        wx.navigateTo({
          url: `/pages/activity/activity?code=${linkValue}`
        });
        break;

      case 'CLAIM_GIFT':
        // 直接领取礼品包
        this.claimBannerGift(b.id, actionConfig);
        break;

      case 'EXTERNAL':
        // 跳转外部链接（复制链接）
        wx.setClipboardData({
          data: linkValue,
          success: () => wx.showToast({ title: '链接已复制', icon: 'none' })
        });
        break;

      // 兼容旧版本
      case 'PAGE':
        if (linkValue.indexOf('/pages/') === 0) {
          wx.navigateTo({ url: linkValue });
        } else {
          wx.showToast({ title: '页面配置无效', icon: 'none' });
        }
        break;

      case 'URL':
        wx.setClipboardData({
          data: linkValue,
          success: () => wx.showToast({ title: '链接已复制', icon: 'none' })
        });
        break;

      default:
        if (linkValue && actionType === 'NONE') {
          // 兼容处理
          if (linkValue.indexOf('/pages/') === 0) {
            wx.navigateTo({ url: linkValue });
          }
        }
        break;
    }
  },

  // 领取Banner礼品
  async claimBannerGift(bannerId, config) {
    if (!this.checkLogin()) {
      this._loginCallback = () => this.claimBannerGift(bannerId, config);
      return;
    }

    wx.showLoading({ title: '领取中...', mask: true });

    try {
      const result = await request.post('/banner/claim', { bannerId });
      wx.hideLoading();

      if (result && result.success) {
        const giftId = result.giftId;
        wx.showModal({
          title: '领取成功',
          content: result.message || '礼品已放入我的礼品包，是否立即兑换？',
          confirmText: '立即兑换',
          cancelText: '稍后再说',
          success: async (modalRes) => {
            if (modalRes.confirm && giftId) {
              wx.showLoading({ title: '兑换中...', mask: true });
              try {
                await request.post('/gift/use', { giftId, redeemNow: true });
                wx.hideLoading();
                wx.showToast({ title: '兑换成功', icon: 'success' });
              } catch (redeemErr) {
                wx.hideLoading();
                wx.showToast({ title: redeemErr.message || '兑换失败', icon: 'none' });
              }
            }
            this.onShow();
          }
        });
      }
    } catch (err) {
      wx.hideLoading();
      wx.showToast({
        title: err.message || '领取失败',
        icon: 'none'
      });
    }
  },

  onQuickWxLogin() {
    if (this.data.loginSubmitting) return;
    this.setData({ loginSubmitting: true });

    new Promise((resolve, reject) => {
      wx.login({
        success: (res) => {
          if (!res.code) {
            reject(new Error('NO_CODE'));
            return;
          }
          resolve(res.code);
        },
        fail: (err) => reject(err || new Error('WX_LOGIN_FAILED')),
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
        const isVip = vipExpire && new Date(vipExpire) > new Date();
        const aiQuota = Number(profile.aiQuota !== undefined ? profile.aiQuota : profile.magicCount);
        const magicCount = Number.isNaN(aiQuota) ? 0 : aiQuota;
        storage.set(storage.KEYS.MAGIC_COUNT, magicCount);

        this.setData({
          nickName: profile.nickName || this.data.nickName,
          avatarUrl: profile.avatarUrl || this.data.avatarUrl,
          showLoginModal: false,
          isFirstLogin: false,
          isLoggedIn: true,
          isVip,
          magicCount,
        });

        wx.showToast({ title: '登录成功', icon: 'success' });
        if (app && typeof app.fetchWatermarkConfig === 'function') {
          app.fetchWatermarkConfig();
        }

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
        this.setData({ loginSubmitting: false });
      });
  },

  onCloseLoginModal() {
    this.closeLoginModal();
  },

  checkLogin() {
    if (requireLogin({ silentToast: true })) return true;
    this.openLoginModal();
    return false;
  },

  onBeadPatternLocal() {
    if (!this.checkLogin()) return;
    wx.switchTab({ url: '/pages/convert/convert' });
  },

  onBeadPatternAI() {
    if (!this.checkLogin()) return;
    wx.switchTab({ url: '/pages/ai-generate/ai-generate' });
  },

  onDrawBoard() {
    if (!this.checkLogin()) return;
    wx.navigateTo({ url: '/pages/draw/draw' });
  },

  onGoMyPatterns() {
    if (!this.checkLogin()) return;
    wx.navigateTo({ url: '/pages/immersive-select/immersive-select' });
  },

  onPopupConfirm() {
    // 由组件内部处理跳转与关闭
  },

  onPopupClose() {
    popupManager.closePopup();
  },

  onPullDownRefresh() {
    this.loadBanners();
    this.loadTutorials();
    setTimeout(() => wx.stopPullDownRefresh(), 400);
  },

  onUnload() {
    if (this._loginModalTimer) clearTimeout(this._loginModalTimer);
    this._loginModalTimer = null;
    this._loginCallback = null;
  }
});
