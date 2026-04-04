const request = require('../../utils/request');
const { cacheProfile } = require('../../utils/profile-guard');
const { getSafeAreaLayout } = require('../../utils/safe-area');

const DEFAULT_NICKNAME = '魔法师小豆';
const EMPTY_STATS = { total: 0, success: 0, ai: 0, saved: 0 };

Page({
  data: {
    userInfo: null,
    stats: EMPTY_STATS,
    loading: false,
    activeSheet: '',
    cloudProcess: true,
    feedbackText: '',
    creatorIncome: 0,
    profileTopPaddingPx: 88,
    subTopSafePx: 20,
    subHeaderHeightPx: 88,
  },

  onLoad() {
    this.calcSafeAreas();
  },

  calcSafeAreas() {
    const layout = getSafeAreaLayout();
    this.setData({
      profileTopPaddingPx: layout.headerSafeTop,
      subTopSafePx: layout.statusBarHeight,
      subHeaderHeightPx: layout.navHeight,
    });
  },

  onShow() {
    this.calcSafeAreas();
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setSelected(3);
    }
    this.loadProfile();
  },

  loadProfile() {
    const nickName = wx.getStorageSync('nickName') || '';
    const avatarUrl = wx.getStorageSync('avatarUrl') || '';
    this.setData({
      userInfo: { nickName: nickName || DEFAULT_NICKNAME, avatarUrl }
    });

    const sessionId = wx.getStorageSync('sessionId');
    if (!sessionId) return;

    const app = getApp();
    const cache = app && app.globalData && app.globalData.prefetch;
    if (cache && cache.profile && cache.stats) {
      this.applyProfileAndStats(cache.profile, cache.stats, nickName, avatarUrl);
      return;
    }

    this.setData({ loading: true });
    Promise.all([
      request.get('/user/profile'),
      request.get('/user/stats')
    ])
      .then(([profile, stats]) => {
        this.applyProfileAndStats(profile, stats, nickName, avatarUrl);
      })
      .catch(() => {
        this.setData({ loading: false });
      });
  },

  applyProfileAndStats(profile, stats, fallbackNickName, fallbackAvatarUrl) {
    if (profile && profile.nickName) {
      wx.setStorageSync('nickName', profile.nickName);
      wx.setStorageSync('avatarUrl', profile.avatarUrl || '');
      wx.setStorageSync('phone', profile.phone || '');
    }
    this.setData({
      userInfo: {
        nickName: (profile && profile.nickName) || fallbackNickName || DEFAULT_NICKNAME,
        avatarUrl: (profile && profile.avatarUrl) || fallbackAvatarUrl || ''
      },
      stats: stats || EMPTY_STATS,
      loading: false
    });
  },

  onEditProfile() {
    wx.navigateTo({ url: '/pages/login/login' });
  },

  onGoHistory() {
    wx.navigateTo({ url: '/pages/history/history' });
  },

  onGoMyPatterns() {
    wx.navigateTo({ url: '/pages/my-patterns/my-patterns' });
  },

  onVip() {
    wx.navigateTo({ url: '/pages/vip/vip' });
  },

  onAccountSettings() { this.setData({ activeSheet: 'account' }); },
  onPrivacy() { this.setData({ activeSheet: 'privacy' }); },
  onHelp() { this.setData({ activeSheet: 'help' }); },
  onCreator() { this.setData({ activeSheet: 'creator' }); },
  onCloseSheet() { this.setData({ activeSheet: '' }); },

  onBindPhone() {
    wx.showToast({ title: '绑定手机号功能即将上线', icon: 'none' });
  },

  onLogout() {
    wx.showModal({
      title: '退出登录',
      content: '确认退出登录？',
      success: (res) => {
        if (res.confirm) {
          wx.removeStorageSync('sessionId');
          wx.removeStorageSync('nickName');
          wx.removeStorageSync('avatarUrl');
          wx.removeStorageSync('phone');
          this.setData({
            userInfo: null,
            stats: EMPTY_STATS,
            activeSheet: ''
          });
          wx.showToast({ title: '已退出登录', icon: 'success' });
        }
      }
    });
  },

  onCloudProcessChange(e) {
    const enabled = !!e.detail.value;
    this.setData({ cloudProcess: enabled });
    wx.showToast({ title: enabled ? '已开启云端处理' : '已关闭云端处理', icon: 'none' });
  },

  onClearTrace() {
    wx.showModal({
      title: '清除魔法痕迹',
      content: '将清除本地缓存和使用记录，确认继续？',
      success: (res) => {
        if (res.confirm) {
          wx.clearStorageSync();
          this.setData({ userInfo: null, stats: EMPTY_STATS, activeSheet: '' });
          wx.showToast({ title: '已清除', icon: 'success' });
        }
      }
    });
  },

  onFeedbackInput(e) {
    this.setData({ feedbackText: e.detail.value });
  },

  onSendFeedback() {
    const text = this.data.feedbackText.trim();
    if (!text) {
      wx.showToast({ title: '请先写下建议', icon: 'none' });
      return;
    }
    request.post('/feedback/submit', { content: text, category: 'SUGGESTION' })
      .then(() => {
        wx.showToast({ title: '已发送给小豆，感谢反馈', icon: 'success' });
        this.setData({ feedbackText: '', activeSheet: '' });
      })
      .catch(() => {
        wx.showToast({ title: '发送失败，请重试', icon: 'none' });
      });
  },

  onUploadPattern() {
    wx.showToast({ title: '上传图纸功能即将上线', icon: 'none' });
  },
});