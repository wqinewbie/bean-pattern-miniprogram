const request = require('../../utils/request');
const { cacheProfile } = require('../../utils/profile-guard');

Page({
  data: {
    avatarUrl: '',
    nickName: '',
    phone: '',
    smsCode: '',
    wxPhoneBound: false,
    sendingCode: false,
    codeCountdown: 0,
    submitting: false
  },

  onLoad() {
    const sessionId = wx.getStorageSync('sessionId');
    if (!sessionId) this.silentLogin();
    this.setData({
      nickName: wx.getStorageSync('nickName') || '',
      avatarUrl: wx.getStorageSync('avatarUrl') || '',
      phone: wx.getStorageSync('phone') || '',
      wxPhoneBound: !!wx.getStorageSync('phone')
    });
  },

  onUnload() {
    if (this._codeTimer) clearInterval(this._codeTimer);
  },

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

  onChooseAvatar(e) {
    this.setData({ avatarUrl: e.detail.avatarUrl });
  },

  onNickNameInput(e) {
    this.setData({ nickName: e.detail.value });
  },

  onPhoneInput(e) {
    this.setData({ phone: e.detail.value, wxPhoneBound: false });
  },

  onSmsCodeInput(e) {
    this.setData({ smsCode: e.detail.value });
  },

  onSendSmsCode() {
    const phone = (this.data.phone || '').trim();
    if (!/^1\d{10}$/.test(phone)) {
      wx.showToast({ title: '请输入正确手机号', icon: 'none' });
      return;
    }
    if (this.data.codeCountdown > 0 || this.data.sendingCode) return;

    this.setData({ sendingCode: true });
    request.post('/api/user/send-phone-code', { phone })
      .then(() => {
        wx.showToast({ title: '验证码已发送', icon: 'success' });
        this.startCountdown();
      })
      .catch((err) => {
        wx.showToast({ title: err.message || '发送失败，请重试', icon: 'none' });
      })
      .finally(() => {
        this.setData({ sendingCode: false });
      });
  },

  startCountdown() {
    if (this._codeTimer) clearInterval(this._codeTimer);
    this.setData({ codeCountdown: 60 });
    this._codeTimer = setInterval(() => {
      const next = this.data.codeCountdown - 1;
      if (next <= 0) {
        clearInterval(this._codeTimer);
        this._codeTimer = null;
        this.setData({ codeCountdown: 0 });
      } else {
        this.setData({ codeCountdown: next });
      }
    }, 1000);
  },

  onGetPhoneNumber(e) {
    const code = e && e.detail && e.detail.code;
    const errMsg = (e && e.detail && e.detail.errMsg) || '';
    if (!code) {
      if (errMsg.includes('user deny') || errMsg.includes('user cancel')) {
        wx.showToast({ title: '你已取消授权，可手动输入手机号', icon: 'none' });
      } else {
        wx.showToast({ title: '未授权手机号，可手动输入', icon: 'none' });
      }
      return;
    }
    request.post('/api/user/bind-phone-wx', { code })
      .then((phone) => {
        wx.setStorageSync('phone', phone || '');
        this.setData({ phone: phone || '', wxPhoneBound: true });
        wx.showToast({ title: '已一键绑定手机号', icon: 'success' });
      })
      .catch((err) => {
        wx.showToast({ title: this.resolvePhoneBindError(err), icon: 'none' });
      });
  },

  resolvePhoneBindError(err) {
    const msg = (err && err.message ? String(err.message) : '').toLowerCase();
    if (!msg) return '一键绑定失败，请手动输入';
    if (msg.includes('access_token') || msg.includes('appid') || msg.includes('appsecret')) {
      return '系统微信配置异常，请先手动输入手机号';
    }
    if (msg.includes('code') || msg.includes('invalid') || msg.includes('过期')) {
      return '授权已失效，请重试或手动输入手机号';
    }
    if (msg.includes('network') || msg.includes('http')) {
      return '网络异常，请重试或手动输入手机号';
    }
    return '一键绑定失败，请手动输入手机号';
  },

  onSubmit() {
    const { nickName, avatarUrl, phone, wxPhoneBound, smsCode } = this.data;
    if (!nickName.trim()) {
      wx.showToast({ title: '请输入昵称', icon: 'none' });
      return;
    }
    if (!/^1\d{10}$/.test((phone || '').trim())) {
      wx.showToast({ title: '请先一键绑定或手动填写手机号', icon: 'none' });
      return;
    }
    if (!wxPhoneBound && !/^\d{6}$/.test((smsCode || '').trim())) {
      wx.showToast({ title: '请输入6位短信验证码', icon: 'none' });
      return;
    }

    this.setData({ submitting: true });
    const uploadAvatar = avatarUrl ? this.uploadAvatarIfNeeded(avatarUrl) : Promise.resolve(avatarUrl);

    uploadAvatar
      .then((finalAvatarUrl) => {
        return request.post('/api/user/update', {
          nickName: nickName.trim(),
          avatarUrl: finalAvatarUrl || ''
        }).then(() => finalAvatarUrl);
      })
      .then((finalAvatarUrl) => {
        if (wxPhoneBound) {
          return request.post('/api/user/bind-phone', { phone: phone.trim() }).then(() => finalAvatarUrl);
        }
        return request.post('/api/user/bind-phone-by-code', {
          phone: phone.trim(),
          code: smsCode.trim()
        }).then(() => finalAvatarUrl);
      })
      .then((finalAvatarUrl) => {
        wx.setStorageSync('nickName', nickName.trim());
        wx.setStorageSync('avatarUrl', finalAvatarUrl || avatarUrl || '');
        wx.setStorageSync('phone', phone.trim());
        this.setData({ submitting: false });
        wx.showToast({ title: '已完成绑定', icon: 'success' });
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
