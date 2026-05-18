const { API_BASE_URL: API_BASE_URL_RAW } = require('./config');
const storage = require('./storage');
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
  storage.clearSession();
}

function openProfileGuardModal(message) {
  wx.showModal({
    title: '完善资料',
    content: message || '请先完善昵称和头像后再继续操作',
    confirmText: '去完善',
    success: (res) => {
      if (res.confirm) wx.switchTab({ url: '/pages/index/index' });
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
    const sessionId = storage.get(storage.KEYS.SESSION_ID, '');
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

function appendQuery(url, params) {
  if (!params || typeof params !== 'object' || Array.isArray(params)) return url;
  const query = Object.keys(params)
    .filter((key) => params[key] !== undefined && params[key] !== null)
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .join('&');
  if (!query) return url;
  return url + (url.indexOf('?') >= 0 ? '&' : '?') + query;
}

function get(url, data, headers) {
  return request(appendQuery(url, data), 'GET', undefined, headers);
}

function post(url, data, headers) {
  return request(url, 'POST', data, headers);
}

function put(url, data, headers) {
  return request(url, 'PUT', data, headers);
}

function del(url, headers) {
  return request(url, 'DELETE', undefined, headers);
}

function uploadImage(filePath) {
  return new Promise((resolve, reject) => {
    const sessionId = storage.get(storage.KEYS.SESSION_ID, '');
    const fullUrl = `${API_BASE_URL}/image/upload`;

    wx.uploadFile({
      url: fullUrl,
      filePath,
      name: 'file',
      header: { 'X-Session-Id': sessionId },
      success: (res) => {
        try {
          const body = JSON.parse(res.data);
          if (body && body.code === 0) {
            resolve(body.data);
          } else {
            reject(new Error((body && body.message) || '上传失败'));
          }
        } catch (e) {
          reject(new Error('解析上传结果失败'));
        }
      },
      fail: (err) => {
        reject(new Error(err.errMsg || '网络错误'));
      }
    });
  });
}

module.exports = { request, get, post, put, delete: del, uploadImage, ERROR_CODES, ERROR_MESSAGES };
