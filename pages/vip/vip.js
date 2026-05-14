const request = require('../../utils/request');
const vipApi = require('../../utils/vip-api');
const { requireLogin } = require('../../utils/profile-guard');
const { getSafeAreaLayout } = require('../../utils/safe-area');

Page({
  data: {
    statusBarHeight: 44,
    vipTab: 'vip',

    // VIP状态
    isVip: false,
    vipExpireAt: null,
    aiQuota: 0,

    // 会员卡套餐（从后端获取）
    selectedVipId: null,
    vipPackages: [],
    vipPackagesLoading: false,

    // 次卡套餐（从后端获取）
    selectedCardId: null,
    cardPackages: [],
    cardPackagesLoading: false,

    // 订单列表
    orders: [],
    ordersLoading: false,
    ordersPage: 1,
    ordersHasMore: true,

    // 权益对比（从后端获取）
    privileges: [],
    privilegesLoading: false,

    // 支付状态
    isPaying: false,

    // 当前选中套餐价格
    currentPrice: 0,
  },

  onLoad(options) {
    this.calcSafeAreas();
    this.loadVipInfo();

    // 如果有传入 tab 参数
    if (options && options.tab) {
      this.setData({ vipTab: options.tab });
    }

    // 处理分享参数（好友点击分享链接）
    if (options.share_from && options.task) {
      this.handleShareVerify(options.share_from, options.task);
    }
  },

  onShow() {
    // 每次显示页面时刷新会员信息
    this.loadVipInfo();

    // 如果当前在订单tab，刷新订单列表
    if (this.data.vipTab === 'orders') {
      this.loadOrders(true);
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

  /**
   * 加载用户会员信息
   */
  loadVipInfo() {
    vipApi.getVipInfo()
      .then((data) => {
        const isVip = data.isVip || data.vipLevel > 0 || false;
        const vipExpireAt = data.vipExpireAt || null;
        const aiQuota = data.aiQuota || 0;

        this.setData({ isVip, vipExpireAt, aiQuota });

        // 更新本地缓存
        if (vipExpireAt) {
          wx.setStorageSync('vipExpire', vipExpireAt);
        }

        // 根据当前tab加载对应数据
        if (this.data.vipTab === 'vip') {
          this.loadVipPackages();
          this.loadPrivileges();
        } else if (this.data.vipTab === 'cards') {
          this.loadCardPackages();
        }
      })
      .catch((err) => {
        console.error('加载会员信息失败', err);
        wx.showToast({ title: '加载失败，请重试', icon: 'none' });
      });
  },

  /**
   * 加载会员套餐列表
   */
  loadVipPackages() {
    if (this.data.vipPackagesLoading) return;

    this.setData({ vipPackagesLoading: true });

    vipApi.getVipPackages()
      .then((data) => {
        const packages = data || [];

        // 转换数据格式以适配现有UI
        const vipPackages = packages.map(pkg => ({
          id: pkg.packageCode,
          code: pkg.packageCode,
          name: pkg.packageName,
          price: pkg.price,
          originalPrice: pkg.originalPrice,
          tag: pkg.tag || '',
          durationDays: pkg.durationDays,
          aiQuotaGift: pkg.aiQuotaGift,
        }));

        // 默认选中第一个
        const selectedVipId = vipPackages.length > 0 ? vipPackages[0].id : null;
        const currentPrice = vipPackages.length > 0 ? vipPackages[0].price : 0;

        this.setData({
          vipPackages,
          selectedVipId,
          currentPrice,
          vipPackagesLoading: false
        });
      })
      .catch((err) => {
        console.error('加载会员套餐失败', err);
        this.setData({ vipPackagesLoading: false });
        wx.showToast({ title: '加载套餐失败', icon: 'none' });
      });
  },

  /**
   * 加载次卡套餐列表
   */
  loadCardPackages() {
    if (this.data.cardPackagesLoading) return;

    this.setData({ cardPackagesLoading: true });

    vipApi.getCardPackages()
      .then((data) => {
        const packages = data || [];

        // 转换数据格式以适配现有UI
        const cardPackages = packages.map(pkg => ({
          id: pkg.packageCode,
          code: pkg.packageCode,
          name: pkg.packageName,
          count: pkg.aiQuota,
          price: pkg.price,
          originalPrice: pkg.originalPrice,
          isVipPrice: pkg.vipPrice,
          tag: pkg.tag || '',
        }));

        // 默认选中第一个
        const selectedCardId = cardPackages.length > 0 ? cardPackages[0].id : null;
        const currentPrice = cardPackages.length > 0 ? (this.data.isVip ? cardPackages[0].isVipPrice : cardPackages[0].price) : 0;

        this.setData({
          cardPackages,
          selectedCardId,
          currentPrice,
          cardPackagesLoading: false
        });
      })
      .catch((err) => {
        console.error('加载次卡套餐失败', err);
        this.setData({ cardPackagesLoading: false });
        wx.showToast({ title: '加载套餐失败', icon: 'none' });
      });
  },

  /**
   * 加载权益对比表
   */
  loadPrivileges() {
    if (this.data.privilegesLoading) return;

    this.setData({ privilegesLoading: true });

    vipApi.getPrivileges()
      .then((data) => {
        const privileges = data || [];

        // 转换数据格式以适配现有UI
        const formattedPrivileges = privileges.map(priv => ({
          name: priv.configName,
          normal: priv.freeValue,
          vip: priv.vipValue,
        }));

        this.setData({
          privileges: formattedPrivileges,
          privilegesLoading: false
        });
      })
      .catch((err) => {
        console.error('加载权益对比失败', err);
        this.setData({ privilegesLoading: false });
      });
  },

  /**
   * 加载订单列表
   */
  loadOrders(refresh = false) {
    if (this.data.ordersLoading) return;

    // 如果是刷新，重置页码
    if (refresh) {
      this.setData({ ordersPage: 1, orders: [], ordersHasMore: true });
    }

    // 如果没有更多数据，不再加载
    if (!refresh && !this.data.ordersHasMore) {
      return;
    }

    this.setData({ ordersLoading: true });

    vipApi.getOrderList({
      page: this.data.ordersPage,
      pageSize: 20
    })
      .then((data) => {
        const newOrders = Array.isArray(data) ? data : (data.list || []);
        const hasMore = Array.isArray(data) ? newOrders.length >= 20 : !!data.hasMore;

        // 转换数据格式
        const formattedOrders = newOrders.map(order => ({
          id: order.id,
          orderNo: order.orderNo,
          type: this.getOrderTypeText(order.productType),
          detail: order.productName || order.planName || order.packageCode,
          validity: this.getOrderValidity(order),
          time: order.createdAt,
          amount: order.amount,
          status: this.getOrderStatusText(order.status),
          statusCode: order.status,
        }));

        this.setData({
          orders: refresh ? formattedOrders : [...this.data.orders, ...formattedOrders],
          ordersPage: this.data.ordersPage + 1,
          ordersHasMore: hasMore,
          ordersLoading: false
        });
      })
      .catch((err) => {
        console.error('加载订单列表失败', err);
        this.setData({ ordersLoading: false });
        wx.showToast({ title: '加载订单失败', icon: 'none' });
      });
  },

  /**
   * 获取订单类型文本
   */
  getOrderTypeText(productType) {
    const typeMap = {
      'vip': '会员卡',
      'card': '次卡',
      'gift': '赠送',
    };
    return typeMap[productType] || '其他';
  },

  /**
   * 获取订单有效期文本
   */
  getOrderValidity(order) {
    if (order.productType === 'card' || order.productType === 'gift') {
      return '永久有效';
    }
    if (order.validityStart && order.validityEnd) {
      return `${order.validityStart} - ${order.validityEnd}`;
    }
    return '-';
  },

  /**
   * 获取订单状态文本
   */
  getOrderStatusText(status) {
    const statusMap = {
      'PENDING': '待支付',
      'PAID': '支付成功',
      'TIMEOUT': '已超时',
      'CANCELLED': '已取消',
      'REFUNDED': '已退款',
    };
    return statusMap[status] || '未知';
  },

  /**
   * 切换Tab
   */
  onSwitchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ vipTab: tab });

    if (tab === 'vip') {
      this.loadVipPackages();
      this.loadPrivileges();
    } else if (tab === 'cards') {
      this.loadCardPackages();
    } else if (tab === 'orders') {
      this.loadOrders(true);
    }
  },

  /**
   * 选择会员套餐
   */
  onSelectVipPlan(e) {
    const id = e.currentTarget.dataset.id;
    const selectedPackage = this.data.vipPackages.find(p => p.id === id);
    const currentPrice = selectedPackage ? selectedPackage.price : 0;
    this.setData({ selectedVipId: id, currentPrice });
  },

  /**
   * 选择次卡套餐
   */
  onSelectCardPlan(e) {
    const id = e.currentTarget.dataset.id;
    const selectedPackage = this.data.cardPackages.find(p => p.id === id);
    const currentPrice = selectedPackage ? (this.data.isVip ? selectedPackage.isVipPrice : selectedPackage.price) : 0;
    this.setData({ selectedCardId: id, currentPrice });
  },

  /**
   * 支付按钮点击
   */
  onPay() {
    if (!requireLogin({ mode: 'page' })) return;

    if (this.data.isPaying) return;

    if (this.data.vipTab === 'vip') {
      this.purchaseVip();
    } else if (this.data.vipTab === 'cards') {
      this.purchaseCard();
    }
  },

  /**
   * 购买会员
   */
  purchaseVip() {
    const selectedPackage = this.data.vipPackages.find(p => p.id === this.data.selectedVipId);
    if (!selectedPackage) {
      wx.showToast({ title: '请选择套餐', icon: 'none' });
      return;
    }

    this.setData({ isPaying: true });

    vipApi.purchaseVip(selectedPackage.code)
      .then((data) => {
        const orderNo = data && data.orderNo;
        const payment = data && data.payment;
        const payParams = (payment && payment.payParams) || data.payParams;
        const status = (payment && payment.status) || data.status;
        if (!orderNo) {
          throw new Error('创建订单失败');
        }
        if (data.mock && status === 'PAID') {
          this.setData({ isPaying: false });
          wx.showToast({ title: '模拟支付成功', icon: 'success' });
          setTimeout(() => this.loadVipInfo(), 500);
          return;
        }
        if (!payParams) {
          this.setData({ isPaying: false });
          wx.showModal({
            title: '订单已创建',
            content: '当前后端尚未返回微信支付参数，请稍后在订单列表中完成支付。',
            showCancel: false,
            success: () => this.loadOrders(true)
          });
          return;
        }
        this.callWechatPay(orderNo, payParams);
      })
      .catch((err) => {
        this.setData({ isPaying: false });
        wx.showToast({ title: err.message || '创建订单失败', icon: 'none' });
      });
  },

  /**
   * 购买次卡
   */
  purchaseCard() {
    const selectedPackage = this.data.cardPackages.find(p => p.id === this.data.selectedCardId);
    if (!selectedPackage) {
      wx.showToast({ title: '请选择套餐', icon: 'none' });
      return;
    }

    this.setData({ isPaying: true });

    vipApi.purchaseCard(selectedPackage.code)
      .then((data) => {
        const orderNo = data && data.orderNo;
        const payment = data && data.payment;
        const payParams = (payment && payment.payParams) || data.payParams;
        const status = (payment && payment.status) || data.status;
        if (!orderNo) {
          throw new Error('创建订单失败');
        }
        if (data.mock && status === 'PAID') {
          this.setData({ isPaying: false });
          wx.showToast({ title: '模拟支付成功', icon: 'success' });
          setTimeout(() => this.loadVipInfo(), 500);
          return;
        }
        if (!payParams) {
          this.setData({ isPaying: false });
          wx.showModal({
            title: '订单已创建',
            content: '当前后端尚未返回微信支付参数，请稍后在订单列表中完成支付。',
            showCancel: false,
            success: () => this.loadOrders(true)
          });
          return;
        }
        this.callWechatPay(orderNo, payParams);
      })
      .catch((err) => {
        this.setData({ isPaying: false });
        wx.showToast({ title: err.message || '创建订单失败', icon: 'none' });
      });
  },

  /**
   * 调用微信支付
   */
  callWechatPay(orderNo, payParams) {
    wx.requestPayment({
      timeStamp: payParams.timeStamp,
      nonceStr: payParams.nonceStr,
      package: payParams.package,
      signType: payParams.signType || 'RSA',
      paySign: payParams.paySign,
      success: () => {
        // 支付成功，查询订单状态
        this.queryPaymentResult(orderNo);
      },
      fail: (err) => {
        this.setData({ isPaying: false });

        if (err.errMsg === 'requestPayment:fail cancel') {
          wx.showToast({ title: '支付已取消', icon: 'none' });
        } else {
          wx.showToast({ title: '支付失败', icon: 'none' });
        }
      }
    });
  },

  /**
   * 查询支付结果
   */
  queryPaymentResult(orderNo, retryCount = 0) {
    const maxRetry = 5;
    const retryDelay = 1000;

    vipApi.queryOrderStatus(orderNo)
      .then((data) => {
        if (data.status === 'PAID') {
          // 支付成功
          this.setData({ isPaying: false });

          wx.showToast({
            title: '支付成功！',
            icon: 'success',
            duration: 2000
          });

          // 刷新会员信息
          setTimeout(() => {
            this.loadVipInfo();
          }, 500);

        } else if (data.status === 'PENDING' && retryCount < maxRetry) {
          // 还在处理中，继续轮询
          setTimeout(() => {
            this.queryPaymentResult(orderNo, retryCount + 1);
          }, retryDelay);

        } else {
          // 支付失败或超时
          this.setData({ isPaying: false });
          wx.showToast({ title: '支付处理中，请稍后查看订单', icon: 'none' });
        }
      })
      .catch((err) => {
        this.setData({ isPaying: false });
        wx.showToast({ title: '查询支付结果失败', icon: 'none' });
      });
  },

  /**
   * 处理分享验证（好友点击分享链接）
   */
  handleShareVerify(shareFrom, taskCode) {
    vipApi.verifyShare(shareFrom, taskCode)
      .then((data) => {
        if (data.success) {
          wx.showToast({
            title: '已帮助好友完成任务！',
            icon: 'success'
          });
        }
      })
      .catch((err) => {
        console.log('分享验证失败', err);
      });
  },

  /**
   * 分享小程序
   */
  onShareAppMessage() {
    const app = getApp();
    const userInfo = app.globalData.prefetch.profile || {};
    const userId = userInfo.id || '';

    return {
      title: '拼豆魔法屋 - 免费AI生成拼豆图纸',
      path: `/pages/index/index?share_from=${userId}&task=daily_share`,
      imageUrl: '/images/share.jpg'
    };
  },

  /**
   * 订单列表滚动到底部
   */
  onOrdersScrollToLower() {
    if (this.data.vipTab === 'orders') {
      this.loadOrders(false);
    }
  },

  /**
   * 返回
   */
  onBack() {
    wx.navigateBack();
  },
});
