const request = require('../../utils/request');

Page({
  data: {
    activityCode: '',
    activity: null,
    loading: true,
    error: false,
    errorMessage: '',

    // 活动信息
    title: '',
    coverImage: '',
    contentHtml: '',
    buttonText: '立即参与',
    buttonAction: 'CLAIM',
    buttonUrl: '',

    // 状态
    canParticipate: true,
    participated: false,
    remainQuota: 0,
    totalQuota: 0,

    // 安全区域
    statusBarHeight: 44
  },

  onLoad(options) {
    const { code } = options;
    if (!code) {
      this.setData({
        loading: false,
        error: true,
        errorMessage: '活动不存在'
      });
      return;
    }

    this.setData({ activityCode: code });
    this.loadActivity();
    this.calcSafeArea();
  },

  calcSafeArea() {
    const systemInfo = wx.getSystemInfoSync();
    this.setData({
      statusBarHeight: systemInfo.statusBarHeight || 44
    });
  },

  // 加载活动详情
  async loadActivity() {
    this.setData({ loading: true });

    try {
      const data = await request.get(`/activity/${this.data.activityCode}`);

      if (!data) {
        throw new Error('活动不存在');
      }

      // 检查活动是否有效
      const now = new Date().getTime();
      const startTime = new Date(data.startAt).getTime();
      const endTime = new Date(data.endAt).getTime();

      let canParticipate = true;
      let errorMessage = '';

      if (now < startTime) {
        canParticipate = false;
        errorMessage = '活动未开始';
      } else if (now > endTime) {
        canParticipate = false;
        errorMessage = '活动已结束';
      } else if (data.totalQuota > 0 && data.remainQuota <= 0) {
        canParticipate = false;
        errorMessage = '名额已抢完';
      }

      this.setData({
        activity: data,
        title: data.title,
        coverImage: data.coverImage,
        contentHtml: data.contentHtml || '',
        buttonText: data.buttonText || '立即参与',
        buttonAction: data.buttonAction || 'CLAIM',
        buttonUrl: data.buttonUrl || '',
        remainQuota: data.remainQuota,
        totalQuota: data.totalQuota,
        participated: data.participated || false,
        canParticipate: canParticipate,
        errorMessage: errorMessage,
        loading: false
      });

      // 记录浏览
      this.recordView();
    } catch (err) {
      console.error('加载活动失败', err);
      this.setData({
        loading: false,
        error: true,
        errorMessage: err.message || '加载失败'
      });
    }
  },

  // 记录浏览
  async recordView() {
    try {
      await request.post('/activity/view', {
        activityCode: this.data.activityCode
      });
    } catch (err) {
      console.error('记录浏览失败', err);
    }
  },

  // 点击操作按钮
  onActionButton() {
    const { buttonAction, buttonUrl, participated, canParticipate } = this.data;

    if (!canParticipate) {
      wx.showToast({
        title: this.data.errorMessage || '无法参与',
        icon: 'none'
      });
      return;
    }

    if (participated) {
      wx.showToast({
        title: '您已参与过该活动',
        icon: 'none'
      });
      return;
    }

    switch (buttonAction) {
      case 'CLAIM':
        this.claimGift();
        break;
      case 'NAVIGATE':
        if (buttonUrl) {
          wx.navigateTo({ url: buttonUrl });
        }
        break;
      case 'EXTERNAL':
        if (buttonUrl) {
          wx.navigateTo({
            url: `/pages/webview/webview?url=${encodeURIComponent(buttonUrl)}`
          });
        }
        break;
      default:
        wx.showToast({
          title: '未知操作',
          icon: 'none'
        });
    }
  },

  // 领取礼品
  async claimGift() {
    wx.showLoading({ title: '领取中...', mask: true });

    try {
      const result = await request.post('/activity/claim', {
        activityCode: this.data.activityCode
      });

      wx.hideLoading();

      if (result && result.success) {
        wx.showModal({
          title: '领取成功',
          content: result.message || '恭喜您成功领取礼品！',
          showCancel: false,
          success: () => {
            // 刷新活动信息
            this.loadActivity();
          }
        });
      }
    } catch (err) {
      wx.hideLoading();
      wx.showToast({
        title: err.message || '领取失败',
        icon: 'none'
      });
    }
  },

  // 返回
  onBack() {
    wx.navigateBack();
  },

  // 分享
  onShareAppMessage() {
    return {
      title: this.data.title,
      path: `/pages/activity/activity?code=${this.data.activityCode}`,
      imageUrl: this.data.coverImage
    };
  }
});
