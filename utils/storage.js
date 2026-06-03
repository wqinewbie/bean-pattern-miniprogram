/**
 * 统一缓存管理
 * 所有 Storage key 集中定义，提供命名空间和类型安全的存取方法
 */

const KEYS = {
  SESSION_ID: 'sessionId',
  NICK_NAME: 'nickName',
  AVATAR_URL: 'avatarUrl',
  PHONE: 'phone',
  VIP_EXPIRE: 'vipExpire',
  MAGIC_COUNT: 'magicCount',
  MY_INVITE_CODE: 'myInviteCode',
  PENDING_INVITE_CODE: 'pendingInviteCode',
  POPUP_HIDDEN: 'popupHidden',
  POPUP_LAST_SHOWN: 'popupLastShown',
  EVER_REGISTERED: 'everRegistered',
  CHECKED_IN: 'checkedIn',
  GIFTS: 'gifts',
  AVAILABLE_GIFT_COUNT: 'availableGiftCount',
  DRAFTS: 'drafts',
  WATERMARK_ENABLED: 'watermarkEnabled',
  WATERMARK_TEXT: 'watermarkText',
};

function get(key, defaultValue) {
  try {
    const value = wx.getStorageSync(key);
    return value !== '' && value !== undefined && value !== null ? value : defaultValue;
  } catch (e) {
    return defaultValue;
  }
}

function set(key, value) {
  try {
    wx.setStorageSync(key, value);
  } catch (e) {
    // storage full or unavailable
  }
}

function remove(key) {
  try {
    wx.removeStorageSync(key);
  } catch (e) {
    // ignore
  }
}

function getJSON(key, defaultValue) {
  try {
    const raw = wx.getStorageSync(key);
    if (!raw) return defaultValue;
    return JSON.parse(raw);
  } catch (e) {
    return defaultValue;
  }
}

function setJSON(key, value) {
  try {
    wx.setStorageSync(key, JSON.stringify(value));
  } catch (e) {
    // storage full or unavailable
  }
}

/** 清除用户会话相关缓存（登出时调用） */
function clearSession() {
  remove(KEYS.SESSION_ID);
  remove(KEYS.NICK_NAME);
  remove(KEYS.AVATAR_URL);
  remove(KEYS.PHONE);
  remove(KEYS.MAGIC_COUNT);
  remove(KEYS.AVAILABLE_GIFT_COUNT);
}

module.exports = {
  KEYS,
  get,
  set,
  remove,
  getJSON,
  setJSON,
  clearSession,
};
