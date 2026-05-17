const request = require('../../utils/request');
const { API_BASE_URL } = require('../../utils/config');
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
    availableGiftCount: 0,
    giftTab: 'available',
    giftTabs: [],
    visibleGifts: [],
    
    // 签到
    checkinStatus: {
      continuousDays: 0,
      totalDays: 0,
      canClaim: false,
      checkedInToday: false,
      calendar: {},
      requiredDays: 3,
      rewardValue: 1
    },

    // 任务
    tasks: [],
    draftCount: 0,
    
    // 设置
    cloudProcess: true,
    watermarkEnabled: true,
    watermarkText: '',
    
    // VIP状态
    isVip: false,
    
    // 待完成任务数
    pendingTaskCount: 0,
    
    // 用户信息
    phone: '',
    inviteCode: '',
    
    // 安全区域
    statusBarHeight: 44,
    subTopSafePx: 20,
    subHeaderHeightPx: 88,
    
    // 反馈
    feedbackText: '',

    // 消息中心
    notifications: [],
    unreadCount: 0,

    // 帮助中心
    helpFaqs: [],
  },

  syncTabBar() {
    const tabBar = this.getTabBar && this.getTabBar();
    if (tabBar && typeof tabBar.setSelected === 'function') {
      tabBar.setSelected(3);
    }
    this.updateTabBarVisibility();
  },

  updateTabBarVisibility() {
    const tabBar = this.getTabBar && this.getTabBar();
    if (tabBar && typeof tabBar.setHidden === 'function') {
      tabBar.setHidden(!!(this.data.showMagicPanel || this.data.showGiftPanel || this.data.showTaskPanel || this.data.showSettingsPanel));
    }
  },

  onLoad() {
    this.calcSafeAreas();
    this.loadWatermarkSetting();
    this.loadLocalData();
    this.loadNotifications();
    this.loadHelpFaqs();
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
      const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : {};
      const appBaseInfo = wx.getAppBaseInfo ? wx.getAppBaseInfo() : {};
      this.setData({ statusBarHeight: windowInfo.statusBarHeight || appBaseInfo.statusBarHeight || 44 });
    }
  },

  onShow() {
    this.syncTabBar();
    this.calcSafeAreas();
    this.loadProfile();
    this.loadLocalData();
    this.loadNotifications();
    this.loadTasksFromServer();
  },

  onHide() {
    const tabBar = this.getTabBar && this.getTabBar();
    if (tabBar && typeof tabBar.setHidden === 'function') {
      tabBar.setHidden(false);
    }
  },

  onUnload() {
    const tabBar = this.getTabBar && this.getTabBar();
    if (tabBar && typeof tabBar.setHidden === 'function') {
      tabBar.setHidden(false);
    }
  },

  loadLocalData() {
    // 加载本地存储的数据
    const checkedIn = wx.getStorageSync('checkedIn') || false;
    const magicCount = wx.getStorageSync('magicCount') || 0;
    const gifts = wx.getStorageSync('gifts') || this.getDefaultGifts();
    const watermarkText = wx.getStorageSync('watermarkText') || '';
    const draftCount = this.getDraftCount();
    const inviteCode = wx.getStorageSync('myInviteCode') || '';
    
    this.setData({
      checkedIn,
      magicCount,
      gifts,
      availableGiftCount: this.calcAvailableGiftCount(gifts),
      watermarkText,
      draftCount,
      inviteCode,
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

  calcPendingTaskCountFromServer(tasks) {
    let count = 0;
    if (Array.isArray(tasks)) {
      tasks.forEach((task) => {
        if ((task.status || 0) !== 2) {
          count += 1;
        }
      });
    }
    return count;
  },

  getDraftCount() {
    const drafts = wx.getStorageSync('drafts') || wx.getStorageSync('draftPatterns') || [];
    return Array.isArray(drafts) ? drafts.length : 0;
  },

  getDefaultTasks() {
    return [
      { id: 'share', name: '分享到微信好友', reward: '奖励 1次 AI魔法', count: 1, done: false, actionText: '去分享' },
      { id: 'invite', name: '邀请好友注册', reward: '奖励 2次 AI魔法', count: 2, done: false, actionText: '去邀请' },
    ];
  },

  loadTasksFromServer() {
    const sessionId = wx.getStorageSync('sessionId');
    if (!sessionId) return Promise.resolve([]);

    return request.get('/task/list')
      .then((taskListData) => {
        const taskConfigs = (taskListData && taskListData.tasks) || [];
        const needsLegacyProgress = taskConfigs.some((task) => task.status === undefined && task.progressId === undefined);

        if (!needsLegacyProgress) {
          const tasks = taskConfigs.map((task) => this.normalizeTaskCenterItem(task));
          this.setData({
            tasks,
            pendingTaskCount: this.calcPendingTaskCountFromServer(tasks),
            checkedIn: false
          });
          return tasks;
        }

        return request.get('/task/progress').then((taskProgress) => {
          const progressMap = {};

          if (Array.isArray(taskProgress)) {
            taskProgress.forEach((p) => {
              progressMap[p.taskCode] = p;
            });
          }

          const tasks = taskConfigs.map((config) => {
            const progress = progressMap[config.taskCode] || null;
            return this.normalizeTaskCenterItem(config, progress);
          });

          this.setData({
            tasks,
            pendingTaskCount: this.calcPendingTaskCountFromServer(tasks),
            checkedIn: false
          });

          return tasks;
        });
      })
      .catch((err) => {
        console.log('加载任务失败', err);
        return [];
      });
  },

  normalizeTaskCenterItem(config, progress) {
    const status = Number((config.status !== undefined ? config.status : progress && progress.status) || 0);
    const currentCount = Number((config.currentCount !== undefined ? config.currentCount : progress && progress.currentCount) || 0);
    const targetCount = Number((config.targetCount !== undefined ? config.targetCount : progress && progress.targetCount) || 1);

    // 优先使用新的 rewardItems 字段
    let rewardValue = 1;
    let rewardText = '奖励礼包';
    let rewardType = config.rewardType;

    if (config.rewardItems && config.rewardItems.length > 0) {
      // 使用第一个奖励项的信息
      const firstReward = config.rewardItems[0];
      rewardValue = Number(firstReward.value || 1);
      rewardText = firstReward.displayText || '奖励礼包';
      rewardType = firstReward.type;
    } else {
      // 向后兼容：使用旧字段
      rewardValue = Number(config.rewardValue || 1);
      rewardText = config.handlerType === 'CHECKIN' ? '奖励礼品包' : '奖励礼包';
    }

    const actionText = config.handlerType === 'CHECKIN'
      ? (status === 1 ? '领取奖励' : '去签到')
      : (config.handlerType === 'FIRST_RECHARGE_GIFT' || config.handlerType === 'REGISTER_GIFT')
        ? (status === 1 ? '领取礼包' : (config.handlerType === 'FIRST_RECHARGE_GIFT' ? '去充值' : '待领取'))
        : (config.handlerType === 'INVITE_REGISTER' || config.handlerType === 'INVITE_RECHARGE')
          ? (status === 1 ? '领取礼包' : '去邀请')
          : config.handlerType === 'REVIEW_TASK'
            ? (status === 2 ? '已完成' : '去提交')
            : (status === 1 ? '领取奖励' : '去完成');
    const progressDisplay = config.progressText || (config.handlerType === 'REVIEW_TASK' ? '' : `${currentCount}/${targetCount}`);

    return {
      id: config.taskCode,
      taskCode: config.taskCode,
      taskName: config.taskName,
      description: config.description || '',
      rewardType,
      rewardValue,
      rewardText,
      rewardItems: config.rewardItems || [],
      actionText,
      progressDisplay,
      handlerType: config.handlerType || 'GENERIC_PROGRESS',
      bizCategory: config.bizCategory || 'EVENT_TASK',
      progressText: config.progressText || `${currentCount}/${targetCount}`,
      status,
      currentCount,
      targetCount,
      progressId: config.progressId || (progress && progress.id ? progress.id : null),
      done: config.done !== undefined ? !!config.done : status === 2,
      canClaim: config.canClaim !== undefined ? !!config.canClaim : status === 1
    };
  },

  getDefaultGifts() {
    return [];
  },

  calcAvailableGiftCount(gifts) {
    return (gifts || []).filter((gift) => {
      if (gift.tabStatus) return gift.tabStatus === 'available';

      const now = Date.now();
      const expireTime = gift.expireAt ? new Date(gift.expireAt).getTime() : 0;
      const expired = gift.status === 2 || (expireTime && expireTime <= now);
      const used = gift.status === 1;
      return !expired && !used;
    }).length;
  },

  loadNotifications() {
    const sessionId = wx.getStorageSync('sessionId');
    if (!sessionId) {
      this.setData({ notifications: [], unreadCount: 0 });
      return;
    }

    // 从后端获取通知列表
    request.get('/notification/list', { limit: 50 })
      .then(notifications => {
        if (Array.isArray(notifications)) {
          const unreadCount = notifications.filter(item => !item.read).length;
          this.setData({ notifications, unreadCount });
        }
      })
      .catch(err => {
        console.error('加载通知失败:', err);
        this.setData({ notifications: [], unreadCount: 0 });
      });
  },

  loadHelpFaqs() {
    const faqs = [
      {
        question: '如何开始创建我的第一个拼豆图纸？',
        answer: '您可以选择"图片转图纸"上传照片，或使用"AI一键生成"输入文字描述，系统会自动为您生成拼豆图纸。',
      },
      {
        question: '什么是魔法值？如何获取？',
        answer: '魔法值用于生成AI图纸和使用高级功能。您可以通过签到、完成任务领取礼品包，兑换后获得魔法值，也可以通过充值会员或购买次卡获得。',
      },
      {
        question: '生成的图纸可以修改吗？',
        answer: '可以！点击图纸进入预览页面后，可以进行颜色替换、尺寸调整等编辑操作。',
      },
      {
        question: '如何保存和分享我的作品？',
        answer: '在预览页面点击"保存"可将图纸保存到"我的图纸"，点击"分享"可生成海报分享给好友。',
      },
    ];
    this.setData({ helpFaqs: faqs });
  },

  markNotificationsRead() {
    const sessionId = wx.getStorageSync('sessionId');
    if (!sessionId) return;

    // 调用后端接口标记所有通知为已读
    request.post('/notification/mark-all-read')
      .then(() => {
        const notifications = (this.data.notifications || []).map(item => ({ ...item, read: true }));
        this.setData({ notifications, unreadCount: 0 });
      })
      .catch(err => {
        console.error('标记已读失败:', err);
      });
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
      request.get('/user/stats'),
      request.get('/gift/my'),
      this.loadTasksFromServer(),
      request.get('/invite/my-code').catch(() => null)
    ])
      .then(([profile, stats, gifts, tasks, inviteData]) => {
        if (profile && profile.nickName) {
          wx.setStorageSync('nickName', profile.nickName);
          wx.setStorageSync('avatarUrl', profile.avatarUrl || '');
          wx.setStorageSync('phone', profile.phone || '');
        }

        const pendingTaskCount = this.calcPendingTaskCountFromServer(tasks || []);

        const normalizedGifts = Array.isArray(gifts) ? this.normalizeGifts(gifts) : [];
        const availableGiftCount = this.calcAvailableGiftCount(normalizedGifts);
        const giftTabs = this.buildGiftTabs(normalizedGifts);
        const visibleGifts = this.filterGiftsByTab(normalizedGifts, this.data.giftTab);

        const inviteCode = inviteData && inviteData.inviteCode ? inviteData.inviteCode : (wx.getStorageSync('myInviteCode') || '');

        this.setData({
          userInfo: {
            nickName: (profile && profile.nickName) || nickName || DEFAULT_NICKNAME,
            avatarUrl: (profile && profile.avatarUrl) || avatarUrl || ''
          },
          stats: stats || EMPTY_STATS,
          phone: (profile && profile.phone) || phone || '',
          inviteCode,
          isVip: (profile && profile.vipExpireAt && new Date(profile.vipExpireAt) > new Date()) || isVip,
          magicCount: (profile && profile.aiQuota) || 0,
          gifts: normalizedGifts,
          availableGiftCount,
          giftTabs,
          visibleGifts,
          pendingTaskCount: pendingTaskCount,
          loading: false
        });

        if (inviteCode) {
          wx.setStorageSync('myInviteCode', inviteCode);
        }
      })
      .catch(() => {
        this.setData({ loading: false });
      });
  },

  // ─── 弹框控制 ───
  onShowMagicPanel() {
    this.setData({ showMagicPanel: true }, () => this.updateTabBarVisibility());
  },

  onShowGiftPanel() {
    const normalizedGifts = this.data.gifts || [];
    this.setData({
      showGiftPanel: true,
      giftTabs: this.buildGiftTabs(normalizedGifts),
      visibleGifts: this.filterGiftsByTab(normalizedGifts, this.data.giftTab)
    }, () => this.updateTabBarVisibility());
  },

  onShowTaskPanel() {
    this.setData({ showTaskPanel: true }, () => this.updateTabBarVisibility());
    // 加载签到状态和任务列表
    this.loadCheckinStatus();
    this.loadTasksFromServer();
  },

  onShowTaskPanelFromMagic() {
    this.setData({ showMagicPanel: false, showTaskPanel: true }, () => this.updateTabBarVisibility());
  },

  onShowSettings() {
    this.setData({ showSettingsPanel: true }, () => this.updateTabBarVisibility());
  },

  onShowFeedback() {
    wx.navigateTo({ url: '/pages/help-center/help-center' });
  },

  onShowPrivacy() {
    wx.navigateTo({ url: '/pages/privacy-policy/privacy-policy' });
  },

  onOpenInvitePage() {
    wx.navigateTo({ url: '/pages/invite/invite' });
  },

  onGoTutorial() {
    wx.navigateTo({ url: '/pages/tutorial-play/tutorial-play' });
  },

  onCloseAllPanels() {
    this.setData({
      showMagicPanel: false,
      showGiftPanel: false,
      showTaskPanel: false,
      showSettingsPanel: false,
    }, () => this.updateTabBarVisibility());
  },

  // ─── AI魔法弹框操作 ───
  onGoCards() {
    this.onCloseAllPanels();
    this.navigateToVipTab('cards');
  },

  navigateToVipTab(tab = 'vip') {
    wx.navigateTo({ url: '/pages/vip/vip?tab=' + tab });
  },

  normalizeGifts(gifts) {
    const now = Date.now();
    return (gifts || []).map((gift) => {
      const expireTime = gift.expireAt ? new Date(gift.expireAt).getTime() : 0;
      const expired = gift.status === 2 || (expireTime && expireTime <= now);
      const used = gift.status === 1;
      const expiringSoon = !expired && !used && expireTime && expireTime - now <= 3 * 24 * 60 * 60 * 1000;
      const tabStatus = expired ? 'expired' : used ? 'used' : 'available';
      return {
        ...gift,
        subtitle: this.getGiftSourceLabel(gift),
        expireText: this.formatGiftExpire(gift.expireAt),
        isPackageGift: gift.giftCode === 'GIFT_PACKAGE',
        expiringSoon,
        tabStatus,
        statusText: expired ? '已过期' : used ? '已使用' : '可使用',
        statusClass: expired ? 'expired' : used ? 'used' : 'available',
        itemClass: expired ? 'gift-item--expired' : used ? 'gift-item--used' : '',
        canUse: tabStatus === 'available'
      };
    });
  },

  buildGiftTabs(gifts) {
    const count = (status) => gifts.filter((gift) => gift.tabStatus === status).length;
    return [
      { key: 'available', label: '可使用', count: count('available') },
      { key: 'used', label: '已使用', count: count('used') },
      { key: 'expired', label: '已过期', count: count('expired') }
    ];
  },

  filterGiftsByTab(gifts, tab) {
    return (gifts || []).filter((gift) => gift.tabStatus === tab);
  },

  onGiftTabChange(e) {
    const tab = e.currentTarget.dataset.tab || 'available';
    this.setData({
      giftTab: tab,
      visibleGifts: this.filterGiftsByTab(this.data.gifts, tab)
    });
  },

  // ─── 礼品包操作 ───
  formatGiftExpire(expireAt) {
    if (!expireAt) return '';
    const d = new Date(expireAt);
    if (Number.isNaN(d.getTime())) return expireAt;
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  },

  getGiftSourceLabel(gift) {
    const source = String(gift?.source || '').toUpperCase();
    if (source.startsWith('INVITE_REGISTER_GIFT:')) return '来自邀请好友注册奖励';
    if (source.startsWith('INVITE_RECHARGE_GIFT:')) return '来自邀请好友充值奖励';
    if (source.startsWith('REGISTER_GIFT:')) return '来自注册礼包';
    if (source.startsWith('FIRST_RECHARGE_GIFT:')) return '来自首冲礼包';
    if (source.startsWith('GIFT_PACKAGE:')) return '来自礼包发放';
    if (source === 'GIFT_PACKAGE') return '来自礼包兑换';
    if (source === 'TASK') return '来自任务奖励';
    if (source === 'PURCHASE') return '来自购买赠送';
    if (gift?.giftCategory === 'PACKAGE') return '来自礼包奖励';
    if (gift?.giftCategory === 'COUPON') return '优惠券';
    return gift?.giftCategory || '系统发放';
  },

  onUseGift(e) {
    const gift = e.currentTarget.dataset.gift;
    if (!gift) return;

    const giftCode = String(gift.giftCode || '').toUpperCase();
    const usageMode = String(gift.usageMode || '').toUpperCase();
    const targetTab = String(gift.targetTab || '').toLowerCase();

    // 优先使用后端明确返回的使用方式
    if (usageMode === 'JUMP_VIP' && (targetTab === 'vip' || targetTab === 'cards')) {
      wx.navigateTo({
        url: `/pages/vip/vip?tab=${targetTab}&couponId=${gift.id}`
      });
      return;
    }

    // 兜底：兼容老数据
    if (giftCode === 'VIP_COUPON' || giftCode === 'CARD_COUPON' || giftCode === 'VIP_CARD_COUPON') {
      const fallbackTab = giftCode === 'VIP_COUPON' ? 'vip' : 'cards';
      wx.navigateTo({
        url: `/pages/vip/vip?tab=${fallbackTab}&couponId=${gift.id}`
      });
      return;
    }

    // 其他礼品统一走后端使用逻辑
    const redeemNow = giftCode === 'GIFT_PACKAGE';
    request.post('/gift/use', { giftId: gift.id, redeemNow })
      .then(() => {
        wx.showToast({ title: redeemNow ? '兑换成功' : '使用成功', icon: 'success' });
        this.loadProfile();
      })
      .catch((err) => {
        wx.showToast({ title: err.message || (redeemNow ? '兑换失败' : '使用失败'), icon: 'none' });
      });
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
    this.setData({
      gifts,
      availableGiftCount: this.calcAvailableGiftCount(gifts),
      giftTabs: this.buildGiftTabs(gifts),
      visibleGifts: this.filterGiftsByTab(gifts, this.data.giftTab)
    });
  },

  // ─── 任务中心操作 ───

  // 加载签到状态
  loadCheckinStatus() {
    const sessionId = wx.getStorageSync('sessionId');
    if (!sessionId) return;

    request.get('/checkin/status')
      .then((data) => {
        if (data) {
          // 处理签到日历数据，转换为数组格式方便渲染
          const calendar = data.calendar || {};
          const calendarArray = [];
          const today = new Date();

          // 生成最近7天的日历
          for (let i = 6; i >= 0; i--) {
            const date = new Date(today);
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];
            calendarArray.push({
              date: dateStr,
              day: date.getDate(),
              checked: calendar[dateStr] || false
            });
          }

          this.setData({
            checkinStatus: {
              ...data,
              calendarArray: calendarArray
            }
          });
        }
      })
      .catch((err) => {
        console.error('加载签到状态失败', err);
      });
  },

  // 执行签到
  onCheckin() {
    request.post('/checkin/do')
      .then((result) => {
        if (result && result.success) {
          wx.showToast({
            title: result.message || '签到成功',
            icon: 'success'
          });
          // 刷新签到状态和用户信息
          this.loadCheckinStatus();
          this.loadProfile();
        }
      })
      .catch((err) => {
        wx.showToast({
          title: err.message || '签到失败',
          icon: 'none'
        });
      });
  },

  // 领取签到奖励
  onClaimCheckinReward() {
    request.post('/checkin/claim')
      .then((result) => {
        if (result && result.success) {
          wx.showToast({
            title: result.message || '领取成功',
            icon: 'success'
          });
          // 刷新签到状态和用户信息
          this.loadCheckinStatus();
          this.loadProfile();
        }
      })
      .catch((err) => {
        wx.showToast({
          title: err.message || '领取失败',
          icon: 'none'
        });
      });
  },

  onCheckIn() {
    this.onCheckin();
  },

  onDoTask(e) {
    const task = e.currentTarget.dataset.task;
    if (!task) return;

    if (task.handlerType === 'CHECKIN') {
      if (task.canClaim) {
        this.onClaimCheckinReward();
      } else {
        this.onCheckin();
      }
      return;
    }

    if (task.handlerType === 'FIRST_RECHARGE_GIFT' || task.handlerType === 'REGISTER_GIFT') {
      if (task.canClaim) {
        request.post('/task/claim-benefit', { taskCode: task.taskCode })
          .then(() => {
            wx.showToast({ title: '领取成功！', icon: 'success' });
            this.loadProfile();
            this.loadTasksFromServer();
          })
          .catch((err) => {
            wx.showToast({ title: err.message || '领取失败', icon: 'none' });
          });
      } else if (task.handlerType === 'FIRST_RECHARGE_GIFT') {
        wx.navigateTo({ url: '/pages/vip/vip' });
      } else {
        wx.showToast({ title: '注册成功后即可领取', icon: 'none' });
      }
      return;
    }

    if (task.handlerType === 'INVITE_REGISTER' || task.handlerType === 'INVITE_RECHARGE') {
      if (task.canClaim) {
        request.post('/task/claim-benefit', { taskCode: task.taskCode })
          .then(() => {
            wx.showToast({ title: '礼包已入包', icon: 'success' });
            this.loadProfile();
            this.loadTasksFromServer();
          })
          .catch((err) => {
            wx.showToast({ title: err.message || '领取失败', icon: 'none' });
          });
      } else {
        wx.navigateTo({ url: '/pages/invite/invite' })
      }
      return;
    }

    if (task.handlerType === 'REVIEW_TASK') {
      wx.navigateTo({
        url: `/pages/review-task-submit/review-task-submit?taskCode=${encodeURIComponent(task.taskCode)}&taskName=${encodeURIComponent(task.taskName || '')}`
      })
      return;
    }

    if (task.canClaim && task.progressId) {
      request.post('/task/claim', { progressId: task.progressId })
        .then(() => {
          wx.showToast({ title: '领取成功！', icon: 'success' });
          this.loadProfile();
          this.loadTasksFromServer();
        })
        .catch((err) => {
          wx.showToast({ title: err.message || '领取失败', icon: 'none' });
        });
      return;
    }

    if (task.taskCode === 'daily_share') {
      wx.showShareMenu({
        withShareTicket: true,
        success: () => {
          request.post('/task/complete', { taskCode: 'daily_share' })
            .then(() => {
              wx.showToast({ title: '分享成功！', icon: 'success' });
              this.loadProfile();
              this.loadTasksFromServer();
            })
            .catch(() => {});
        }
      });
      return;
    }

    if (task.taskCode === 'invite_friend') {
      wx.showToast({ title: '邀请功能开发中', icon: 'none' });
      return;
    }

    request.post('/task/complete', { taskCode: task.taskCode })
      .then(() => {
        wx.showToast({ title: '任务完成！', icon: 'success' });
        this.loadProfile();
        this.loadTasksFromServer();
      })
      .catch((err) => {
        wx.showToast({ title: err.message || '操作失败', icon: 'none' });
      });
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
    if (!this.data.isVip) {
      this.setData({ watermarkEnabled: true });
      this.onCloseAllPanels();
      this.navigateToVipTab('vip');
      return;
    }
    this.setData({ watermarkEnabled: enabled });
    wx.setStorageSync('watermarkEnabled', enabled);
  },

  onWatermarkTextChange(e) {
    if (!this.data.isVip) {
      this.onCloseAllPanels();
      this.navigateToVipTab('vip');
      return;
    }
    this.setData({ watermarkText: e.detail.value });
  },

  onCustomWatermarkTap() {
    if (!this.data.isVip) {
      this.onCloseAllPanels();
      this.navigateToVipTab('vip');
    }
  },

  async onConfirmSettings() {
    const { watermarkEnabled, watermarkText, isVip } = this.data;

    // 保存到本地存储（用于离线场景）
    wx.setStorageSync('watermarkEnabled', watermarkEnabled);
    wx.setStorageSync('watermarkText', watermarkText);

    // 如果是VIP，同步到服务器
    if (isVip) {
      try {
        wx.showLoading({ title: '保存中...', mask: true });

        await request.post('/watermark/user-config', {
          enabled: watermarkEnabled ? 1 : 0,
          customText: watermarkText
        });

        // 保存成功后，立即更新 app.globalData
        const app = getApp();
        if (app && app.globalData && app.globalData.watermarkConfig) {
          app.globalData.watermarkConfig.enabled = watermarkEnabled;
          app.globalData.watermarkConfig.text = watermarkText || app.globalData.appName;
          console.log('[profile] 已更新 globalData 水印配置');
        }

        wx.hideLoading();
        this.onCloseAllPanels();
        wx.showToast({ title: '设置已保存', icon: 'success' });
      } catch (e) {
        wx.hideLoading();
        console.error('[profile] 保存水印配置失败', e);
        wx.showToast({ title: '保存失败，请重试', icon: 'error' });
      }
    } else {
      this.onCloseAllPanels();
      wx.showToast({ title: '设置已保存', icon: 'success' });
    }
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
        this.setData({ feedbackText: '' });
      })
      .catch(() => {
        wx.showToast({ title: '发送失败，请重试', icon: 'none' });
      });
  },

  // ─── 其他导航 ───
  onEditProfile() {
    wx.navigateTo({ url: '/pages/edit-profile/edit-profile' });
  },

  onNotifications() {
    wx.navigateTo({ url: '/pages/notifications/notifications' });
  },

  onVip() {
    this.navigateToVipTab('vip');
  },

  onGoHistory() {
    wx.navigateTo({ url: '/pages/history/history' });
  },

  onGoDraft() {
    wx.navigateTo({ url: '/pages/draft/draft' });
  },

  onGoMyPatterns() {
    wx.navigateTo({ url: '/pages/my-patterns/my-patterns' });
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
            pendingTaskCount: 0,
          });
          wx.showToast({ title: '已退出登录', icon: 'success' });
        }
      }
    });
  },

});
