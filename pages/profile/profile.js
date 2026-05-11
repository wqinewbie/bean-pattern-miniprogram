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
    
    // 子页
    subPage: '',
    subPageLoading: false,
    subPagePatterns: [],
    subPagePatternAll: [],
    patternSearchKeyword: '',

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
      tabBar.setHidden(!!(this.data.showMagicPanel || this.data.showGiftPanel || this.data.showTaskPanel || this.data.showSettingsPanel || this.data.subPage));
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
    const tasks = wx.getStorageSync('tasks') || this.getDefaultTasks();
    const gifts = wx.getStorageSync('gifts') || this.getDefaultGifts();
    const watermarkText = wx.getStorageSync('watermarkText') || '';
    const draftCount = this.getDraftCount();
    
    const pendingTaskCount = this.calcPendingTaskCount(checkedIn, tasks);
    
    this.setData({
      checkedIn,
      magicCount,
      tasks,
      gifts,
      watermarkText,
      pendingTaskCount,
      draftCount,
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

  calcPendingTaskCountFromServer(taskProgress) {
    // 从服务器返回的任务进度计算待完成任务数
    // taskProgress 是 UserTaskProgress 数组，包含 currentCount, targetCount, claimed 等字段
    let count = 0;
    if (Array.isArray(taskProgress)) {
      taskProgress.forEach(progress => {
        // 如果任务未完成或已完成但未领取奖励，计入待完成数
        const isCompleted = progress.currentCount >= progress.targetCount;
        const isClaimed = progress.claimed;
        if (!isCompleted || (isCompleted && !isClaimed)) {
          count++;
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
    if (!sessionId) return;

    Promise.all([
      request.get('/task/list'),
      request.get('/task/progress')
    ])
      .then(([taskListData, taskProgress]) => {
        const taskConfigs = (taskListData && taskListData.tasks) || [];
        const progressMap = {};

        // 构建进度映射
        if (Array.isArray(taskProgress)) {
          taskProgress.forEach(p => {
            progressMap[p.taskCode] = p;
          });
        }

        // 合并任务配置和进度
        const tasks = taskConfigs.map(config => {
          const progress = progressMap[config.taskCode] || {};
          const isCompleted = progress.currentCount >= config.targetCount;
          const isClaimed = progress.claimed;

          return {
            id: config.taskCode,
            taskCode: config.taskCode,
            name: config.taskName,
            reward: config.rewardDesc || `奖励 ${config.rewardValue} 次 AI魔法`,
            count: config.rewardValue,
            done: isCompleted && isClaimed,
            canClaim: isCompleted && !isClaimed,
            actionText: isCompleted ? (isClaimed ? '已完成' : '领取奖励') : '去完成',
            currentCount: progress.currentCount || 0,
            targetCount: config.targetCount || 1,
            progressId: progress.id
          };
        });

        // 计算待完成任务数（未完成或已完成但未领取）
        const pendingTaskCount = tasks.filter(t => !t.done).length;

        this.setData({
          tasks,
          pendingTaskCount,
          checkedIn: false // 打卡状态由任务系统管理
        });
      })
      .catch(() => {
        // 加载失败时使用本地数据
        console.log('加载任务失败，使用本地数据');
      });
  },

  getDefaultGifts() {
    return [];
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
        answer: '魔法值用于生成AI图纸和使用高级功能。您可以通过每日签到、完成任务或充值会员获得魔法值。',
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
      request.get('/gift/available'),
      request.get('/task/progress')
    ])
      .then(([profile, stats, gifts, taskProgress]) => {
        if (profile && profile.nickName) {
          wx.setStorageSync('nickName', profile.nickName);
          wx.setStorageSync('avatarUrl', profile.avatarUrl || '');
          wx.setStorageSync('phone', profile.phone || '');
        }

        // 计算待完成任务数
        const pendingTaskCount = this.calcPendingTaskCountFromServer(taskProgress || []);

        this.setData({
          userInfo: {
            nickName: (profile && profile.nickName) || nickName || DEFAULT_NICKNAME,
            avatarUrl: (profile && profile.avatarUrl) || avatarUrl || ''
          },
          stats: stats || EMPTY_STATS,
          phone: (profile && profile.phone) || phone || '',
          isVip: (profile && profile.vipExpireAt && new Date(profile.vipExpireAt) > new Date()) || isVip,
          magicCount: (profile && profile.aiQuota) || 0,
          gifts: Array.isArray(gifts) ? gifts : [],
          pendingTaskCount: pendingTaskCount,
          loading: false
        });
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
    this.setData({ showGiftPanel: true }, () => this.updateTabBarVisibility());
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
    this.setData({ subPage: 'feedback', feedbackText: '' }, () => this.updateTabBarVisibility());
  },

  onShowPrivacy() {
    this.setData({ subPage: 'privacy' }, () => this.updateTabBarVisibility());
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

  // ─── 礼品包操作 ───
  onUseGift(e) {
    const gift = e.currentTarget.dataset.gift;
    if (!gift) return;

    // 调用后端接口使用礼品
    request.post('/gift/use', { giftId: gift.id })
      .then(() => {
        wx.showToast({ title: '使用成功', icon: 'success' });
        // 重新加载礼品列表和用户信息
        this.loadProfile();
      })
      .catch((err) => {
        wx.showToast({ title: err.message || '使用失败', icon: 'none' });
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
    this.setData({ gifts });
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
    // 调用后端接口完成打卡任务
    request.post('/task/complete', { taskCode: 'daily_checkin' })
      .then(() => {
        wx.showToast({ title: '打卡成功！', icon: 'success' });
        // 重新加载任务进度和用户信息
        this.loadProfile();
        this.loadTasksFromServer();
      })
      .catch((err) => {
        wx.showToast({ title: err.message || '打卡失败', icon: 'none' });
      });
  },

  onDoTask(e) {
    const task = e.currentTarget.dataset.task;
    if (!task) return;

    // 如果任务已完成但未领取，调用领取奖励接口
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

    // 根据任务类型执行不同操作
    if (task.taskCode === 'daily_share') {
      // 触发分享
      wx.showShareMenu({
        withShareTicket: true,
        success: () => {
          // 分享成功后调用完成接口
          request.post('/task/complete', { taskCode: 'daily_share' })
            .then(() => {
              wx.showToast({ title: '分享成功！', icon: 'success' });
              this.loadProfile();
              this.loadTasksFromServer();
            })
            .catch(() => {});
        }
      });
    } else if (task.taskCode === 'invite_friend') {
      // 邀请好友逻辑
      wx.showToast({ title: '邀请功能开发中', icon: 'none' });
    } else {
      // 其他任务
      request.post('/task/complete', { taskCode: task.taskCode })
        .then(() => {
          wx.showToast({ title: '任务完成！', icon: 'success' });
          this.loadProfile();
          this.loadTasksFromServer();
        })
        .catch((err) => {
          wx.showToast({ title: err.message || '操作失败', icon: 'none' });
        });
    }
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
    if (!this.data.isVip && !enabled) {
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
        this.setData({ feedbackText: '', subPage: '' });
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
    this.markNotificationsRead();
    this.setData({ subPage: 'notifications' }, () => this.updateTabBarVisibility());
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

  onAddPattern() {
    const maxCapacity = this.data.isVip ? 100 : 10;
    const current = (this.data.subPagePatternAll || []).length;
    if (current >= maxCapacity) {
      wx.showModal({
        title: '图纸箱容量已满',
        content: this.data.isVip ? '您的图纸箱已达到100张上限，请先清理一些不用的图纸。' : '普通学徒最多保存10张图纸，清理或者升级会员即可获取更多容量。',
        confirmText: this.data.isVip ? '我知道了' : '去升级',
        cancelText: '取消',
        success: (res) => {
          if (res.confirm && !this.data.isVip) {
            this.onVip();
          }
        }
      });
      return;
    }
    wx.showToast({ title: '请前往画板或通过AI生成新图纸', icon: 'none' });
  },

  onPatternSearchInput(e) {
    const keyword = (e.detail.value || '').trim();
    this.setData({ patternSearchKeyword: keyword }, () => this.filterPatterns());
  },

  filterPatterns() {
    const keyword = (this.data.patternSearchKeyword || '').trim().toLowerCase();
    const all = this.data.subPagePatternAll || [];
    if (!keyword) {
      this.setData({ subPagePatterns: all });
      return;
    }
    const filtered = all.filter((item) => {
      const name = String(item.name || '').toLowerCase();
      const brand = String(item.brand || '').toLowerCase();
      return name.includes(keyword) || brand.includes(keyword);
    });
    this.setData({ subPagePatterns: filtered });
  },

  onGoMyPatterns() {
    wx.navigateTo({ url: '/pages/my-patterns/my-patterns' });
  },

  onCloseSubPage() {
    this.setData({ subPage: '' }, () => this.updateTabBarVisibility());
  },

  // ─── 加载子页数据 ───
  loadPatterns() {
    const sessionId = wx.getStorageSync('sessionId');
    if (!sessionId) {
      this.setData({ subPagePatterns: [], subPagePatternAll: [], subPageLoading: false });
      return;
    }
    request.get('/box/list')
      .then(data => {
        // 与 my-patterns.js 保持一致的数据处理
        const patterns = (Array.isArray(data) ? data : []).map(item => ({
          id: item.id,
          name: item.name || ('图纸#' + item.id),
          gridSize: item.gridSize,
          colorCount: item.colorCount,
          brand: item.brand,
          gridData: item.gridData,
          colorPalette: item.colorPalette,
          sourceUrl: item.sourceUrl,
          sourceType: item.sourceType || item.source || item.type || '',
          sourceLabel: this.getPatternSourceLabel(item),
          sourceClass: this.getPatternSourceClass(item),
          boxId: item.id,
          createdAt: this.formatTime(item.createdAt),
        }));
        this.setData({ subPagePatternAll: patterns, subPagePatterns: patterns, subPageLoading: false });
      })
      .catch(() => {
        this.setData({ subPagePatterns: [], subPagePatternAll: [], subPageLoading: false });
      });
  },

  formatTime(timeStr) {
    if (!timeStr) return '';
    const d = new Date(timeStr);
    if (isNaN(d.getTime())) return timeStr;
    const pad = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()) +
           ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  },

  getPatternSourceType(item) {
    return String(item.sourceType || item.source || item.type || '').toLowerCase();
  },

  getPatternSourceLabel(item) {
    const sourceType = this.getPatternSourceType(item);
    if (sourceType.includes('ai')) return 'AI生成';
    if (sourceType.includes('draft')) return '草稿箱';
    if (sourceType.includes('free') || sourceType.includes('convert') || sourceType.includes('image')) return '图片转换';
    return '';
  },

  getPatternSourceClass(item) {
    const sourceType = this.getPatternSourceType(item);
    if (sourceType.includes('ai')) return 'ai';
    if (sourceType.includes('draft')) return 'draft';
    if (sourceType.includes('free') || sourceType.includes('convert') || sourceType.includes('image')) return 'free';
    return '';
  },

  onSubClearHistory() {
    wx.showToast({ title: '已下线清空入口', icon: 'none' });
  },

  onSubItemTap(e) {
    const item = e.currentTarget.dataset.item;
    if (!item) return;
    if (this.data.subPage === 'history') {
      wx.navigateTo({
        url: '/pages/result/result?historyId=' + item.id + '&sourceType=HISTORY'
      });
    } else {
      wx.navigateTo({
        url: '/pages/result/result?boxId=' + item.id + '&sourceType=BOX'
      });
    }
  },

  onSubDelete(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    request.delete('/box/delete/' + id)
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
    request.post('/box/restore/' + id)
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

  onContactService() {
    wx.showToast({ title: '客服功能开发中', icon: 'none' });
  },
});
