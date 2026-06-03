const request = require('../../utils/request');
const { ensureProfileComplete } = require('../../utils/profile-guard');
const { getSafeAreaLayout } = require('../../utils/safe-area');
const storage = require('../../utils/storage');
const { drawPatternWithAxes } = require('../../utils/pattern-canvas');
const colorMatcher = require('../../utils/color-matcher');
const { renderResult } = require('../../utils/canvas2d/renderers/resultRenderer');
const { waitCanvas2dReady } = require('../../utils/canvas2d/controller');
const { init2dCanvas, resize2dCanvas } = require('../../utils/canvas2d/core');
const { exportCanvasToTempFilePath } = require('../../utils/canvas2d/export');
const { previewSize, patternBoardSize, resultExportSize, patternExportSize, previewExportSize } = require('../../utils/canvas2d/size-strategies');
const { isTempPath, isValidRemoteUrl, needsUpload, getPathType } = require('../../utils/path-helper');
const { generatePatternName } = require('../../utils/name-helper');
const { getWatermarkConfig } = require('../../utils/watermark-helper');
const { showCapacityFullIfNeeded, showRequestErrorToast } = require('../../utils/capacity-toast');

const PATTERN_EXPORT_MODE = '2d'; // 可选: 'legacy' | '2d'

// Canvas 2D 缓存
const canvasCache = {};

// 获取 Canvas 2D 实例的辅助函数
async function getCanvas2d(pageInstance, canvasId, width, height) {
  const targetWidth = Math.max(1, Math.floor(Number(width) || 1));
  const targetHeight = Math.max(1, Math.floor(Number(height) || 1));
  if (canvasCache[canvasId]) {
    const cached = canvasCache[canvasId];
    if (cached.width !== targetWidth || cached.height !== targetHeight) {
      resize2dCanvas({ canvas: cached.canvas, ctx: cached.ctx, width: targetWidth, height: targetHeight, dpr: cached.dpr });
      cached.width = targetWidth;
      cached.height = targetHeight;
    }
    return canvasCache[canvasId];
  }

  const { canvas, ctx, dpr } = await init2dCanvas(pageInstance, '#' + canvasId);
  resize2dCanvas({ canvas, ctx, width: targetWidth, height: targetHeight, dpr });

  const result = { canvas, ctx, dpr, width: targetWidth, height: targetHeight };
  canvasCache[canvasId] = result;
  return result;
}

/**
 * 上传本地临时图片到服务器 COS，返回公开 URL。
 * 如果已经是远程 COS URL，直接返回；如果是临时路径，上传后返回 COS URL。
 * 上传失败时返回空字符串，确保只有 COS URL 才会被保存。
 */
function uploadImageIfNeeded(url) {
  console.log('[result] uploadImageIfNeeded 接收到的参数', {
    'url': url,
    'url.length': url ? url.length : 0,
    'typeof url': typeof url
  });

  return new Promise((resolve) => {
    const shouldUpload = needsUpload(url);
    const isRemoteUrl = isValidRemoteUrl(url);
    const pathType = getPathType(url);

    console.log('[result] uploadImageIfNeeded check', {
      url: url ? url.slice(0, 100) : '',
      pathType,
      shouldUpload,
      isRemoteUrl
    });

    // 如果已经是有效的远程 URL（COS URL），直接返回
    if (isRemoteUrl && !shouldUpload) {
      resolve(url);
      return;
    }

    // 如果不需要上传也不是远程 URL，返回空字符串
    if (!shouldUpload) {
      resolve('');
      return;
    }

    // 上传临时文件到 COS
    console.log('[result] uploadImageIfNeeded start upload');

    request.uploadImage(url)
      .then(data => {
        const cosUrl = data.imageUrl || data.originalUrl || '';
        console.log('[result] uploadImageIfNeeded success, COS URL:', cosUrl);
        resolve(cosUrl);
      })
      .catch(err => {
        console.error('[result] uploadImageIfNeeded failed', err);
        resolve('');
      });
  });
}

