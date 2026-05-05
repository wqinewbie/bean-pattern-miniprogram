/**
 * 纯前端像素化处理（perler-beads-ai 方式）
 * 流程：Canvas采样 → 颜色匹配 → mappedPixelData → 渲染
 */
const request = require('../../utils/request');
const { isTempPath, isValidRemoteUrl, needsUpload, getPathType } = require('../../utils/path-helper');
const app = getApp();

Page({
  data: {
    isTimeout: false,
    loadingText: '正在处理...',
    // AI 模式参数
    prompt: '',
    style: '',
    size: 24,
    // 图片模式参数
    imageUrl: '',
    gridSize: 64,
    brand: 'MARD',
    colorCount: 0,
    mode: 'image', // 'ai' 或 'image'
    // 像素化模式参数
    pixelationMode: 'dominant', // 'dominant' | 'average'
    similarityThreshold: 0,
    mirrorOn: false,
  },

  _timeoutTimer: null,

  onLoad(options) {
    const mode = String((options && options.mode) || '').toLowerCase() === 'ai' ? 'ai' : 'image';
    this.setData({ mode });

    if (mode === 'ai') {
      // AI 文字生成模式
      const prompt = decodeURIComponent(options.prompt || '');
      const style = decodeURIComponent(options.style || '');
      const size = parseInt(options.size) || 24;
      this.setData({ prompt, style, size });
      this.startAiGenerate(prompt, style, size);
    } else {
      // 图片生成模式 - 纯前端处理
      const imageUrl = decodeURIComponent(options.imageUrl || '');
      const gridSize = parseInt(options.gridSize) || 64;
      const brand = decodeURIComponent(options.brand || 'MARD');
      const colorCount = parseInt(options.colorCount) || 0;
      const pixelationMode = decodeURIComponent(options.pixelationMode || 'dominant');
      const parsedThreshold = parseInt(options.similarityThreshold, 10);
      const similarityThreshold = Number.isNaN(parsedThreshold) ? 0 : parsedThreshold;
      const mirrorOn = String(options.mirrorOn || '0') === '1';
      const flowId = decodeURIComponent(options.flowId || '');
      
      this.setData({ 
        imageUrl, 
        gridSize, 
        brand, 
        colorCount,
        pixelationMode,
        similarityThreshold,
        mirrorOn
      });
      
      this.startImageGenerate(imageUrl, gridSize, brand, colorCount, pixelationMode, similarityThreshold, mirrorOn, flowId);
    }
  },

  onUnload() {
    clearTimeout(this._timeoutTimer);
  },

  preloadResultThenRedirect(targetUrl, resultToken) {
    const doRedirect = () => {
      wx.redirectTo({ url: targetUrl });
    };

    const app = getApp();
    const hasTokenData = () => {
      if (!resultToken) return true;
      const map = app && app.globalData ? (app.globalData.resultDataMap || {}) : {};

      const isUsableResultData = (data) => {
        if (!data || typeof data !== 'object') return false;
        const hasMapped = Array.isArray(data.mappedPixelData) && data.mappedPixelData.length > 0;
        const hasLegacy = Array.isArray(data.gridData) && data.gridData.length > 0;
        const hasRendered = !!(data.renderedPatternUrl || data.renderedResultUrl);
        return hasMapped || hasLegacy || hasRendered;
      };

      if (isUsableResultData(map[resultToken])) return true;
      try {
        const cached = wx.getStorageSync('resultData:' + resultToken);
        return isUsableResultData(cached);
      } catch (e) {
        return false;
      }
    };

    const waitTokenData = (maxWaitMs = 2000, stepMs = 20) => new Promise((resolve) => {
      if (hasTokenData()) {
        resolve(true);
        return;
      }
      let elapsed = 0;
      const timer = setInterval(() => {
        elapsed += stepMs;
        if (hasTokenData()) {
          clearInterval(timer);
          resolve(true);
          return;
        }
        if (elapsed >= maxWaitMs) {
          clearInterval(timer);
          resolve(false);
        }
      }, stepMs);
    });

    waitTokenData().then((ready) => {
      if (!ready) {
        // 数据未就绪时不跳转，继续停留在 generating 页
        this.setData({ loadingText: '正在准备结果页...' });
        setTimeout(() => this.preloadResultThenRedirect(targetUrl, resultToken), 180);
        return;
      }

      if (typeof wx.preloadPage !== 'function') {
        doRedirect();
        return;
      }

      try {
        wx.preloadPage({
          url: targetUrl,
          success: () => {
            setTimeout(doRedirect, 220);
          },
          fail: () => {
            doRedirect();
          }
        });
      } catch (e) {
        doRedirect();
      }
    });
  },

  // ========== AI 文字生成模式 ==========
  startAiGenerate(prompt, style, size) {
    this.setData({ loadingText: 'AI 正在施展魔法...' });

    this._timeoutTimer = setTimeout(() => {
      this.setData({ isTimeout: true });
    }, 30000);

    request.post('/bead/pattern-ai-text', {
      prompt, style, size
    })
      .then((data) => {
        clearTimeout(this._timeoutTimer);
        const mapped = (data && data.mappedPixelData) ? data.mappedPixelData : [];
        if (mapped.length) {
          request.post('/history/save', {
            sourceType: 'AI',
            brand: (data.brand || 'MARD'),
            colorCount: Number(data.colorCount || 0),
            name: 'AI记录#' + Date.now(),
            gridSize: Number(data.gridSize || size || 24),
            mappedPixelData: JSON.stringify(mapped),
            sourceUrl: data.originalUrl || data.sourceUrl || ''
          }).catch((err) => {
            console.warn('[generating-ai] 自动保存时光机失败，不影响结果页', err);
          });
        }
        wx.redirectTo({
          url: '/pages/result/result?resultUrl=' + encodeURIComponent(data.resultUrl || '') +
               '&patternUrl=' + encodeURIComponent(data.patternUrl || '') +
               '&colorStats=' + encodeURIComponent(data.colorStats || '')
        });
      })
      .catch((err) => {
        clearTimeout(this._timeoutTimer);
        if (err && err.message === 'PROFILE_INCOMPLETE') {
          wx.navigateBack({ delta: 1 });
          return;
        }
        wx.showModal({
          title: 'AI生成失败',
          content: (err && err.message) ? err.message : '请稍后重试',
          showCancel: false,
          success: () => wx.navigateBack({ delta: 1 })
        });
      });
  },

  // ========== 图片生成模式 - 纯前端处理 ==========
  startImageGenerate(imageUrl, gridSize, brand, colorCount, pixelationMode, similarityThreshold, mirrorOn, flowId) {
    this._flowId = flowId || this._flowId || '';
    this.setData({ loadingText: '正在采样图片...' });
    console.log('[generating:image] startImageGenerate', {
      flowId: flowId || '',
      imageUrl: imageUrl ? (String(imageUrl).slice(0, 80) + (String(imageUrl).length > 80 ? '...' : '')) : '',
      gridSize,
      brand,
      colorCount,
      pixelationMode,
      similarityThreshold,
      mirrorOn
    });

    const sessionId = wx.getStorageSync('sessionId') || '';

    // 60秒超时提示
    this._timeoutTimer = setTimeout(() => {
      this.setData({ isTimeout: true });
    }, 60000);

    // 如果开启镜像，先创建镜像图片
    const prepareImageForSampling = (imgUrl) => {
      if (mirrorOn) {
        console.log('[flow][generating] stage=mirror:start', {
          flowId: flowId || '',
          imgUrl
        });
        return this._createMirrorImage(imgUrl)
          .then((mirroredPath) => {
            console.log('[flow][generating] stage=mirror:done', {
              flowId: flowId || '',
              mirroredPath
            });
            return mirroredPath;
          })
          .catch((err) => {
            console.error('[flow][generating] stage=mirror:fail', err);
            return imgUrl; // 镜像失败时使用原图
          });
      }
      return Promise.resolve(imgUrl);
    };

    console.log('[flow][generating] stage=sample:start', {
      flowId: flowId || '',
      imageUrl,
      gridSize,
      mirrorOn
    });

    // 先准备图片（可能需要镜像），然后采样
    let _samplingImageUrl = imageUrl; // 保存镜像后的图片路径
    prepareImageForSampling(imageUrl)
      .then((samplingImageUrl) => {
        _samplingImageUrl = samplingImageUrl;
        return this._sampleImage(samplingImageUrl, gridSize, pixelationMode, false);
      })
      .then((rgbGrid) => {
        const rows = Array.isArray(rgbGrid) ? rgbGrid.length : 0;
        const cols = rows && Array.isArray(rgbGrid[0]) ? rgbGrid[0].length : 0;
        let sampleCell = null;
        if (rows && cols) {
          const c = rgbGrid[0][0];
          sampleCell = Array.isArray(c) ? `${c[0]},${c[1]},${c[2]}` : c;
        }
        console.log('[flow][generating] stage=sample:done', {
          flowId: flowId || '',
          rows,
          cols,
          sampleCell
        });
        this.setData({ loadingText: '匹配颜色...' });
        return this._matchColors(rgbGrid, brand, colorCount, pixelationMode);
      })
      .then((matchedGrid) => {
        const rows = Array.isArray(matchedGrid) ? matchedGrid.length : 0;
        const cols = rows && Array.isArray(matchedGrid[0]) ? matchedGrid[0].length : 0;
        const first = rows && cols ? matchedGrid[0][0] : null;
        console.log('[flow][generating] stage=match:done', {
          flowId: flowId || '',
          rows,
          cols,
          firstId: first && first.id,
          firstName: first && first.name,
          firstRgb: first ? `${first.r},${first.g},${first.b}` : ''
        });
        this.setData({ loadingText: '生成图案数据...' });
        return this._convertToMappedPixelData(matchedGrid);
      })
      .then((mappedResult) => {
        const mappedRows = mappedResult && mappedResult.mappedPixelData ? mappedResult.mappedPixelData.length : 0;
        const colorStatsLen = mappedResult && mappedResult.colorStats ? mappedResult.colorStats.length : 0;
        console.log('[flow][generating] stage=convert:done', {
          flowId: flowId || '',
          mappedRows,
          colorStatsLen
        });
        this.setData({ loadingText: '合并相近色号...' });
        return this._mergeSimilarMappedColors(mappedResult, similarityThreshold);
      })
      .then((mappedPixelData) => {
        const mappedRows = mappedPixelData && mappedPixelData.mappedPixelData ? mappedPixelData.mappedPixelData.length : 0;
        const colorStatsLen = mappedPixelData && mappedPixelData.colorStats ? mappedPixelData.colorStats.length : 0;
        console.log('[flow][generating] stage=merge:done', {
          flowId: flowId || '',
          mappedRows,
          colorStatsLen
        });
        this.setData({ loadingText: '正在渲染...' });
        return this._waitRenderReady(mappedPixelData, gridSize);
      })
      .then((rendered) => {
        console.log('[generating:image] render completed', {
          hasPatternUrl: !!(rendered && rendered.patternUrl),
          hasResultUrl: !!(rendered && rendered.resultUrl),
          patternUrlLen: rendered && rendered.patternUrl ? rendered.patternUrl.length : 0,
          resultUrlLen: rendered && rendered.resultUrl ? rendered.resultUrl.length : 0,
          colorStatsLen: rendered && rendered.colorStats ? rendered.colorStats.length : 0
        });
        clearTimeout(this._timeoutTimer);

        // 使用采样时的图片（如果开启了镜像，就是镜像后的图片）
        const sourceForSave = _samplingImageUrl || imageUrl;

        // 判断是否需要上传：只有临时路径需要上传，已经是 COS URL 的直接使用
        const shouldUpload = needsUpload(sourceForSave);
        const pathType = getPathType(sourceForSave);
        const isRemoteUrl = isValidRemoteUrl(sourceForSave);

        console.log('[generating] sourceForSave check', {
          sourceForSave: sourceForSave ? sourceForSave.slice(0, 100) : '',
          pathType,
          shouldUpload,
          isRemoteUrl
        });

        const uploadRawImage = shouldUpload
          ? this.uploadFile(sourceForSave, sessionId).catch((err) => {
              console.error('[generating] 上传原图到COS失败', {
                error: err,
                sourceForSave: sourceForSave ? sourceForSave.slice(0, 100) : '',
                pathType
              });
              // 上传失败时给用户提示
              wx.showToast({
                title: '原图上传失败，将无法查看历史记录',
                icon: 'none',
                duration: 3000
              });
              return ''; // 上传失败时返回空字符串，不使用临时路径
            })
          : Promise.resolve(isRemoteUrl ? sourceForSave : '');

        return uploadRawImage.then((uploadedSourceUrl) => {
          // 只使用上传后的 COS URL，不要 fallback 到临时路径
          const sourceUrl = uploadedSourceUrl || '';

          console.log('[generating] upload result', {
            uploadedSourceUrl: uploadedSourceUrl ? uploadedSourceUrl.slice(0, 100) : '',
            sourceUrl: sourceUrl ? sourceUrl.slice(0, 100) : '',
            isValidCosUrl: isValidRemoteUrl(sourceUrl)
          });
          const { gridData, colorPalette, rgbData } = this._convertToResultFormat(rendered.mappedPixelData, rendered.colorStats);

          // 原图已经在 generating.js 中通过像素级镜像处理完成，result 页面不需要再做镜像处理
          const mirrorOnForResult = false;

          const resultData = {
            id: 'BP' + Date.now().toString(36) + Math.random().toString(36).substr(2, 6).toUpperCase(),
            resultToken: 'RT' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10),
            gridSize: gridSize,
            brand: brand,
            pixelationMode: pixelationMode,
            similarityThreshold: similarityThreshold,
            mirrorOn: mirrorOnForResult,
            originalUrl: sourceUrl,
            sourceUrl: sourceUrl,
            mappedPixelData: rendered.mappedPixelData || [],
            colorStats: rendered.colorStats || [],
            gridData: gridData,
            colorPalette: colorPalette,
            rgbData: rgbData,
            renderedPatternUrl: rendered.patternUrl || '',
            renderedResultUrl: rendered.resultUrl || '',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };

          const savePayload = {
            sourceType: 'LOCAL',
            brand: brand,
            colorCount: (rendered.colorStats || []).length,
            name: '记录#' + Date.now(),
            gridSize: gridSize,
            mappedPixelData: JSON.stringify(rendered.mappedPixelData || []),
            sourceUrl: sourceUrl
          };

          request.post('/history/save', savePayload)
            .then((history) => {
              if (history && history.id) {
                resultData.historyId = history.id;
              }
            })
            .catch((err) => {
              console.warn('[generating] 自动保存时光机失败，不影响结果页', err);
            })
            .finally(() => {
              if (!app.globalData.resultDataMap) {
                app.globalData.resultDataMap = {};
              }
              app.globalData.resultDataMap[resultData.resultToken] = resultData;
              try {
                wx.setStorageSync('resultData:' + resultData.resultToken, resultData);
              } catch (e) {}
              app.globalData.pendingResultData = resultData;
              console.log('[generating:image] pendingResultData prepared', {
                resultToken: resultData.resultToken,
                hasHistoryId: !!resultData.historyId,
                historyId: resultData.historyId || null,
                hasRenderedPatternUrl: !!resultData.renderedPatternUrl,
                hasRenderedResultUrl: !!resultData.renderedResultUrl,
                mappedRows: (resultData.mappedPixelData || []).length
              });

              console.log('=== 纯前端处理完成 ===');
              console.log('gridSize:', gridSize);
              console.log('pixelationMode:', pixelationMode);
              console.log('colorCount:', rendered.colorStats.length);
              console.log('historyId:', resultData.historyId || null);

              if (resultData.historyId) {
                const targetUrl = '/pages/result/result?fromGlobal=1&historyId=' + resultData.historyId +
                  '&resultToken=' + encodeURIComponent(resultData.resultToken || '') +
                  '&sourceType=HISTORY' +
                  '&mirrorOn=' + (mirrorOnForResult ? '1' : '0');
                console.log('[generating:image] redirect -> result(history, preloaded)', {
                  targetUrl,
                  hasRenderedPatternUrlParam: !!resultData.renderedPatternUrl,
                  hasRenderedResultUrlParam: !!resultData.renderedResultUrl
                });
                this.preloadResultThenRedirect(targetUrl, resultData.resultToken);
              } else {
                const targetUrl = '/pages/result/result?fromGlobal=1&resultToken=' + encodeURIComponent(resultData.resultToken || '') + '&mirrorOn=' + (mirrorOnForResult ? '1' : '0');
                console.log('[generating:image] redirect -> result(global, preloaded)', { targetUrl });
                this.preloadResultThenRedirect(targetUrl, resultData.resultToken);
              }
            });
        });
      })
      .catch((err) => {
        clearTimeout(this._timeoutTimer);
        if (err && err.message === 'PROFILE_INCOMPLETE') {
          wx.navigateBack({ delta: 1 });
          return;
        }
        wx.showModal({
          title: '生成失败',
          content: (err && err.message) ? err.message : '请稍后重试',
          showCancel: false,
          success: () => wx.navigateBack({ delta: 1 })
        });
      });
  },

  // ========== 像素级镜像处理 ==========
  // 使用 canvasGetImageData + 像素反转 + canvasPutImageData 避免 canvas transform 白图问题
  _createMirrorImage(imagePath) {
    const canvasId = 'bead-mirror-canvas';
    
    return new Promise((resolve, reject) => {
      wx.getImageInfo({
        src: imagePath,
        success: (info) => {
          const w = info.width;
          const h = info.height;
          console.log('[flow][generating] _createMirrorImage getImageInfo', {
            flowId: this._flowId || '',
            width: w,
            height: h
          });
          
          // 绘制图片到 canvas
          const ctx = wx.createCanvasContext(canvasId);
          ctx.drawImage(info.path, 0, 0, w, h);
          ctx.draw(false, () => {
            // 获取像素数据
            wx.canvasGetImageData({
              canvasId: canvasId,
              x: 0,
              y: 0,
              width: w,
              height: h,
              success: (imgData) => {
                console.log('[flow][generating] _createMirrorImage getImageData', {
                  flowId: this._flowId || '',
                  dataLength: imgData.data.length
                });
                
                // 像素级水平镜像：反转每行的像素顺序
                const srcData = imgData.data;
                const mirroredData = new Uint8ClampedArray(srcData.length);
                
                for (let y = 0; y < h; y++) {
                  for (let x = 0; x < w; x++) {
                    // 原图的 x 位置，对应镜像后的 (w - 1 - x)
                    const srcIdx = (y * w + x) * 4;
                    const dstIdx = (y * w + (w - 1 - x)) * 4;
                    
                    mirroredData[dstIdx] = srcData[srcIdx];       // R
                    mirroredData[dstIdx + 1] = srcData[srcIdx + 1]; // G
                    mirroredData[dstIdx + 2] = srcData[srcIdx + 2]; // B
                    mirroredData[dstIdx + 3] = srcData[srcIdx + 3]; // A
                  }
                }
                
                // 放回像素数据
                wx.canvasPutImageData({
                  canvasId: canvasId,
                  x: 0,
                  y: 0,
                  width: w,
                  height: h,
                  data: mirroredData,
                  success: () => {
                    console.log('[flow][generating] _createMirrorImage putImageData success');
                    
                    // 导出镜像后的图片
                    wx.canvasToTempFilePath({
                      canvasId: canvasId,
                      x: 0,
                      y: 0,
                      width: w,
                      height: h,
                      destWidth: w,
                      destHeight: h,
                      success: (res) => {
                        wx.getFileInfo({
                          filePath: res.tempFilePath,
                          success: (fi) => {
                            console.log('[flow][generating] _createMirrorImage fileInfo', {
                              flowId: this._flowId || '',
                              size: fi.size,
                              digest: fi.digest
                            });
                          },
                          fail: (e) => {
                            console.error('[flow][generating] _createMirrorImage fileInfo fail', e);
                          }
                        });
                        resolve(res.tempFilePath);
                      },
                      fail: (err) => {
                        console.error('[flow][generating] _createMirrorImage export fail', err);
                        reject(err);
                      }
                    });
                  },
                  fail: (err) => {
                    console.error('[flow][generating] _createMirrorImage putImageData fail', err);
                    reject(err);
                  }
                });
              },
              fail: (err) => {
                console.error('[flow][generating] _createMirrorImage getImageData fail', err);
                reject(err);
              }
            });
          });
        },
        fail: (err) => {
          console.error('[flow][generating] _createMirrorImage getImageInfo fail', err);
          reject(err);
        }
      });
    });
  },

  // ========== Canvas 采样 ==========
  _sampleImage(imagePath, gridSize, mode, mirrorOn) {
    const SAMPLE_PX = 512;
    
    return new Promise((resolve, reject) => {
      wx.getImageInfo({
        src: imagePath,
        success: (info) => {
          console.log('[flow][generating] stage=sample:imageInfo', {
            flowId: this._flowId || '',
            imagePath,
            width: info.width,
            height: info.height,
            path: info.path
          });
          const ratio = info.width / info.height;
          let sampW, sampH;
          
          if (ratio >= 1) {
            sampW = SAMPLE_PX;
            sampH = Math.max(1, Math.round(SAMPLE_PX / ratio));
          } else {
            sampH = SAMPLE_PX;
            sampW = Math.max(1, Math.round(SAMPLE_PX * ratio));
          }
          
          // 创建采样画布
          const sCtx = wx.createCanvasContext('bead-sample-canvas');
          sCtx.drawImage(imagePath, 0, 0, sampW, sampH);
          sCtx.draw(false, () => {
            wx.canvasGetImageData({
              canvasId: 'bead-sample-canvas',
              x: 0, y: 0, width: sampW, height: sampH,
              success: (pd) => {
                try {
                  const pixelCount = Math.floor((pd && pd.data ? pd.data.length : 0) / 4);
                  let sumL = 0;
                  const step = Math.max(1, Math.floor(pixelCount / 2000));
                  for (let i = 0; i < pixelCount; i += step) {
                    const idx = i * 4;
                    const r = pd.data[idx] || 0;
                    const g = pd.data[idx + 1] || 0;
                    const b = pd.data[idx + 2] || 0;
                    sumL += (r + g + b) / 3;
                  }
                  const sampled = Math.ceil(pixelCount / step);
                  const avgL = sampled > 0 ? Math.round(sumL / sampled) : 0;
                  console.log('[flow][generating] stage=sample:imageData', {
                    flowId: this._flowId || '',
                    sampW,
                    sampH,
                    pixelCount,
                    avgL
                  });
                  // 根据模式采样（镜像已在 _createMirrorImage 中完成）
                  const rgbGrid = this._sampleGrid(pd.data, sampW, sampH, gridSize, mode);
                  resolve(rgbGrid);
                } catch (e) {
                  reject(e);
                }
              },
              fail: (err) => {
                console.error('[flow][generating] stage=sample:imageData:fail', {
                  flowId: this._flowId || '',
                  sampW,
                  sampH,
                  err
                });
                reject(err);
              }
            });
          });
        },
        fail: (err) => {
          console.error('[flow][generating] stage=sample:imageInfo:fail', {
            flowId: this._flowId || '',
            imagePath,
            err
          });
          reject(err);
        }
      });
    });
  },

  // 采样网格 - 支持 Dominant(众数) 和 Average(均值) 模式
  // 注意：镜像操作已在 _createMirrorImage 中通过像素级方式完成，这里不再处理
  _sampleGrid(data, sw, sh, gridSize, mode) {
    // 这里必须使用真实宽高比（不能取倒数），否则竖图会被错误拉成横图
    const aspect = sw / sh;
    let gw, gh;
    
    if (aspect >= 1) {
      gw = gridSize;
      gh = Math.max(1, Math.round(gridSize / aspect));
    } else {
      gh = gridSize;
      gw = Math.max(1, Math.round(gridSize * aspect));
    }
    
    const cw = sw / gw;
    const ch = sh / gh;
    const grid = [];

    for (let gy = 0; gy < gh; gy++) {
      const row = [];
      for (let gx = 0; gx < gw; gx++) {
        const x0 = Math.floor(gx * cw), x1 = Math.min(Math.ceil((gx+1)*cw), sw);
        const y0 = Math.floor(gy * ch), y1 = Math.min(Math.ceil((gy+1)*ch), sh);
        const pixels = [];

        for (let py = y0; py < y1; py++) {
          for (let px = x0; px < x1; px++) {
            const srcX = px; // 像素级坐标始终按原始顺序读取
            const i = (py * sw + srcX) * 4;
            const a = data[i + 3];
            if (a < 128) continue;
            pixels.push([data[i], data[i + 1], data[i + 2]]);
          }
        }

        if (!pixels.length) {
          row.push([255, 255, 255]);
          continue;
        }

        if (mode === 'dominant') {
          const colorCounts = {};
          let dominantRgb = null;
          let maxCount = 0;

          pixels.forEach((rgb) => {
            const key = rgb.join(',');
            colorCounts[key] = (colorCounts[key] || 0) + 1;
            if (colorCounts[key] > maxCount) {
              maxCount = colorCounts[key];
              dominantRgb = rgb;
            }
          });

          row.push(dominantRgb || [255, 255, 255]);
        } else {
          let rSum = 0, gSum = 0, bSum = 0;
          pixels.forEach((rgb) => {
            rSum += rgb[0];
            gSum += rgb[1];
            bSum += rgb[2];
          });
          const total = pixels.length;
          row.push(total > 0
            ? [Math.round(rSum / total), Math.round(gSum / total), Math.round(bSum / total)]
            : [255, 255, 255]);
        }
      }
      grid.push(row);
    }

    return grid;
  },

  _colorDistance(colorA, colorB) {
    const dr = Number(colorA.r || 0) - Number(colorB.r || 0);
    const dg = Number(colorA.g || 0) - Number(colorB.g || 0);
    const db = Number(colorA.b || 0) - Number(colorB.b || 0);
    return Math.sqrt(dr * dr + dg * dg + db * db);
  },

  _calcColorStats(mappedPixelData) {
    const colorStatsMap = {};

    for (let y = 0; y < mappedPixelData.length; y++) {
      const row = mappedPixelData[y] || [];
      for (let x = 0; x < row.length; x++) {
        const cell = row[x];
        if (!cell || cell.isExternal) continue;

        const id = cell.id;
        if (!colorStatsMap[id]) {
          colorStatsMap[id] = {
            id: id,
            name: cell.name,
            hex: cell.hex,
            r: cell.r,
            g: cell.g,
            b: cell.b,
            count: 0
          };
        }
        colorStatsMap[id].count++;
      }
    }

    return Object.values(colorStatsMap).sort((a, b) => b.count - a.count);
  },

  _mergeSimilarMappedColors(mappedResult, threshold) {
    return new Promise((resolve) => {
      const mappedPixelData = mappedResult && mappedResult.mappedPixelData ? mappedResult.mappedPixelData : [];
      const normalizedThreshold = Math.max(0, Math.min(100, Number(threshold || 0)));

      if (!mappedPixelData.length || normalizedThreshold <= 0) {
        resolve({
          mappedPixelData,
          colorStats: mappedResult && mappedResult.colorStats ? mappedResult.colorStats : this._calcColorStats(mappedPixelData)
        });
        return;
      }

      const colorCounts = {};
      const colorDataMap = {};

      mappedPixelData.forEach((row) => {
        (row || []).forEach((cell) => {
          if (!cell || cell.isExternal || !cell.id) return;
          colorCounts[cell.id] = (colorCounts[cell.id] || 0) + 1;
          if (!colorDataMap[cell.id]) {
            colorDataMap[cell.id] = {
              id: cell.id,
              name: cell.name,
              hex: cell.hex,
              r: cell.r,
              g: cell.g,
              b: cell.b
            };
          }
        });
      });

      const colorsByFrequency = Object.entries(colorCounts)
        .sort((a, b) => b[1] - a[1])
        .map((entry) => entry[0]);

      const mergedData = mappedPixelData.map((row) =>
        (row || []).map((cell) => Object.assign({}, cell, { isExternal: cell && cell.isExternal ? true : false }))
      );
      const replacedColors = {};
      let mergeCount = 0;

      for (let i = 0; i < colorsByFrequency.length; i++) {
        const currentId = colorsByFrequency[i];
        if (replacedColors[currentId]) continue;

        const currentColor = colorDataMap[currentId];
        if (!currentColor) continue;

        for (let j = i + 1; j < colorsByFrequency.length; j++) {
          const lowerFreqId = colorsByFrequency[j];
          if (replacedColors[lowerFreqId]) continue;

          const lowerFreqColor = colorDataMap[lowerFreqId];
          if (!lowerFreqColor) continue;

          const distance = this._colorDistance(currentColor, lowerFreqColor);
          if (distance < normalizedThreshold) {
            replacedColors[lowerFreqId] = true;
            mergeCount++;

            for (let y = 0; y < mergedData.length; y++) {
              const row = mergedData[y] || [];
              for (let x = 0; x < row.length; x++) {
                if (row[x] && row[x].id === lowerFreqId) {
                  row[x] = {
                    id: currentColor.id,
                    name: currentColor.name,
                    hex: currentColor.hex,
                    r: currentColor.r,
                    g: currentColor.g,
                    b: currentColor.b,
                    isExternal: false
                  };
                }
              }
            }
          }
        }
      }

      const colorStats = this._calcColorStats(mergedData);
      console.log('=== 全局相近色号合并 ===');
      console.log('threshold:', normalizedThreshold);
      console.log('mergedColorTypes:', mergeCount);
      console.log('colorStats.length:', colorStats.length);

      resolve({ mappedPixelData: mergedData, colorStats });
    });
  },

  // ========== 颜色匹配 ==========
  _matchColors(rgbGrid, brand, colorCount, mode) {
    return new Promise((resolve, reject) => {
      request.post('/bead/match-colors', {
        brand: brand.toLowerCase(),
        colorCount: Number(colorCount || 0),
        grid: rgbGrid,
        algo: mode === 'dominant' ? 'dominant' : 'standard',
        // 后端不再参与阈值量化，保留字段仅用于调试记录
        similarityThreshold: 0,
      })
        .then((res) => {
          // 从响应中提取 data 字段
          console.log('=== 颜色匹配响应 ===');
          console.log('response:', JSON.stringify(res).substring(0, 500));
          resolve(res.data || res);
        })
        .catch(reject);
    });
  },

  // ========== 转换为 mappedPixelData ==========
  _convertToMappedPixelData(matchedGrid) {
    return new Promise((resolve) => {
      console.log('=== _convertToMappedPixelData ===');
      console.log('matchedGrid:', matchedGrid);
      console.log('matchedGrid.length:', matchedGrid ? matchedGrid.length : 'null/undefined');
      
      if (!matchedGrid || !matchedGrid.length) {
        console.error('matchedGrid 为空!');
        resolve({ mappedPixelData: [], colorStats: [] });
        return;
      }
      
      const mappedData = [];
      const colorStatsMap = {};
      
      for (let y = 0; y < matchedGrid.length; y++) {
        const row = [];
        const matchedRow = matchedGrid[y];
        
        if (!matchedRow) {
          console.error('matchedRow 为空 at y:', y);
          continue;
        }
        
        for (let x = 0; x < matchedRow.length; x++) {
          const cell = matchedRow[x];
          if (!cell) continue;
          
          const colorObj = {
            id: cell.id || '',
            name: cell.name || cell.id || '',
            hex: this._rgbToHex(cell.r, cell.g, cell.b),
            r: cell.r,
            g: cell.g,
            b: cell.b,
            isExternal: false
          };
          row.push(colorObj);
          
          // 统计颜色
          const id = colorObj.id;
          if (!colorStatsMap[id]) {
            colorStatsMap[id] = {
              id: id,
              name: colorObj.name,
              hex: colorObj.hex,
              r: colorObj.r,
              g: colorObj.g,
              b: colorObj.b,
              count: 0
            };
          }
          colorStatsMap[id].count++;
        }
        mappedData.push(row);
      }
      
      // 转换为数组并排序
      const colorStats = Object.values(colorStatsMap).sort((a, b) => b.count - a.count);
      
      console.log('mappedData.length:', mappedData.length);
      console.log('colorStats.length:', colorStats.length);
      
      resolve({ mappedPixelData: mappedData, colorStats });
    });
  },

  // ========== 转换为 result.js 兼容格式 ==========
  _convertToResultFormat(mappedPixelData, colorStats) {
    const gridSize = mappedPixelData.length;
    
    // 构建 colorId -> index 映射（按频率排序后的顺序）
    const colorIdToIndex = {};
    colorStats.forEach((c, idx) => {
      colorIdToIndex[c.id] = idx;
    });
    
    // 构建 colorPalette 数组（按 colorStats 顺序）
    const colorPalette = colorStats.map(c => ({
      id: c.id,
      name: c.name,
      r: c.r,
      g: c.g,
      b: c.b,
      count: c.count
    }));
    
    // 构建 gridData（每个格子存储颜色索引）
    const gridData = [];
    const rgbData = [];
    
    for (let y = 0; y < gridSize; y++) {
      const gridRow = [];
      const rgbRow = [];
      
      for (let x = 0; x < mappedPixelData[y].length; x++) {
        const cell = mappedPixelData[y][x];
        const colorIndex = colorIdToIndex[cell.id] || 0;
        
        gridRow.push(colorIndex);
        rgbRow.push([cell.r, cell.g, cell.b]);
      }
      
      gridData.push(gridRow);
      rgbData.push(rgbRow);
    }
    
    return { gridData, colorPalette, rgbData };
  },

  // RGB转Hex
  _rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(function(x) {
      return ('0' + Math.max(0, Math.min(255, x)).toString(16)).slice(-2);
    }).join('').toUpperCase();
  },

  _ensureRenderedImage(path, kind) {
    if (path && typeof path === 'string' && path.length > 0) {
      return Promise.resolve(path);
    }
    return Promise.reject(new Error(kind + '渲染失败'));
  },

  _waitRenderReady(mappedPixelData, gridSize) {
    console.log('[generating:image] waitRenderReady start', {
      gridSize,
      rows: mappedPixelData && mappedPixelData.mappedPixelData ? mappedPixelData.mappedPixelData.length : (mappedPixelData || []).length
    });
    return this._renderPreview(mappedPixelData, gridSize)
      .then((rendered) => {
        console.log('[generating:image] waitRenderReady got render result', {
          hasPatternUrl: !!(rendered && rendered.patternUrl),
          hasResultUrl: !!(rendered && rendered.resultUrl)
        });
        return Promise.all([
          this._ensureRenderedImage(rendered && rendered.patternUrl, '色号图'),
          this._ensureRenderedImage(rendered && rendered.resultUrl, '效果图')
        ]).then(() => rendered);
      });
  },

  // ========== 渲染预览图 ==========
  _renderPreview(mappedPixelData, gridSize) {
    return new Promise((resolve) => {
      // 提高分辨率让色号文字更清晰
      const canvasSize = 600;
      // 使用实际的网格尺寸（非正方形图片会返回非正方形网格）
      const actualPixelData = mappedPixelData.mappedPixelData || mappedPixelData;
      const actualRows = actualPixelData.length;
      const actualCols = actualPixelData.length > 0 ? actualPixelData[0].length : 0;
      const cellSize = canvasSize / Math.max(actualRows, actualCols);
      const drawWidth = actualCols * cellSize;
      const drawHeight = actualRows * cellSize;
      const offsetX = (canvasSize - drawWidth) / 2;
      const offsetY = (canvasSize - drawHeight) / 2;
      
      console.log('=== 渲染预览图 ===');
      console.log('gridSize:', gridSize);
      console.log('actualRows:', actualRows, 'actualCols:', actualCols);
      console.log('cellSize:', cellSize);
      
      // 1. 渲染色号图
      const renderPattern = () => {
        return new Promise((resolvePattern) => {
          const patternCtx = wx.createCanvasContext('patternCanvas');
          
          // 固定正方形导出：白底+居中，避免非正方形尺寸被系统二次缩放
          patternCtx.setFillStyle('#ffffff');
          patternCtx.fillRect(0, 0, canvasSize, canvasSize);
          
          // 绘制每个格子
          for (let y = 0; y < actualRows; y++) {
            for (let x = 0; x < actualCols; x++) {
              const cell = actualPixelData[y] && actualPixelData[y][x];
              if (cell) {
                patternCtx.setFillStyle('rgb(' + cell.r + ',' + cell.g + ',' + cell.b + ')');
                patternCtx.fillRect(offsetX + x * cellSize + 0.5, offsetY + y * cellSize + 0.5, cellSize, cellSize);
              }
            }
          }
          
          // 绘制色号文字（降低条件，只要有空间就绘制）
          if (cellSize >= 5) {
            patternCtx.setTextAlign('center');
            patternCtx.setTextBaseline('middle');
            
            for (let y = 0; y < actualRows; y++) {
              for (let x = 0; x < actualCols; x++) {
                const cell = actualPixelData[y] && actualPixelData[y][x];
                if (cell) {
                  const lum = 0.299 * cell.r + 0.587 * cell.g + 0.114 * cell.b;
                  const textColor = lum > 140 ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.9)';
                  // 直接显示完整色码，如 P1, A11, C14
                  const text = cell.id || '';
                  
                  // 字体大小：格子宽度的一半，最多不超过 12
                  const fontSize = Math.min(Math.max(3, Math.floor(cellSize * 0.45)), 12);
                  patternCtx.setFontSize(fontSize);
                  patternCtx.setFillStyle(textColor);
                  patternCtx.fillText(text, offsetX + x * cellSize + cellSize / 2, offsetY + y * cellSize + cellSize / 2);
                }
              }
            }
          }
          
          let patternDone = false;
          const patternBackup = setTimeout(() => {
            console.log('pattern 备用超时触发');
            if (!patternDone) { patternDone = true; resolvePattern(''); }
          }, 5000);
          
          patternCtx.draw(false, () => {
            if (patternDone) return;
            patternDone = true;
            clearTimeout(patternBackup);
            wx.canvasToTempFilePath({
              canvasId: 'patternCanvas',
              x: 0, y: 0,
              width: canvasSize, height: canvasSize,
              destWidth: canvasSize, destHeight: canvasSize,
              success: (res) => {
                console.log('pattern 渲染成功:', res.tempFilePath);
                resolvePattern(res.tempFilePath);
              },
              fail: (err) => {
                console.error('pattern 渲染失败:', err);
                resolvePattern('');
              }
            });
          });
        });
      };
      
      // 2. 渲染效果图（纯色块，无文字）
      const renderResult = () => {
        return new Promise((resolveResult) => {
          const resultCtx = wx.createCanvasContext('resultCanvas');
          
          resultCtx.setFillStyle('#ffffff');
          resultCtx.fillRect(0, 0, canvasSize, canvasSize);
          
          for (let y = 0; y < actualRows; y++) {
            for (let x = 0; x < actualCols; x++) {
              const cell = actualPixelData[y] && actualPixelData[y][x];
              if (cell) {
                resultCtx.setFillStyle('rgb(' + cell.r + ',' + cell.g + ',' + cell.b + ')');
                resultCtx.fillRect(offsetX + x * cellSize + 0.5, offsetY + y * cellSize + 0.5, cellSize, cellSize);
              }
            }
          }
          
          let resultDone = false;
          const resultBackup = setTimeout(() => {
            console.log('result 备用超时触发');
            if (!resultDone) { resultDone = true; resolveResult(''); }
          }, 3000);
          
          resultCtx.draw(false, () => {
            if (resultDone) return;
            resultDone = true;
            clearTimeout(resultBackup);
            wx.canvasToTempFilePath({
              canvasId: 'resultCanvas',
              x: 0, y: 0,
              width: canvasSize, height: canvasSize,
              destWidth: canvasSize, destHeight: canvasSize,
              success: (res) => {
                console.log('result 渲染成功:', res.tempFilePath);
                resolveResult(res.tempFilePath);
              },
              fail: (err) => {
                console.error('result 渲染失败:', err);
                resolveResult('');
              }
            });
          });
        });
      };
      
      // 并行渲染
      Promise.all([renderPattern(), renderResult()])
        .then(([patternUrl, resultUrl]) => {
          // 重新计算颜色统计
          const colorStatsMap = {};
          for (let y = 0; y < actualPixelData.length; y++) {
            for (let x = 0; x < actualPixelData[y].length; x++) {
              const cell = actualPixelData[y][x];
              const id = cell.id;
              if (!colorStatsMap[id]) {
                colorStatsMap[id] = { ...cell, count: 0 };
              }
              colorStatsMap[id].count++;
            }
          }
          const colorStats = Object.values(colorStatsMap).sort((a, b) => b.count - a.count);
          
          resolve({ 
            mappedPixelData: actualPixelData, 
            colorStats, 
            patternUrl, 
            resultUrl 
          });
        });
    });
  },

  // ========== 文件上传（用于保存原图）==========
  uploadFile(filePath, sessionId) {
    const API_BASE_URL = require('../../utils/config').API_BASE_URL;
    console.log('[generating] uploadFile start', {
      filePath: filePath ? (String(filePath).slice(0, 100) + '...') : '',
      url: API_BASE_URL + '/api/image/upload'
    });
    return new Promise((resolve, reject) => {
      wx.uploadFile({
        url: API_BASE_URL + '/api/image/upload',
        filePath: filePath,
        name: 'file',
        header: { 'X-Session-Id': sessionId },
        success: (res) => {
          const raw = res && res.data ? String(res.data) : '';
          console.log('[generating] uploadFile response', {
            statusCode: res.statusCode,
            dataPreview: raw.slice(0, 200)
          });
          try {
            const body = JSON.parse(raw || '{}');
            if (res.statusCode === 200 && body.code === 0) {
              const cosUrl = body.data.imageUrl || body.data.originalUrl;
              console.log('[generating] uploadFile success, COS URL:', cosUrl);
              resolve(cosUrl);
              return;
            }
            const message = (body && body.message) ? body.message : ('HTTP ' + res.statusCode);
            console.error('[generating] uploadFile failed', { statusCode: res.statusCode, message, body });
            reject(new Error('[upload] ' + message));
          } catch (e) {
            console.error('[generating] uploadFile parse error', e);
            reject(new Error('[upload] HTTP ' + res.statusCode));
          }
        },
        fail: (err) => {
          console.error('[generating] uploadFile network fail', err);
          reject(new Error('[upload] ' + ((err && err.errMsg) || '上传失败')));
        }
      });
    });
  },

  onGoMyPatterns() {
    wx.redirectTo({ url: '/pages/my-patterns/my-patterns' });
  },

  onKeepWaiting() {
    this.setData({ isTimeout: false });
  },
});
