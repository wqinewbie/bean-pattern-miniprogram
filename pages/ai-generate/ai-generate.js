const request = require('../../utils/request');
const { ensureProfileComplete } = require('../../utils/profile-guard');
const { API_BASE_URL } = require('../../utils/config');
const { getSafeAreaLayout } = require('../../utils/safe-area');
const core = require('../../utils/canvas2d/core');
const vipApi = require('../../utils/vip-api');

Page({
  syncTabBar() {
    const tabBar = this.getTabBar && this.getTabBar();
    if (tabBar && typeof tabBar.setSelected === 'function') {
      tabBar.setSelected(2);
    }
  },

  data: {
    uploadedImage: '',
    aiInstruction: '',
    isGenerating: false,

    // 魔法风格（从后台获取）
    magicStyles: [],
    selectedStyle: '',

    // 图纸参数
    sizeMode: 'default',
    brands: [],
    brandIndex: 0,
    colorSets: [],
    colorSetIndex: 0,
    isMirrored: false,

    // 底部弹窗
    showBrandSheet: false,
    showColorSheet: false,

    magicCount: 3,
    scrollHeight: 400,
    scrollTop: 0,
    statusBarHeight: 20,
    navHeight: 32,
    capsuleWidth: 87,

    // 图片调整浮层
    showAdjustModal: false,
    tempImage: '',
    adjustX: 0,
    adjustY: 0,
    adjustScale: 1,
    adjustBaseW: 0,
    adjustBaseH: 0,
    adjustLeft: 0,
    adjustTop: 0,
    adjustBoxPx: 340,

    // 预览交互（保留旧代码兼容）
    previewX: 0,
    previewY: 0,
    previewScale: 1,
    previewBaseW: 0,
    previewBaseH: 0,
    previewLeft: 0,
    previewTop: 0,
    previewBoxPx: 640,
  },

  onLoad() {
    const layout = getSafeAreaLayout();
    const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : {};
    const menuButton = layout.menuButton || {};
    const sbh = layout.statusBarHeight;
    const windowHeight = windowInfo.windowHeight || 667;
    const tabBarH = 56;
    const scrollHeight = Math.max(windowHeight - sbh - tabBarH, 300);

    // 计算 640rpx 对应的实际像素值
    const screenWidth = windowInfo.windowWidth || 375;
    const previewBoxPx = Math.round(screenWidth * 640 / 750);

    this.setData({
      statusBarHeight: sbh,
      navHeight: layout.navHeight || 88,
      capsuleWidth: menuButton.width || 87,
      scrollHeight,
      previewBoxPx
    });
    this.loadBrandsFromServer();
    this.loadMagicStyles();

    // 添加页面进入时的滚动提示动画
    this.addScrollHintAnimation();
  },

  addScrollHintAnimation() {
    // 延迟执行，确保页面已渲染
    setTimeout(() => {
      // 先向下滚动 50px
      this.setData({ scrollTop: 50 });

      // 然后弹回顶部
      setTimeout(() => {
        this.setData({ scrollTop: 0 });
      }, 400);
    }, 500);
  },

  onShow() {
    this.syncTabBar();
    this.loadAiQuota();
  },

  /**
   * 加载AI魔法次数
   */
  loadAiQuota() {
    vipApi.getAiQuotaInfo().then(data => {
      if (data && typeof data.remainQuota === 'number') {
        this.setData({
          magicCount: data.remainQuota
        });
      }
    }).catch(err => {
      console.error('获取AI次数失败', err);
    });
  },

  loadBrandsFromServer() {
    request.get('/bead/brands').then((data) => {
      if (!data || typeof data !== 'object') return;
      const brandList = Object.keys(data);
      if (brandList.length === 0) return;
      const firstBrand = brandList[0];
      const kits = data[firstBrand] || [];
      const colorSets = ['全部色号', ...kits.map(k => k + '色')];
      this.setData({
        brands: brandList,
        brandIndex: 0,
        colorSets,
        colorSetIndex: 0,
        _brandsData: data
      });
    }).catch(() => {
      this.setData({
        brands: ['MARD'],
        brandIndex: 0,
        colorSets: ['全部色号', '24色', '48色', '72色', '96色'],
        colorSetIndex: 0
      });
    });
  },

  /**
   * 加载魔法风格列表
   */
  loadMagicStyles() {
    request.get('/ai/magic-styles').then((data) => {
      if (data && Array.isArray(data) && data.length > 0) {
        this.setData({
          magicStyles: data,
          selectedStyle: data[0].name
        });
      }
    }).catch((err) => {
      console.error('加载魔法风格失败', err);
      // 使用默认风格（兜底）
      this.setData({
        magicStyles: [
          { name: '人物特化', icon: null, tag: '适用人物' }
        ],
        selectedStyle: '人物特化'
      });
    });
  },

  onChooseImage() {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempImage = res.tempFilePaths[0];
        // 弹出调整浮层
        this.setData({
          tempImage,
          showAdjustModal: true
        });
        this.initAdjustMetrics(tempImage);
      }
    });
  },

  initAdjustMetrics(url) {
    wx.getImageInfo({
      src: url,
      success: (info) => {
        const imgW = info.width || 1;
        const imgH = info.height || 1;
        const box = 340;
        const ratio = Math.max(box / imgW, box / imgH);
        const baseW = imgW * ratio;
        const baseH = imgH * ratio;
        const left = (box - baseW) / 2;
        const top = (box - baseH) / 2;
        this.setData({
          adjustBaseW: baseW,
          adjustBaseH: baseH,
          adjustLeft: left,
          adjustTop: top,
          adjustBoxPx: box,
          adjustX: 0,
          adjustY: 0,
          adjustScale: 1
        });
      }
    });
  },

  onAdjustTouchStart(e) {
    const touches = (e && e.touches) || [];
    if (touches.length === 1) {
      this._adjustDragging = true;
      this._adjustDragStartX = touches[0].pageX;
      this._adjustDragStartY = touches[0].pageY;
      this._adjustDragOriginX = this.data.adjustX || 0;
      this._adjustDragOriginY = this.data.adjustY || 0;
      this._adjustPinching = false;
      return;
    }
    if (touches.length !== 2) return;
    const p1 = touches[0];
    const p2 = touches[1];

    // 计算双指中心点
    const centerX = (p1.pageX + p2.pageX) / 2;
    const centerY = (p1.pageY + p2.pageY) / 2;

    this._adjustPinchStartDistance = Math.hypot(p2.pageX - p1.pageX, p2.pageY - p1.pageY) || 1;
    this._adjustPinchStartScale = this.data.adjustScale || 1;
    this._adjustPinchStartX = this.data.adjustX || 0;
    this._adjustPinchStartY = this.data.adjustY || 0;
    this._adjustPinchCenterX = centerX;
    this._adjustPinchCenterY = centerY;
    this._adjustPinching = true;
    this._adjustDragging = false;
  },

  onAdjustTouchMove(e) {
    const touches = (e && e.touches) || [];

    if (this._adjustPinching && touches.length === 2) {
      const p1 = touches[0];
      const p2 = touches[1];

      // 计算当前双指中心点
      const centerX = (p1.pageX + p2.pageX) / 2;
      const centerY = (p1.pageY + p2.pageY) / 2;

      // 计算缩放比例
      const dist = Math.hypot(p2.pageX - p1.pageX, p2.pageY - p1.pageY) || 1;
      const scaleRatio = dist / this._adjustPinchStartDistance;
      const nextScale = this._adjustPinchStartScale * scaleRatio;

      // 计算双指中心点的移动距离（支持双指拖拽）
      const centerDx = centerX - this._adjustPinchCenterX;
      const centerDy = centerY - this._adjustPinchCenterY;

      // 计算缩放导致的位移补偿
      // 以双指中心为缩放原点，需要调整translate值
      const scaleDelta = nextScale - this._adjustPinchStartScale;
      const nextX = this._adjustPinchStartX + centerDx;
      const nextY = this._adjustPinchStartY + centerDy;

      this.applyAdjustTransform(nextX, nextY, nextScale);
      return;
    }

    if (this._adjustDragging && touches.length === 1) {
      const dx = touches[0].pageX - this._adjustDragStartX;
      const dy = touches[0].pageY - this._adjustDragStartY;
      const nextX = this._adjustDragOriginX + dx;
      const nextY = this._adjustDragOriginY + dy;
      this.applyAdjustTransform(nextX, nextY, this.data.adjustScale);
    }
  },

  onAdjustTouchEnd() {
    this._adjustDragging = false;
    this._adjustPinching = false;
  },

  applyAdjustTransform(nextX, nextY, nextScale) {
    const box = this.data.adjustBoxPx || 0;
    const baseW = this.data.adjustBaseW || 0;
    const baseH = this.data.adjustBaseH || 0;
    if (!box || !baseW || !baseH) return;

    let scale = nextScale;
    if (scale < 1) scale = 1;
    if (scale > 5) scale = 5;

    const scaledW = baseW * scale;
    const scaledH = baseH * scale;

    let x = nextX;
    let y = nextY;

    if (scaledW <= box) {
      x = 0;
    } else {
      const maxX = (scaledW - box) / 2;
      if (x > maxX) x = maxX;
      if (x < -maxX) x = -maxX;
    }

    if (scaledH <= box) {
      y = 0;
    } else {
      const maxY = (scaledH - box) / 2;
      if (y > maxY) y = maxY;
      if (y < -maxY) y = -maxY;
    }

    this.setData({ adjustX: x, adjustY: y, adjustScale: scale });
  },

  onCancelAdjust() {
    this.setData({
      showAdjustModal: false,
      tempImage: ''
    });
  },

  onConfirmAdjust() {
    wx.showLoading({ title: '处理中...', mask: true });

    this.cropImageToSquare().then(croppedPath => {
      wx.hideLoading();

      this.setData({
        uploadedImage: croppedPath,
        showAdjustModal: false,
        tempImage: '',
        previewX: 0,
        previewY: 0,
        previewScale: 1
      });

      this.initPreviewMetrics(croppedPath);
    }).catch(err => {
      wx.hideLoading();
      console.error('裁剪失败:', err);
      wx.showToast({ title: '裁剪失败', icon: 'none' });
    });
  },

  async cropImageToSquare() {
    const { tempImage, adjustX, adjustY, adjustScale, adjustBaseW, adjustBaseH, adjustLeft, adjustTop, adjustBoxPx, previewBoxPx } = this.data;
    const canvasSize = previewBoxPx || 640;

    try {
      // 使用 Canvas 2D API
      const { canvas, ctx, dpr } = await core.init2dCanvas(this, '#cropCanvas');
      core.resize2dCanvas({ canvas, ctx, width: canvasSize, height: canvasSize, dpr });

      // 白色背景
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvasSize, canvasSize);

      // 获取原始图片信息
      const imgInfo = await new Promise((resolve, reject) => {
        wx.getImageInfo({
          src: tempImage,
          success: resolve,
          fail: reject
        });
      });

      const imgW = imgInfo.width;
      const imgH = imgInfo.height;

      // 计算浮层中图片的实际显示位置
      // CSS transform: translate3d(adjustX, adjustY, 0) scale(adjustScale)
      // transform-origin 默认是 center
      const baseW = adjustBaseW;
      const baseH = adjustBaseH;
      const displayW = baseW * adjustScale;
      const displayH = baseH * adjustScale;

      // 缩放前中心位置
      const centerXBefore = adjustLeft + baseW / 2;
      const centerYBefore = adjustTop + baseH / 2;

      // translate 后的中心位置
      const centerXFinal = centerXBefore + adjustX;
      const centerYFinal = centerYBefore + adjustY;

      // 最终图片左上角位置
      const displayX = centerXFinal - displayW / 2;
      const displayY = centerYFinal - displayH / 2;

      // 计算可视区域在图片坐标系中的位置
      const cropLeftInImg = -displayX;
      const cropTopInImg = -displayY;
      const cropWidthInImg = adjustBoxPx;
      const cropHeightInImg = adjustBoxPx;

      // 转换到原图坐标系
      const scaleRatio = imgW / adjustBaseW;
      const srcXRaw = (cropLeftInImg / adjustScale) * scaleRatio;
      const srcYRaw = (cropTopInImg / adjustScale) * scaleRatio;
      const srcWRaw = (cropWidthInImg / adjustScale) * scaleRatio;
      const srcHRaw = (cropHeightInImg / adjustScale) * scaleRatio;

      // 处理边界：裁剪区域可能超出原图
      let srcX = Math.max(0, srcXRaw);
      let srcY = Math.max(0, srcYRaw);
      let srcRight = Math.min(imgW, srcXRaw + srcWRaw);
      let srcBottom = Math.min(imgH, srcYRaw + srcHRaw);
      let srcW = srcRight - srcX;
      let srcH = srcBottom - srcY;

      // 计算目标区域：根据源区域在原始裁剪框中的位置
      let destX = 0;
      let destY = 0;
      let destW = canvasSize;
      let destH = canvasSize;

      if (srcXRaw < 0) {
        destX = (-srcXRaw / srcWRaw) * canvasSize;
      }
      if (srcYRaw < 0) {
        destY = (-srcYRaw / srcHRaw) * canvasSize;
      }
      if (srcXRaw + srcWRaw > imgW) {
        destW = ((imgW - srcXRaw) / srcWRaw) * canvasSize;
      } else {
        destW = (srcW / srcWRaw) * canvasSize;
      }
      if (srcYRaw + srcHRaw > imgH) {
        destH = ((imgH - srcYRaw) / srcHRaw) * canvasSize;
      } else {
        destH = (srcH / srcHRaw) * canvasSize;
      }

      // 加载图片
      const image = canvas.createImage();
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = reject;
        image.src = tempImage;
      });

      // 从原图裁剪并绘制到 Canvas
      ctx.drawImage(
        image,
        srcX, srcY, srcW, srcH,
        destX, destY, destW, destH
      );

      // 导出图片
      const tempFilePath = await new Promise((resolve, reject) => {
        wx.canvasToTempFilePath({
          canvas,
          success: (res) => resolve(res.tempFilePath),
          fail: reject
        }, this);
      });

      console.log('裁剪完成:', tempFilePath);
      return tempFilePath;

    } catch (err) {
      console.error('裁剪失败:', err);
      throw err;
    }
  },

  initPreviewMetrics(url) {
    console.log('initPreviewMetrics 被调用，图片路径:', url);
    wx.getImageInfo({
      src: url,
      success: (info) => {
        console.log('获取图片信息成功:', info);
        const imgW = info.width || 1;
        const imgH = info.height || 1;
        const box = this.data.previewBoxPx || 640;
        const ratio = Math.max(box / imgW, box / imgH);
        const baseW = imgW * ratio;
        const baseH = imgH * ratio;
        const left = (box - baseW) / 2;
        const top = (box - baseH) / 2;
        console.log('计算预览参数:', {
          imgW, imgH, box, ratio, baseW, baseH, left, top
        });
        this.setData({
          previewBaseW: baseW,
          previewBaseH: baseH,
          previewLeft: left,
          previewTop: top,
          previewX: 0,
          previewY: 0,
          previewScale: 1
        });
        console.log('预览参数已更新');
      },
      fail: (err) => {
        console.error('获取图片信息失败:', err);
      }
    });
  },

  onPreviewTouchStart(e) {
    const touches = (e && e.touches) || [];
    if (touches.length === 1) {
      this._dragging = true;
      this._dragStartX = touches[0].pageX;
      this._dragStartY = touches[0].pageY;
      this._dragOriginX = this.data.previewX || 0;
      this._dragOriginY = this.data.previewY || 0;
      this._pinching = false;
      return;
    }
    if (touches.length !== 2) return;
    const p1 = touches[0];
    const p2 = touches[1];

    // 计算双指中心点
    const centerX = (p1.pageX + p2.pageX) / 2;
    const centerY = (p1.pageY + p2.pageY) / 2;

    this._pinchStartDistance = Math.hypot(p2.pageX - p1.pageX, p2.pageY - p1.pageY) || 1;
    this._pinchStartScale = this.data.previewScale || 1;
    this._pinchStartX = this.data.previewX || 0;
    this._pinchStartY = this.data.previewY || 0;
    this._pinchCenterX = centerX;
    this._pinchCenterY = centerY;
    this._pinching = true;
    this._dragging = false;
  },

  onPreviewTouchMove(e) {
    const touches = (e && e.touches) || [];

    if (this._pinching && touches.length === 2) {
      const p1 = touches[0];
      const p2 = touches[1];

      // 计算当前双指中心点
      const centerX = (p1.pageX + p2.pageX) / 2;
      const centerY = (p1.pageY + p2.pageY) / 2;

      // 计算缩放比例
      const dist = Math.hypot(p2.pageX - p1.pageX, p2.pageY - p1.pageY) || 1;
      const scaleRatio = dist / this._pinchStartDistance;
      const nextScale = this._pinchStartScale * scaleRatio;

      // 计算双指中心点的移动距离（支持双指拖拽）
      const centerDx = centerX - this._pinchCenterX;
      const centerDy = centerY - this._pinchCenterY;

      // 应用双指拖拽和缩放
      const nextX = this._pinchStartX + centerDx;
      const nextY = this._pinchStartY + centerDy;

      this.applyPreviewTransform(nextX, nextY, nextScale);
      return;
    }

    if (this._dragging && touches.length === 1) {
      const dx = touches[0].pageX - this._dragStartX;
      const dy = touches[0].pageY - this._dragStartY;
      const nextX = this._dragOriginX + dx;
      const nextY = this._dragOriginY + dy;
      this.applyPreviewTransform(nextX, nextY, this.data.previewScale);
    }
  },

  onPreviewTouchEnd() {
    this._dragging = false;
    this._pinching = false;
  },

  applyPreviewTransform(nextX, nextY, nextScale) {
    const box = this.data.previewBoxPx || 0;
    const baseW = this.data.previewBaseW || 0;
    const baseH = this.data.previewBaseH || 0;
    if (!box || !baseW || !baseH) return;

    let scale = nextScale;
    if (scale < 1) scale = 1;
    if (scale > 5) scale = 5;

    const scaledW = baseW * scale;
    const scaledH = baseH * scale;

    let x = nextX;
    let y = nextY;

    if (scaledW <= box) {
      x = 0;
    } else {
      const maxX = (scaledW - box) / 2;
      if (x > maxX) x = maxX;
      if (x < -maxX) x = -maxX;
    }

    if (scaledH <= box) {
      y = 0;
    } else {
      const maxY = (scaledH - box) / 2;
      if (y > maxY) y = maxY;
      if (y < -maxY) y = -maxY;
    }

    this.setData({ previewX: x, previewY: y, previewScale: scale });
  },

  onAiInstructionInput(e) {
    this.setData({ aiInstruction: e.detail.value });
  },

  onStyleTap(e) {
    this.setData({ selectedStyle: e.currentTarget.dataset.style });
  },

  onSizeModeTap(e) {
    this.setData({ sizeMode: e.currentTarget.dataset.mode });
  },

  onShowBrandSheet() {
    this.setData({ showBrandSheet: true });
  },

  onHideBrandSheet() {
    this.setData({ showBrandSheet: false });
  },

  onSelectBrand(e) {
    const idx = parseInt(e.currentTarget.dataset.index);
    const brand = this.data.brands[idx];
    const brandsData = this.data._brandsData || {};
    const kits = brandsData[brand] || [];
    const colorSets = ['全部色号', ...kits.map(k => k + '色')];
    this.setData({
      brandIndex: idx,
      colorSets,
      colorSetIndex: 0,
      showBrandSheet: false
    });
  },

  onShowColorSheet() {
    this.setData({ showColorSheet: true });
  },

  onHideColorSheet() {
    this.setData({ showColorSheet: false });
  },

  onSelectColorSet(e) {
    const idx = parseInt(e.currentTarget.dataset.index);
    this.setData({
      colorSetIndex: idx,
      showColorSheet: false
    });
  },

  onBrandChange(e) {
    const idx = parseInt(e.detail.value);
    const brand = this.data.brands[idx];
    const brandsData = this.data._brandsData || {};
    const kits = brandsData[brand] || [];
    const colorSets = ['全部色号', ...kits.map(k => k + '色')];
    this.setData({
      brandIndex: idx,
      colorSets,
      colorSetIndex: 0
    });
  },

  onColorSetChange(e) {
    this.setData({ colorSetIndex: e.detail.value });
  },

  onMirrorToggle() {
    this.setData({ isMirrored: !this.data.isMirrored });
  },

  onGenerate() {
    const { uploadedImage, selectedStyle, sizeMode, brandIndex, brands, colorSetIndex, colorSets, isMirrored, magicCount } = this.data;

    if (!uploadedImage) {
      wx.showToast({ title: '请先上传图片', icon: 'none' });
      return;
    }

    if (!selectedStyle) {
      wx.showToast({ title: '请选择魔法风格', icon: 'none' });
      return;
    }

    if (magicCount <= 0) {
      wx.showModal({
        title: '魔法次数不足',
        content: '您的AI魔法次数已用完，购买次卡或开通会员即可继续使用',
        confirmText: '去购买',
        cancelText: '取消',
        success: (res) => {
          if (res.confirm) {
            wx.navigateTo({
              url: '/pages/vip/vip?tab=cards'
            });
          }
        }
      });
      return;
    }

    ensureProfileComplete().then((ok) => {
      if (!ok) return;

      // 准备参数
      const finalSize = sizeMode === 'small' ? 36 : 64;
      const brand = brands[brandIndex];
      const colorSet = colorSets[colorSetIndex];

      // 解析色号数量
      let colorCount = 0;
      if (colorSet !== '全部色号') {
        const match = colorSet.match(/(\d+)/);
        if (match) colorCount = parseInt(match[1]);
      }

      // 将参数存储到全局，供generating页面使用
      const app = getApp();
      app.globalData.aiGenerateParams = {
        uploadedImage,
        style: selectedStyle,
        size: finalSize,
        brand,
        colorCount,
        mirror: isMirrored
      };

      // 立即跳转到生成页面
      wx.navigateTo({
        url: `/pages/generating/generating?mode=ai&fromAiGenerate=1`
      });
    });
  },

  uploadImage(filePath) {
    return new Promise((resolve, reject) => {
      const sessionId = wx.getStorageSync('sessionId') || '';

      wx.uploadFile({
        url: require('../../utils/config').API_BASE_URL + '/api/image/upload',
        filePath: filePath,
        name: 'file',
        header: { 'X-Session-Id': sessionId },
        success: (res) => {
          try {
            const data = JSON.parse(res.data);
            if (res.statusCode === 200 && data.code === 0) {
              const imageUrl = data.data.imageUrl || data.data.originalUrl;
              resolve(imageUrl);
            } else {
              reject(new Error(data.message || '上传失败'));
            }
          } catch (e) {
            reject(new Error('上传失败'));
          }
        },
        fail: (err) => {
          reject(new Error('网络错误'));
        }
      });
    });
  },

  callAiGenerate(params) {
    return new Promise((resolve, reject) => {
      request.post('/ai/generate', params).then(data => {
        if (data && data.taskId) {
          resolve(data.taskId);
        } else {
          reject(new Error('生成失败'));
        }
      }).catch(err => {
        reject(err);
      });
    });
  },
});
