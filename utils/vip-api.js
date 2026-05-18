const request = require('./request');

/**
 * 会员系统 API 封装
 */

// 构建查询字符串的辅助函数（替代 URLSearchParams）
function buildQueryString(params) {
  if (!params || Object.keys(params).length === 0) {
    return '';
  }
  return Object.keys(params)
    .filter(key => params[key] !== undefined && params[key] !== null)
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .join('&');
}

// ==================== 套餐查询 ====================

/**
 * 获取会员套餐列表
 */
function getVipPackages() {
  return request.get('/vip/packages');
}

/**
 * 获取次卡套餐列表
 */
function getCardPackages() {
  return request.get('/vip/card-packages');
}

/**
 * 获取权益对比表
 */
function getPrivileges() {
  return request.get('/vip/privileges');
}

// ==================== 会员相关 ====================

/**
 * 获取用户会员信息
 */
function getVipInfo() {
  return request.get('/vip/info');
}

/**
 * 购买会员
 * @param {string} packageCode - 套餐代码：month/quarter/year
 * @param {number} couponId - 优惠券ID（可选）
 */
function purchaseVip(packageCode, couponId) {
  const body = { packageCode };
  if (couponId) {
    body.couponId = couponId;
  }
  return request.post('/orders/vip', body);
}

/**
 * 取消自动续费
 */
function cancelAutoRenew() {
  return request.post('/vip/cancel-renew');
}

// ==================== 次卡相关 ====================

/**
 * 购买次卡
 * @param {string} packageCode - 套餐代码：c10/c30/c100
 * @param {number} couponId - 优惠券ID（可选）
 */
function purchaseCard(packageCode, couponId) {
  const body = { packageCode };
  if (couponId) {
    body.couponId = couponId;
  }
  return request.post('/orders/card', body);
}

// ==================== 订单相关 ====================

/**
 * 获取订单列表
 * @param {object} params - 查询参数
 * @param {string} params.productType - 商品类型：vip/card/gift（可选）
 * @param {number} params.page - 页码（可选，默认1）
 * @param {number} params.pageSize - 每页数量（可选，默认20）
 */
function getOrderList(params = {}) {
  const query = buildQueryString(params);
  return request.get(`/orders/list${query ? '?' + query : ''}`);
}

/**
 * 获取订单详情
 * @param {string} orderNo - 订单号
 */
function getOrderDetail(orderNo) {
  return request.get(`/orders/${orderNo}`);
}

/**
 * 取消订单
 * @param {string} orderNo - 订单号
 */
function cancelOrder(orderNo) {
  return request.post(`/orders/${orderNo}/cancel`);
}

/**
 * 查询订单支付状态
 * @param {string} orderNo - 订单号
 */
function queryOrderStatus(orderNo) {
  return request.get(`/orders/${orderNo}/status`);
}

// ==================== 权益校验 ====================

/**
 * 检查用户权益
 * @param {string} privilegeKey - 权益键：pattern_box_limit/draft_box_limit/history_expire_days/watermark_control
 */
function checkPrivilege(privilegeKey) {
  return request.get(`/privilege/check?key=${privilegeKey}`);
}

function checkPatternBoxLimit() {
  return request.get('/privilege/check/pattern-box');
}

function checkDraftBoxLimit() {
  return request.get('/privilege/check/draft-box');
}

// ==================== AI次数相关 ====================

/**
 * 获取用户AI次数信息
 */
function getAiQuotaInfo() {
  return request.get('/ai-count/info');
}

/**
 * 使用AI次数
 * @param {string} bizType - 业务类型：AI_GENERATE/AI_ENHANCE
 * @param {string} bizId - 业务ID
 */
function useAiQuota(bizType, bizId) {
  return request.post('/ai-count/use', { bizType, bizId });
}

/**
 * 获取AI次数使用记录
 * @param {object} params - 查询参数
 * @param {number} params.page - 页码（可选，默认1）
 * @param {number} params.pageSize - 每页数量（可选，默认20）
 */
