var _exportCapability = null;

function _detectCapability(canvas) {
  if (_exportCapability !== null) return _exportCapability;
  if (typeof wx.canvasToTempFilePath === 'function') {
    _exportCapability = 'wx-api';
  } else if (canvas && typeof canvas.toTempFilePath === 'function') {
    _exportCapability = 'canvas-method';
  } else {
    _exportCapability = 'none';
  }
  return _exportCapability;
}

function _doExport(canvas, params, componentInstance) {
  return new Promise((resolve, reject) => {
    const cap = _detectCapability(canvas);
    const wrappedParams = Object.assign({}, params, {
      success(res) {
        resolve(res.tempFilePath);
      },
      fail(err) {
        reject(err || new Error('export failed'));
      }
    });

    if (cap === 'wx-api') {
      wrappedParams.canvas = canvas;
      if (componentInstance) {
        wx.canvasToTempFilePath(wrappedParams, componentInstance);
      } else {
        wx.canvasToTempFilePath(wrappedParams);
      }
    } else if (cap === 'canvas-method') {
      canvas.toTempFilePath(wrappedParams);
    } else {
      reject(new Error('canvas export not supported'));
    }
  });
}

function exportCanvasToTempFilePath(canvas, options, componentInstance) {
  options = options || {};
  const width = Math.max(1, Math.floor(Number(options.width) || 1));
  const height = Math.max(1, Math.floor(Number(options.height) || 1));
  const sourceWidth = Math.max(1, Math.floor(Number(options.sourceWidth || options.width) || width));
  const sourceHeight = Math.max(1, Math.floor(Number(options.sourceHeight || options.height) || height));
  const fileType = options.fileType || 'png';
  const quality = options.quality == null ? 1 : Number(options.quality);
  const maxRetry = options.maxRetry != null ? Number(options.maxRetry) : 2;
  const retryDelay = options.retryDelay != null ? Number(options.retryDelay) : 100;
  const timeout = options.timeout != null ? Number(options.timeout) : 10000;

  if (!canvas) {
    return Promise.reject(new Error('canvas is null'));
  }

  var params = {
    x: 0,
    y: 0,
    width: sourceWidth,
    height: sourceHeight,
    destWidth: width,
    destHeight: height,
    fileType: fileType,
    quality: quality
  };

  function attempt(retry) {
    return new Promise(function (resolve, reject) {
      var done = false;
      var timer = setTimeout(function () {
        if (!done) {
          done = true;
          reject(new Error('export timeout'));
        }
      }, timeout);

      _doExport(canvas, params, componentInstance)
        .then(function (path) {
          if (!done) {
            done = true;
            clearTimeout(timer);
            resolve(path);
          }
        })
        .catch(function (err) {
          if (!done) {
            done = true;
            clearTimeout(timer);
            reject(err);
          }
        });
    }).catch(function (err) {
      var errMsg = err && (err.errMsg || err.message || '');
      if (errMsg === 'canvas export not supported') {
        throw err;
      }
      if (retry < maxRetry) {
        return new Promise(function (r) {
          setTimeout(r, retryDelay * (retry + 1));
        }).then(function () {
          return attempt(retry + 1);
        });
      }
      throw err;
    });
  }

  return attempt(0);
}

module.exports = {
  exportCanvasToTempFilePath: exportCanvasToTempFilePath
};
