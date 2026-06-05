function getCurrentPage() {
  const pages = getCurrentPages();
  return pages.length > 0 ? pages[pages.length - 1] : null;
}

function showLogin(callback) {
  const page = getCurrentPage();
  if (page) {
    try {
      const comp = page.selectComponent('#login-modal');
      if (comp && typeof comp.show === 'function') {
        comp.show({ callback });
        return;
      }
    } catch (e) {
      // 页面可能还没有 #login-modal 组件，fallback
    }
  }

  // fallback: 跳转到首页（首页的 onShow 会弹出登录弹窗）
  wx.switchTab({ url: '/pages/index/index' });
}

function hideLogin() {
  const page = getCurrentPage();
  if (page) {
    try {
      const comp = page.selectComponent('#login-modal');
      if (comp && typeof comp.hide === 'function') {
        comp.hide();
      }
    } catch (e) {
      // ignore
    }
  }
}

module.exports = {
  showLogin,
  hideLogin
};
