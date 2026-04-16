Component({
  options: {
    multipleSlots: true
  },
  properties: {
    title:    { type: String, value: '' },
    subtitle: { type: String, value: '' },
    showBack: { type: Boolean, value: true }
  },
  data: {
    navTop: 0
  },
  lifetimes: {
    attached() {
      // 动态计算导航栏顶部距离，对齐胶囊按钮
      const sys = wx.getSystemInfoSync();
      const statusBarHeight = sys.statusBarHeight || 20;
      const menuButton = wx.getMenuButtonBoundingClientRect();
      
      if (menuButton) {
        // 胶囊按钮中心点 = top + height/2
        const menuCenter = menuButton.top + menuButton.height / 2;
        // 导航栏高度（32px）
        const navHeight = 32;
        // 导航栏顶部距离 = 胶囊中心点 - 导航栏高度/2
        // 这样导航栏中心就和胶囊按钮中心对齐了
        const top = menuCenter - navHeight / 2;
        this.setData({ navTop: top });
      } else {
        // 兜底：使用状态栏高度 + 固定值
        this.setData({ navTop: statusBarHeight + 8 });
      }
    }
  },
  methods: {
    onBack() {
      this.triggerEvent('back');
    }
  }
});
