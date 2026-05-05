function getSafeAreaLayout() {
  const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : {};
  const appBaseInfo = wx.getAppBaseInfo ? wx.getAppBaseInfo() : {};
  const menuButton = wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : null;
  const statusBarHeight = windowInfo.statusBarHeight || appBaseInfo.statusBarHeight || 20;
  const menuHeight = menuButton && menuButton.height ? menuButton.height : 32;
  const menuBottom = menuButton && menuButton.bottom ? menuButton.bottom : (statusBarHeight + menuHeight + 8);

  return {
    statusBarHeight,
    menuButton,
    navTop: menuBottom + 10,
    headerSafeTop: menuBottom + 16,
    navHeight: Math.max(menuHeight + statusBarHeight + 24, 88),
  };
}

module.exports = {
  getSafeAreaLayout,
};
