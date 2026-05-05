/**
 * 路径处理工具
 * 统一处理临时路径判断和 URL 验证
 */

/**
 * 判断是否为微信小程序临时路径
 * @param {string} url - 要判断的路径
 * @returns {boolean} 是否为临时路径
 */
function isTempPath(url) {
  if (!url) return false;

  const urlStr = String(url).trim();
  if (!urlStr) return false;

  // 微信小程序临时路径的常见格式：
  // 1. wxfile://tmp/...
  // 2. http://tmp/... (某些情况下 canvas 导出的格式)
  // 3. http://usr/... (用户目录)
  // 4. 本地文件路径（不以 http:// 或 https:// 开头）

  // 标准微信临时文件协议
  if (urlStr.startsWith('wxfile://')) {
    return true;
  }

  // 特殊的临时路径格式：http://tmp/ 或 http://usr/
  if (urlStr.startsWith('http://tmp/') || urlStr.startsWith('http://usr/')) {
    return true;
  }

  // 检查是否为有效的远程 URL（COS URL）
  if (isValidRemoteUrl(urlStr)) {
    return false;
  }

  // 其他情况都视为临时路径（本地文件路径）
  return true;
}

/**
 * 判断是否为有效的远程 URL（COS URL 或其他 HTTPS URL）
 * @param {string} url - 要判断的 URL
 * @returns {boolean} 是否为有效的远程 URL
 */
function isValidRemoteUrl(url) {
  if (!url) return false;

  const urlStr = String(url).trim();
  if (!urlStr) return false;

  // 必须是 https:// 开头（COS URL 通常是 HTTPS）
  if (!urlStr.startsWith('https://')) {
    return false;
  }

  // 排除特殊的临时路径格式
  if (urlStr.startsWith('https://tmp/') || urlStr.startsWith('https://usr/')) {
    return false;
  }

  // 使用正则表达式验证 URL 格式（微信小程序不支持 new URL()）
  // 匹配 https://domain.com/path 格式
  const urlPattern = /^https:\/\/[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}(\/.*)?$/;
  return urlPattern.test(urlStr);
}

/**
 * 判断是否需要上传到 COS
 * @param {string} url - 要判断的路径
 * @returns {boolean} 是否需要上传
 */
function needsUpload(url) {
  return isTempPath(url);
}

/**
 * 获取路径类型描述（用于调试）
 * @param {string} url - 要判断的路径
 * @returns {string} 路径类型描述
 */
function getPathType(url) {
  if (!url) return 'empty';

  const urlStr = String(url).trim();
  if (!urlStr) return 'empty';

  if (urlStr.startsWith('wxfile://')) return 'wxfile';
  if (urlStr.startsWith('http://tmp/')) return 'http-tmp';
  if (urlStr.startsWith('http://usr/')) return 'http-usr';
  if (urlStr.startsWith('https://')) return isValidRemoteUrl(urlStr) ? 'remote-https' : 'invalid-https';
  if (urlStr.startsWith('http://')) return 'http';

  return 'local';
}

module.exports = {
  isTempPath,
  isValidRemoteUrl,
  needsUpload,
  getPathType
};