function getAiQuotaLogs(params = {}) {
  const query = buildQueryString(params);
  return request.get(`/ai-count/logs${query ? '?' + query : ''}`);
}

// ==================== 消息通知 ====================

/**
 * 获取消息列表
 * @param {object} params - 查询参数
 * @param {number} params.page - 页码（可选，默认1）
 * @param {number} params.pageSize - 每页数量（可选，默认20）
 */
function getNotifications(params = {}) {
  const query = buildQueryString(params);
  return request.get(`/notification/list${query ? '?' + query : ''}`);
}

/**
 * 标记消息已读
 * @param {number} notificationId - 消息ID
 */
function markNotificationRead(notificationId) {
  return request.post('/notification/mark-read/' + notificationId);
}

/**
 * 获取未读消息数量
 */
function getUnreadCount() {
  return request.get('/notification/unread-count');
}

// ==================== 活动相关 ====================

/**
 * 获取活动详情
 * @param {string} activityCode - 活动代码
 */
function getActivityDetail(activityCode) {
  return request.get(`/activity/${activityCode}`);
}

/**
 * 领取活动礼品
 * @param {string} activityCode - 活动代码
 */
function claimActivityGift(activityCode) {
  return request.post('/activity/claim', { activityCode });
}

// ==================== 任务中心 ====================

/**
 * 每日签到
 */
function dailyCheckin() {
  return request.post('/task/checkin');
}

/**
 * 获取签到状态
 */
function getCheckinStatus() {
  return request.get('/task/checkin/status');
}

/**
 * 领取签到奖励
 */
function claimCheckinReward() {
  return request.post('/task/checkin/claim');
}

/**
 * 记录分享行为
 * @param {string} taskCode - 任务代码：daily_share
 */
function recordShare(taskCode) {
  return request.post('/task/share/record', { taskCode });
}

/**
 * 验证分享（好友点击分享链接时调用）
 * @param {string} shareFrom - 分享者用户ID
 * @param {string} taskCode - 任务代码：daily_share
 */
function verifyShare(shareFrom, taskCode) {
  return request.post('/task/share/verify', { shareFrom, taskCode });
}

/**
 * 获取任务列表
 */
function getTaskList() {
  return request.get('/task/list');
}

/**
 * 获取任务完成记录
 */
function getTaskLogs() {
  return request.get('/task/logs');
}

// ==================== 礼品系统 ====================

/**
 * 获取我的礼品列表
 * @param {object} params - 查询参数
 * @param {string} params.status - 状态：UNUSED/USED/EXPIRED（可选）
 */
function getMyGifts(params = {}) {
  const query = buildQueryString(params);
  return request.get(`/gift/my-gifts${query ? '?' + query : ''}`);
}

/**
 * 使用礼品
 * @param {number} giftId - 礼品ID
 */
function useGift(giftId) {
  return request.post('/gift/use', { giftId });
}

module.exports = {
  // 套餐查询
  getVipPackages,
  getCardPackages,
  getPrivileges,

  // 会员相关
  getVipInfo,
  purchaseVip,
  cancelAutoRenew,

  // 次卡相关
  purchaseCard,

  // 订单相关
  getOrderList,
  getOrderDetail,
  cancelOrder,
  queryOrderStatus,

  // 权益校验
  checkPrivilege,
  checkPatternBoxLimit,
  checkDraftBoxLimit,

  // AI次数相关
  getAiQuotaInfo,
  useAiQuota,
  getAiQuotaLogs,

  // 消息通知
  getNotifications,
  markNotificationRead,
  getUnreadCount,

  // 活动相关
  getActivityDetail,
  claimActivityGift,

  // 任务中心
  dailyCheckin,
  getCheckinStatus,
  claimCheckinReward,
  recordShare,
  verifyShare,
  getTaskList,
  getTaskLogs,

  // 礼品系统
  getMyGifts,
  useGift,
};
