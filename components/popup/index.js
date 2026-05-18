const storage = require('../../utils/storage');

Component({
  properties: {
    config: { type: Object, value: {} }
  },

  data: {
    visible: false,
    showNeverShow: true,
    neverShowKey: ''
  },

  methods: {
    show(popupKey, config) {
      const hidden = storage.getJSON(storage.KEYS.POPUP_HIDDEN, {});
      if (hidden[popupKey]) return;

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
        const hidden = storage.getJSON(storage.KEYS.POPUP_HIDDEN, {});
        hidden[popupKey] = true;
        storage.setJSON(storage.KEYS.POPUP_HIDDEN, hidden);

        const lastShown = storage.getJSON(storage.KEYS.POPUP_LAST_SHOWN, {});
        lastShown[popupKey] = Date.now();
        storage.setJSON(storage.KEYS.POPUP_LAST_SHOWN, lastShown);
      }
    }
  }
});
