const request = require('../../utils/request');

Page({
  data: {
    statusBarHeight: 20,
    selectedPlan: null,
    plans: [],
    plansLoading: true,
    benefits: [
      { icon: '✨', title: '无限AI生成', desc: '不限次数，随心创作' },
      { icon: '🖼', title: '高清无损导出', desc: '4K分辨率图纸下载' },
      { icon: '🚫', title: '无广告体验', desc: '纯净创作环境' },
      { icon: '🎨', title: '专属魔法风格', desc: '解锁高级生成风格' },
      { icon: '⚡', title: '极速优先处理', desc: 'AI生成插队加速' },
      { icon: '💾', title: '云端图纸同步', desc: '多设备数据互通' },
    ],
  },

  onLoad() {
    wx.getSystemInfo({
      success: (res) => {
        this.setData({ statusBarHeight: res.statusBarHeight || 20 });
      }
    });
    this.loadPlans();
  },

  loadPlans() {
    this.setData({ plansLoading: true });
    request.get('/api/recharge/plans')
      .then((data) => {
        const plans = Array.isArray(data) ? data : [];
        this.setData({
          plans,
          selectedPlan: plans.length > 0 ? plans[0].id : null,
          plansLoading: false,
        });
      })
      .catch(() => {
        this.setData({ plansLoading: false });
        wx.showToast({ title: '加载套餐失败', icon: 'none' });
      });
  },

  onSelectPlan(e) {
    this.setData({ selectedPlan: e.currentTarget.dataset.id });
  },

  onPay() {
    const plan = this.data.plans.find(p => p.id === this.data.selectedPlan);
    if (!plan) return;
    const sessionId = wx.getStorageSync('sessionId');
    if (!sessionId) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }
    wx.showToast({ title: `即将开通${plan.name}`, icon: 'none' });
    // TODO: 调用后端创建订单接口，再调起微信支付
    // request.post('/api/order/create', { planId: plan.id })
    //   .then(orderData => wx.requestPayment({ ...orderData }))
  },

  onBack() {
    wx.navigateBack();
  },
});
