Page({
  data: {
    helpFaqs: [],
  },

  onLoad() {
    this.loadHelpFaqs();
  },

  loadHelpFaqs() {
    this.setData({
      helpFaqs: [
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
      ],
    });
  },

  // 客服功能已通过 <button open-type="contact"> 接入

  onBack() {
    wx.navigateBack();
  },
});
