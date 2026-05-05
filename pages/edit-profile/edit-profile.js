const request = require('../../utils/request');
const { getSafeAreaLayout } = require('../../utils/safe-area');

Page({
  data: {
    statusBarHeight: 44,
    avatarUrl: '',
    nickName: '',
    phone: '',
    submitting: false,
    isEditing: false,

    // 初始值用于检测变化
    initialAvatarUrl: '',
    initialNickName: '',
    initialPhone: '',
  },

  onLoad() {
    this.calcSafeAreas();
    this.loadProfileDraft();
  },

  calcSafeAreas() {
    try {
      const layout = getSafeAreaLayout();
      this.setData({ statusBarHeight: layout.statusBarHeight || 44 });
    } catch (e) {
      const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : {};
      const appBaseInfo = wx.getAppBaseInfo ? wx.getAppBaseInfo() : {};
      this.setData({ statusBarHeight: windowInfo.statusBarHeight || appBaseInfo.statusBarHeight || 44 });
    }
  },

  loadProfileDraft() {
    const nickName = wx.getStorageSync('nickName') || '';
    const avatarUrl = wx.getStorageSync('avatarUrl') || '';
    const phone = wx.getStorageSync('phone') || '';
    this.setData({
      nickName,
      avatarUrl,
      phone,
      initialNickName: nickName,
      initialAvatarUrl: avatarUrl,
      initialPhone: phone,
    });
  },

  checkIfEdited() {
    const { avatarUrl, nickName, phone, initialAvatarUrl, initialNickName, initialPhone } = this.data;
    const isEditing = avatarUrl !== initialAvatarUrl || nickName !== initialNickName || phone !== initialPhone;
    this.setData({ isEditing });
  },

  onChooseAvatar(e) {
    this.setData({ avatarUrl: e.detail.avatarUrl }, () => {
      this.checkIfEdited();
    });
  },

  onNickNameInput(e) {
    this.setData({ nickName: e.detail.value }, () => {
      this.checkIfEdited();
    });
  },

  onPhoneInput(e) {
    this.setData({ phone: e.detail.value.replace(/\s+/g, '') }, () => {
      this.checkIfEdited();
    });
  },

  onSubmit() {
    const { nickName, avatarUrl, phone } = this.data;
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
          avatarUrl: finalAvatarUrl || '',
          phone: phone.trim(),
        }).then(() => finalAvatarUrl);
      })
      .then((finalAvatarUrl) => {
        wx.setStorageSync('nickName', nickName.trim());
        wx.setStorageSync('avatarUrl', finalAvatarUrl || avatarUrl || '');
        wx.setStorageSync('phone', phone.trim());
        this.setData({
          submitting: false,
          isEditing: false,
          initialNickName: nickName.trim(),
          initialAvatarUrl: finalAvatarUrl || avatarUrl || '',
          initialPhone: phone.trim(),
        });
        wx.showToast({ title: '保存成功！', icon: 'success' });
        setTimeout(() => wx.navigateBack(), 350);
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
  },

  onBack() {
    wx.navigateBack();
  },
});
