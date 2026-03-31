const request = require('../../utils/request');

const CATEGORIES = ['推荐', '卡通', '动物', '字母', '简约', '节日'];

Page({
  data: {
    loading: false,
    loadingText: '处理中...',
    showLoginModal: false,
    isFirstLogin: true,
    loginAvatarUrl: '',
    loginNickName: '',
    loginSubmitting: false,
    phoneGot: false,
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
    allTemplates: [],  // 从后端加载的完整列表
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
    const nickName = wx.getStorageSync('nickName');
    if (!nickName) {
      const everRegistered = wx.getStorageSync('everRegistered');
      setTimeout(() => {
        this.setData({
          showLoginModal: true,
          isFirstLogin: !everRegistered,
          loginAvatarUrl: '',
          loginNickName: '',
          phoneGot: false,
        });
      }, 400);
    }
  },

  // ─── Banner ───
  loadBanners() {
    request.get('/api/banner/list')
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

  // ─── 图纸市场 ───
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
    request.get('/api/creator/patterns?limit=100')
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

  // ─── 登录弹窗 ───
  onLoginChooseAvatar(e) {
    this.setData({ loginAvatarUrl: e.detail.avatarUrl });
  },

  onLoginNickInput(e) {
    this.setData({ loginNickName: e.detail.value });
  },

  onGetPhoneNumber(e) {
    if (e.detail.code) {
      this.setData({ phoneGot: true });
      wx.showToast({ title: '手机号已授权', icon: 'success' });
    }
  },

  onCloseLoginModal() {
    this.setData({ showLoginModal: false });
    if (this._loginCallback) this._loginCallback = null;
  },

  onLoginSubmit() {
    const { loginNickName, loginAvatarUrl } = this.data;
    const nick = loginNickName.trim();
    if (!nick) {
      wx.showToast({ title: '请输入昵称', icon: 'none' });
      return;
    }
    this.setData({ loginSubmitting: true });
    wx.login({
      success: (res) => {
        if (res.code) {
          request.post('/api/auth/login', { code: res.code })
            .then((data) => {
              const sid = data.sessionId || data.token;
              if (sid) wx.setStorageSync('sessionId', sid);
            })
            .catch(() => {})
            .finally(() => {
              this._saveLogin(nick, loginAvatarUrl);
            });
        } else {
          this._saveLogin(nick, loginAvatarUrl);
        }
      },
      fail: () => { this._saveLogin(nick, loginAvatarUrl); }
    });
  },

  _saveLogin(nick, avatarPath) {
    wx.setStorageSync('nickName', nick);
    wx.setStorageSync('everRegistered', '1');
    if (avatarPath) wx.setStorageSync('avatarUrl', avatarPath);
    this.setData({
      showLoginModal: false,
      loginSubmitting: false,
      nickName: nick,
      avatarUrl: avatarPath || wx.getStorageSync('avatarUrl') || ''
    });
    wx.showToast({ title: '登录成功', icon: 'success' });
    if (this._loginCallback) { this._loginCallback(); this._loginCallback = null; }
    const sessionId = wx.getStorageSync('sessionId');
    if (sessionId) {
      request.post('/api/user/update', { nickName: nick, avatarUrl: avatarPath || '' }).catch(() => {});
    }
  },

  checkLogin() {
    const nickName = wx.getStorageSync('nickName');
    if (!nickName) {
      const everRegistered = wx.getStorageSync('everRegistered');
      this.setData({
        showLoginModal: true,
        isFirstLogin: !everRegistered,
        loginAvatarUrl: '',
        loginNickName: '',
        phoneGot: false,
      });
      return false;
    }
    return true;
  },

  onBeadPatternLocal() {
    if (!this.checkLogin()) return;
    wx.switchTab({ url: '/pages/convert/convert' });
  },

  onBeadPatternAI() {
    if (!this.checkLogin()) return;
    wx.switchTab({ url: '/pages/ai-generate/ai-generate' });
  },

  onGoMyPatterns() {
    if (!this.checkLogin()) return;
    wx.navigateTo({ url: '/pages/my-patterns/my-patterns' });
  },

  onDrawBoard() {
    if (!this.checkLogin()) return;
    wx.navigateTo({ url: '/pages/draw/draw' });
  },

  showError(msg) {
    this.setData({ loading: false });
    wx.showToast({ title: msg, icon: 'none' });
  }
});
