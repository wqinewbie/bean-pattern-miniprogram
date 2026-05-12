const request = require('../../utils/request')

Page({
  data: {
    inviteCode: '',
    registeredCount: 0,
    paidCount: 0,
    records: []
  },

  onLoad() {
    this.loadData()
  },

  onShow() {
    this.loadData()
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
