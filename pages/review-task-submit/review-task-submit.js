const request = require('../../utils/request');
const { API_BASE_URL } = require('../../utils/config');

Page({
  data: {
    taskCode: '',
    taskName: '',
    submissionText: '',
    proofImages: ['', ''],
    submitting: false,
  },

  onLoad(options) {
    this.setData({
      taskCode: options.taskCode || '',
      taskName: options.taskName || '社交平台任务'
    });
  },

  onInputText(e) {
    this.setData({ submissionText: e.detail.value || '' });
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
      }
    });
  },

  onSubmit() {
    const { taskCode, submissionText, proofImages } = this.data;
    if (!taskCode) {
      wx.showToast({ title: '任务参数错误', icon: 'none' });
      return;
    }
    if (proofImages.some((item) => !item)) {
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
