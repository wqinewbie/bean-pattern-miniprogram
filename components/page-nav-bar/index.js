Component({
  options: {
    multipleSlots: true
  },
  properties: {
    title:    { type: String, value: '' },
    subtitle: { type: String, value: '' },
    showBack: { type: Boolean, value: true },
    bgColor:  { type: String, value: '#FFF9ED' }
  },
  data: {
    navTop: 0,
    safeRightInset: 0,
  },
  lifetimes: {
    attached() {
      const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : {};
      const appBaseInfo = wx.getAppBaseInfo ? wx.getAppBaseInfo() : {};
      const statusBarHeight = windowInfo.statusBarHeight || appBaseInfo.statusBarHeight || 20;
      const menuButton = wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : null;

      if (menuButton) {
        const menuCenter = menuButton.top + menuButton.height / 2;
        const navHeight = 32;
        const top = menuCenter - navHeight / 2;
        const safeRightInset = Math.max(0, (windowInfo.windowWidth || 0) - menuButton.left + 8);
        this.setData({ navTop: top, safeRightInset });
      } else {
        this.setData({ navTop: statusBarHeight + 8, safeRightInset: 0 });
      }
    }
  },
  methods: {
    onBack() {
      this.triggerEvent('back');
    }
  }
});
