const request = require('./request');
const storage = require('./storage');

let currentPopup = null;
let popupComponent = null;
const sessionShown = {};

function getPopupVersionKey(popup) {
  if (!popup) return '';
  const key = popup.key || popup.id || '';
  const version = [
    popup.title || '',
    popup.content || '',
    popup.imageUrl || popup.image_url || '',
    popup.buttonText || popup.button_text || '',
    popup.buttonUrl || popup.button_url || ''
  ].join('|');
  return key + ':' + version;
}

function getLegacyPopupVersionKey(popup) {
  if (!popup) return '';
  const key = popup.key || popup.id || '';
  const version = popup.updatedAt || popup.updated_at || popup.content || popup.title || '';
  return key + ':' + version;
}

function setPopupComponent(comp) {
  popupComponent = comp;
}

async function checkAndShowPopup() {
  const sessionId = storage.get(storage.KEYS.SESSION_ID, '');
  if (!sessionId) return;

  try {
    const popups = await request.get('/popup/active');
    if (!popups || !Array.isArray(popups) || popups.length === 0) return;

    const hidden = storage.getJSON(storage.KEYS.POPUP_HIDDEN, {});
    const lastShown = storage.getJSON(storage.KEYS.POPUP_LAST_SHOWN, {});
    const now = Date.now();

    for (const popup of popups) {
      const key = getPopupVersionKey(popup);
      const legacyKey = getLegacyPopupVersionKey(popup);
      if (hidden[key] || hidden[legacyKey]) continue;
      if (sessionShown[key]) continue;

      if (popup.showInterval && popup.showInterval > 0) {
        const last = lastShown[key] || lastShown[legacyKey];
        if (last) {
          const intervalMs = popup.showInterval * 24 * 60 * 60 * 1000;
          if (now - last < intervalMs) continue;
        }
      }

      currentPopup = popup;
      sessionShown[key] = Date.now();
      if (popupComponent) {
        popupComponent.show(popup.key, popup);
      }
      break;
    }
  } catch (e) {
    console.error('检查弹窗失败', e);
  }
}

function getCurrentPopup() {
  return currentPopup;
}

function closePopup() {
  if (popupComponent) {
    popupComponent.hide();
  }
  currentPopup = null;
}

module.exports = {
  setPopupComponent,
  checkAndShowPopup,
  getCurrentPopup,
  closePopup
};
