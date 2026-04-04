const request = require('../../utils/request');
const { isLoggedAndBound, requireLogin, cacheProfile, hasSession } = require('../../utils/profile-guard');

const CATEGORIES = ['推荐', '卡通', '动物', '字母', '简约', '节日'];

Page({
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
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setSelected(0);
    }
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
    request.get('/banner/list')
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        if (!list.length) return;
        const first = list[0] || {};
        this.setData({
          bannerList: list,
          currentBanner: {
            title: first.title || '初夏限定拼豆',
            subTitle: first.subTitle || '一键生成专属图纸',
            tagText: first.tagText || '魔法上新',
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

  onGoProfileEdit() {
    wx.navigateTo({ url: '/pages/login/login' });
  },

  onQuickWxLogin() {
    if (this.data.loginSubmitting) return;
    this.setData({ loginSubmitting: true });
    wx.login({
      success: (res) => {
        if (!res.code) {
          this.setData({ loginSubmitting: false });
          wx.showToast({ title: '微信登录失败，请重试', icon: 'none' });
          return;
        }
        request.post('/auth/login', { code: res.code })
          .then((data) => {
            const sid = data.sessionId || data.token;
            if (sid) wx.setStorageSync('sessionId', sid);
            return request.get('/user/profile').catch(() => null);
          })
          .then((profile) => {
            wx.setStorageSync('everRegistered', true);
            cacheProfile(profile || {});
            this.closeLoginModal();
            wx.showToast({ title: '登录成功，可稍后补手机号', icon: 'success' });
            if (this._loginCallback) { this._loginCallback(); this._loginCallback = null; }
          })
          .catch(() => {
            this.setData({ loginSubmitting: false });
            wx.showToast({ title: '登录失败，请重试', icon: 'none' });
          });
      },
      fail: () => {
        this.setData({ loginSubmitting: false });
        wx.showToast({ title: '微信登录失败，请重试', icon: 'none' });
      }
    });
  },

  onGetPhoneNumber(e) {
    console.log('onGetPhoneNumber detail:', e && e.detail ? e.detail : null);
    const phoneCode = e && e.detail && e.detail.code;
    if (!phoneCode) {
      const errMsg = e && e.detail && e.detail.errMsg ? e.detail.errMsg : '';
      const tip = errMsg && errMsg.indexOf('fail') >= 0
        ? '当前账号暂未开通手机号能力，可先快速登录'
        : '当前环境暂未返回手机号授权，请用真机测试';
      wx.showToast({ title: tip, icon: 'none' });
      return;
    }
    this.setData({ loginSubmitting: true });
    wx.login({
      success: (res) => {
        if (!res.code) {
          this.setData({ loginSubmitting: false });
          wx.showToast({ title: '微信登录失败，请重试', icon: 'none' });
          return;
        }
        request.post('/auth/login', { code: res.code })
          .then((data) => {
            const sid = data.sessionId || data.token;
            if (sid) wx.setStorageSync('sessionId', sid);
            return request.post('/user/bind-phone-wx', { code: phoneCode });
          })
          .then((phone) => {
            wx.setStorageSync('phone', phone || '');
            wx.setStorageSync('everRegistered', true);
            return request.get('/user/profile').catch(() => null);
          })
          .then((profile) => {
            if (profile) {
              cacheProfile(profile);
            }
            wx.setStorageSync('everRegistered', true);
            this.closeLoginModal();
            wx.showToast({ title: '登录成功', icon: 'success' });
            if (this._loginCallback) { this._loginCallback(); this._loginCallback = null; }
          })
          .catch((err) => {
            this.setData({ loginSubmitting: false });
            wx.showToast({ title: (err && err.message) || '登录失败，请重试', icon: 'none' });
          });
      },
      fail: () => {
        this.setData({ loginSubmitting: false });
        wx.showToast({ title: '微信登录失败，请重试', icon: 'none' });
      }
    });
  },

  onCloseLoginModal() {
    this.setData({ showLoginModal: false });
    if (this._loginCallback) this._loginCallback = null;
  },

  checkLogin() {
    return requireLogin({
      mode: 'modal',
      onNeedLogin: () => {
        this.openLoginModal();
      }
    });
  },

  runAfterLogin(action) {
    if (!this.checkLogin()) return;
    if (typeof action === 'function') action();
  },

  onBeadPatternLocal() {
    this.runAfterLogin(() => wx.switchTab({ url: '/pages/convert/convert' }));
  },

  onBeadPatternAI() {
    this.runAfterLogin(() => wx.switchTab({ url: '/pages/ai-generate/ai-generate' }));
  },

  onGoMyPatterns() {
    this.runAfterLogin(() => wx.navigateTo({ url: '/pages/my-patterns/my-patterns' }));
  },

  onDrawBoard() {
    this.runAfterLogin(() => wx.navigateTo({ url: '/pages/draw/draw' }));
  },

  showError(msg) {
    this.setData({ loading: false });
    wx.showToast({ title: msg, icon: 'none' });
  }
});
