Component({
  properties: {
    config: {
      type: Object,
      value: {}
    }
  },

  data: {
    visible: false,
    showNeverShow: true,
    neverShowKey: ''
  },

  methods: {
    show(popupKey, config) {
      const hidden = wx.getStorageSync('popupHidden') || {};
      if (hidden[popupKey]) {
        return;
      }
      
      this.setData({ 
        visible: true,
        neverShowKey: popupKey,
        config: config || {}
      });
    },

    hide() {
      this.setData({ visible: false });
    },

    onOverlayTap() {
      if (this.properties.config.closable !== false) {
        this.hide();
      }
    },

    onClose() {
      this.hide();
      this.triggerEvent('close');
    },

    noop() {},

    onConfirm() {
      const { config } = this.properties;
      
      if (config.buttonUrl) {
        wx.navigateTo({ url: config.buttonUrl });
      }
      
      this.hide();
      this.triggerEvent('confirm');
    },

    onNeverShow(e) {
      const checked = e.detail.value && e.detail.value.length > 0;
      if (checked) {
        const popupKey = this.data.neverShowKey;
        const hidden = wx.getStorageSync('popupHidden') || {};
        hidden[popupKey] = true;
        wx.setStorageSync('popupHidden', hidden);
        
        const lastShown = wx.getStorageSync('popupLastShown') || {};
        lastShown[popupKey] = Date.now();
        wx.setStorageSync('popupLastShown', lastShown);
      }
    }
  }
});
