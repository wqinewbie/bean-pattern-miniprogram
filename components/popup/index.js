const storage = require('../../utils/storage');

function getPopupVersionKey(popupKey, config) {
  const version = config ? [
    config.title || '',
    config.content || '',
    config.imageUrl || config.image_url || '',
    config.buttonText || config.button_text || '',
    config.buttonUrl || config.button_url || ''
  ].join('|') : '';
  return popupKey + ':' + version;
}

function getLegacyPopupVersionKey(popupKey, config) {
  const version = (config && (config.updatedAt || config.updated_at || config.content || config.title)) || '';
  return popupKey + ':' + version;
}

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
      const versionKey = getPopupVersionKey(popupKey, config || {});
      const legacyKey = getLegacyPopupVersionKey(popupKey, config || {});
      if (hidden[versionKey] || hidden[legacyKey]) return;

      this.setData({
        visible: true,
        neverShowKey: versionKey,
        config: config || {}
      });
    },

    hide() {
      const popupKey = this.data.neverShowKey;
      if (popupKey) {
        const lastShown = storage.getJSON(storage.KEYS.POPUP_LAST_SHOWN, {});
        lastShown[popupKey] = Date.now();
        storage.setJSON(storage.KEYS.POPUP_LAST_SHOWN, lastShown);
      }
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
