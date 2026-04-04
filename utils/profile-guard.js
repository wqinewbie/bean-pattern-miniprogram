const request = require('./request');

function hasText(v) {
  return !!(v && String(v).trim());
}

function hasSession() {
  return hasText(wx.getStorageSync('sessionId') || '');
}

function hasBoundPhone() {
  return hasText(wx.getStorageSync('phone') || '');
}

function isLoggedAndBound() {
  return hasSession() && hasBoundPhone();
}

function cacheProfile(profile) {
  if (!profile || typeof profile !== 'object') return;
  wx.setStorageSync('nickName', profile.nickName || '');
  wx.setStorageSync('avatarUrl', profile.avatarUrl || '');
  wx.setStorageSync('phone', profile.phone || '');
}

function openProfilePage() {
  wx.navigateTo({ url: '/pages/login/login' });
}

function requireLogin(options = {}) {
  const { mode = 'page', onNeedLogin } = options;
  if (isLoggedAndBound()) return true;

  if (typeof onNeedLogin === 'function') {
    onNeedLogin();
  }
  if (mode === 'page') {
    openProfilePage();
  }
  return false;
}

function ensureProfileComplete() {
  if (!hasSession()) {
    wx.showToast({ title: '请先登录', icon: 'none' });
    openProfilePage();
    return Promise.resolve(false);
  }

  const nickName = wx.getStorageSync('nickName') || '';
  const avatarUrl = wx.getStorageSync('avatarUrl') || '';
  const phone = wx.getStorageSync('phone') || '';
  if (hasText(nickName) && hasText(avatarUrl) && hasText(phone)) {
    return Promise.resolve(true);
  }

  return request.get('/user/profile')
    .then((profile) => {
      cacheProfile(profile || {});
      const nick = (profile && profile.nickName) || '';
      const avatar = (profile && profile.avatarUrl) || '';
      const p = (profile && profile.phone) || '';
      if (hasText(nick) && hasText(avatar) && hasText(p)) return true;
      wx.showModal({
        title: '绑定手机号',
        content: '请先完善昵称头像并绑定手机号后再继续操作',
        confirmText: '去绑定',
        success: (res) => {
          if (res.confirm) openProfilePage();
        }
      });
      return false;
    })
    .catch(() => false);
}

module.exports = {
  ensureProfileComplete,
  hasSession,
  hasBoundPhone,
  isLoggedAndBound,
  cacheProfile,
  requireLogin,
};