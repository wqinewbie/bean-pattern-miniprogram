const request = require('./request');

function hasText(v) {
  return !!(v && String(v).trim());
}

function hasSession() {
  return hasText(wx.getStorageSync('sessionId') || '');
}

function isLoggedAndBound() {
  return hasSession();
}

function cacheProfile(profile) {
  if (!profile || typeof profile !== 'object') return;
  wx.setStorageSync('nickName', profile.nickName || '');
  wx.setStorageSync('avatarUrl', profile.avatarUrl || '');
  wx.setStorageSync('phone', profile.phone || '');

  const vipExpire = profile.vipExpireAt || profile.vipExpire || '';
  wx.setStorageSync('vipExpire', vipExpire);

  const aiQuota = Number(profile.aiQuota !== undefined ? profile.aiQuota : profile.magicCount);
  if (!Number.isNaN(aiQuota)) {
    wx.setStorageSync('magicCount', aiQuota);
  }
}

function openProfilePage() {
  wx.switchTab({ url: '/pages/index/index' });
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

  return request.get('/user/profile')
    .then((profile) => {
      cacheProfile(profile || {});
      return true;
    })
    .catch(() => true);
}

module.exports = {
  ensureProfileComplete,
  hasSession,
  isLoggedAndBound,
  cacheProfile,
  requireLogin,
};