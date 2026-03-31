const request = require('../../utils/request');

Page({
  data: {
    avatarUrl: '',
    nickName: '',
    submitting: false
  },

  onLoad() {
    // 如果已经登录过，看是否已有昵称，有则直接跳首页
    const sessionId = wx.getStorageSync('sessionId');
    if (!sessionId) {
      // 未登录，先静默登录拿 sessionId，再让用户完善资料
      this.silentLogin();
    }
  },

  // 静默登录：wx.login 换取 sessionId（无需用户感知）
  silentLogin() {
    wx.login({
      success: (res) => {
        if (!res.code) return;
        request.post('/api/auth/login', { code: res.code })
          .then((data) => {
            const sessionId = data.sessionId || data.token;
            if (sessionId) wx.setStorageSync('sessionId', sessionId);
          })
          .catch(() => {
            wx.showToast({ title: '网络异常，请重试', icon: 'none' });
          });
      }
    });
  },

  // 用户选择头像（微信官方 chooseAvatar API）
  onChooseAvatar(e) {
    const { avatarUrl } = e.detail;
    this.setData({ avatarUrl });
  },

  // 昵称输入框失焦（type="nickname" 时微信会自动填入微信名）
  onNickNameInput(e) {
    this.setData({ nickName: e.detail.value });
  },

  // 确认提交
  onSubmit() {
    const { nickName, avatarUrl } = this.data;
    if (!nickName.trim()) {
      wx.showToast({ title: '请输入昵称', icon: 'none' });
      return;
    }

    this.setData({ submitting: true });

    // 如果有微信头像（临时路径），先上传到后端存储
    const uploadAvatar = avatarUrl
      ? this.uploadAvatarIfNeeded(avatarUrl)
      : Promise.resolve(avatarUrl);

    uploadAvatar
      .then((finalAvatarUrl) => {
        return request.post('/api/user/update', {
          nickName: nickName.trim(),
          avatarUrl: finalAvatarUrl || ''
        });
      })
      .then(() => {
        // 本地缓存昵称和头像，避免每次重新请求
        wx.setStorageSync('nickName', nickName.trim());
        wx.setStorageSync('avatarUrl', avatarUrl);
        this.setData({ submitting: false });
        // 跳转首页
        wx.switchTab({ url: '/pages/home/home' });
      })
      .catch(() => {
        this.setData({ submitting: false });
        wx.showToast({ title: '保存失败，请重试', icon: 'none' });
      });
  },

  // 上传头像到后端（微信临时路径需要上传才能持久化）
  uploadAvatarIfNeeded(avatarUrl) {
    // 微信头像临时路径以 http://tmp 或 wxfile:// 开头
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
          resolve(avatarUrl); // 上传失败，降级用临时路径
        },
        fail: () => resolve(avatarUrl)
      });
    });
  },

  // 跳过（不填资料直接进入）
  onSkip() {
    wx.switchTab({ url: '/pages/home/home' });
  }
});
