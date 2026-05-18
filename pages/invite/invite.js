const request = require('../../utils/request')
const { getSafeAreaLayout } = require('../../utils/safe-area')
const storage = require('../../utils/storage')

Page({
  data: {
    inviteCode: '',
    inputCode: '',
    statusBarHeight: 20,
    navHeight: 32,
    capsuleWidth: 87
  },

  onLoad() {
    this.calcNavTop()
    this.setData({
      inputCode: storage.get(storage.KEYS.PENDING_INVITE_CODE, '')
    })
    this.loadInviteCode()
  },

  onShareAppMessage() {
    const code = this.data.inviteCode || storage.get(storage.KEYS.MY_INVITE_CODE, '')
    return {
      title: '来和我一起玩拼豆，输入邀请码可解锁邀请任务进度',
      path: `/pages/index/index?inviteCode=${encodeURIComponent(code)}`
    }
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

  loadInviteCode() {
    request.get('/invite/my-code')
      .then((data) => {
        const inviteCode = data && data.inviteCode ? data.inviteCode : ''
        this.setData({ inviteCode })
        if (inviteCode) storage.set(storage.KEYS.MY_INVITE_CODE, inviteCode)
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
    wx.showLoading({ title: '绑定中...', mask: true })
    request.post('/invite/bind', { inviteCode: code })
      .then(() => {
        storage.remove(storage.KEYS.PENDING_INVITE_CODE)
        wx.hideLoading()
        wx.showToast({ title: '绑定成功', icon: 'success' })
        this.setData({ inputCode: '' })
      })
      .catch((err) => {
        wx.hideLoading()
        wx.showToast({ title: err.message || '绑定失败', icon: 'none' })
      })
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
