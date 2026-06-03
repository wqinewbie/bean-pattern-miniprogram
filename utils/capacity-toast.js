const DEFAULT_MESSAGES = {
  box: '图纸箱容量已满',
  draft: '草稿箱容量已满'
};

function getCapacityFullMessage(result, type = 'box') {
  if (result && result.capacityMessage) return result.capacityMessage;

  const current = result && Number(result.capacityCurrent);
  const limit = result && Number(result.capacityLimit);
  const base = DEFAULT_MESSAGES[type] || DEFAULT_MESSAGES.box;
  if (Number.isFinite(current) && Number.isFinite(limit) && limit > 0) {
    return `${base}（${current}/${limit}），请删除${type === 'draft' ? '草稿' : '图纸'}或升级会员`;
  }
  return `${base}，请删除${type === 'draft' ? '草稿' : '图纸'}或升级会员`;
}

function showCapacityFullIfNeeded(result, options = {}) {
  if (!result || !result.capacityFull) return false;
  const type = options.type || 'box';
  const delay = options.delay == null ? 700 : options.delay;
  const duration = options.duration || 2200;
  setTimeout(() => {
    wx.showToast({
      title: getCapacityFullMessage(result, type),
      icon: 'none',
      duration
    });
  }, delay);
  return true;
}

function showRequestErrorToast(err, fallback = '保存失败') {
  const title = (err && err.message) || fallback;
  wx.showToast({ title, icon: 'none', duration: 2200 });
}

module.exports = {
  getCapacityFullMessage,
  showCapacityFullIfNeeded,
  showRequestErrorToast
};
