const REVIEW_TASK_RESULT_TEMPLATE_ID = 'WLmanAkxOdW1QNOdPXLETDIRSLtDcBEftzFAE8c2DY';

function requestReviewTaskResultSubscribe() {
  if (!wx.requestSubscribeMessage) {
    return Promise.resolve({ supported: false });
  }
  return new Promise((resolve) => {
    wx.requestSubscribeMessage({
      tmplIds: [REVIEW_TASK_RESULT_TEMPLATE_ID],
      success: (res) => resolve(res || {}),
      fail: (err) => {
        console.warn('[subscribe][review-task] request failed', err);
        resolve({ failed: true, errMsg: err && err.errMsg });
      }
    });
  });
}

module.exports = {
  REVIEW_TASK_RESULT_TEMPLATE_ID,
  requestReviewTaskResultSubscribe
};
