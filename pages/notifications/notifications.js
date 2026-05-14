const request = require('../../utils/request');
const { getSafeAreaLayout } = require('../../utils/safe-area');

Page({
  data: {
    statusBarHeight: 44,
    navHeight: 88,
    notifications: [],
    loading: false,
  },

  onLoad() {
    this.calcSafeAreas();
    this.loadNotifications();
    this.markNotificationsRead();
  },

  calcSafeAreas() {
    try {
      const layout = getSafeAreaLayout();
      this.setData({
        statusBarHeight: layout.statusBarHeight || 44,
        navHeight: layout.navHeight || 88,
      });
    } catch (e) {
      const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : {};
      const appBaseInfo = wx.getAppBaseInfo ? wx.getAppBaseInfo() : {};
      this.setData({ statusBarHeight: windowInfo.statusBarHeight || appBaseInfo.statusBarHeight || 44 });
    }
  },

  loadNotifications() {
    const sessionId = wx.getStorageSync('sessionId');
    if (!sessionId) {
      this.setData({ notifications: [], loading: false });
      return;
    }

    this.setData({ loading: true });
    request.get('/notification/list', { limit: 50 })
      .then((notifications) => {
        this.setData({
          notifications: Array.isArray(notifications) ? notifications : [],
          loading: false,
        });
      })
      .catch((err) => {
        console.error('加载通知失败:', err);
        this.setData({ notifications: [], loading: false });
        wx.showToast({ title: '加载消息失败', icon: 'none' });
      });
  },

  markNotificationsRead() {
    const sessionId = wx.getStorageSync('sessionId');
    if (!sessionId) return;

    request.post('/notification/mark-all-read')
      .then(() => {
        const notifications = (this.data.notifications || []).map(item => ({ ...item, read: true }));
        this.setData({ notifications });
      })
      .catch((err) => {
        console.error('标记已读失败:', err);
      });
  },

  onBack() {
    wx.navigateBack();
  },
});
