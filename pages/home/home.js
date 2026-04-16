const request = require('../../utils/request');
const { requireLogin, cacheProfile, hasSession } = require('../../utils/profile-guard');

const CATEGORIES = ['推荐', '卡通', '动物', '字母', '简约', '节日'];

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
    statusBarHeight: 20,
    bannerTop: 120,
    bannerList: [],
    currentBanner: {
      title: '初夏限定拼豆',
      subTitle: '一键生成专属图纸',
      tagText: '魔法上新',
      imageUrl: '',
      linkType: 'NONE',
      linkValue: ''
    },
    categories: CATEGORIES,
    activeCategory: '推荐',
    templates: [],
    allTemplates: [],
    templatesLoading: true,
  },

  onLoad() {
    wx.getSystemInfo({
      success: (res) => {
        const statusBarHeight = res.statusBarHeight || 20;
        let bannerTop = 120;
        const menuButton = wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : null;
        if (menuButton && menuButton.bottom) {
          bannerTop = menuButton.bottom + 24;
        } else {
          bannerTop = statusBarHeight + 84;
        }
        this.setData({ statusBarHeight, bannerTop });
      }
    });
    this.loadBanners();
    this.loadTemplates();
  },

  onShow() {
    this.syncTabBar();
    if (!hasSession()) {
      this.openLoginModal();
    } else {
      this.closeLoginModal();
    }
  },

  openLoginModal() {
    if (this._loginModalTimer) clearTimeout(this._loginModalTimer);
    const everRegistered = wx.getStorageSync('everRegistered');
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
      if(/[\uFFFD]/.test(t) || /[\u00C0-\u00FF]{3,}/.test(t)) return fallback;
      return t;
    };

    request.get('/banner/list')
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        if (!list.length) return;
        const first = list[0] || {};
        this.setData({
          bannerList: list,
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

  onBannerTap() {
    const b = this.data.currentBanner || {};
    const type = (b.linkType || 'NONE').toUpperCase();
    const value = b.linkValue || '';
    if (!value || type === 'NONE') return;

    if (type === 'PAGE') {
      if (value.indexOf('/pages/') === 0) {
        wx.navigateTo({ url: value });
      } else {
        wx.showToast({ title: '页面配置无效', icon: 'none' });
      }
      return;
    }

    if (type === 'URL') {
      wx.setClipboardData({ data: value, success: () => wx.showToast({ title: '链接已复制', icon: 'none' }) });
    }
  },

  loadTemplates() {
    this.setData({ templatesLoading: true });
    const app = getApp();
    const cache = app && app.globalData && app.globalData.prefetch;
    if (cache && Array.isArray(cache.templates) && cache.templates.length) {
      const list = cache.templates;
      this.setData({
        allTemplates: list,
        templates: list,
        activeCategory: '推荐',
        templatesLoading: false,
      });
      return;
    }
    request.get('/creator/patterns?limit=100')
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        this.setData({
          allTemplates: list,
          templates: list,
          activeCategory: '推荐',
          templatesLoading: false,
        });
      })
      .catch(() => {
        this.setData({ templatesLoading: false });
      });
  },

  onCategoryTap(e) {
    const cat = e.currentTarget.dataset.cat;
    const all = this.data.allTemplates;
    const filtered = cat === '推荐' ? all : all.filter(t => t.category === cat);
    this.setData({ activeCategory: cat, templates: filtered });
  },

  onTemplateTap(e) {
    const item = e.currentTarget.dataset.item;
    const url = item.coverUrl || '';
    if (!this.checkLogin()) {
      this._loginCallback = () => wx.navigateTo({ url: '/pages/generate/generate?imageUrl=' + encodeURIComponent(url) });
      return;
    }
    wx.navigateTo({ url: '/pages/generate/generate?imageUrl=' + encodeURIComponent(url) });
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

        wx.setStorageSync('sessionId', sessionId);
        wx.setStorageSync('everRegistered', true);

        const profile = ret.profile || {};
        if (profile.nickName) wx.setStorageSync('nickName', profile.nickName);
        if (profile.avatarUrl) wx.setStorageSync('avatarUrl', profile.avatarUrl);
        cacheProfile(profile);

        this.setData({
          nickName: profile.nickName || this.data.nickName,
          avatarUrl: profile.avatarUrl || this.data.avatarUrl,
          showLoginModal: false,
          isFirstLogin: false,
        });

        wx.showToast({ title: '登录成功', icon: 'success' });

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
    wx.navigateTo({ url: '/pages/my-patterns/my-patterns' });
  },

  onPullDownRefresh() {
    this.loadBanners();
    this.loadTemplates();
    setTimeout(() => wx.stopPullDownRefresh(), 400);
  },

  onUnload() {
    if (this._loginModalTimer) clearTimeout(this._loginModalTimer);
    this._loginModalTimer = null;
    this._loginCallback = null;
  }
});
