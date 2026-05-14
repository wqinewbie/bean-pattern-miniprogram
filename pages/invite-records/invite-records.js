const request = require('../../utils/request')
const { getSafeAreaLayout } = require('../../utils/safe-area')

Page({
  data: {
    inviteCode: '',
    registeredCount: 0,
    paidCount: 0,
    records: [],
    statusBarHeight: 20,
    navHeight: 32,
    capsuleWidth: 87
  },

  onLoad() {
    this.calcNavTop()
    this.loadData()
  },

  onShow() {
    this.calcNavTop()
    this.loadData()
  },

  calcNavTop() {
    const layout = getSafeAreaLayout()
    const menuButton = layout.menuButton || {}
    this.setData({
      statusBarHeight: menuButton.top || layout.statusBarHeight || 20,
      navHeight: menuButton.height || 32,
      capsuleWidth: menuButton.width || 87
    })
  },

  onBack() {
    wx.navigateBack()
  },

  loadData() {
    request.get('/invite/records')
      .then((data) => {
        this.setData({
          inviteCode: data.inviteCode || '',
          registeredCount: data.registeredCount || 0,
          paidCount: data.paidCount || 0,
          records: Array.isArray(data.records) ? data.records : []
        })
      })
      .catch((err) => {
        wx.showToast({ title: err.message || '加载失败', icon: 'none' })
      })
  }
})
