/**
 * 生成默认的图纸名称
 * @returns {string} 格式：魔法图纸#年月日_时分秒
 */
function generatePatternName() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hour = String(now.getHours()).padStart(2, '0');
  const minute = String(now.getMinutes()).padStart(2, '0');
  const second = String(now.getSeconds()).padStart(2, '0');
  return `魔法图纸#${year}${month}${day}_${hour}${minute}${second}`;
}

/**
 * 生成默认的草稿名称
 * @returns {string} 格式：魔法草稿#年月日_时分秒
 */
function generateDraftName() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hour = String(now.getHours()).padStart(2, '0');
  const minute = String(now.getMinutes()).padStart(2, '0');
  const second = String(now.getSeconds()).padStart(2, '0');
  return `魔法草稿#${year}${month}${day}_${hour}${minute}${second}`;
}

module.exports = {
  generatePatternName,
  generateDraftName,
};
