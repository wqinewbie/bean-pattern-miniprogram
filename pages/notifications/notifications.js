const request = require('../../utils/request');

Page({
  data: {
    notifications: [],
    loading: false,
  },

  onLoad() {
    this.loadNotifications();
    this.markNotificationsRead();
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
