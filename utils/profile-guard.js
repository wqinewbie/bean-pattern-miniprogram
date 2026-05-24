const request = require('./request');
const storage = require('./storage');

function hasText(v) {
  return !!(v && String(v).trim());
}

function hasSession() {
  return hasText(storage.get(storage.KEYS.SESSION_ID, ''));
}

function isLoggedAndBound() {
  return hasSession();
}

function cacheProfile(profile) {
  if (!profile || typeof profile !== 'object') return;
  storage.set(storage.KEYS.NICK_NAME, profile.nickName || '');
  storage.set(storage.KEYS.AVATAR_URL, profile.avatarUrl || '');
  storage.set(storage.KEYS.PHONE, profile.phone || '');

  const vipExpire = profile.vipExpireAt || profile.vipExpire || '';
  storage.set(storage.KEYS.VIP_EXPIRE, vipExpire);

  const aiQuota = Number(profile.aiQuota !== undefined ? profile.aiQuota : profile.magicCount);
  if (!Number.isNaN(aiQuota)) {
    storage.set(storage.KEYS.MAGIC_COUNT, aiQuota);
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

function wxLoginCode() {
  return new Promise((resolve, reject) => {
    wx.login({
      success: (res) => {
        if (!res.code) {
          reject(new Error('NO_CODE'));
          return;
        }
        resolve(res.code);
      },
      fail: (err) => reject(err || new Error('WX_LOGIN_FAILED')),
    });
  });
}

function refreshWechatSession() {
  return wxLoginCode()
    .then((code) => request.post('/auth/login', { code }))
    .then((ret) => {
      const sessionId = ret && ret.sessionId;
      if (!sessionId) throw new Error('NO_SESSION');

      storage.set(storage.KEYS.SESSION_ID, sessionId);
      storage.set(storage.KEYS.EVER_REGISTERED, true);
      cacheProfile(ret.profile || {});
      return ret;
    });
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
  refreshWechatSession,
};
