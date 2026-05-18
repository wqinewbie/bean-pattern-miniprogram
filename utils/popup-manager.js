const request = require('./request');
const storage = require('./storage');

let currentPopup = null;
let popupComponent = null;

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
      const key = popup.key;
      if (hidden[key]) continue;

      if (popup.showInterval && popup.showInterval > 0) {
        const last = lastShown[key];
        if (last) {
          const intervalMs = popup.showInterval * 24 * 60 * 60 * 1000;
          if (now - last < intervalMs) continue;
        }
      }

      currentPopup = popup;
      if (popupComponent) {
        popupComponent.show(key, popup);
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
