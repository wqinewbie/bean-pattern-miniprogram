const request = require('../../utils/request')

Page({
  data: {
    inviteCode: '',
    inputCode: ''
  },

  onLoad() {
    this.setData({
      inputCode: wx.getStorageSync('pendingInviteCode') || ''
    })
    this.loadInviteCode()
  },

  onShareAppMessage() {
    const code = this.data.inviteCode || wx.getStorageSync('myInviteCode') || ''
    return {
      title: '来和我一起玩拼豆，输入邀请码可解锁邀请任务进度',
      path: `/pages/home/home?inviteCode=${encodeURIComponent(code)}`
    }
  },

  loadInviteCode() {
    request.get('/invite/my-code')
      .then((data) => {
        const inviteCode = data && data.inviteCode ? data.inviteCode : ''
        this.setData({ inviteCode })
        if (inviteCode) wx.setStorageSync('myInviteCode', inviteCode)
      })
      .catch(() => {})
  },

  onInputCode(e) {
    this.setData({ inputCode: (e.detail.value || '').trim().toUpperCase() })
  },

  onSaveInputCode() {
    const code = this.data.inputCode || ''
    if (!code) {
      wx.showToast({ title: '请输入邀请码', icon: 'none' })
      return
    }
    wx.setStorageSync('pendingInviteCode', code)
    wx.showToast({ title: '已保存，下次登录生效', icon: 'success' })
  },

  onCopyCode() {
    const code = this.data.inviteCode
    if (!code) {
      wx.showToast({ title: '邀请码为空', icon: 'none' })
      return
    }
    wx.setClipboardData({ data: code })
  },

  onShareInvite() {
    wx.showShareMenu({
      withShareTicket: false,
      menus: ['shareAppMessage']
    })
    wx.showToast({ title: '请点击右上角分享', icon: 'none' })
  },

  onOpenRecords() {
    wx.navigateTo({ url: '/pages/invite-records/invite-records' })
  }
})
