const request = require('../../utils/request');
const { cacheProfile } = require('../../utils/profile-guard');
const { getSafeAreaLayout } = require('../../utils/safe-area');

const DEFAULT_NICKNAME = '魔法师小豆';
const EMPTY_STATS = { total: 0, success: 0, ai: 0, saved: 0 };

Page({
  data: {
    userInfo: null,
    stats: EMPTY_STATS,
    loading: false,
    
    // 新增弹窗状态
    showMagicPanel: false,
    showGiftPanel: false,
    showTaskPanel: false,
    showSettingsPanel: false,
    
    // AI魔法次数
    magicCount: 0,
    
    // 礼品包
    gifts: [],
    
    // 任务
    checkedIn: false,
    tasks: [],
    
    // 设置
    cloudProcess: true,
    watermarkEnabled: true,
    watermarkText: '',
    
    // 子页
    subPage: '',
    subPageLoading: false,
    subPagePatterns: [],
    subPageHistory: [],
    subPageRecycle: [],
    
    // VIP状态
    isVip: false,
    
    // 待完成任务数
    pendingTaskCount: 0,
    
    // 用户信息
    phone: '',
    
    // 安全区域
    statusBarHeight: 44,
    subTopSafePx: 20,
    subHeaderHeightPx: 88,
    
    // 反馈
    feedbackText: '',
  },

  syncTabBar() {
    const tabBar = this.getTabBar && this.getTabBar();
    if (tabBar && typeof tabBar.setSelected === 'function') {
      tabBar.setSelected(3);
    }
  },

  onLoad() {
    this.calcSafeAreas();
    this.loadWatermarkSetting();
    this.loadLocalData();
  },

  calcSafeAreas() {
    try {
      const layout = getSafeAreaLayout();
      this.setData({
        statusBarHeight: layout.statusBarHeight || 44,
        subTopSafePx: layout.statusBarHeight || 20,
        subHeaderHeightPx: layout.navHeight || 88,
      });
    } catch (e) {
      wx.getSystemInfo({
        success: (res) => {
          this.setData({ statusBarHeight: res.statusBarHeight || 44 });
        }
      });
    }
  },

  onShow() {
    this.syncTabBar();
    this.calcSafeAreas();
    this.loadProfile();
    this.loadLocalData();
  },

  loadLocalData() {
    // 加载本地存储的数据
    const checkedIn = wx.getStorageSync('checkedIn') || false;
    const magicCount = wx.getStorageSync('magicCount') || 0;
    const tasks = wx.getStorageSync('tasks') || this.getDefaultTasks();
    const gifts = wx.getStorageSync('gifts') || this.getDefaultGifts();
    const watermarkText = wx.getStorageSync('watermarkText') || '';
    
    const pendingTaskCount = this.calcPendingTaskCount(checkedIn, tasks);
    
    this.setData({
      checkedIn,
      magicCount,
      tasks,
      gifts,
      watermarkText,
      pendingTaskCount,
    });
  },

  calcPendingTaskCount(checkedIn, tasks) {
    let count = 0;
    if (!checkedIn) count++;
    tasks.forEach(t => {
      if (!t.done) count++;
    });
    return count;
  },

  getDefaultTasks() {
    return [
      { id: 'share', name: '分享到微信好友', reward: '奖励 1次 AI魔法', count: 1, done: false, actionText: '去分享' },
      { id: 'invite', name: '邀请好友注册', reward: '奖励 2次 AI魔法', count: 2, done: false, actionText: '去邀请' },
    ];
  },

  getDefaultGifts() {
    return [
      { id: 1, type: 'vip_coupon', title: '购会员卡优惠券', subtitle: '立减10元' },
      { id: 2, type: 'vip_trial', title: '会员体验卡', subtitle: '3日至尊体验' },
      { id: 3, type: 'redeem', title: 'AI魔法兑换券', subtitle: '可兑换3次AI魔法' },
      { id: 4, type: 'card_coupon', title: '会员专享购次卡优惠券', subtitle: '立享8折' },
    ];
  },

  loadProfile() {
    const nickName = wx.getStorageSync('nickName') || '';
    const avatarUrl = wx.getStorageSync('avatarUrl') || '';
    const phone = wx.getStorageSync('phone') || '';
    const vipExpire = wx.getStorageSync('vipExpire') || '';
    const isVip = vipExpire && new Date(vipExpire) > new Date();
    
    this.setData({
      userInfo: { nickName: nickName || DEFAULT_NICKNAME, avatarUrl },
      phone,
      isVip,
    });

    const sessionId = wx.getStorageSync('sessionId');
    if (!sessionId) return;

    this.setData({ loading: true });
    Promise.all([
      request.get('/user/profile'),
      request.get('/user/stats')
    ])
      .then(([profile, stats]) => {
        if (profile && profile.nickName) {
          wx.setStorageSync('nickName', profile.nickName);
          wx.setStorageSync('avatarUrl', profile.avatarUrl || '');
          wx.setStorageSync('phone', profile.phone || '');
        }
        this.setData({
          userInfo: {
            nickName: (profile && profile.nickName) || nickName || DEFAULT_NICKNAME,
            avatarUrl: (profile && profile.avatarUrl) || avatarUrl || ''
          },
          stats: stats || EMPTY_STATS,
          phone: (profile && profile.phone) || phone || '',
          isVip: (profile && profile.vipExpire && new Date(profile.vipExpire) > new Date()) || isVip,
          loading: false
        });
      })
      .catch(() => {
        this.setData({ loading: false });
      });
  },

  // ─── 弹框控制 ───
  onShowMagicPanel() {
    this.setData({ showMagicPanel: true });
  },

  onShowGiftPanel() {
    this.setData({ showGiftPanel: true });
  },

  onShowTaskPanel() {
    this.setData({ showTaskPanel: true });
  },

  onShowTaskPanelFromMagic() {
    this.setData({ showMagicPanel: false, showTaskPanel: true });
  },

  onShowSettings() {
    this.setData({ showSettingsPanel: true });
  },

  onShowFeedback() {
    this.setData({ subPage: 'feedback', feedbackText: '' });
  },

  onCloseAllPanels() {
    this.setData({
      showMagicPanel: false,
      showGiftPanel: false,
      showTaskPanel: false,
      showSettingsPanel: false,
    });
  },

  // ─── AI魔法弹框操作 ───
  onGoCards() {
    this.onCloseAllPanels();
    this.onVip();
  },

  // ─── 礼品包操作 ───
  onUseGift(e) {
    const gift = e.currentTarget.dataset.gift;
    if (!gift) return;

    if (gift.type === 'vip_coupon' || gift.type === 'card_coupon') {
      wx.showToast({ title: '请前往开通会员使用优惠券', icon: 'none' });
    } else if (gift.type === 'vip_trial') {
      wx.showModal({
        title: '开通体验',
        content: '立即开启3日至尊体验？',
        success: (res) => {
          if (res.confirm) {
            this.activateVipTrial();
            this.removeGift(gift.id);
            wx.showToast({ title: '已发放权益', icon: 'success' });
          }
        }
      });
    } else if (gift.type === 'redeem') {
      this.addMagicCount(3);
      this.removeGift(gift.id);
      wx.showToast({ title: '已发放权益', icon: 'success' });
    }
  },

  activateVipTrial() {
    const expireDate = new Date();
    expireDate.setDate(expireDate.getDate() + 3);
    wx.setStorageSync('vipExpire', expireDate.toISOString());
    this.setData({ isVip: true });
  },

  removeGift(giftId) {
    const gifts = this.data.gifts.filter(g => g.id !== giftId);
    wx.setStorageSync('gifts', gifts);
    this.setData({ gifts });
  },

  // ─── 任务中心操作 ───
  onCheckIn() {
    const checkedIn = true;
    const pendingTaskCount = this.calcPendingTaskCount(checkedIn, this.data.tasks);
    this.setData({ checkedIn, pendingTaskCount });
    wx.setStorageSync('checkedIn', true);
    this.addMagicCount(3);
    wx.showToast({ title: '打卡成功！获得 3次 AI魔法', icon: 'success' });
  },

  onDoTask(e) {
    const task = e.currentTarget.dataset.task;
    if (!task) return;

    // 模拟完成任务
    const tasks = this.data.tasks.map(t => {
      if (t.id === task.id) {
        return { ...t, done: true };
      }
      return t;
    });
    const pendingTaskCount = this.calcPendingTaskCount(this.data.checkedIn, tasks);
    wx.setStorageSync('tasks', tasks);
    this.setData({ tasks, pendingTaskCount });
    this.addMagicCount(task.count);
    wx.showToast({ title: `完成任务，获得 ${task.count} 次 AI魔法！`, icon: 'success' });
  },

  addMagicCount(count) {
    const magicCount = this.data.magicCount + count;
    wx.setStorageSync('magicCount', magicCount);
    this.setData({ magicCount });
  },

  // ─── 设置操作 ───
  onCloudProcessChange(e) {
    const enabled = !!e.detail.value;
    this.setData({ cloudProcess: enabled });
    wx.showToast({ title: enabled ? '已开启云端处理' : '已关闭云端处理', icon: 'none' });
  },

  onWatermarkChange(e) {
    const enabled = !!e.detail.value;
    this.setData({ watermarkEnabled: enabled });
    wx.setStorageSync('watermarkEnabled', enabled);
  },

  onWatermarkTextChange(e) {
    this.setData({ watermarkText: e.detail.value });
  },

  onConfirmSettings() {
    wx.setStorageSync('watermarkText', this.data.watermarkText);
    this.onCloseAllPanels();
    wx.showToast({ title: '设置已保存', icon: 'success' });
  },

  loadWatermarkSetting() {
    const enabled = wx.getStorageSync('watermarkEnabled');
    const text = wx.getStorageSync('watermarkText') || '';
    this.setData({ 
      watermarkEnabled: enabled !== false,
      watermarkText: text,
    });
  },

  // ─── 清除魔法痕迹 ───
  onClearTrace() {
    wx.showModal({
      title: '清除魔法痕迹',
      content: '将清除本地缓存和使用记录，确认继续？',
      success: (res) => {
        if (res.confirm) {
          wx.clearStorageSync();
          const tasks = this.getDefaultTasks();
          const gifts = this.getDefaultGifts();
          const pendingTaskCount = this.calcPendingTaskCount(false, tasks);
          this.setData({
            userInfo: null,
            stats: EMPTY_STATS,
            magicCount: 0,
            checkedIn: false,
            tasks,
            gifts,
            pendingTaskCount,
          });
          wx.showToast({ title: '已清除', icon: 'success' });
        }
      }
    });
  },

  // ─── 反馈 ───
  onFeedbackInput(e) {
    this.setData({ feedbackText: e.detail.value });
  },

  onSendFeedback() {
    const text = this.data.feedbackText.trim();
    if (!text) {
      wx.showToast({ title: '请先写下建议', icon: 'none' });
      return;
    }
    request.post('/feedback/submit', { content: text, category: 'SUGGESTION' })
      .then(() => {
        wx.showToast({ title: '小豆已经收到你的建议啦！', icon: 'success' });
        this.setData({ feedbackText: '', subPage: '' });
      })
      .catch(() => {
        wx.showToast({ title: '发送失败，请重试', icon: 'none' });
      });
  },

  // ─── 其他导航 ───
  onEditProfile() {
    wx.navigateTo({ url: '/pages/login/login' });
  },

  onVip() {
    wx.navigateTo({ url: '/pages/vip/vip' });
  },

  onGoHistory() {
    this.setData({ subPage: 'history', subPageLoading: true });
    this.loadHistory();
  },

  onGoDraft() {
    wx.navigateTo({ url: '/pages/draft/draft' });
  },

  onGoMyPatterns() {
    this.setData({ subPage: 'patterns', subPageLoading: true });
    this.loadPatterns();
  },

  onCloseSubPage() {
    this.setData({ subPage: '' });
  },

  // ─── 加载子页数据 ───
  loadPatterns() {
    const sessionId = wx.getStorageSync('sessionId');
    if (!sessionId) {
      this.setData({ subPagePatterns: [], subPageLoading: false });
      return;
    }
    request.get('/box/list')
      .then(res => {
        this.setData({ subPagePatterns: res.data || [], subPageLoading: false });
      })
      .catch(() => {
        this.setData({ subPagePatterns: [], subPageLoading: false });
      });
  },

  loadHistory() {
    const sessionId = wx.getStorageSync('sessionId');
    if (!sessionId) {
      this.setData({ subPageHistory: [], subPageLoading: false });
      return;
    }
    request.get('/history/list')
      .then(res => {
        this.setData({ subPageHistory: res.data || [], subPageLoading: false });
      })
      .catch(() => {
        this.setData({ subPageHistory: [], subPageLoading: false });
      });
  },

  onSubClearHistory() {
    wx.showModal({
      title: '清空时光机',
      content: '确认清空所有历史记录？',
      success: (res) => {
        if (res.confirm) {
          const sessionId = wx.getStorageSync('sessionId');
          if (sessionId) {
            request.post('/history/clear')
              .then(() => {
                this.setData({ subPageHistory: [] });
                wx.showToast({ title: '时光机已清空', icon: 'success' });
              })
              .catch(() => {
                wx.showToast({ title: '清空失败', icon: 'none' });
              });
          }
        }
      }
    });
  },

  onSubItemTap(e) {
    const item = e.currentTarget.dataset.item;
    if (!item) return;
    wx.navigateTo({
      url: `/pages/result/result?id=${item.id}&from=${this.data.subPage}`
    });
  },

  onSubDelete(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    request.delete(`/box/delete/${id}`)
      .then(() => {
        this.loadPatterns();
        wx.showToast({ title: '已删除', icon: 'success' });
      })
      .catch(() => {
        wx.showToast({ title: '删除失败', icon: 'none' });
      });
  },

  onSubRestore(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    request.post(`/box/restore/${id}`)
      .then(() => {
        this.loadRecycle();
        wx.showToast({ title: '已恢复', icon: 'success' });
      })
      .catch(() => {
        wx.showToast({ title: '恢复失败', icon: 'none' });
      });
  },

  onLogout() {
    wx.showModal({
      title: '退出登录',
      content: '确认退出登录？',
      success: (res) => {
        if (res.confirm) {
          wx.removeStorageSync('sessionId');
          wx.removeStorageSync('nickName');
          wx.removeStorageSync('avatarUrl');
          wx.removeStorageSync('phone');
          wx.removeStorageSync('vipExpire');
          this.setData({
            userInfo: null,
            stats: EMPTY_STATS,
            isVip: false,
            phone: '',
            subPage: '',
            pendingTaskCount: 0,
          });
          wx.showToast({ title: '已退出登录', icon: 'success' });
        }
      }
    });
  },
});
