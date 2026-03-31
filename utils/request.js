const { API_BASE_URL } = require('./config');

/**
 * 基础请求封装
 * - 自动携带 X-Session-Id
 * - 后端返回 HTTP 401 时，清除本地登录态并提示重新登录
 */
function request(url, method, data, headers) {
  return new Promise((resolve, reject) => {
    wx.getStorage({
      key: 'sessionId',
      complete: (storageRes) => {
        const sessionId = storageRes.data || '';

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
            // 统一处理 401：清除登录态，提示用户
            if (res.statusCode === 401) {
              wx.removeStorageSync('sessionId');
              wx.removeStorageSync('nickName');
              wx.removeStorageSync('avatarUrl');
              wx.showToast({ title: '登录已过期，请重新登录', icon: 'none', duration: 2000 });
              reject(new Error('UNAUTHORIZED'));
              return;
            }
            if (res.statusCode >= 200 && res.statusCode < 300) {
              const body = res.data;
              if (body && body.code !== undefined && body.code !== 0) {
                reject(new Error(body.message || '请求失败'));
                return;
              }
              resolve(body && body.data !== undefined ? body.data : body);
              return;
            }
            reject(new Error(`HTTP ${res.statusCode}`));
          },
          fail: (err) => {
            reject(new Error(err.errMsg || '网络错误'));
          }
        });
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

module.exports = { request, get, post };
