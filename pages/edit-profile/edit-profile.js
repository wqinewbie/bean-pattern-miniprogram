const request = require('../../utils/request');
const storage = require('../../utils/storage');

Page({
  data: {
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
    this.loadProfileDraft();
  },

  loadProfileDraft() {
    const nickName = storage.get(storage.KEYS.NICK_NAME, '');
    const avatarUrl = storage.get(storage.KEYS.AVATAR_URL, '');
    const phone = storage.get(storage.KEYS.PHONE, '');
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

  onGetPhoneNumber(e) {
    const code = e.detail.code;
    if (!code) {
      // 用户拒绝授权或出错
      if (e.detail.errMsg && e.detail.errMsg.indexOf('deny') === -1) {
        wx.showToast({ title: '获取手机号失败', icon: 'none' });
      }
      return;
    }
    wx.showLoading({ title: '授权中...', mask: true });
    request.post('/user/bind-phone-wx', { code })
      .then((phone) => {
        wx.hideLoading();
        if (phone) {
          this.setData({ phone }, () => {
            this.checkIfEdited();
          });
          wx.showToast({ title: '手机号已授权', icon: 'success' });
        }
      })
      .catch((e) => {
        wx.hideLoading();
        wx.showToast({ title: e.message || '手机号授权失败', icon: 'none' });
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
        storage.set(storage.KEYS.NICK_NAME, nickName.trim());
        storage.set(storage.KEYS.AVATAR_URL, finalAvatarUrl || avatarUrl || '');
        storage.set(storage.KEYS.PHONE, phone.trim());
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
    return request.uploadImage(avatarUrl)
      .then(data => data.imageUrl || data.originalUrl || avatarUrl)
      .catch(() => avatarUrl);
  },

  onBack() {
    wx.navigateBack();
  },
});
