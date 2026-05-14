const request = require('../../utils/request');
const { API_BASE_URL } = require('../../utils/config');
const { getSafeAreaLayout } = require('../../utils/safe-area');

Page({
  data: {
    taskCode: '',
    taskName: '',
    submissionText: '',
    proofImages: ['', ''],
    submitting: false,
    canSubmit: false,
    statusBarHeight: 20,
    navHeight: 32,
    capsuleWidth: 87,
    bottomSafeHeight: 0,
  },

  onLoad(options) {
    this.calcNavTop();
    this.setData({
      taskCode: options.taskCode || '',
      taskName: options.taskName || '社交平台任务'
    });
    this.updateSubmitState(['', '']);
  },

  calcNavTop() {
    const layout = getSafeAreaLayout();
    const menuButton = layout.menuButton || {};
    const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : {};
    const safeArea = windowInfo.safeArea || null;
    const screenHeight = windowInfo.screenHeight || windowInfo.windowHeight || 0;
    const bottomSafeHeight = safeArea && screenHeight ? Math.max(screenHeight - safeArea.bottom, 0) : 0;

    this.setData({
      statusBarHeight: menuButton.top || layout.statusBarHeight || 20,
      navHeight: menuButton.height || 32,
      capsuleWidth: menuButton.width || 87,
      bottomSafeHeight,
    });
  },

  onBack() {
    wx.navigateBack();
  },

  onInputText(e) {
    this.setData({ submissionText: e.detail.value || '' });
  },

  updateSubmitState(proofImages = this.data.proofImages) {
    const canSubmit = Array.isArray(proofImages) && proofImages.length === 2 && proofImages.every((item) => !!item);
    this.setData({ canSubmit });
  },

  onChooseImage(e) {
    const index = Number(e.currentTarget.dataset.index || 0);
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const file = res.tempFiles && res.tempFiles[0];
        if (!file || !file.tempFilePath) return;
        const next = [...this.data.proofImages];
        next[index] = file.tempFilePath;
        this.setData({ proofImages: next });
        this.updateSubmitState(next);
      }
    });
  },

  onSubmit() {
    const { taskCode, submissionText, proofImages, canSubmit, submitting } = this.data;
    if (submitting) {
      return;
    }
    if (!taskCode) {
      wx.showToast({ title: '任务参数错误', icon: 'none' });
      return;
    }
    if (!canSubmit || proofImages.some((item) => !item)) {
      wx.showToast({ title: '请上传两张图片', icon: 'none' });
      return;
    }

    this.setData({ submitting: true });
    Promise.all(proofImages.map((filePath) => this.uploadImage(filePath)))
      .then((urls) => request.post('/review-task/submit', {
        taskCode,
        submissionText,
        proofImages: JSON.stringify(urls)
      }))
      .then(() => {
        this.setData({ submitting: false });
        wx.showToast({ title: '提交成功', icon: 'success' });
        setTimeout(() => wx.navigateBack(), 500);
      })
      .catch((err) => {
        this.setData({ submitting: false });
        wx.showToast({ title: err.message || '提交失败', icon: 'none' });
      });
  },

  uploadImage(filePath) {
    const sessionId = wx.getStorageSync('sessionId') || '';
    return new Promise((resolve, reject) => {
      wx.uploadFile({
        url: `${API_BASE_URL}/api/image/upload`,
        filePath,
        name: 'file',
        header: { 'X-Session-Id': sessionId },
        success: (res) => {
          try {
            const body = JSON.parse(res.data || '{}');
            if (res.statusCode === 200 && body.code === 0) {
              resolve(body.data.imageUrl || body.data.originalUrl);
              return;
            }
          } catch (e) {}
          reject(new Error('图片上传失败'));
        },
        fail: () => reject(new Error('图片上传失败'))
      });
    });
  }
});
