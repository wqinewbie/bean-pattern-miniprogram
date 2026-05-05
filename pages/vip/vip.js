const request = require('../../utils/request');
const { requireLogin } = require('../../utils/profile-guard');
const { getSafeAreaLayout } = require('../../utils/safe-area');

Page({
  data: {
    statusBarHeight: 44,
    vipTab: 'vip',
    
    // VIP状态
    isVip: false,
    
    // 会员卡套餐
    selectedVipId: 'month',
    vipPackages: [
      { id: 'month', name: '连续包月', price: '9.9', originalPrice: 15, tag: '首月特惠' },
      { id: 'quarter', name: '连续包季', price: '25.9', originalPrice: 45, tag: '' },
      { id: 'year', name: '年度特惠', price: '69.9', originalPrice: 118, tag: '最划算' },
    ],
    
    // 次卡套餐
    selectedCardId: 'c10',
    cardPackages: [
      { id: 'c3', name: '3次魔法包', count: 3, price: '1.5', originalPrice: 3, isVipPrice: '1.2', tag: '' },
      { id: 'c10', name: '10次魔法包', count: 10, price: '5.0', originalPrice: 10, isVipPrice: '4.0', tag: '热销' },
      { id: 'c30', name: '30次魔法包', count: 30, price: '12.0', originalPrice: 30, isVipPrice: '9.6', tag: '超值赠送' },
    ],
    
    // 订单列表
    orders: [],
    ordersLoading: false,
    
    // 权益对比
    privileges: [
      { name: '纯净免广告', normal: '有广告', vip: '纯净无广' },
      { name: 'AI生图次数', normal: '无', vip: '每日赠送' },
      { name: '购次卡优惠', normal: '原价', vip: '尊享8折' },
      { name: '免图纸水印', normal: '强制水印', vip: '纯净图纸' },
      { name: '自定义水印', normal: '不支持', vip: '专属定制' },
      { name: '图纸箱容量', normal: '30张', vip: '500张' },
      { name: '时光机时限', normal: '近7天', vip: '近30天' },
      { name: '回收站时限', normal: '7天', vip: '30天' },
      { name: '尊贵身份标识', normal: '无', vip: '专属标识' },
    ],
    
    // 支付状态
    isPaying: false,
  },

  onLoad(options) {
    this.calcSafeAreas();
    this.loadVipStatus();
    
    // 如果有传入 tab 参数
    if (options && options.tab) {
      this.setData({ vipTab: options.tab });
    }
  },

  calcSafeAreas() {
    try {
      const layout = getSafeAreaLayout();
      this.setData({ statusBarHeight: layout.statusBarHeight || 44 });
    } catch (e) {
      const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : {};
      const appBaseInfo = wx.getAppBaseInfo ? wx.getAppBaseInfo() : {};
      this.setData({ statusBarHeight: windowInfo.statusBarHeight || appBaseInfo.statusBarHeight || 44 });
    }
  },

  loadVipStatus() {
    const vipExpire = wx.getStorageSync('vipExpire') || '';
    const isVip = vipExpire && new Date(vipExpire) > new Date();
    this.setData({ isVip });
  },

  onSwitchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ vipTab: tab });
    
    if (tab === 'orders') {
      this.loadOrders();
    }
  },

  onSelectVipPlan(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({ selectedVipId: id });
  },

  onSelectCardPlan(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({ selectedCardId: id });
  },

  loadOrders() {
    this.setData({ ordersLoading: true });
    
    // 模拟订单数据（实际应该从后端获取）
    const mockOrders = [
      { id: '1', type: '次卡', detail: '10次魔法包', validity: '永久有效', time: '2024-01-01 10:00', amount: '5.00', status: '支付成功' },
      { id: '2', type: '赠送', detail: '活动赠送3次', validity: '永久有效', time: '2023-12-15 14:20', amount: '0.00', status: '赠送' },
      { id: '3', type: '会员卡', detail: '连续包月', validity: '2024.01.01-2024.02.01', time: '2024-01-01 09:00', amount: '9.90', status: '已退款' },
    ];
    
    setTimeout(() => {
      this.setData({ orders: mockOrders, ordersLoading: false });
    }, 500);
  },

  onPay() {
    if (!requireLogin({ mode: 'page' })) return;
    
    this.setData({ isPaying: true });
    
    // 模拟支付流程
    setTimeout(() => {
      this.setData({ isPaying: false });
      
      if (this.data.vipTab === 'cards') {
        // 购买次卡
        const card = this.data.cardPackages.find(c => c.id === this.data.selectedCardId);
        if (card) {
          // 增加魔法次数
          const magicCount = wx.getStorageSync('magicCount') || 0;
          wx.setStorageSync('magicCount', magicCount + card.count);
          wx.showToast({ title: `充值成功！魔法次数 +${card.count} ✨`, icon: 'success' });
        }
      } else {
        // 开通会员
        const expireDate = new Date();
        if (this.data.selectedVipId === 'month') {
          expireDate.setMonth(expireDate.getMonth() + 1);
        } else if (this.data.selectedVipId === 'quarter') {
          expireDate.setMonth(expireDate.getMonth() + 3);
        } else if (this.data.selectedVipId === 'year') {
          expireDate.setFullYear(expireDate.getFullYear() + 1);
        }
        wx.setStorageSync('vipExpire', expireDate.toISOString());
        this.setData({ isVip: true });
        wx.showToast({ title: '充值成功！已为您点亮至尊魔法标识 ✨', icon: 'success' });
      }
    }, 1500);
  },

  onBack() {
    wx.navigateBack();
  },
});
