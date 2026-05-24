const request = require('../../utils/request');
const storage = require('../../utils/storage');

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
    const sessionId = storage.get(storage.KEYS.SESSION_ID, '');
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
    const sessionId = storage.get(storage.KEYS.SESSION_ID, '');
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

  onNotificationTap(e) {
    const item = (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.item) || {};
    const actionType = String(item.actionType || 'NONE').toUpperCase();
    const actionValue = item.actionValue || '';
    if (!actionValue || actionType === 'NONE') return;

    if (actionType === 'PAGE' || actionType === 'NAVIGATE') {
      if (String(actionValue).indexOf('/pages/') === 0) {
        wx.navigateTo({ url: actionValue });
      }
      return;
    }

    if (actionType === 'GIFT') {
      wx.switchTab({ url: '/pages/profile/profile' });
    }
  },

  onBack() {
    wx.navigateBack();
  },
});