Page({
  data: {
    // 旧参数（兼容）
    taskId: null,
    originalUrl: '',
    resultUrl: '',
    patternUrl: '',
    colorStats: [],
    // 新参数
    boxId: null,
    historyId: null,
    sourceType: '', // BOX, HISTORY, LOCAL, AI, DRAW, EDIT
    // 核心数据
    gridSize: 64,
    mappedPixelData: [],
    gridData: [],
    colorPalette: [],
    totalBeads: 0,
    // 效果图数据
    rgbData: [],
    rgbWidth: 0,
    rgbHeight: 0,
    // UI状态
    activeTab: 'original',
    mirrorOn: false,
    mirroredOriginalUrl: '',
    warmedOriginalUrl: '',
    saving: false,
    isSaved: false,
    currentPreviewUrl: '',
    savingToAlbum: false, // 保存至相册按钮加载状态
    savingToBox: false,
    currentSize: 64,
    brandName: 'MARD',
    colorCount: 0,
    navTop: 88,
    showNameModal: false,
    patternNameInput: '',
    hasPatternData: false,
    // 水印配置
    watermarkConfig: null,
    appName: '', // 小程序名称（显示在色号图顶部）
    isVip: false, // 是否VIP
    canCustomizeWatermark: false, // 是否可以自定义水印
    renderedPatternUrl: '', // 预渲染的色号图URL
    renderedResultUrl: '', // 预渲染的效果图URL
    // 加载状态
    isHydrated: false, // 页面核心数据是否已就绪（就绪前不渲染内容区，避免空态闪烁）
    hasRgbData: false,
    resultRendered: false, // 效果图是否已渲染
    patternRendered: false, // 色号图是否已渲染

    // 2D Canvas
    canvas2dReadyMap: {},

    // 结果页内置生成遮罩
    showGeneratingOverlay: false,
    generatingLoadingText: '正在处理...',
    generatingTimeout: false,
    generatingMode: '',
    resultInitialLoading: false,
  },

  onLoad(options) {
    console.log('=== result.js onLoad ===');
    console.log('options:', options);
    console.log('[result] onLoad route flags', {
      fromGlobal: options && options.fromGlobal,
      fromPatternBox: options && options.fromPatternBox,
      boxId: options && options.boxId,
      historyId: options && options.historyId,
      draftId: options && options.draftId,
      hasRenderedPatternParam: !!(options && options.renderedPatternUrl),
      hasRenderedResultParam: !!(options && options.renderedResultUrl)
    });
    this._resultRenderInFlight = false;
    this.loadWatermarkConfig();
    
    const layout = getSafeAreaLayout();
    this.setData({ navTop: layout.navTop });

    const generateNow = String((options && options.generateNow) || '0') === '1';
    const fromPatternBox = String((options && options.fromPatternBox) || '0') === '1';
    if (fromPatternBox) {
      this.setData({
        resultInitialLoading: true,
        generatingLoadingText: '正在打开图纸...',
        isHydrated: false,
      });
    }
    const mode = String((options && options.mode) || '').toLowerCase();
    if (generateNow && (mode === 'ai' || mode === 'image')) {
      this.startGenerateFlow(options);
      return;
    }

    const {
      taskId, originalUrl, resultUrl, patternUrl, colorStats,
      gridSize, brand, colorCount,
      boxId, historyId, draftId, sourceType,
      gridData, colorPalette, rgbData,
      renderedPatternUrl, renderedResultUrl,  // 预渲染好的图片
      storageKey,  // 从本地存储读取的 key
      fromGlobal,
      resultToken,
      mirrorOn: mirrorOnOption
    } = options;

    // 保存预渲染图片到 data
    const preRenderedPattern = renderedPatternUrl ? decodeURIComponent(renderedPatternUrl) : '';
    const preRenderedResult = renderedResultUrl ? decodeURIComponent(renderedResultUrl) : '';
    
    // 保存从 URL 传递的参数（用于沉浸模式）
    const urlOriginalUrl = originalUrl ? decodeURIComponent(originalUrl) : '';
    const urlColorStats = colorStats ? decodeURIComponent(colorStats) : '';
    const mirrorOn = String(mirrorOnOption || '0') === '1';
    const routeResultToken = resultToken ? decodeURIComponent(resultToken) : '';

    // 优先读取全局内存数据（generating 已经准备好的完整结果）
    const app = getApp();
    const globalMap = app && app.globalData ? (app.globalData.resultDataMap || {}) : {};
    const mapDataByToken = routeResultToken ? globalMap[routeResultToken] : null;
    let storageDataByToken = null;
    if (routeResultToken && !mapDataByToken) {
      try {
        storageDataByToken = storage.getJSON('resultData:' + routeResultToken, null);
      } catch (e) {
        storageDataByToken = null;
      }
    }
    const pendingData = app && app.globalData ? app.globalData.pendingResultData : null;
    const pendingResultToken = pendingData && pendingData.resultToken ? String(pendingData.resultToken) : '';
    const pendingTokenMatched = !!(routeResultToken && pendingResultToken && pendingResultToken === routeResultToken);
    const globalData = mapDataByToken || storageDataByToken || (pendingTokenMatched ? pendingData : null);
    const globalResultToken = globalData && globalData.resultToken ? String(globalData.resultToken) : '';
    const canUseGlobalData = !!globalData && (
      (routeResultToken && globalResultToken && globalResultToken === routeResultToken) ||
      (!routeResultToken && !!fromGlobal) ||
      (!routeResultToken && historyId && globalData.historyId && String(globalData.historyId) === String(historyId)) ||
      (!routeResultToken && boxId && globalData.boxId && String(globalData.boxId) === String(boxId)) ||
      (!routeResultToken && draftId && globalData.draftId && String(globalData.draftId) === String(draftId))
    );

    // 从 generating 过来且内存数据可用：直接加载完整数据，不先进入任何过渡态
    if (canUseGlobalData) {
      if (globalData.mirrorOn === undefined) {
        globalData.mirrorOn = mirrorOn;
      }
      console.log('[result] load from global memory branch', {
        fromGlobal: !!fromGlobal,
        routeResultToken: routeResultToken || null,
        globalResultToken: globalResultToken || null,
        routeHistoryId: historyId || null,
        globalHistoryId: globalData.historyId || null,
        hasRenderedPatternUrl: !!globalData.renderedPatternUrl,
        hasRenderedResultUrl: !!globalData.renderedResultUrl,
        hasMappedData: !!(globalData.mappedPixelData && globalData.mappedPixelData.length)
      });
      this.loadDataFromMemory(globalData);
      if (routeResultToken && app && app.globalData) {
        if (!app.globalData.resultDataMap) app.globalData.resultDataMap = {};
        app.globalData.resultDataMap[routeResultToken] = globalData;
      }
      return;
    }

    // 带 resultToken 的请求必须命中同 token 的内存数据；未命中时轮询等待，减少跳转瞬间的竞态
    if (routeResultToken && !canUseGlobalData) {
      console.warn('[result] resultToken provided but no in-memory match, start waiting', {
        routeResultToken,
        fromGlobal: !!fromGlobal,
        historyId: historyId || null
      });
      this.setData({ mirrorOn, isHydrated: false });
      this._waitResultDataByToken(routeResultToken, 3200, 40)
        .then((retryData) => {
          if (retryData) {
            if (retryData.mirrorOn === undefined) retryData.mirrorOn = mirrorOn;
            this.loadDataFromMemory(retryData);
            return;
          }

          if (boxId || historyId || draftId) {
            this.loadDataFromServer(boxId, historyId, draftId, options, preRenderedPattern, preRenderedResult, urlOriginalUrl, urlColorStats);
          } else {
            this.loadDataFromUrl(options);
          }
        });
      return;
    }

    // 非 generating 直出路径才进入未就绪态
    this.setData({ mirrorOn, isHydrated: false });

    // 如果有 boxId, historyId 或 draftId，调用接口获取完整数据
    if (boxId || historyId || draftId) {
      console.log('[result] load from server branch', { boxId, historyId, draftId });
      this.loadDataFromServer(boxId, historyId, draftId, options, preRenderedPattern, preRenderedResult, urlOriginalUrl, urlColorStats);
      return;
    }

    // 否则使用 URL 参数中的数据（生成页面跳转过来的情况）
    console.log('[result] load from url branch');
    this.loadDataFromUrl(options);
  },

  _waitResultDataByToken(resultToken, maxWaitMs = 3200, stepMs = 40) {
    const isUsableResultData = (data) => {
      if (!data || typeof data !== 'object') return false;
      const hasMapped = Array.isArray(data.mappedPixelData) && data.mappedPixelData.length > 0;
      const hasLegacy = Array.isArray(data.gridData) && data.gridData.length > 0;
      const hasRendered = !!(data.renderedPatternUrl || data.renderedResultUrl);
      return hasMapped || hasLegacy || hasRendered;
    };

    const readByToken = () => {
      const app = getApp();
      const map = app && app.globalData ? (app.globalData.resultDataMap || {}) : {};
      const mapData = map[resultToken];
      if (isUsableResultData(mapData)) return mapData;

      try {
        const storageData = storage.getJSON('resultData:' + resultToken, null);
        if (isUsableResultData(storageData)) return storageData;
      } catch (e) {}

      const pending = app && app.globalData ? app.globalData.pendingResultData : null;
      const pendingToken = pending && pending.resultToken ? String(pending.resultToken) : '';
      if (pendingToken === resultToken && isUsableResultData(pending)) {
        return pending;
      }

      return null;
    };

    return new Promise((resolve) => {
      const direct = readByToken();
      if (direct) {
        resolve(direct);
        return;
      }

      let elapsed = 0;
      const timer = setInterval(() => {
        elapsed += stepMs;
        const data = readByToken();
        if (data) {
          clearInterval(timer);
          resolve(data);
          return;
        }
        if (elapsed >= maxWaitMs) {
          clearInterval(timer);
          resolve(null);
        }
      }, stepMs);
    });
  },

  _applyResultData(payload) {
    const {
      meta = {},
      core = {},
      ui = {},
      render = {}
    } = payload || {};

    console.log('[result] _applyResultData 开始', {
      'ui.originalUrl': ui.originalUrl,
      'ui.originalUrl.length': ui.originalUrl ? ui.originalUrl.length : 0,
      'ui.currentPreviewUrl': ui.currentPreviewUrl,
      'ui.currentPreviewUrl.length': ui.currentPreviewUrl ? ui.currentPreviewUrl.length : 0
    });

    const hasPatternData = !!core.hasPatternData;
    const hasMappedData = !!core.hasMappedData;
    const hasRgbData = !!core.hasRgbData;
    const hasAnyPattern = hasPatternData || hasMappedData;

    const needsResultRender = hasRgbData && !ui.renderedResultUrl;
    const needsPatternRender = hasAnyPattern && !ui.renderedPatternUrl;
    const keepGeneratingOverlay = !!this._holdOverlayUntilRendered && (needsResultRender || needsPatternRender);
    this._overlayWaitForResult = keepGeneratingOverlay && needsResultRender;
    this._overlayWaitForPattern = keepGeneratingOverlay && needsPatternRender;
    if (!keepGeneratingOverlay) {
      this._holdOverlayUntilRendered = false;
    }

    this.setData({
      boxId: meta.boxId || null,
      historyId: meta.historyId || null,
      draftId: meta.draftId || null,
      sourceType: meta.sourceType || 'LOCAL',
      isSaved: !!meta.boxId,
      mirrorOn: !!meta.mirrorOn,

      gridSize: core.gridSize,
      mappedPixelData: core.mappedPixelData,
      gridData: core.gridData,
      colorPalette: core.colorPalette,
      colorStats: core.colorStats,
      rgbData: core.rgbData,
      colorCount: core.colorCount,
      totalBeads: core.totalBeads,
      hasPatternData: hasAnyPattern,
      hasRgbData,

      originalUrl: ui.originalUrl || '',
      warmedOriginalUrl: '',
      currentPreviewUrl: ui.currentPreviewUrl || '',
      activeTab: ui.activeTab || 'original',
      currentSize: ui.currentSize || core.gridSize,
      brandName: ui.brandName || 'MARD',
      renderedPatternUrl: ui.renderedPatternUrl || '',
      renderedResultUrl: ui.renderedResultUrl || '',
      resultRendered: !!ui.resultRendered,
      patternRendered: !!ui.patternRendered,

      isHydrated: true,
      resultInitialLoading: false,
      showGeneratingOverlay: keepGeneratingOverlay,
      generatingTimeout: keepGeneratingOverlay ? this.data.generatingTimeout : false,
    });

    // 验证 setData 后 this.data.originalUrl 是否被正确设置
    console.log('[result] _applyResultData - 验证 setData 后的 originalUrl:', {
      'this.data.originalUrl': this.data.originalUrl,
      'this.data.originalUrl.length': this.data.originalUrl ? this.data.originalUrl.length : 0,
      'ui.originalUrl': ui.originalUrl,
      'ui.originalUrl.length': ui.originalUrl ? ui.originalUrl.length : 0,
      '是否一致': this.data.originalUrl === ui.originalUrl
    });

    if (keepGeneratingOverlay) {
      this._holdOverlayUntilRendered = false;
      setTimeout(() => {
        if (this.data.showGeneratingOverlay) {
          this._finishGeneratingOverlay();
        }
      }, 120);
    }

    if (render.autoRender) {
      this._pendingRenderCount = (hasRgbData ? 1 : 0) + (hasAnyPattern ? 1 : 0);
      console.log('[result][overlay] autoRender pending init', {
        pending: this._pendingRenderCount,
        hasRgbData,
        hasAnyPattern,
        keepOverlay: keepGeneratingOverlay
      });
      setTimeout(() => {
        if (hasRgbData) this._ensureResultCanvasReady(!!render.forceRender);
      }, render.delay || 80);
    } else {
      this._pendingRenderCount = 0;
      console.log('[result][overlay] no autoRender, pending reset to 0');
    }

    this._warmOriginalImage(ui.originalUrl || '');
    if (meta.mirrorOn && ui.originalUrl) {
      this.ensureMirroredOriginalUrl(ui.originalUrl, (mirrored) => {
        if (!mirrored) return;
        const update = { mirroredOriginalUrl: mirrored };
        if (this.data.activeTab === 'original') {
          update.currentPreviewUrl = mirrored;
        }
        this.setData(update);
      });
    }
    if (render.generatePatternPreview && hasAnyPattern) {
      setTimeout(() => this.generatePatternPreviewImage(true), render.previewDelay || 80);
    }
  },

  _warmOriginalImage(url) {
    if (!url || typeof url !== 'string') return;
    if (this.data.warmedOriginalUrl) return;
    if (this._warmingOriginal) return;

    this._warmingOriginal = true;

    if (!/^https?:\/\//i.test(url)) {
      this.setData({ warmedOriginalUrl: url });
      this._warmingOriginal = false;
      return;
    }

    wx.downloadFile({
      url,
      success: (res) => {
        const localPath = (res && res.statusCode === 200 && res.tempFilePath) ? res.tempFilePath : '';
        if (localPath) {
          this.setData({ warmedOriginalUrl: localPath });
        }
      },
      complete: () => {
        this._warmingOriginal = false;
      }
    });
  },

  loadDataFromMemory(data) {
    this._traceFlow('loadDataFromMemory:start', {
      hasData: !!data,
      hasMapped: !!(data && data.mappedPixelData && data.mappedPixelData.length),
      hasGrid: !!(data && data.gridData && data.gridData.length),
      hasPalette: !!(data && data.colorPalette && data.colorPalette.length),
      hasRgb: !!(data && data.rgbData && data.rgbData.length)
    });
    console.log('[result] loadDataFromMemory 开始', {
      hasData: !!data,
      'originalUrl': data && data.originalUrl,
      'originalUrl.length': data && data.originalUrl ? data.originalUrl.length : 0,
      'sourceUrl': data && data.sourceUrl,
      'sourceUrl.length': data && data.sourceUrl ? data.sourceUrl.length : 0
    });

    if (!data) {
      this.setData({ isHydrated: true });
      wx.showToast({ title: '数据加载失败', icon: 'none' });
      return;
    }

    const parsedMappedPixelData = data.mappedPixelData || [];
    let parsedGridData = data.gridData || [];
    let parsedColorPalette = data.colorPalette || [];
    let parsedRgbData = data.rgbData || [];

    if (parsedMappedPixelData.length && (!parsedGridData.length || !parsedColorPalette.length)) {
      const derived = this._deriveLegacyFromMapped(parsedMappedPixelData);
      parsedGridData = derived.gridData;
      parsedColorPalette = derived.colorPalette;
      parsedRgbData = derived.rgbData;
    }

    const gridSize = data.gridSize || 64;
    const hasPatternData = parsedGridData.length > 0 && parsedColorPalette.length > 0;
    const hasMappedData = parsedMappedPixelData.length > 0;
    const hasRgbData = parsedRgbData.length > 0;
    const totalBeads = parsedColorPalette.reduce((a, c) => a + (c.count || 0), 0);

    let activeTab = 'original';
    if (hasRgbData) activeTab = 'result';
    else if (hasPatternData || hasMappedData) activeTab = 'pattern';

    const memSourceType = data.sourceType || 'LOCAL';

    this._applyResultData({
      meta: {
        boxId: data.boxId || null,
        historyId: data.historyId || null,
        draftId: data.draftId || null,
        sourceType: memSourceType,
        mirrorOn: !!data.mirrorOn
      },
      core: {
        gridSize,
        mappedPixelData: parsedMappedPixelData,
        gridData: parsedGridData,
        colorPalette: parsedColorPalette,
        colorStats: data.colorStats || parsedColorPalette,
        rgbData: parsedRgbData,
        colorCount: data.colorCount || parsedColorPalette.length,
        totalBeads,
        hasPatternData,
        hasMappedData,
        hasRgbData
      },
      ui: {
        originalUrl: data.originalUrl || data.sourceUrl || '',
        currentPreviewUrl: data.originalUrl || data.sourceUrl || '',
        activeTab,
        currentSize: gridSize,
        brandName: (data.brand || 'MARD').toUpperCase(),
        renderedPatternUrl: data.renderedPatternUrl || '',
        renderedResultUrl: data.renderedResultUrl || '',
        resultRendered: !!(data.renderedResultUrl || !hasRgbData),
        patternRendered: !!(data.renderedPatternUrl || !(hasPatternData || hasMappedData))
      },
      render: {
        autoRender: hasRgbData || hasPatternData || hasMappedData,
        generatePatternPreview: hasPatternData || hasMappedData
      }
    });
  },

  // 从接口加载数据
  loadDataFromServer(boxId, historyId, draftId, options, preRenderedPattern, preRenderedResult, urlOriginalUrl, urlColorStats) {
    const sourceType = options.sourceType || (boxId ? 'BOX' : (historyId ? 'HISTORY' : 'DRAFT'));
    let apiUrl = '';
    
    if (boxId) {
      apiUrl = '/box/detail/' + boxId;
    } else if (historyId) {
      apiUrl = '/history/detail/' + historyId;
    } else if (draftId) {
      apiUrl = '/draft/detail/' + draftId;
    }
    
    console.log('=== 从接口加载数据 ===', apiUrl);
    console.log('预渲染图片:', preRenderedPattern, preRenderedResult);
    
    request.get(apiUrl)
      .then((data) => {
        console.log('接口返回数据:', data);
        if (!data) {
          this.setData({ isHydrated: true, resultInitialLoading: false });
          wx.showToast({ title: '数据加载失败', icon: 'none' });
          return;
        }
        
        // 解析数据
        let parsedGridData = [];
        let parsedColorPalette = [];
        let parsedRgbData = [];
        let parsedMappedPixelData = [];
        
        try {
          if (data.mappedPixelData) {
            parsedMappedPixelData = typeof data.mappedPixelData === 'string'
              ? JSON.parse(data.mappedPixelData)
              : data.mappedPixelData;
          }
          if (data.gridData) {
            parsedGridData = typeof data.gridData === 'string' 
              ? JSON.parse(data.gridData) 
              : data.gridData;
          }
          if (data.colorPalette) {
            parsedColorPalette = typeof data.colorPalette === 'string' 
              ? JSON.parse(data.colorPalette) 
              : data.colorPalette;
          }
          if (data.rgbData) {
            parsedRgbData = typeof data.rgbData === 'string' 
              ? JSON.parse(data.rgbData) 
              : data.rgbData;
          }
        } catch (e) {
          console.error('解析数据失败:', e);
        }

        if (parsedMappedPixelData.length && (!parsedGridData.length || !parsedColorPalette.length)) {
          const derived = this._deriveLegacyFromMapped(parsedMappedPixelData);
          parsedGridData = derived.gridData;
          parsedColorPalette = derived.colorPalette;
          parsedRgbData = derived.rgbData;
        }
        
        // 同时设置 colorStats（兼容沉浸模式）
        let parsedColorStats = parsedColorPalette;
        
        const gridSize = data.gridSize || 64;
        const hasPatternData = parsedGridData.length > 0 && parsedColorPalette.length > 0;
        const hasMappedData = parsedMappedPixelData.length > 0;
        const hasRgbData = parsedRgbData.length > 0;
        
        // 计算 rgb 尺寸
        let rgbWidth = 0, rgbHeight = 0;
        if (hasRgbData && parsedRgbData.length > 0) {
          if (Array.isArray(parsedRgbData[0]) && Array.isArray(parsedRgbData[0][0])) {
            rgbHeight = parsedRgbData.length;
            rgbWidth = parsedRgbData[0].length;
          }
        }
        
        // 计算总豆数
        const totalBeads = parsedColorPalette.reduce((a, c) => a + (c.count || 0), 0);
        
        // 确定默认显示的 tab
        let activeTab = 'original';
        if (hasRgbData) {
          activeTab = 'result';
        } else if (hasPatternData) {
          activeTab = 'pattern';
        }
        
        // 是否有预渲染图片
        const hasPreRendered = preRenderedPattern || preRenderedResult;
        console.log('[result] server data parsed', {
          hasPatternData,
          hasMappedData,
          hasRgbData,
          hasPreRendered: !!hasPreRendered,
          preRenderedPatternLen: preRenderedPattern ? preRenderedPattern.length : 0,
          preRenderedResultLen: preRenderedResult ? preRenderedResult.length : 0,
          gridSize,
          parsedGridRows: parsedGridData.length,
          parsedPaletteLen: parsedColorPalette.length,
          parsedRgbRows: parsedRgbData.length
        });

        const resolvedColorStats = urlColorStats ? JSON.parse(urlColorStats) : parsedColorPalette;
        this._applyResultData({
          meta: {
            boxId: boxId || null,
            historyId: historyId || null,
            draftId: draftId || null,
            sourceType,
            mirrorOn: this.data.mirrorOn
          },
          core: {
            gridSize,
            mappedPixelData: parsedMappedPixelData,
            gridData: parsedGridData,
            colorPalette: parsedColorPalette,
            colorStats: resolvedColorStats,
            rgbData: parsedRgbData,
            colorCount: data.colorCount || parsedColorPalette.length,
            totalBeads,
            hasPatternData,
            hasMappedData,
            hasRgbData
          },
          ui: {
            originalUrl: urlOriginalUrl || data.sourceUrl || '',
            currentPreviewUrl: urlOriginalUrl || data.sourceUrl || '',
            activeTab,
            currentSize: gridSize,
            brandName: (data.brand || 'MARD').toUpperCase(),
            renderedPatternUrl: preRenderedPattern,
            renderedResultUrl: preRenderedResult,
            resultRendered: !hasRgbData || !!preRenderedResult,
            patternRendered: !(hasPatternData || hasMappedData) || !!preRenderedPattern
          },
          render: {
            autoRender: !hasPreRendered && (hasRgbData || hasPatternData || hasMappedData),
            delay: 100,
            generatePatternPreview: hasPatternData || hasMappedData
          }
        });

        this.setData({
          name: data.name,
          resultUrl: preRenderedResult || (data.resultUrl || ''),
          patternUrl: preRenderedPattern || (data.patternUrl || '')
        });
      })
      .catch((err) => {
        console.error('加载数据失败:', err);
        this.setData({ isHydrated: true, resultInitialLoading: false });
        wx.hideLoading();
        wx.showToast({ title: '加载失败', icon: 'none' });
      });
  },

  // 从 URL 参数加载数据（生成页面跳转过来的情况）
  loadDataFromUrl(options) {
    const {
      taskId, originalUrl, resultUrl, patternUrl, colorStats,
      gridSize, brand, colorCount,
      boxId, historyId, sourceType,
      gridData, colorPalette, rgbData,
      renderedPatternUrl, renderedResultUrl,
      storageKey
    } = options;

    console.log('原始参数:');
    console.log('  gridData:', gridData ? '存在' : '空');
    console.log('  colorPalette:', colorPalette ? '存在' : '空');
    console.log('  storageKey:', storageKey);

    // 优先从本地存储读取数据
    let parsedGridData = [];
    let parsedColorPalette = [];
    let parsedRgbData = [];
    let parsedMappedPixelData = [];
    let storedOriginalUrl = '';
    let storedBrand = '';
    let storedHistoryId = null;
    let storedRenderedPatternUrl = '';
    let storedRenderedResultUrl = '';
    
    if (storageKey) {
      try {
        const storedData = storage.getJSON(storageKey, null);
        if (storedData) {
          console.log('=== 从本地存储读取数据 ===');
          parsedMappedPixelData = storedData.mappedPixelData || [];
          parsedGridData = storedData.gridData || [];
          parsedColorPalette = storedData.colorPalette || [];
          parsedRgbData = storedData.rgbData || [];
          storedOriginalUrl = storedData.originalUrl || '';
          storedBrand = storedData.brand || '';
          storedHistoryId = storedData.historyId;
          storedRenderedPatternUrl = storedData.renderedPatternUrl || '';
          storedRenderedResultUrl = storedData.renderedResultUrl || '';
          console.log('storedRenderedPatternUrl:', storedRenderedPatternUrl);
          console.log('storedRenderedResultUrl:', storedRenderedResultUrl);
          // 清理存储
          storage.remove(storageKey);
        }
      } catch (e) {
        console.error('读取存储数据失败:', e);
      }
    }

    if (parsedMappedPixelData.length && (!parsedGridData.length || !parsedColorPalette.length)) {
      const derived = this._deriveLegacyFromMapped(parsedMappedPixelData);
      parsedGridData = derived.gridData;
      parsedColorPalette = derived.colorPalette;
      parsedRgbData = derived.rgbData;
    }
    
    // 如果本地存储没有数据，解析 URL 参数
    if (parsedMappedPixelData.length === 0 && parsedGridData.length === 0 && gridData) {
      try {
        console.log('=== 从 URL 参数解析数据 ===');
        console.log('gridData 原值:', gridData ? gridData.substring(0, 200) + '...' : '空');
        if (gridData) parsedGridData = JSON.parse(decodeURIComponent(gridData));
        console.log('parsedGridData 长度:', parsedGridData.length);
        if (colorPalette) parsedColorPalette = JSON.parse(decodeURIComponent(colorPalette));
        console.log('parsedColorPalette 长度:', parsedColorPalette.length);
        if (rgbData) {
          parsedRgbData = JSON.parse(decodeURIComponent(rgbData));
          console.log('parsedRgbData 长度:', parsedRgbData.length);
        }
      } catch (e) { console.error('解析错误:', e); }
    }
    
    
    if (parsedMappedPixelData.length === 0 && parsedGridData.length && parsedColorPalette.length) {
      parsedMappedPixelData = this._buildMappedFromLegacy(parsedGridData, parsedColorPalette);
    }

    console.log('parsedGridData:', parsedGridData.length, 'parsedColorPalette:', parsedColorPalette.length);

    // 兼容旧格式
    let stats = [];
    try {
      if (colorStats) stats = JSON.parse(decodeURIComponent(colorStats));
    } catch (e) {}

    // 计算总豆数
    const totalBeads = parsedColorPalette.reduce((a, c) => a + (c.count || 0), 0) ||
                       stats.reduce((a, c) => a + (c.count || 0), 0);

    const size = gridSize ? parseInt(gridSize) : (parsedMappedPixelData.length || parsedGridData.length || 64);
    const brandName = (storedBrand || (brand ? decodeURIComponent(brand) : 'MARD')).toUpperCase();
    const cnt = colorCount ? parseInt(colorCount) : (parsedColorPalette.length || stats.length || 0);
    let hasPatternData = parsedGridData.length > 0 && parsedColorPalette.length > 0;
    const hasMappedData = parsedMappedPixelData.length > 0;
    if (!hasPatternData && hasMappedData) {
      const derived = this._deriveLegacyFromMapped(parsedMappedPixelData);
      parsedGridData = derived.gridData;
      parsedColorPalette = derived.colorPalette;
      parsedRgbData = derived.rgbData;
      hasPatternData = parsedGridData.length > 0 && parsedColorPalette.length > 0;
    }
    const effectiveHistoryId = storedHistoryId || (historyId ? parseInt(historyId) : null);
    const effectiveOriginalUrl = storedOriginalUrl || decodeURIComponent(originalUrl || '');
    const effectiveRenderedPatternUrl = storedRenderedPatternUrl || decodeURIComponent(renderedPatternUrl || '');
    const effectiveRenderedResultUrl = storedRenderedResultUrl || decodeURIComponent(renderedResultUrl || '');
    const effectiveSourceUrl = decodeURIComponent(options.sourceUrl || storedOriginalUrl || '');

    const effectiveSourceType = effectiveHistoryId ? 'HISTORY' : (sourceType || 'LOCAL');

    // 确定默认显示的tab
    let activeTab = 'original';
    let currentPreviewUrl = effectiveOriginalUrl;
    const hasRgbData = parsedRgbData.length > 0;
    if (hasRgbData) {
      // 有效果图数据，优先显示效果图
      activeTab = 'result';
      currentPreviewUrl = '';
    } else if (hasPatternData) {
      // 有色号图数据，显示色号图
      activeTab = 'pattern';
      currentPreviewUrl = '';
    } else if (resultUrl) {
      activeTab = 'result';
      currentPreviewUrl = decodeURIComponent(resultUrl);
    }

    this._applyResultData({
      meta: {
        boxId: boxId ? parseInt(boxId) : null,
        historyId: effectiveHistoryId,
        sourceType: effectiveSourceType,
        mirrorOn: this.data.mirrorOn
      },
      core: {
        gridSize: size,
        mappedPixelData: parsedMappedPixelData,
        gridData: parsedGridData,
        colorPalette: parsedColorPalette,
        colorStats: stats,
        rgbData: parsedRgbData,
        colorCount: cnt,
        totalBeads,
        hasPatternData,
        hasMappedData,
        hasRgbData
      },
      ui: {
        originalUrl: effectiveOriginalUrl,
        currentPreviewUrl,
        activeTab,
        currentSize: size,
        brandName,
        renderedPatternUrl: effectiveRenderedPatternUrl,
        renderedResultUrl: effectiveRenderedResultUrl,
        resultRendered: !!(effectiveRenderedResultUrl || !hasRgbData),
        patternRendered: !!(effectiveRenderedPatternUrl || !(hasPatternData || hasMappedData))
      },
      render: {
        autoRender: !(effectiveRenderedPatternUrl || effectiveRenderedResultUrl) && (hasPatternData || hasRgbData || hasMappedData),
        delay: 100,
        generatePatternPreview: hasPatternData || hasMappedData
      }
    });

    this.setData({
      taskId: taskId || null,
      resultUrl: effectiveRenderedResultUrl || decodeURIComponent(resultUrl || ''),
      patternUrl: effectiveRenderedPatternUrl || decodeURIComponent(patternUrl || '')
    });

    if (boxId) {
      this.setData({ isSaved: true });
    }

    this.loadWatermarkConfig();
  },

  // 加载水印配置
  _buildMappedFromLegacy(gridData, colorPalette) {
    return (gridData || []).map((row) => (row || []).map((idx) => {
      if (idx === -1 || idx === null || idx === undefined) {
        return { id: 'ERASE', name: 'Transparent', r: 255, g: 255, b: 255, hex: '#FFFFFF', isExternal: true };
      }
      const c = (colorPalette || [])[idx] || {};
      const r = Number(c.r ?? 255);
      const g = Number(c.g ?? 255);
      const b = Number(c.b ?? 255);
      const hex = '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
      return { id: c.id || '', name: c.name || c.id || '', r, g, b, hex, isExternal: false };
    }));
  },

  _deriveLegacyFromMapped(mappedPixelData) {
    const rows = mappedPixelData || [];
    const stats = new Map();
    const order = [];

    rows.forEach((row) => {
      (row || []).forEach((cell) => {
        if (!cell || cell.isExternal) return;
        const key = String(cell.id || '') + '|' + String(cell.hex || '');
        if (!stats.has(key)) {
          stats.set(key, {
            id: cell.id || '',
            name: cell.name || '',
            r: Number(cell.r),
            g: Number(cell.g),
            b: Number(cell.b),
            count: 0
          });
          order.push(key);
        }
        const it = stats.get(key);
        it.count = (it.count || 0) + 1;
      });
    });

    const colorPalette = order.map((k, i) => ({ index: i, ...stats.get(k) }));
    const indexMap = new Map(order.map((k, i) => [k, i]));

    const gridData = rows.map((row) => (row || []).map((cell) => {
      if (!cell || cell.isExternal) return -1;
      const key = String(cell.id || '') + '|' + String(cell.hex || '');
      return indexMap.has(key) ? indexMap.get(key) : -1;
    }));

    const rgbData = rows.map((row) => (row || []).map((cell) => {
      if (!cell || cell.isExternal) return [255, 255, 255];
      return [Number(cell.r), Number(cell.g), Number(cell.b)];
    }));

    return { gridData, colorPalette, rgbData };
  },

  _getRenderableLegacyData() {
    let { gridData, colorPalette, rgbData, mappedPixelData } = this.data;
    if ((!gridData || !gridData.length || !colorPalette || !colorPalette.length) && mappedPixelData && mappedPixelData.length) {
      const derived = this._deriveLegacyFromMapped(mappedPixelData);
      gridData = derived.gridData || [];
      colorPalette = derived.colorPalette || [];
      rgbData = derived.rgbData || [];
      const totalBeads = colorPalette.reduce((sum, c) => sum + (c.count || 0), 0);
      this.setData({
        gridData,
        colorPalette,
        rgbData,
        totalBeads,
        colorCount: colorPalette.length,
        hasPatternData: gridData.length > 0
      });
    }
    return { gridData, colorPalette, rgbData };
  },

  _getMappedForPersistence() {
    let mapped = this.data.mappedPixelData || [];
    if ((!mapped || !mapped.length) && this.data.gridData && this.data.gridData.length && this.data.colorPalette && this.data.colorPalette.length) {
      mapped = this._buildMappedFromLegacy(this.data.gridData, this.data.colorPalette);
      this.setData({ mappedPixelData: mapped });
    }
    return mapped || [];
  },

  async loadWatermarkConfig() {
    try {
      const { appName, watermarkConfig } = await getWatermarkConfig();

      this.setData({
        watermarkConfig: watermarkConfig,
        appName: appName,
        isVip: watermarkConfig.isVip || false,
        canCustomizeWatermark: watermarkConfig.canCustomize || false
      });

      console.log('[result] 水印和小程序名称配置加载成功', {
        watermarkEnabled: watermarkConfig.enabled,
        watermarkText: watermarkConfig.text,
        watermarkColor: watermarkConfig.color,
        appName: appName
      });
    } catch (e) {
      console.error('[result] 加载水印配置失败', e);
      // 使用默认配置
      this.setData({
        watermarkConfig: {
          enabled: 1,
          text: '拼豆魔法屋出品',
          fontSize: 24,
          color: 'rgba(100,100,100,0.25)',
          angle: -30,
          spacingXRatio: 0.22,
          spacingYRatio: 0.18,
          opacity: 0.25
        },
        appName: '拼豆魔法屋',
        isVip: false,
        canCustomizeWatermark: false
      });
    }
  },

  onTabChange(e) {
    if (this.data.showGeneratingOverlay) {
      console.log('[result][tab] blocked while generating overlay visible');
      return;
    }

    const tab = e && e.currentTarget && e.currentTarget.dataset ? e.currentTarget.dataset.tab : '';
    if (!tab) {
      console.warn('[result][tab] invalid tab event', e);
      return;
    }

    const prevTab = this.data.activeTab;
    if (tab === prevTab) {
      console.log('[result][tab] ignored same tab', { tab });
      return;
    }

    const { renderedResultUrl, renderedPatternUrl } = this.data;

    let nextUrl = '';
    if (tab === 'original') {
      nextUrl = (this.data.mirrorOn && this.data.mirroredOriginalUrl) || this.data.originalUrl || this.data.warmedOriginalUrl || '';
    }

    console.log('[result][tab] change request', {
      from: prevTab,
      to: tab,
      renderedResultUrl: !!renderedResultUrl,
      renderedPatternUrl: !!renderedPatternUrl,
      rgbRows: Array.isArray(this.data.rgbData) ? this.data.rgbData.length : -1,
      hasPatternData: !!this.data.hasPatternData,
    });

    this.setData({
      activeTab: tab,
      currentPreviewUrl: nextUrl
    }, () => {
      if (tab === 'result') {
        if (!this.data.renderedResultUrl) {
          this.generateResultPreviewImage(true);
          this._ensureResultCanvasReady(true);
        }
      } else if (tab === 'pattern') {
        if (this.data.renderedPatternUrl) {
          console.log('[result][tab] pattern already rendered, skip re-render');
          return;
        }
        this.generatePatternPreviewImage(true);
      }

      console.log('[result][tab] change applied', {
        activeTab: this.data.activeTab,
        currentPreviewUrl: this.data.currentPreviewUrl,
        resultRendered: !!this.data.resultRendered,
        patternRendered: !!this.data.patternRendered
      });
    });
  },

  _ensureResultCanvasReady(force = false) {
    if (!force && this.data.resultRendered) return;
    if (!this.data.rgbData || !this.data.rgbData.length) return;
    setTimeout(() => this._renderResultCanvas2d(force), 40);
  },

  // 渲染效果图（2D）
  renderResultCanvas(forceRender = false) {
    this._renderResultCanvas2d(forceRender);
  },

  // canvas 渲染完成回调
  onCanvasRendered(type) {
    console.log('Canvas 渲染完成:', type, {
      activeTab: this.data.activeTab,
      pendingBefore: this._pendingRenderCount,
      resultRenderedBefore: this.data.resultRendered,
      patternRenderedBefore: this.data.patternRendered
    });

    if (type === 'result') {
      this._resultRenderInFlight = false;
    }
    
    // 设置对应的渲染标记
    const update = {};
    if (type === 'result' && !this.data.resultRendered) {
      update.resultRendered = true;
    } else if (type === 'pattern' && !this.data.patternRendered) {
      update.patternRendered = true;
    }
    
    // 减少待完成的渲染数量
    if (this._pendingRenderCount > 0) {
      this._pendingRenderCount--;
    }
    
    if (Object.keys(update).length) {
      this.setData(update, () => {
        console.log('[result] Canvas 渲染标记已更新，移除 canvas-rendering 类', {
          type,
          resultRendered: this.data.resultRendered,
          patternRendered: this.data.patternRendered
        });
      });
    }
    console.log('[result] onCanvasRendered update', {
      type,
      pendingAfter: this._pendingRenderCount,
      update
    });

    if (type === 'pattern' && !this.data.renderedPatternUrl) {
      this.generatePatternPreviewImage();
    }
    if (type === 'result' && !this.data.renderedResultUrl) {
      this.generateResultPreviewImage();
    }
    
    // 所有渲染都完成（或超时），清除超时定时器
    if (this._pendingRenderCount <= 0 && this._renderTimeout) {
      clearTimeout(this._renderTimeout);
      this._renderTimeout = null;
    }

    if (this._holdOverlayUntilRendered) {
      if (type === 'result') this._overlayWaitForResult = false;
      if (type === 'pattern') this._overlayWaitForPattern = false;
      if (!this._overlayWaitForResult && !this._overlayWaitForPattern) {
        this._finishGeneratingOverlay();
      }
    }
  },

  onCanvas2dError(e) {
    console.warn('[result][canvas2d] component error', e && e.detail ? e.detail : e);
  },

  _renderResultCanvas2d(forceRender = false) {
    const { gridData, colorPalette, rgbData } = this._getRenderableLegacyData();

    if (this._resultRenderInFlight) return;
    if (!forceRender && this.data.resultRendered) return;
    if ((!gridData || !gridData.length || !colorPalette || !colorPalette.length) && (!rgbData || !rgbData.length)) return;

    this._resultRenderInFlight = true;

    waitCanvas2dReady(this, 'resultCanvas2dComp', { label: 'result-render' })
      .then(({ comp, ctx }) => {
        const query = wx.createSelectorQuery();
        query.select('.preview-wrap').boundingClientRect((rect) => {
          if (!rect || !rect.width) {
            console.warn('[result][canvas2d][result] invalid preview rect', { rect });
            this._resultRenderInFlight = false;
            return;
          }

          const canvasSize = previewSize(rect.width);
          try {
            if (typeof comp.resizeSync === 'function') {
              comp.resizeSync(canvasSize, canvasSize);
            }

            const layout = renderResult(ctx, {
              rgbData,
              gridData,
              colorPalette,
              gridSize: gridData.length
            }, {
              width: canvasSize,
              height: canvasSize
            });

            if (!layout || layout.empty) {
              console.warn('[result][canvas2d][result] layout empty');
              this._resultRenderInFlight = false;
              return;
            }

            this._resultLayout2d = layout || null;
            this.onCanvasRendered('result');
          } catch (error) {
            console.warn('[result][canvas2d] result render failed', error);
            this._resultRenderInFlight = false;
          }
        }).exec();
      })
      .catch(() => {
        this._resultRenderInFlight = false;
      });
  },

  // 应用水印（兼容传统 Canvas API）
  getCurrentUrl() {
    return this.data.currentPreviewUrl || '';
  },

  onPreviewImage() {
    const { activeTab } = this.data;

    console.log('[result][preview][tap]', {
      activeTab,
      renderedResultUrl: this.data.renderedResultUrl || '',
      renderedResultLen: this.data.renderedResultUrl ? this.data.renderedResultUrl.length : 0,
      renderedPatternUrl: this.data.renderedPatternUrl || '',
      renderedPatternLen: this.data.renderedPatternUrl ? this.data.renderedPatternUrl.length : 0,
      originalUrl: this.data.originalUrl || '',
      originalLen: this.data.originalUrl ? this.data.originalUrl.length : 0,
      resultUrl: this.data.resultUrl || '',
      resultLen: this.data.resultUrl ? this.data.resultUrl.length : 0,
      patternUrl: this.data.patternUrl || '',
      patternLen: this.data.patternUrl ? this.data.patternUrl.length : 0,
      showGeneratingOverlay: !!this.data.showGeneratingOverlay
    });

    const openPreview = (mirroredOriginal) => {
      const originalUrl = this.data.mirrorOn
        ? (mirroredOriginal || this.data.mirroredOriginalUrl || this.data.warmedOriginalUrl || this.data.originalUrl)
        : (this.data.warmedOriginalUrl || this.data.originalUrl);
      const resultUrl = this.data.renderedResultUrl || this.data.resultUrl || '';
      const patternUrl = this.data.renderedPatternUrl || this.data.patternUrl || '';

      const urls = [originalUrl, resultUrl, patternUrl].filter(Boolean);
      const uniqueUrls = Array.from(new Set(urls));

      console.log('[result][preview] prepare', {
        activeTab,
        mirrorOn: this.data.mirrorOn,
        mirroredPassed: mirroredOriginal,
        dataMirrored: this.data.mirroredOriginalUrl,
        originalUrl,
        resultUrl,
        patternUrl,
        uniqueCount: uniqueUrls.length,
        uniqueUrls
      });

      let current = '';
      if (activeTab === 'original') current = originalUrl;
      if (activeTab === 'result') current = resultUrl;
      if (activeTab === 'pattern') current = patternUrl;

      if (!current) {
        if (activeTab === 'result') {
          console.log('[result][preview][route] result -> previewFromCanvas', {
            mode: 'resultCanvas2d',
            reason: 'current empty'
          });
          this.previewFromCanvas('resultCanvas2d');
          return;
        }
        if (activeTab === 'pattern') {
          console.log('[result][preview][route] pattern -> previewFromCanvas', {
            mode: 'patternCanvas2d',
            reason: 'current empty'
          });
          this.previewFromCanvas('patternCanvas2d');
          return;
        }
        current = this.getCurrentUrl();
      }

      console.log('[result][preview] current resolved', { activeTab, current });

      if (!current) {
        wx.showToast({ title: '暂无可预览图片', icon: 'none' });
        return;
      }

      wx.previewImage({
        urls: uniqueUrls.length ? uniqueUrls : [current],
        current,
        fail: (err) => {
          console.error('[result][preview] wx.previewImage fail', err);
        }
      });
    };

    if (this.data.mirrorOn) {
      if (this.data.mirroredOriginalUrl) {
        openPreview(this.data.mirroredOriginalUrl);
        return;
      }
      this.ensureMirroredOriginalUrl(this.data.originalUrl, (mirrored) => {
        openPreview(mirrored || '');
      });
      return;
    }

    openPreview('');
  },

  previewFromCanvas(canvasId) {
    console.log('[result][preview][canvas] start', {
      canvasId,
      activeTab: this.data.activeTab
    });

    const compId = canvasId === 'patternCanvas2d' ? '#patternCanvas2dComp' : '#resultCanvas2dComp';
    const comp = this.selectComponent(compId);
    if (!comp || typeof comp.exportTempFilePath !== 'function') {
      console.warn('[result][preview][canvas] 2d component export unavailable', {
        canvasId,
        compId,
        hasComp: !!comp,
        hasExport: !!(comp && comp.exportTempFilePath)
      });
      wx.showToast({ title: '预览失败', icon: 'none' });
      return;
    }

    const query = wx.createSelectorQuery();
    query.select('.preview-wrap').boundingClientRect((rect) => {
      const size = previewExportSize((rect && rect.width) || 0);
      console.log('[result][preview][canvas] 2d export begin', { canvasId, size });
      comp.exportTempFilePath({ width: size, height: size })
        .then((path) => {
          console.log('[result][preview][canvas] 2d export success', {
            canvasId,
            path: path || '',
            pathLen: path ? path.length : 0
          });
          if (!path) {
            wx.showToast({ title: '预览失败', icon: 'none' });
            return;
          }
          wx.previewImage({ urls: [path], current: path });
        })
        .catch((err) => {
          console.error('[result][preview][canvas] 2d export fail', { canvasId, err });
          wx.showToast({ title: '预览失败', icon: 'none' });
        });
    }).exec();
  },

  ensureMirroredOriginalUrl(url, done) {
    if (!url) {
      if (typeof done === 'function') done('');
      return;
    }
    if (this.data.mirroredOriginalUrl) {
      if (typeof done === 'function') done(this.data.mirroredOriginalUrl);
      return;
    }
    if (this._mirroredOriginalGenerating) {
      if (typeof done === 'function') {
        const timer = setInterval(() => {
          if (!this._mirroredOriginalGenerating) {
            clearInterval(timer);
            done(this.data.mirroredOriginalUrl || '');
          }
        }, 80);
      }
      return;
    }

    this._mirroredOriginalGenerating = true;

    // 优先走 COS 在线镜像转换，避免本地 canvas 偶发白图
    if (/^https?:\/\//i.test(url)) {
      const mirroredByCos = url + (url.includes('?') ? '&' : '?') + 'imageMogr2/flop';
      console.log('[result][mirror-preview] use cos mirror url', { mirroredByCos });
      this.setData({ mirroredOriginalUrl: mirroredByCos });
      this._mirroredOriginalGenerating = false;
      if (typeof done === 'function') done(mirroredByCos);
      return;
    }

    this._ensureMirroredOriginalByCanvas(url, done);
  },

  _ensureMirroredOriginalByCanvas(url, done) {

    wx.getImageInfo({
      src: url,
      success: (info) => {
        const width = info.width || 0;
        const height = info.height || 0;
        console.log('[result][mirror-preview] getImageInfo success', {
          width,
          height,
          path: info.path,
          type: info.type,
          orientation: info.orientation
        });

        if (!width || !height) {
          this._mirroredOriginalGenerating = false;
          console.warn('[result][mirror-preview] invalid image size');
          if (typeof done === 'function') done('');
          return;
        }

        const maxSide = 2048;
        const scale = Math.min(1, maxSide / Math.max(width, height));
        const targetW = Math.max(1, Math.floor(width * scale));
        const targetH = Math.max(1, Math.floor(height * scale));
        console.log('[result][mirror-preview] draw target', { targetW, targetH, scale });

        // 使用 Canvas 2D
        getCanvas2d(this, 'mirrorPreviewCanvas', targetW, targetH).then(({ canvas, ctx }) => {
          // 加载并绘制镜像图片
          const img = canvas.createImage();
          img.onload = () => {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, targetW, targetH);
            ctx.save();
            ctx.translate(targetW, 0);
            ctx.scale(-1, 1);
            ctx.drawImage(img, 0, 0, targetW, targetH);
            ctx.restore();

            // 导出
            exportCanvasToTempFilePath(canvas, {
              width: targetW,
              height: targetH,
              sourceWidth: canvas.width,
              sourceHeight: canvas.height,
              fileType: 'png',
              quality: 1
            }, this).then((tempFilePath) => {
              console.log('[result][mirror-preview] canvasToTempFilePath success', {
                tempFilePath: tempFilePath
              });
              const mirrored = tempFilePath || '';
              this._mirroredOriginalGenerating = false;
              if (mirrored) {
                this.setData({ mirroredOriginalUrl: mirrored });
                wx.getFileInfo({
                  filePath: mirrored,
                  success: (infoRes) => {
                    console.log('[result][mirror-preview] mirrored file info', {
                      size: infoRes.size,
                      digest: infoRes.digest
                    });
                  },
                  fail: (fileErr) => {
                    console.error('[result][mirror-preview] getFileInfo fail', fileErr);
                  }
                });
              }
              if (typeof done === 'function') done(mirrored);
            }).catch((err) => {
              console.error('[result][mirror-preview] canvasToTempFilePath fail', err);
              this._mirroredOriginalGenerating = false;
              if (typeof done === 'function') done('');
            });
          };
          img.onerror = (err) => {
            console.error('[result][mirror-preview] image load fail', err);
            this._mirroredOriginalGenerating = false;
            if (typeof done === 'function') done('');
          };
          img.src = info.path || url;
        }).catch((err) => {
          console.error('[result][mirror-preview] canvas init fail', err);
          this._mirroredOriginalGenerating = false;
          if (typeof done === 'function') done('');
        });
      },
      fail: (err) => {
        console.error('[result][mirror-preview] getImageInfo fail', err);
        this._mirroredOriginalGenerating = false;
        if (typeof done === 'function') done('');
      }
    });
  },

  onSaveImage() {
    const { activeTab, rgbData } = this.data;
    const { gridData, colorPalette } = this._getRenderableLegacyData();
    let url = '';

    if (activeTab === 'pattern') {
      // 保存渲染的色号图
      this.savePatternCanvas();
      return;
    }

    if (activeTab === 'result' && rgbData && rgbData.length > 0) {
      // 保存渲染的效果图
      this.saveResultCanvas();
      return;
    }

    url = this.getCurrentUrl();
    if (!url) { wx.showToast({ title: '暂无图片', icon: 'none' }); return; }
    this.setData({ saving: true, savingToAlbum: true });
    if (url.startsWith('http')) {
      wx.downloadFile({
        url,
        success: (res) => {
          if (res.statusCode === 200) this.saveToAlbum(res.tempFilePath);
          else { this.setData({ saving: false, savingToAlbum: false }); wx.showToast({ title: '下载失败', icon: 'error' }); }
        },
        fail: () => { this.setData({ saving: false, savingToAlbum: false }); wx.showToast({ title: '下载失败', icon: 'error' }); }
      });
    } else {
      this.saveToAlbum(url);
    }
  },

  _exportResultTempImage() {
    this._traceFlow('resultTemp:export:start');

    return waitCanvas2dReady(this, 'resultExport2dComp', {
      label: 'result-export',
      maxCompRetry: 15,
      maxCtxRetry: 20
    }).then(({ comp, ctx }) => {
      const query = wx.createSelectorQuery();
      return new Promise((resolve, reject) => {
        query.select('.preview-wrap').boundingClientRect((rect) => {
          const exportSize = resultExportSize((rect && rect.width) || 0);

          if (typeof comp.resizeSync === 'function') {
            comp.resizeSync(exportSize, exportSize);
          }

          renderResult(ctx, {
            rgbData: this.data.rgbData || [],
            rgbWidth: this.data.rgbWidth,
            rgbHeight: this.data.rgbHeight
          }, { width: exportSize, height: exportSize });

          comp.exportTempFilePath({ width: exportSize, height: exportSize })
            .then((path) => {
              this._traceFlow('resultTemp:export:success', {
                exportSize,
                hasPath: !!path,
                via: 'hidden-export-comp'
              });
              resolve(path);
            })
            .catch((err) => {
              this._traceFlow('resultTemp:export:failed', {
                exportSize,
                errMsg: err && err.message ? err.message : String(err || ''),
                via: 'hidden-export-comp'
              });
              reject(err || new Error('result export failed'));
            });
        }).exec();
      });
    });
  },

  generateResultPreviewImage(force = false) {
    if (this._resultPreviewGenerating || (this.data.renderedResultUrl && !force)) {
      return;
    }

    this._resultPreviewGenerating = true;
    this._exportResultTempImage()
      .then((path) => {
        if (path) {
          const update = { renderedResultUrl: path };
          if (this.data.activeTab === 'result') {
            update.currentPreviewUrl = path;
          }
          this.setData(update);
        }
        this._resultPreviewGenerating = false;
      })
      .catch(() => {
        this._resultPreviewGenerating = false;
      });
  },

  _exportPatternWith2d(options = {}) {
    const { withWatermark = false } = options;
    this._traceFlow('patternTemp:export:start', { withWatermark });
    const { gridData, colorPalette } = this._getRenderableLegacyData();

    if (!gridData || !gridData.length || !colorPalette || !colorPalette.length) {
      return Promise.reject(new Error('no pattern data'));
    }

    const gridRows = gridData.length;
    const gridCols = (gridData[0] && gridData[0].length) || gridRows;

    return waitCanvas2dReady(this, 'patternExport2dComp', {
      label: 'pattern-export',
      maxCompRetry: 15,
      maxCtxRetry: 20
    }).then(async ({ comp, ctx }) => {
      const boardSize = patternBoardSize(gridRows, gridCols);
      const latestWatermark = await getWatermarkConfig();
      const latestAppName = latestWatermark.appName || this.data.appName || '';
      const latestWatermarkConfig = latestWatermark.watermarkConfig || this.data.watermarkConfig || null;
      this.setData({
        appName: latestAppName,
        watermarkConfig: latestWatermarkConfig
      });
      
      // 准备绘制选项（包含小程序名称和水印配置）
      const drawOptions = {
        maxCanvasSize: 4096,
        appName: latestAppName,
        watermark: withWatermark ? (latestWatermarkConfig || {
          enabled: 1,
          text: '',
          fontSize: 24,
          color: 'rgba(100,100,100,0.25)',
          position: '平铺'
        }) : null
      };
      
      // 第一步：先绘制一次获取实际尺寸
      const layoutPreview = drawPatternWithAxes(ctx, gridData, colorPalette, gridRows, boardSize, drawOptions);

      // 第二步：根据实际尺寸 resize Canvas（长方形）
      if (typeof comp.resizeSync === 'function') {
        comp.resizeSync(layoutPreview.totalWidth, layoutPreview.totalHeight);
      }

      let layout;
      try {
        // 第三步：清空并重新绘制（resize 会清空内容）
        ctx.clearRect(0, 0, layoutPreview.totalWidth, layoutPreview.totalHeight);
        layout = drawPatternWithAxes(ctx, gridData, colorPalette, gridRows, boardSize, drawOptions);
        this._traceFlow('patternTemp:export:layout-ok', {
          totalWidth: layout.totalWidth,
          totalHeight: layout.totalHeight,
          headerHeight: layout.headerHeight
        });
      } catch (err) {
        this._traceFlow('patternTemp:export:layout-failed', {
          errMsg: err && err.message ? err.message : String(err || '')
        });
        throw err;
      }

      return comp.exportTempFilePath({
        width: layout.totalWidth,
        height: layout.totalHeight
      }).then((path) => {
        this._traceFlow('patternTemp:export:success', {
          hasPath: !!path,
          width: layout.totalWidth,
          height: layout.totalHeight,
          withWatermark
        });
        return path;
      }).catch((err) => {
        this._traceFlow('patternTemp:export:failed', {
          errMsg: err && (err.errMsg || err.message) ? (err.errMsg || err.message) : String(err || ''),
          width: layout.totalWidth,
          height: layout.totalHeight,
          withWatermark
        });
        throw err;
      });
    });
  },
  // 保存渲染的色号图（使用高分辨率渲染）
  generatePatternPreviewImage(force = false) {
    if (this._patternPreviewGenerating || (this.data.renderedPatternUrl && !force)) {
      return;
    }

    this._patternPreviewGenerating = true;
    this._traceFlow('patternTemp:generate:start', {
      force,
      activeTab: this.data.activeTab,
      hasPatternData: !!this.data.hasPatternData
    });

    this._exportPatternWith2d({ withWatermark: true })
      .then((path) => {
        if (path) {
          const update = { renderedPatternUrl: path };
          if (this.data.activeTab === 'pattern') {
            update.currentPreviewUrl = path;
          }
          this.setData(update, () => {
            this._traceFlow('patternTemp:generate:setData-ok', {
              hasPath: !!path,
              pathLen: path ? String(path).length : 0,
              activeTab: this.data.activeTab,
              renderedPatternLen: this.data.renderedPatternUrl ? this.data.renderedPatternUrl.length : 0
            });
          });
        }
        this._traceFlow('patternTemp:generate:success', {
          hasPath: !!path,
          pathLen: path ? String(path).length : 0
        });
        this._patternPreviewGenerating = false;
      })
      .catch((err) => {
        this._traceFlow('patternTemp:generate:failed', {
          errMsg: err && (err.errMsg || err.message) ? (err.errMsg || err.message) : String(err || '')
        });
        this._patternPreviewGenerating = false;
      });
  },

  // 保存渲染的色号图（使用高分辨率渲染）
  savePatternCanvas() {
    this.setData({ saving: true, savingToAlbum: true });

    this._exportPatternWith2d({ withWatermark: true })
      .then((path) => {
        if (!path) throw new Error('empty path');
        this.setData({ renderedPatternUrl: path });
        this.saveToAlbum(path);
      })
      .catch((err) => {
        console.error('保存色号图失败', err);
        this.setData({ saving: false, savingToAlbum: false });
        wx.showToast({ title: '保存失败', icon: 'none' });
      });
  },

  // 保存渲染的效果图（2D 导出）
  saveResultCanvas() {
    this.setData({ saving: true, savingToAlbum: true });
    if (this.data.renderedResultUrl) {
      this.saveToAlbum(this.data.renderedResultUrl);
      return;
    }

    this._exportResultTempImage()
      .then((path) => {
        if (!path) throw new Error('empty path');
        this.setData({ renderedResultUrl: path });
        this.saveToAlbum(path);
      })
      .catch((err) => {
        console.error('保存效果图失败', err);
        this.setData({ saving: false, savingToAlbum: false });
        wx.showToast({ title: '保存失败', icon: 'none' });
      });
  },

  saveToAlbum(filePath) {
    wx.saveImageToPhotosAlbum({
      filePath,
      success: () => { this.setData({ saving: false, savingToAlbum: false }); wx.showToast({ title: '已保存到相册', icon: 'success' }); },
      fail: (err) => {
        this.setData({ saving: false, savingToAlbum: false });
        if (err.errMsg && err.errMsg.includes('auth deny')) {
          wx.showModal({ title: '需要授权', content: '请在设置中允许访问相册', confirmText: '去设置',
            success: (r) => { if (r.confirm) wx.openSetting(); } });
        } else {
          wx.showToast({ title: '保存失败', icon: 'error' });
        }
      }
    });
  },

  handleToggleEditMode() {
    const { mappedPixelData, gridData, colorPalette, gridSize, brandName, colorCount, sourceType, draftId, boxId, historyId, taskId, originalUrl, currentPreviewUrl, patternNameInput } = this.data;
    if (!mappedPixelData || !mappedPixelData.length) {
      wx.showToast({ title: '暂无可编辑图纸', icon: 'none' });
      return;
    }

    // 确保 gridData 和 colorPalette 存在
    if (!gridData || !gridData.length || !colorPalette || !colorPalette.length) {
      wx.showToast({ title: '图纸数据不完整', icon: 'none' });
      return;
    }

    const storageKey = 'draw_edit_' + Date.now();
    storage.setJSON(storageKey, {
      gridSize,
      gridData,
      colorPalette,
      brand: brandName || 'MARD',
      colorCount: colorCount || 0,
      editSourceType: sourceType || (boxId ? 'BOX' : (historyId ? 'HISTORY' : (draftId ? 'DRAFT' : 'LOCAL'))),
      draftId: draftId || null,
      boxId: boxId || null,
      historyId: historyId || null,
      taskId: taskId || null,
      sourceUrl: originalUrl || currentPreviewUrl || '',
      name: patternNameInput || ''
    });

    wx.navigateTo({
      url: '/pages/draw/draw?source=result&storageKey=' + storageKey
    });
  },

  onEnterFocusMode() {
    const { boxId, isSaved, renderedPatternUrl, colorPalette } = this.data;
    if (!isSaved || !boxId) {
      wx.showToast({ title: '请先保存到图纸箱', icon: 'none' });
      return;
    }
    
    // 传递 patternUrl 和 colorStats 给沉浸模式
    let url = '/pages/focus-mode/focus-mode?boxId=' + boxId;
    
    // 如果有预渲染的色号图，传递给沉浸模式
    if (renderedPatternUrl) {
      url += '&patternUrl=' + encodeURIComponent(renderedPatternUrl);
    }
    
    // 传递色盘数据
    if (colorPalette && colorPalette.length > 0) {
      url += '&colorStats=' + encodeURIComponent(JSON.stringify(colorPalette));
    }
    
    wx.navigateTo({ url });
  },

  onSaveToMyPatterns() {
    ensureProfileComplete().then((ok) => {
      if (!ok) return;
      const { isSaved, boxId } = this.data;

      if (isSaved || boxId) {
        wx.showToast({ title: '已保存到图纸箱', icon: 'none' });
        return;
      }

      this.setData({ showNameModal: true, patternNameInput: '' });
    });
  },

  onNameInput(e) {
    this.setData({ patternNameInput: e.detail.value || '' });
  },

  onCloseNameModal() {
    this.setData({ showNameModal: false });
  },

  onConfirmSavePattern() {
    if (this.data.savingToBox) return;
    const { patternNameInput, historyId, sourceType } = this.data;
    const name = (patternNameInput || '').trim() || generatePatternName();

    // 计算总格子数
    const gridSize = this.data.gridSize;
    const focusTotalCells = gridSize * gridSize;
    // 计算已完成的格子数（沉浸模式进度）
    const completedCells = this._getCompletedCells ? this._getCompletedCells() : 0;

    const postBoxSave = (sourceUrl) => {
      const mappedPixelData = this._getMappedForPersistence();
      request.post('/box/save', {
        name: name,
        sourceType: sourceType || 'LOCAL',
        brand: this.data.brandName,
        colorCount: this.data.colorCount,
        gridSize: gridSize,
        mappedPixelData: JSON.stringify(mappedPixelData),
        historyId: historyId || null,
        sourceUrl: sourceUrl || '',
        // 沉浸模式进度
        focusTotalCells: focusTotalCells,
        focusCompletedCells: completedCells,
        focusProgress: focusTotalCells > 0 ? Math.round(completedCells / focusTotalCells * 100) : 0,
      })
        .then((box) => {
          const newBoxId = box && box.id ? box.id : (box && box.boxId ? box.boxId : (box && box.box && box.box.id ? box.box.id : null));
          this.setData({
            isSaved: true,
            showNameModal: false,
            patternNameInput: name,
            boxId: newBoxId,
            savingToBox: false
          });
          wx.showToast({ title: '已保存到图纸箱', icon: 'success' });
          this._showCapacityFullIfNeeded(box);
        })
        .catch((err) => {
          this.setData({ savingToBox: false });
          showRequestErrorToast(err, '保存失败，请重试');
        });
    };

    this.setData({ savingToBox: true });
    const currentSourceUrl = this.data.sourceUrl || '';
    const originalUrl = this.data.originalUrl || '';
    if (isValidRemoteUrl(currentSourceUrl)) {
      postBoxSave(currentSourceUrl);
      return;
    }
    if (isValidRemoteUrl(originalUrl)) {
      postBoxSave(originalUrl);
      return;
    }

    uploadImageIfNeeded(originalUrl).then((cosSourceUrl) => {
      if (cosSourceUrl) {
        this.setData({ originalUrl: cosSourceUrl, sourceUrl: cosSourceUrl });
      }
      postBoxSave(cosSourceUrl || '');
    }).catch(() => {
      postBoxSave('');
    });
  },

  _showCapacityFullIfNeeded(result) {
    showCapacityFullIfNeeded(result, { type: 'box' });
  },

  onSaveToHistory() {
    ensureProfileComplete().then((ok) => {
      if (!ok) return;
      const mappedPixelData = this._getMappedForPersistence();
      const { gridSize, brandName, colorCount, isSaved, boxId } = this.data;
      
      // 判断是否在图纸箱
      if (!isSaved || !boxId) {
        wx.showModal({
          title: '提示',
          content: '请先保存到图纸箱，再保存到时光机',
          showCancel: false,
          confirmText: '我知道了'
        });
        return;
      }
      
      request.post('/history/save', {
        sourceType: 'LOCAL',
        brand: brandName,
        colorCount: colorCount,
        gridSize: gridSize,
        mappedPixelData: JSON.stringify(mappedPixelData || []),
        boxId: boxId,
      })
        .then(() => {
          wx.showToast({ title: '已保存到时光机', icon: 'success' });
        })
        .catch(() => {
          wx.showToast({ title: '保存失败', icon: 'none' });
        });
    });
  },

  // ========== 结果页内置生成流程（替代 generating 页面） ==========
  startGenerateFlow(options) {
    const mode = String((options && options.mode) || '').toLowerCase() === 'ai' ? 'ai' : 'image';
    this._resultCanvas2dRetryCount = 0;
    this._patternCanvas2dRetryCount = 0;
    this.setData({
      generatingMode: mode,
      showGeneratingOverlay: true,
      generatingTimeout: false,
      generatingLoadingText: mode === 'ai' ? 'AI 正在施展魔法...' : '正在采样图片...',
      isHydrated: false,
      renderedResultUrl: '',
      renderedPatternUrl: ''
    });
    this._holdOverlayUntilRendered = true;
    this._overlayWaitForResult = false;
    this._overlayWaitForPattern = false;

    if (this._overlaySafetyTimer) {
      clearTimeout(this._overlaySafetyTimer);
      this._overlaySafetyTimer = null;
    }
    this._overlaySafetyTimer = setTimeout(() => {
      if (this.data.showGeneratingOverlay) {
        console.warn('[result][overlay] safety timeout reached, keep overlay and show timeout actions');
        this.setData({ generatingTimeout: true });
      }
    }, 12000);

    if (this._generateTimeoutTimer) {
      clearTimeout(this._generateTimeoutTimer);
      this._generateTimeoutTimer = null;
    }

    if (mode === 'ai') {
      const prompt = decodeURIComponent((options && options.prompt) || '');
      const style = decodeURIComponent((options && options.style) || '');
      const size = parseInt(options && options.size, 10) || 24;
      this.startAiGenerateInResult(prompt, style, size);
      return;
    }

    const imageUrl = decodeURIComponent((options && options.imageUrl) || '');

    console.log('[result] startGenerateFlow params', {
      mode,
      imageUrl: imageUrl ? imageUrl.slice(0, 100) : '',
      gridSize: parseInt(options && options.gridSize, 10) || 64,
      brand: decodeURIComponent((options && options.brand) || 'MARD')
    });

    if (!imageUrl) {
      console.error('[result] startGenerateFlow imageUrl is empty');
      this._finishGeneratingOverlay();
      wx.showModal({
        title: '图片丢失',
        content: '图片路径为空，请重新选择图片',
        showCancel: false,
        success: () => wx.navigateBack({ delta: 1 })
      });
      return;
    }

    const gridSize = parseInt(options && options.gridSize, 10) || 64;
    const brand = decodeURIComponent((options && options.brand) || 'MARD');
    const colorCount = parseInt(options && options.colorCount, 10) || 0;
    const pixelationMode = decodeURIComponent((options && options.pixelationMode) || 'dominant');
    const parsedThreshold = parseInt(options && options.similarityThreshold, 10);
    const similarityThreshold = Number.isNaN(parsedThreshold) ? 0 : parsedThreshold;
    const mirrorOn = String((options && options.mirrorOn) || '0') === '1';
    const flowId = decodeURIComponent((options && options.flowId) || '');

    this._beginFlowTrace({
      mode,
      routeImageType: getPathType(imageUrl),
      gridSize,
      brand,
      flowId: flowId || null
    });

    this._traceFlow('startGenerateFlow:init', {
      mode,
      hasImageUrl: !!imageUrl,
      gridSize,
      brand,
      colorCount,
      pixelationMode,
      similarityThreshold,
      mirrorOn,
      flowId: flowId || null
    });

    this.startImageGenerateInResult(imageUrl, gridSize, brand, colorCount, pixelationMode, similarityThreshold, mirrorOn, flowId);
  },

  _setGeneratingText(text) {
    this.setData({ generatingLoadingText: text || '正在处理...' });
  },

  _beginFlowTrace(meta = {}) {
    this._flowSessionId = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    this._flowStep = 0;
    this._traceFlow('trace:begin', meta);
  },

  _traceFlow(stage, extra = {}) {
    if (!this._flowSessionId) {
      this._flowSessionId = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      this._flowStep = 0;
    }
    this._flowStep = (this._flowStep || 0) + 1;
    console.log('[result][flow]', {
      sid: this._flowSessionId,
      step: this._flowStep,
      stage,
      ts: Date.now(),
      activeTab: this.data.activeTab,
      isHydrated: this.data.isHydrated,
      overlay: this.data.showGeneratingOverlay,
      pending: this._pendingRenderCount,
      hasResultTemp: !!this.data.renderedResultUrl,
      hasPatternTemp: !!this.data.renderedPatternUrl,
      ...extra
    });
  },

  _finishGeneratingOverlay() {
    console.log('[result][overlay] finish requested', {
      hold: !!this._holdOverlayUntilRendered,
      waitResult: !!this._overlayWaitForResult,
      waitPattern: !!this._overlayWaitForPattern,
      pending: this._pendingRenderCount
    });

    if (this._overlaySafetyTimer) {
      clearTimeout(this._overlaySafetyTimer);
      this._overlaySafetyTimer = null;
    }
    if (this._generateTimeoutTimer) {
      clearTimeout(this._generateTimeoutTimer);
      this._generateTimeoutTimer = null;
    }
    this.setData({
      showGeneratingOverlay: false,
      generatingTimeout: false,
      generatingLoadingText: '正在处理...'
    });
    this._holdOverlayUntilRendered = false;
    this._overlayWaitForResult = false;
    this._overlayWaitForPattern = false;
  },

  onGoMyPatterns() {
    this._finishGeneratingOverlay();
    wx.redirectTo({ url: '/pages/my-patterns/my-patterns' });
  },

  onKeepWaiting() {
    this.setData({ generatingTimeout: false });
  },

  startAiGenerateInResult(prompt, style, size) {
    this._setGeneratingText('AI 正在施展魔法...');

    this._generateTimeoutTimer = setTimeout(() => {
      this.setData({ generatingTimeout: true });
    }, 30000);

    request.post('/bead/pattern-ai-text', { prompt, style, size })
      .then((data) => {
        const mapped = (data && data.mappedPixelData) ? data.mappedPixelData : [];

        const closeOverlayAndLoad = () => {
          this._finishGeneratingOverlay();
          this.loadDataFromUrl({
            taskId: '',
            originalUrl: encodeURIComponent((data && (data.originalUrl || data.sourceUrl || '')) || ''),
            resultUrl: encodeURIComponent((data && data.resultUrl) || ''),
            patternUrl: encodeURIComponent((data && data.patternUrl) || ''),
            colorStats: encodeURIComponent((data && data.colorStats) || ''),
            gridSize: String((data && data.gridSize) || size || 24),
            brand: encodeURIComponent((data && data.brand) || 'MARD'),
            colorCount: String((data && data.colorCount) || 0),
            sourceType: 'AI'
          });
        };

        if (!mapped.length) {
          closeOverlayAndLoad();
          return;
        }

        request.post('/history/save', {
          sourceType: 'AI',
          brand: (data.brand || 'MARD'),
          colorCount: Number(data.colorCount || 0),
          name: 'AI记录#' + Date.now(),
          gridSize: Number(data.gridSize || size || 24),
          mappedPixelData: JSON.stringify(mapped),
          sourceUrl: data.originalUrl || data.sourceUrl || ''
        })
          .catch((err) => {
            console.warn('[result-ai] 自动保存时光机失败，不影响结果页', err);
          })
          .finally(closeOverlayAndLoad);
      })
      .catch((err) => {
        this._finishGeneratingOverlay();
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

  startImageGenerateInResult(imageUrl, gridSize, brand, colorCount, pixelationMode, similarityThreshold, mirrorOn, flowId) {
    this._flowId = flowId || this._flowId || '';
    this._setGeneratingText('正在采样图片...');
    this._traceFlow('imageFlow:start', {
      imageUrlType: getPathType(imageUrl),
      gridSize,
      brand,
      colorCount,
      pixelationMode,
      similarityThreshold,
      mirrorOn,
      flowId: this._flowId || null
    });

    this._generateTimeoutTimer = setTimeout(() => {
      this._traceFlow('imageFlow:timeout-60s');
      this.setData({ generatingTimeout: true });
    }, 60000);

    let sourceMirroredForSampling = false;
    const prepareImageForSampling = (imgUrl) => {
      if (!mirrorOn || !imgUrl) return Promise.resolve(imgUrl);
      return new Promise((resolve) => {
        this.ensureMirroredOriginalUrl(imgUrl, (mirroredUrl) => {
          sourceMirroredForSampling = !!mirroredUrl;
          resolve(mirroredUrl || imgUrl);
        });
      });
    };

    let samplingImageUrl = imageUrl;
    prepareImageForSampling(imageUrl)
      .then((path) => {
        samplingImageUrl = path;
        this._traceFlow('imageFlow:sample-ready', {
          samplingImageUrlType: getPathType(path),
          samplingImageUrlLen: path ? String(path).length : 0
        });
        return this._sampleImage(path, gridSize, pixelationMode);
      })
      .then((rgbGrid) => {
        this._traceFlow('imageFlow:sample-grid-ok', {
          rows: Array.isArray(rgbGrid) ? rgbGrid.length : -1,
          cols: Array.isArray(rgbGrid) && rgbGrid[0] ? rgbGrid[0].length : -1
        });
        this._setGeneratingText('匹配颜色...');
        return this._matchColors(rgbGrid, brand, colorCount, pixelationMode);
      })
      .then((matchedGrid) => {
        this._traceFlow('imageFlow:match-colors-ok', {
          rows: Array.isArray(matchedGrid) ? matchedGrid.length : -1,
          cols: Array.isArray(matchedGrid) && matchedGrid[0] ? matchedGrid[0].length : -1
        });
        this._setGeneratingText('生成图案数据...');
        return this._convertToMappedPixelData(matchedGrid);
      })
      .then((mappedResult) => {
        this._setGeneratingText('合并相近色号...');
        return this._mergeSimilarMappedColors(mappedResult, similarityThreshold);
      })
      .then((mappedResult) => {
        let mappedPixelData = mappedResult.mappedPixelData || [];
        if (mirrorOn && !sourceMirroredForSampling && Array.isArray(mappedPixelData) && mappedPixelData.length) {
          mappedPixelData = mappedPixelData.map((row) => Array.isArray(row) ? row.slice().reverse() : row);
        }
        const colorStats = mappedResult.colorStats || [];
        this._traceFlow('imageFlow:merge-ok', {
          mappedLen: mappedPixelData.length,
          colorStatsLen: colorStats.length
        });
        const converted = this._deriveLegacyFromMapped(mappedPixelData);

        const buildResult = (cosImageUrl) => {
          this._traceFlow('imageFlow:buildResult', {
            cosUrlType: getPathType(cosImageUrl),
            cosUrlLen: cosImageUrl ? String(cosImageUrl).length : 0,
            mappedLen: mappedPixelData.length,
            colorStatsLen: colorStats.length
          });
          console.log('[result] buildResult 开始，cosImageUrl:', cosImageUrl, 'length:', cosImageUrl ? cosImageUrl.length : 0);

          const displayOriginalUrl = sourceImageUrl || cosImageUrl || '';
          const resultData = {
            id: 'BP' + Date.now().toString(36) + Math.random().toString(36).substr(2, 6).toUpperCase(),
            resultToken: 'RT' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10),
            gridSize,
            brand,
            colorCount: colorStats.length,
            sourceType: 'LOCAL',
            mirrorOn: !!mirrorOn,
            originalUrl: displayOriginalUrl,
            sourceUrl: cosImageUrl || '', // 只使用 COS URL，不 fallback 到临时路径
            mappedPixelData,
            colorStats,
            gridData: converted.gridData || [],
            colorPalette: converted.colorPalette || [],
            rgbData: converted.rgbData || []
          };

          console.log('[result] buildResult resultData 创建完成', {
            'originalUrl': resultData.originalUrl,
            'originalUrl.length': resultData.originalUrl ? resultData.originalUrl.length : 0,
            'sourceUrl': resultData.sourceUrl,
            'sourceUrl.length': resultData.sourceUrl ? resultData.sourceUrl.length : 0
          });

          return request.post('/history/save', {
            sourceType: 'LOCAL',
            brand,
            colorCount: colorStats.length,
            name: '记录#' + Date.now(),
            gridSize,
            mappedPixelData: JSON.stringify(mappedPixelData),
            sourceUrl: cosImageUrl || '' // 只使用 COS URL
          }).then((history) => {
            if (history && history.id) resultData.historyId = history.id;
            console.log('[result] 时光机保存成功，historyId:', history && history.id);
          }).catch((err) => {
            console.error('[result] 时光机保存失败', err);
          }).finally(() => {
            this._traceFlow('imageFlow:loadDataFromMemory:start', {
              resultToken: resultData.resultToken,
              historyId: resultData.historyId || null,
              hasRgbData: !!(resultData.rgbData && resultData.rgbData.length),
              hasGridData: !!(resultData.gridData && resultData.gridData.length),
              hasPalette: !!(resultData.colorPalette && resultData.colorPalette.length)
            });
            console.log('[result] 准备调用 loadDataFromMemory，originalUrl:', resultData.originalUrl ? resultData.originalUrl.slice(0, 100) : '(空)');
            this.loadDataFromMemory(resultData);
          });
        };

        // 先上传原图到 COS，再保存
        const sourceImageUrl = samplingImageUrl || imageUrl;
        console.log('[result] startImageGenerateInResult upload check', {
          samplingImageUrl: samplingImageUrl ? samplingImageUrl.slice(0, 100) : '',
          imageUrl: imageUrl ? imageUrl.slice(0, 100) : '',
          sourceImageUrl: sourceImageUrl ? sourceImageUrl.slice(0, 100) : '',
          pathType: getPathType(sourceImageUrl)
        });

        uploadImageIfNeeded(sourceImageUrl).then((cosUrl) => {
          console.log('[result] startImageGenerateInResult upload result', {
            'cosUrl': cosUrl,
            'cosUrl.length': cosUrl ? cosUrl.length : 0,
            isEmpty: !cosUrl
          });

          if (!cosUrl) {
            console.warn('[result] 原图上传失败或为空，将无法保存到图纸箱');
          }

          console.log('[result] 准备调用 buildResult，cosUrl:', cosUrl, 'length:', cosUrl ? cosUrl.length : 0);
          buildResult(cosUrl);
        }).catch((err) => {
          console.error('[result] startImageGenerateInResult upload error', err);
          buildResult(''); // 上传失败时仍然继续，但 sourceUrl 为空
        });
      })
      .catch((err) => {
        this._traceFlow('imageFlow:failed', {
          errMsg: err && err.message ? err.message : String(err || '')
        });
        this._finishGeneratingOverlay();
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

  _rgbToHex(r, g, b) {
    return '#' + [r, g, b].map((x) => ('0' + Math.max(0, Math.min(255, x)).toString(16)).slice(-2)).join('').toUpperCase();
  },

  _sampleImage(imagePath, gridSize, mode) {
    const SAMPLE_PX = 512;
    return new Promise((resolve, reject) => {
      wx.getImageInfo({
        src: imagePath,
        success: (info) => {
          const ratio = info.width / info.height;
          const sampW = ratio >= 1 ? SAMPLE_PX : Math.max(1, Math.round(SAMPLE_PX * ratio));
          const sampH = ratio >= 1 ? Math.max(1, Math.round(SAMPLE_PX / ratio)) : SAMPLE_PX;

          // 使用 Canvas 2D
          getCanvas2d(this, 'beadSampleCanvas', sampW, sampH).then(({ canvas, ctx }) => {
            // 加载并绘制图片
            const img = canvas.createImage();
            img.onload = () => {
              ctx.drawImage(img, 0, 0, sampW, sampH);

              // 获取像素数据
              const imgData = ctx.getImageData(0, 0, sampW, sampH);
              try {
                resolve(this._sampleGrid(imgData.data, sampW, sampH, gridSize, mode));
              } catch (e) {
                reject(e);
              }
            };
            img.onerror = (err) => {
              reject(err);
            };
            img.src = imagePath;
          }).catch(reject);
        },
        fail: reject
      });
    });
  },

  _sampleGrid(data, sw, sh, gridSize, mode) {
    return colorMatcher.sampleGrid(data, sw, sh, gridSize, mode);
  },

  _colorDistance(colorA, colorB) {
    return colorMatcher.colorDistance(colorA, colorB);
  },

  _calcColorStats(mappedPixelData) {
    return colorMatcher.calcColorStats(mappedPixelData);
  },

  _mergeSimilarMappedColors(mappedResult, threshold) {
    return colorMatcher.mergeSimilarColors(mappedResult, threshold);
  },

  _matchColors(rgbGrid, brand, colorCount, mode) {
    return colorMatcher.matchColors(rgbGrid, brand, colorCount, mode);
  },

  _convertToMappedPixelData(matchedGrid) {
    return colorMatcher.convertToMappedPixelData(matchedGrid);
  },

  onBack() {
    wx.navigateBack({ delta: 1 });
  },

  onColorTap(e) {
    const { name, id, count } = e.currentTarget.dataset;
    const message = name ? '#' + id + ' ' + name : '#' + id;
    wx.showToast({ title: message + ' (' + count + '颗)', icon: 'none', duration: 2000 });
  },

  onUnload() {
    // 清除渲染超时定时器，防止内存泄漏
    if (this._renderTimeout) {
      clearTimeout(this._renderTimeout);
      this._renderTimeout = null;
    }
    if (this._resultRenderTimeout) {
      clearTimeout(this._resultRenderTimeout);
      this._resultRenderTimeout = null;
    }
    if (this._patternRenderTimeout) {
      clearTimeout(this._patternRenderTimeout);
      this._patternRenderTimeout = null;
    }
  },

  onCanvas2dReady(e) {
    const detail = (e && e.detail) || {};
    const canvasId = detail.canvasId || '';
    if (!canvasId) return;

    console.log('[result][canvas2d] onCanvas2dReady', {
      canvasId,
      width: detail.width,
      height: detail.height,
      dpr: detail.dpr,
      activeTab: this.data.activeTab
    });

    const readyMap = Object.assign({}, this.data.canvas2dReadyMap || {});
    readyMap[canvasId] = {
      ready: true,
      width: detail.width || 0,
      height: detail.height || 0,
      dpr: detail.dpr || 1
    };

    this.setData({ canvas2dReadyMap: readyMap });

    if (canvasId === 'patternExport2d' || canvasId === 'resultExport2d') {
      return;
    }

    if (canvasId === 'resultCanvas2d' && !this.data.renderedResultUrl) {
      setTimeout(() => this._ensureResultCanvasReady(true), 20);
    }
  },

  noop() {}
});
