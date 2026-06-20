const request = require('../../utils/request');
const vipApi = require('../../utils/vip-api');
const { requireLogin, refreshWechatSession } = require('../../utils/profile-guard');
const storage = require('../../utils/storage');
const { getSafeAreaLayout } = require('../../utils/safe-area');
const analytics = require('../../utils/analytics');

Page({
  data: {
    statusBarHeight: 44,
    vipTab: 'vip',

    // VIP状?    isVip: false,
    vipExpireAt: null,
    aiQuota: 0,

    // 会员卡套餐（从后端获取）
    selectedVipId: null,
    vipPackages: [],
    vipPackagesLoading: false,

    // 次卡套餐（从后端获取?    selectedCardId: null,
    cardPackages: [],
    cardPackagesLoading: false,

    // 优惠?    selectedCouponId: null,
    selectedCouponId: null,
    availableCoupons: [],
    couponsLoading: false,
    selectedCouponIndex: 0,
    couponRange: ['不使用优惠券'],
    couponOptionsSelect: [{ text: '不使用优惠券', value: 0 }],
    selectedCouponDescription: '不使用优惠券',

    // 订单列表
    orders: [],
    ordersLoading: false,
    ordersPage: 1,
    ordersHasMore: true,

    // 权益对比（从后端获取?    privileges: [],
    privilegesLoading: false,

    // 支付状?    isPaying: false,

    // 当前选中套餐价格
    currentPrice: 0,
    originalPrice: 0,
    discountedPrice: 0,
    selectedCardHasVipPrice: false,
  },

  noop() {},

  onLoad(options) {
    this.calcSafeAreas();
    this.loadVipInfo();

    // 如果有传?tab 参数
    if (options && options.tab) {
      this.setData({ vipTab: options.tab });
    }

    // 如果有传?couponId 参数（从礼品包跳转）
    if (options && options.couponId) {
      this.setData({ selectedCouponId: parseInt(options.couponId) });
    }

  },

  onShow() {
    analytics.track('recharge_center_view', {
      source: 'vip_page',
      is_vip: this.data.isVip
    });
    this.loadVipInfo();

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
        const isVip = data.isVip || data.vip || data.vipLevel > 0 || false;
        const vipExpireAt = data.vipExpireAt || null;
        const aiQuota = data.aiQuota || 0;

        this.setData({ isVip, vipExpireAt, aiQuota });

        // 更新本地缓存
        if (vipExpireAt) {
          storage.set(storage.KEYS.VIP_EXPIRE, vipExpireAt);
        }

        // 根据当前tab加载对应数据
        if (this.data.vipTab === 'vip') {
          this.loadVipPackages();
          this.loadPrivileges();
          this.loadAvailableCoupons('VIP');
        } else if (this.data.vipTab === 'cards') {
          this.loadCardPackages();
          this.loadAvailableCoupons('CARD');
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
        const vipPackages = packages.map(pkg => {
          const remainingPurchaseCount = pkg.remainingPurchaseCount ?? pkg.remainingBuyCount ?? pkg.purchaseRemaining ?? null;
          return {
            id: pkg.packageCode,
            code: pkg.packageCode,
            name: pkg.packageName,
            price: pkg.price,
            originalPrice: pkg.originalPrice,
            tag: pkg.tag || '',
            durationDays: pkg.durationDays,
            aiQuotaGift: pkg.aiQuotaGift,
            remainingPurchaseCount,
            soldOut: remainingPurchaseCount !== null && remainingPurchaseCount <= 0,
          };
        });

        // 默认选中第一个可购买套餐
        const defaultVip = vipPackages.find(p => !p.soldOut) || null;
        const selectedVipId = defaultVip ? defaultVip.id : null;
        const currentPrice = defaultVip ? defaultVip.price : 0;

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
        const cardPackages = packages.map(pkg => {
          const remainingPurchaseCount = pkg.remainingPurchaseCount ?? pkg.remainingBuyCount ?? pkg.purchaseRemaining ?? null;
          return {
            id: pkg.packageCode,
            code: pkg.packageCode,
            name: pkg.packageName,
            count: pkg.aiQuota,
            price: pkg.price,
            originalPrice: pkg.originalPrice,
            isVipPrice: pkg.vipPrice,
            tag: pkg.tag || '',
            remainingPurchaseCount,
            soldOut: remainingPurchaseCount !== null && remainingPurchaseCount <= 0,
          };
        });

        // 默认选中第一个可购买套餐
        const defaultCard = cardPackages.find(p => !p.soldOut) || null;
        const selectedCardId = defaultCard ? defaultCard.id : null;
        const currentPrice = defaultCard ? (this.data.isVip && defaultCard.isVipPrice ? defaultCard.isVipPrice : defaultCard.price) : 0;

        const selectedCardHasVipPrice = this.data.isVip && !!(defaultCard && defaultCard.isVipPrice);

        this.setData({
          cardPackages,
          selectedCardId,
          currentPrice,
          selectedCardHasVipPrice,
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
   * 加载可用优惠?   */
  loadAvailableCoupons(category) {
    if (this.data.couponsLoading) return;

    this.setData({ couponsLoading: true });

    const url = category ? `/gift/coupons/${category.toLowerCase()}` : '/gift/coupons/all';

    request.get(url)
      .then((data) => {
        const coupons = Array.isArray(data) ? data : [];

        // 格式化优惠券数据
        // 后端 value = 折扣 * 10（如 9??90），recalculatePrice ?value/100 计算
        const formattedCoupons = coupons.map(coupon => {
          const rawValue = coupon.value || 0;
          const discountName = rawValue > 10 ? (rawValue / 10) + '' : rawValue + '';
          return {
            id: coupon.id,
            name: coupon.giftName,
            value: rawValue,
            expireAt: coupon.expireAt,
            description: discountName + '优惠券',
          };
        });

        const couponRange = ['不使用优惠券'].concat(
          formattedCoupons.map(c => c.description)
        );

        // 预计算当前选中优惠券的描述
        let selectedCouponDescription = '不使用优惠券';
        let selectedCouponIndex = 0;
        if (this.data.selectedCouponId) {
          const foundIndex = formattedCoupons.findIndex(c => c.id === this.data.selectedCouponId);
          const found = formattedCoupons[foundIndex];
          if (found) {
            selectedCouponDescription = found.description;
            selectedCouponIndex = foundIndex + 1;
          }
        }

        this.setData({
          availableCoupons: formattedCoupons,
          couponRange,
          selectedCouponIndex,
          selectedCouponDescription,
          couponsLoading: false
        });
        this._updateCouponOptionsSelect();

        // 重新计算价格（如果已选中优惠券）
        this.recalculatePrice();
      })
      .catch((err) => {
        console.error('加载优惠券失败', err);
        this.setData({ couponsLoading: false });
      });
  },

  /**
   * 加载权益对比?   */
  loadPrivileges() {
    if (this.data.privilegesLoading) return;

    this.setData({ privilegesLoading: true });

    vipApi.getPrivileges()
      .then((data) => {
        const privileges = data || [];

        // 转换数据格式以适配现有UI
        const formattedPrivileges = privileges.map(priv => ({
          name: priv.configName,
          normal: this.formatPrivilegeValue(priv.freeValue, priv.valueType),
          vip: this.formatPrivilegeValue(priv.vipValue, priv.valueType),
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
   * 格式化权益值，避免小程序页面直接展?true / false
   */
  formatPrivilegeValue(value, valueType) {
    const normalized = String(value).toLowerCase();
    if (valueType === 'boolean' || normalized === 'true' || normalized === 'false') {
      return normalized === 'true' ? '' : '';
    }
    return value;
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
          status: this.getOrderStatusText(order.status, order.deliverStatus),
          statusCode: order.status,
          deliverStatus: order.deliverStatus,
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
   * 获取订单有效期文?   */
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
   * 获取订单状态文?   */
  getOrderStatusText(status, deliverStatus) {
    if (status === 'PAID' && deliverStatus === 'SUCCESS') {
      return '已到账';
    }
    if (status === 'PAID' && deliverStatus === 'FAILED') {
      return '权益处理中';
    }
    if (status === 'PAID') {
      return '发放中';
    }
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
    this.setData({ selectedCouponIndex: 0 });
    this.setData({ vipTab: tab, selectedCouponId: null, selectedCouponDescription: '不使用优惠券' });

    if (tab === 'vip') {
      this.loadVipPackages();
      this.loadPrivileges();
      this.loadAvailableCoupons('VIP');
    } else if (tab === 'cards') {
      this.loadCardPackages();
      this.loadAvailableCoupons('CARD');
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
    if (!selectedPackage || selectedPackage.soldOut) {
      wx.showToast({ title: '该套餐已达购买上限', icon: 'none' });
      return;
    }
    const currentPrice = selectedPackage.price;
    this.setData({
      selectedVipId: id,
      currentPrice,
      originalPrice: currentPrice
    });
    analytics.track('vip_product_click', {
      product_id: selectedPackage.code || selectedPackage.id,
      price: currentPrice,
      vip_days: selectedPackage.durationDays || 0,
      source: 'vip_page'
    });
    this.recalculatePrice();
  },

  /**
   * 选择次卡套餐
   */
  onSelectCardPlan(e) {
    const id = e.currentTarget.dataset.id;
    const selectedPackage = this.data.cardPackages.find(p => p.id === id);
    if (!selectedPackage || selectedPackage.soldOut) {
      wx.showToast({ title: '该套餐已达购买上限', icon: 'none' });
      return;
    }
    const currentPrice = this.data.isVip && selectedPackage.isVipPrice ? selectedPackage.isVipPrice : selectedPackage.price;
    this.setData({
      selectedCardId: id,
      currentPrice,
      originalPrice: currentPrice,
      selectedCardHasVipPrice: this.data.isVip && !!selectedPackage.isVipPrice
    });
    analytics.track('card_product_click', {
      product_id: selectedPackage.code || selectedPackage.id,
      price: currentPrice,
      quota_count: selectedPackage.count || 0,
      discount: this.data.isVip && selectedPackage.isVipPrice ? 'vip' : 'none',
      source: 'vip_page'
    });
    this.recalculatePrice();
  },

  _updateCouponOptionsSelect() {
    const opts = this.data.couponRange.map((text, index) => ({ text, value: index }));
    this.setData({ couponOptionsSelect: opts });
  },

  onCouponDropdownChange(e) {
    this._applyCouponIndex(e.detail);
  },

  /**
   * 选择优惠?   */
  _applyCouponIndex(index) {
    index = Number(index) || 0;
    if (index === 0) {
      this.setData({ selectedCouponIndex: 0 });
      this.setData({ selectedCouponId: null, selectedCouponDescription: '不使用优惠券' });
      this.recalculatePrice();
      return;
    }
    const couponIndex = index - 1;
    if (couponIndex < 0 || couponIndex >= this.data.availableCoupons.length) {
      this.setData({ selectedCouponIndex: 0 });
      this.setData({ selectedCouponId: null, selectedCouponDescription: '不使用优惠券' });
      this.recalculatePrice();
      return;
    }
    const selectedCoupon = this.data.availableCoupons[couponIndex];
    this.setData({
      selectedCouponId: selectedCoupon.id,
      selectedCouponIndex: index,
      selectedCouponDescription: selectedCoupon.description
    });
    this.recalculatePrice();
  },

  onSelectCoupon(e) {
    this._applyCouponIndex(parseInt(e.detail.value));
  },

  /**
   * 重新计算价格（应用优惠券折扣?   */
  recalculatePrice() {
    const { selectedCouponId, availableCoupons, originalPrice } = this.data;

    if (!selectedCouponId || !originalPrice) {
      this.setData({ discountedPrice: 0 });
      return;
    }

    const selectedCoupon = availableCoupons.find(c => c.id === selectedCouponId);
    if (!selectedCoupon) {
      this.setData({ discountedPrice: 0 });
      return;
    }

    // 计算折扣后的价格
    const discount = selectedCoupon.value / 100;
    const discountedPrice = (originalPrice * discount).toFixed(2);

    this.setData({ discountedPrice: parseFloat(discountedPrice) });
  },

  /**
   * 支付按钮点击
   */
  onPay() {
    if (!requireLogin({ mode: 'page' })) return;

    if (this.data.isPaying) return;

    if (this.data.vipTab === 'vip' && !this.data.selectedVipId) {
      wx.showToast({ title: '暂无可购套餐', icon: 'none' });
      return;
    }

    if (this.data.vipTab === 'cards' && !this.data.selectedCardId) {
      wx.showToast({ title: '暂无可购套餐', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '准备支付...' });
    refreshWechatSession()
      .then(() => {
        wx.hideLoading();
        if (this.data.vipTab === 'vip') {
          this.purchaseVip();
        } else if (this.data.vipTab === 'cards') {
          this.purchaseCard();
        }
      })
      .catch((err) => {
        wx.hideLoading();
        console.error('刷新微信会话失败', err);
        wx.showToast({ title: '登录状态刷新失败，请重试', icon: 'none' });
      });
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

    vipApi.purchaseVip(selectedPackage.code, this.data.selectedCouponId)
      .then((data) => {
        const orderNo = data && data.orderNo;
        const payment = data && data.payment;
        const status = (payment && payment.status) || data.status;
        if (!orderNo) {
          throw new Error('创建订单失败');
        }
        analytics.track('payment_create_result', {
          result: 'success',
          order_id: orderNo,
          product_type: 'vip',
          amount: this.data.currentPrice
        });
        if (data.mock && status === 'PAID') {
          this.setData({ isPaying: false });
          wx.showToast({ title: '模拟支付成功', icon: 'success' });
          analytics.track('payment_result', {
            result: 'success',
            order_id: orderNo,
            amount: this.data.currentPrice,
            product_type: 'vip'
          }, { immediate: true });
          setTimeout(() => this.loadVipInfo(), 500);
          return;
        }
        const signData = payment && payment.signData;
        const paySig = payment && payment.paySig;
        const signature = payment && payment.signature;
        const mode = (payment && payment.mode) || 'short_series_coin';
        if (!signData || !paySig || !signature) {
          this.setData({ isPaying: false });
          wx.showModal({
            title: 'Ѵ',
            content: '֧ȱʧԺڶбԡ',
            showCancel: false,
            success: () => this.loadOrders(true)
          });
          return;
        }
        this.callVirtualPay(orderNo, { signData, paySig, signature, mode });
      })
      .catch((err) => {
        this.setData({ isPaying: false });
        wx.showToast({ title: err.message || '创建订单失败', icon: 'none' });
        analytics.track('payment_create_result', {
          result: 'fail',
          fail_reason: 'server_error',
          product_type: 'vip'
        }, { immediate: true });
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

    vipApi.purchaseCard(selectedPackage.code, this.data.selectedCouponId)
      .then((data) => {
        const orderNo = data && data.orderNo;
        const payment = data && data.payment;
        const status = (payment && payment.status) || data.status;
        if (!orderNo) {
          throw new Error('创建订单失败');
        }
        analytics.track('payment_create_result', {
          result: 'success',
          order_id: orderNo,
          product_type: 'ai_card',
          amount: this.data.currentPrice
        });
        if (data.mock && status === 'PAID') {
          this.setData({ isPaying: false });
          wx.showToast({ title: '模拟支付成功', icon: 'success' });
          analytics.track('payment_result', {
            result: 'success',
            order_id: orderNo,
            amount: this.data.currentPrice,
            product_type: 'ai_card'
          }, { immediate: true });
          setTimeout(() => this.loadVipInfo(), 500);
          return;
        }
        const signData = payment && payment.signData;
        const paySig = payment && payment.paySig;
        const signature = payment && payment.signature;
        const mode = (payment && payment.mode) || 'short_series_coin';
        if (!signData || !paySig || !signature) {
          this.setData({ isPaying: false });
          wx.showModal({
            title: 'Ѵ',
            content: '֧ȱʧԺڶбԡ',
            showCancel: false,
            success: () => this.loadOrders(true)
          });
          return;
        }
        this.callVirtualPay(orderNo, { signData, paySig, signature, mode });
      })
      .catch((err) => {
        this.setData({ isPaying: false });
        wx.showToast({ title: err.message || '创建订单失败', icon: 'none' });
        analytics.track('payment_create_result', {
          result: 'fail',
          fail_reason: 'server_error',
          product_type: 'ai_card'
        }, { immediate: true });
      });
  },

  /**
   * 调用微信虚拟支付（米大师?   */
  callVirtualPay(orderNo, payParams) {
    if (typeof wx.requestVirtualPayment !== 'function') {
      this.setData({ isPaying: false });
      wx.showModal({
        title: '暂不支持虚拟支付',
        content: 'ǰ΢Ű汾л֧֧ʹֵ֧΢ſͻԡ',
        showCancel: false
      });
      return;
    }
    const normalizedPayParams = this.normalizeVirtualPayParams(payParams);
    wx.requestVirtualPayment({
      signData: normalizedPayParams.signData,
      paySig: normalizedPayParams.paySig,
      signature: normalizedPayParams.signature,
      mode: normalizedPayParams.mode,
      success: () => {
        wx.showLoading({ title: 'Ȩ淢', mask: true });
        this.queryPaymentResultV2(orderNo);
      },
      fail: (err) => {
        this.setData({ isPaying: false });
        console.error('wx.requestVirtualPayment fail', {
          orderNo,
          err,
          payParams: normalizedPayParams,
          rawPayParams: payParams
        });
        if (err.errMsg && err.errMsg.indexOf('cancel') !== -1) {
          wx.showToast({ title: '支付已取消', icon: 'none' });
          analytics.track('payment_result', {
            result: 'cancel',
            fail_reason: 'payment_cancel',
            order_id: orderNo,
            product_type: this.data.vipTab === 'vip' ? 'vip' : 'ai_card'
          }, { immediate: true });
        } else {
          const detail = err && (err.errMsg || err.errCode || JSON.stringify(err));
          wx.showModal({
            title: '支付失败',
            content: detail ? String(detail).slice(0, 500) : 'Ժ',
            showCancel: false
          });
          analytics.track('payment_result', {
            result: 'fail',
            fail_reason: 'payment_fail',
            order_id: orderNo,
            product_type: this.data.vipTab === 'vip' ? 'vip' : 'ai_card'
          }, { immediate: true });
        }
      }
    });
  },

  normalizeVirtualPayParams(payParams) {
    let mode = payParams.mode || 'short_series_coin';
    try {
      const signData = JSON.parse(payParams.signData || '{}');
      const hasGoodsFields = !!signData.productId && signData.goodsPrice !== undefined && signData.goodsPrice !== null;
      if (!hasGoodsFields) {
        mode = 'short_series_coin';
      }
    } catch (e) {
      mode = mode || 'short_series_coin';
    }
    return {
      ...payParams,
      mode
    };
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
            title: '支付成功',
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
          this.setData({ isPaying: false });
          wx.showToast({ title: '支付处理中，请稍后查看订单', icon: 'none' });
        }
      })
      .catch((err) => {
        this.setData({ isPaying: false });
        wx.showToast({ title: '查询支付结果失败', icon: 'none' });
      });
  },

  queryPaymentResultV2(orderNo, retryCount = 0) {
    const maxRetry = 20;
    const retryDelay = 1000;

    vipApi.queryOrderStatus(orderNo)
      .then((data) => {
        const status = data.status;
        const deliverStatus = data.deliverStatus;

        if (status === 'PAID' && deliverStatus === 'SUCCESS') {
          this.setData({ isPaying: false });
          wx.hideLoading();
          wx.showToast({ title: '购买成功', icon: 'success', duration: 2000 });
          analytics.track('payment_result', {
            result: 'success',
            order_id: orderNo,
            product_type: this.data.vipTab === 'vip' ? 'vip' : 'ai_card'
          }, { immediate: true });
          setTimeout(() => {
            this.loadVipInfo();
            this.loadOrders(true);
          }, 500);
          return;
        }

        if (status === 'PAID' && deliverStatus === 'FAILED') {
          this.showEntitlementPendingModal('֧ɹ', 'ȨڴУϵͳԶԺˢȨ鿴');
          return;
        }

        if ((status === 'PENDING' || status === 'PAID') && retryCount < maxRetry) {
          setTimeout(() => {
            this.queryPaymentResultV2(orderNo, retryCount + 1);
          }, retryDelay);
          return;
        }

        const title = status === 'PAID' ? '֧ɹ' : '֧';
        const content = status === 'PAID'
          ? 'ȨԺˣԺˢȨ鿴'
          : '֧ȷУԺ鿴';
        this.showEntitlementPendingModal(title, content);
      })
      .catch((err) => {
        this.setData({ isPaying: false });
        wx.hideLoading();
        wx.showToast({ title: '查询支付结果失败', icon: 'none' });
      });
  },

  showEntitlementPendingModal(title, content) {
    this.setData({ isPaying: false });
    wx.hideLoading();
    wx.showModal({
      title,
      content,
      confirmText: '查看订单',
      cancelText: '刷新权益',
      success: (res) => {
        if (res.confirm) {
          this.setData({ vipTab: 'orders' });
          this.loadOrders(true);
        } else {
          this.loadVipInfo();
        }
      }
    });
  },

  /**
   * 分享小程?   */
  onShareAppMessage() {
    return {
      title: '拼豆魔法?- 免费AI生成拼豆图纸',
      path: '/pages/index/index',
      imageUrl: '/images/share.jpg'
    };
  },

  /**
   * 订单列表滚动到底?   */
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
