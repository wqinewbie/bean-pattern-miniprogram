const { API_BASE_URL } = require('./config');

const ERROR_CODES = {
  PROFILE_INCOMPLETE: 10010,
  PHONE_UNBOUND: 10011,
};

const ERROR_MESSAGES = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  PROFILE_INCOMPLETE: 'PROFILE_INCOMPLETE',
  PHONE_UNBOUND: 'PHONE_UNBOUND',
};

function clearSessionCache() {
  wx.removeStorageSync('sessionId');
  wx.removeStorageSync('nickName');
  wx.removeStorageSync('avatarUrl');
  wx.removeStorageSync('phone');
}

function openProfileGuardModal(needPhone, message) {
  wx.showModal({
    title: needPhone ? '绑定手机号' : '完善资料',
    content: message || (needPhone ? '请先绑定手机号后再继续操作' : '请先完善昵称和头像后再继续操作'),
    confirmText: needPhone ? '去绑定' : '去完善',
    success: (res) => {
      if (res.confirm) wx.navigateTo({ url: '/pages/login/login' });
    }
  });
}

function rejectProfileGuard(body, reject) {
  const code = body && body.code;
  if (code !== ERROR_CODES.PROFILE_INCOMPLETE && code !== ERROR_CODES.PHONE_UNBOUND) return false;
  const needPhone = code === ERROR_CODES.PHONE_UNBOUND;
  openProfileGuardModal(needPhone, body && body.message);
  reject(new Error(needPhone ? ERROR_MESSAGES.PHONE_UNBOUND : ERROR_MESSAGES.PROFILE_INCOMPLETE));
  return true;
}

function request(url, method, data, headers) {
  return new Promise((resolve, reject) => {
    const sessionId = wx.getStorageSync('sessionId') || '';

    wx.request({
      url: `${API_BASE_URL}${url}`,
      method,
      data,
      header: {
        'Content-Type': 'application/json',
        'X-Session-Id': sessionId,
        ...(headers || {})
      },
      success: (res) => {
        const body = res.data;

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
      fail: (err) => reject(new Error(err.errMsg || '网络错误'))
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