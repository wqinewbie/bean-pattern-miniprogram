const request = require('../../utils/request');

Page({
  data: {
    avatarUrl: '',
    nickName: '',
    submitting: false
  },

  onLoad() {
    const sessionId = wx.getStorageSync('sessionId');
    if (!sessionId) this.silentLogin();
    this.setData({
      nickName: wx.getStorageSync('nickName') || '',
      avatarUrl: wx.getStorageSync('avatarUrl') || ''
    });
  },

  silentLogin() {
    const app = getApp();
    if (!app || typeof app.ensureSession !== 'function') return;
    app.ensureSession()
      .catch(() => {
        wx.showToast({ title: '网络异常，请重试', icon: 'none' });
      });
  },

  onChooseAvatar(e) {
    this.setData({ avatarUrl: e.detail.avatarUrl });
  },

  onNickNameInput(e) {
    this.setData({ nickName: e.detail.value });
  },

  onSubmit() {
    const { nickName, avatarUrl } = this.data;
    if (!nickName.trim()) {
      wx.showToast({ title: '请输入昵称', icon: 'none' });
      return;
    }

    this.setData({ submitting: true });
    const uploadAvatar = avatarUrl ? this.uploadAvatarIfNeeded(avatarUrl) : Promise.resolve(avatarUrl);

    uploadAvatar
      .then((finalAvatarUrl) => {
        return request.post('/user/update', {
          nickName: nickName.trim(),
          avatarUrl: finalAvatarUrl || ''
        }).then(() => finalAvatarUrl);
      })
      .then((finalAvatarUrl) => {
        wx.setStorageSync('nickName', nickName.trim());
        wx.setStorageSync('avatarUrl', finalAvatarUrl || avatarUrl || '');
        this.setData({ submitting: false });
        wx.showToast({ title: '已保存', icon: 'success' });
        setTimeout(() => wx.switchTab({ url: '/pages/home/home' }), 400);
      })
      .catch((e) => {
        this.setData({ submitting: false });
        wx.showToast({ title: e.message || '保存失败，请重试', icon: 'none' });
      });
  },

  uploadAvatarIfNeeded(avatarUrl) {
    if (!avatarUrl || avatarUrl.startsWith('http://') && !avatarUrl.includes('tmp')) {
      return Promise.resolve(avatarUrl);
    }
    const { API_BASE_URL } = require('../../utils/config');
    const sessionId = wx.getStorageSync('sessionId') || '';
    return new Promise((resolve) => {
      wx.uploadFile({
        url: `${API_BASE_URL}/api/image/upload`,
        filePath: avatarUrl,
        name: 'file',
        header: { 'X-Session-Id': sessionId },
        success: (res) => {
          try {
            const body = JSON.parse(res.data);
            if (res.statusCode === 200 && body.code === 0) {
              resolve(body.data.imageUrl || body.data.originalUrl);
              return;
            }
          } catch (e) {}
          resolve(avatarUrl);
        },
        fail: () => resolve(avatarUrl)
      });
    });
  }
});
