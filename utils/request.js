const { API_BASE_URL: API_BASE_URL_RAW } = require('./config');
const API_BASE_URL = `${API_BASE_URL_RAW}/api`;

const DEBUG_REQUEST = (() => {
  try {
    const info = wx.getAccountInfoSync && wx.getAccountInfoSync();
    const envVersion = info && info.miniProgram && info.miniProgram.envVersion;
    return envVersion !== 'release';
  } catch (e) {
    return true;
  }
})();

const ERROR_CODES = {
  PROFILE_INCOMPLETE: 10010,
};

const ERROR_MESSAGES = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  PROFILE_INCOMPLETE: 'PROFILE_INCOMPLETE',
};

function clearSessionCache() {
  wx.removeStorageSync('sessionId');
  wx.removeStorageSync('nickName');
  wx.removeStorageSync('avatarUrl');
  wx.removeStorageSync('phone');
}

function openProfileGuardModal(message) {
  wx.showModal({
    title: '完善资料',
    content: message || '请先完善昵称和头像后再继续操作',
    confirmText: '去完善',
    success: (res) => {
      if (res.confirm) wx.navigateTo({ url: '/pages/login/login' });
    }
  });
}

function rejectProfileGuard(body, reject) {
  const code = body && body.code;
  if (code !== ERROR_CODES.PROFILE_INCOMPLETE) return false;
  openProfileGuardModal(body && body.message);
  reject(new Error(ERROR_MESSAGES.PROFILE_INCOMPLETE));
  return true;
}

function request(url, method, data, headers) {
  return new Promise((resolve, reject) => {
    const sessionId = wx.getStorageSync('sessionId') || '';
    const fullUrl = `${API_BASE_URL}${url}`;

    if (DEBUG_REQUEST) {
      console.log('[REQ]', method, fullUrl, data || {});
      if (url === '/auth/login') {
        console.log('[LOGIN][API_BASE_URL]', API_BASE_URL_RAW);
      }
    }

    wx.request({
      url: fullUrl,
      method,
      data,
      header: {
        'Content-Type': 'application/json',
        'X-Session-Id': sessionId,
        ...(headers || {})
      },
      success: (res) => {
        const body = res.data;

        if (DEBUG_REQUEST) {
          console.log('[RES]', method, fullUrl, res.statusCode, body);
        }

        if (res.statusCode === 401) {
          clearSessionCache();
          wx.showToast({ title: '登录已过期，请重新登录', icon: 'none', duration: 2000 });
          reject(new Error(ERROR_MESSAGES.UNAUTHORIZED));
          return;
        }

        if (res.statusCode === 403 && rejectProfileGuard(body, reject)) {
          return;
        }

        if (res.statusCode >= 200 && res.statusCode < 300) {
          if (body && body.code !== undefined && body.code !== 0) {
            if (rejectProfileGuard(body, reject)) {
              return;
            }
            reject(new Error(body.message || '请求失败'));
            return;
          }
          resolve(body && body.data !== undefined ? body.data : body);
          return;
        }

        reject(new Error(`HTTP ${res.statusCode}`));
      },
      fail: (err) => {
        if (DEBUG_REQUEST) {
          console.error('[REQ_FAIL]', method, fullUrl, err);
        }
        reject(new Error(err.errMsg || '网络错误'));
      }
    });
  });
}

function get(url, headers) {
  return request(url, 'GET', undefined, headers);
}

function post(url, data, headers) {
  return request(url, 'POST', data, headers);
}

module.exports = { request, get, post, ERROR_CODES, ERROR_MESSAGES };
