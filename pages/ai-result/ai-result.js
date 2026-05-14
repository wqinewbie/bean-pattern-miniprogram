const request = require('../../utils/request');
const { ensureProfileComplete } = require('../../utils/profile-guard');
const { drawPatternWithAxes } = require('../../utils/pattern-canvas');
const { waitCanvas2dReady } = require('../../utils/canvas2d/controller');
const { patternBoardSize } = require('../../utils/canvas2d/size-strategies');
const { getWatermarkConfig } = require('../../utils/watermark-helper');

Page({
  data: {
    taskId: '',
    aiImageUrl: '',
    resultImageUrl: '',
    colorNumberImageUrl: '', // 色号图
    gridSize: 64,
    colorCount: 0,
    brand: 'MARD',
    mappedPixelData: null,
    colorList: [],
    gridData: [],
    colorPalette: [],
    totalBeads: 0,
    isGenerating: false,
    showNamingModal: false,
    patternName: '',

    // 系统信息
    statusBarHeight: 0,
    navBarHeight: 0,
    menuButtonInfo: null,

    // 图片 tab
    activeImageTab: 0, // 0: 效果图, 1: 色号图

    // 图片处理数据
    rgbData: [],

    // 保存状态
    isSaved: false,
    savingToAlbum: false,
    isSavingToBox: false,
    isEditMode: false,

    // Canvas 显示控制
    showCanvas: true, // 初始显示 canvas 用于渲染，导出后隐藏
  },

  onLoad(options) {
    // 获取系统信息和胶囊按钮信息
    this.initSystemInfo();

    const taskId = options.taskId || '';
    const aiImageUrl = decodeURIComponent(options.aiImageUrl || '');
    const gridSize = parseInt(options.gridSize) || 64;
    const brand = options.brand || 'MARD';

    this.setData({
      taskId,
      aiImageUrl,
      gridSize,
      brand,
      isGenerating: true
    });

    // 处理AI图片，生成效果图和色号图
    this.processAiImage(aiImageUrl);
  },

  initSystemInfo() {
    const systemInfo = wx.getSystemInfoSync();
    const menuButtonInfo = wx.getMenuButtonBoundingClientRect();

    // 计算导航栏高度：胶囊按钮底部位置 + 额外间距
    const navBarHeight = menuButtonInfo.bottom + 8;

    this.setData({
      statusBarHeight: systemInfo.statusBarHeight,
      navBarHeight: navBarHeight,
      menuButtonInfo: menuButtonInfo
    });
  },

  onImageTabChange(e) {
    const index = e.currentTarget.dataset.index;
    this.setData({
      activeImageTab: index
    });
  },

  async processAiImage(imageUrl) {
    if (!imageUrl) {
      wx.showToast({ title: '图片地址无效', icon: 'none' });
      this.setData({ isGenerating: false });
      return;
    }

    try {
      const { gridSize, brand } = this.data;
      const similarityThreshold = 30; // 默认合并阈值

      // 1. 采样图片获取 RGB 网格
      console.log('[ai-result] 开始采样图片...');
      const rgbGrid = await this._sampleImage(imageUrl, gridSize);

      // 2. 调用后端 API 匹配珠子颜色
      console.log('[ai-result] 开始匹配颜色...');
      const matchedGrid = await this._matchColors(rgbGrid, brand);

      // 3. 转换为 mappedPixelData 格式
      console.log('[ai-result] 转换数据格式...');
      let { mappedPixelData, colorStats, gridData, colorPalette } = this._convertToMappedPixelData(matchedGrid);

      // 4. 合并相近色号
      console.log('[ai-result] 合并相近色号...');
      const mergedResult = await this._mergeSimilarMappedColors({ mappedPixelData, colorStats }, similarityThreshold);
      mappedPixelData = mergedResult.mappedPixelData;
      colorStats = mergedResult.colorStats;

      // 重新生成 gridData 和 colorPalette
      const converted = this._convertToMappedPixelData(this._convertMappedToMatchedGrid(mappedPixelData));
      gridData = converted.gridData;
      colorPalette = converted.colorPalette;

      // 5. 计算总珠子数
      const totalBeads = colorStats.reduce((sum, item) => sum + (item.count || 0), 0);

      // 6. 渲染效果图和色号图
      console.log('[ai-result] 开始渲染图片...');
      const { patternUrl, resultUrl } = await this._renderImages(mappedPixelData, gridData, colorPalette, gridSize);

      // 7. 更新数据
      this.setData({
        mappedPixelData,
        colorList: colorStats,
        colorPalette: colorPalette,
        gridData: gridData,
        totalBeads,
        colorCount: colorStats.length,
        resultImageUrl: resultUrl,
        colorNumberImageUrl: patternUrl,
        isGenerating: false,
        showCanvas: false // 导出完成后隐藏 canvas
      });

      console.log('[ai-result] 处理完成，setData 已调用');
      console.log('[ai-result] 当前 data 状态:', {
        resultImageUrl: this.data.resultImageUrl,
        colorNumberImageUrl: this.data.colorNumberImageUrl,
        isGenerating: this.data.isGenerating,
        activeImageTab: this.data.activeImageTab,
        showCanvas: this.data.showCanvas
      });
    } catch (error) {
      console.error('[ai-result] 处理失败:', error);
      wx.showToast({ title: '图片处理失败', icon: 'none' });
      this.setData({ isGenerating: false });
    }
  },

  // 采样图片（使用bead-canvas2d组件）
  _sampleImage(imagePath, gridSize) {
    const SAMPLE_PX = 512;

    return new Promise((resolve, reject) => {
      wx.getImageInfo({
        src: imagePath,
        success: (info) => {
          const ratio = info.width / info.height;
          let sampW, sampH;

          if (ratio >= 1) {
            sampW = SAMPLE_PX;
            sampH = Math.max(1, Math.round(SAMPLE_PX / ratio));
          } else {
            sampH = SAMPLE_PX;
            sampW = Math.max(1, Math.round(SAMPLE_PX * ratio));
          }

          waitCanvas2dReady(this, 'sampleCanvas2dComp', {
            label: 'sample-canvas',
            maxCompRetry: 15,
            maxCtxRetry: 20
          }).then(({ comp, ctx, canvas }) => {
            // Resize canvas to sample size
            if (typeof comp.resizeSync === 'function') {
              comp.resizeSync(sampW, sampH);
            }

            const img = canvas.createImage();
            img.onload = () => {
              ctx.drawImage(img, 0, 0, sampW, sampH);
              const imgData = ctx.getImageData(0, 0, sampW, sampH);
              const rgbGrid = this._sampleGrid(imgData.data, sampW, sampH, gridSize);
              resolve(rgbGrid);
            };
            img.onerror = reject;
            img.src = imagePath;
          }).catch(reject);
        },
        fail: reject
      });
    });
  },

  // 采样网格（从 generating.js 复制）
  _sampleGrid(data, sw, sh, gridSize) {
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
            const i = (py * sw + px) * 4;
            const a = data[i + 3];
            if (a < 128) continue;
            pixels.push([data[i], data[i + 1], data[i + 2]]);
          }
        }

        if (!pixels.length) {
          row.push([255, 255, 255]);
          continue;
        }

        // 使用 average 模式（卡通模式）
        let rSum = 0, gSum = 0, bSum = 0;
        pixels.forEach((rgb) => {
          rSum += rgb[0];
          gSum += rgb[1];
          bSum += rgb[2];
        });
        const total = pixels.length;
        row.push([
          Math.round(rSum / total),
          Math.round(gSum / total),
          Math.round(bSum / total)
        ]);
      }
      grid.push(row);
    }

    return grid;
  },

  // 调用后端 API 匹配颜色（从 generating.js 复制）
  _matchColors(rgbGrid, brand) {
    return new Promise((resolve, reject) => {
      request.post('/bead/match-colors', {
        brand: brand.toLowerCase(),
        colorCount: 0,
        grid: rgbGrid,
        algo: 'standard',
        similarityThreshold: 0,
      })
        .then((res) => {
          resolve(res.data || res);
        })
        .catch(reject);
    });
  },

  // 转换数据格式（从 generating.js 复制）
  _convertToMappedPixelData(matchedGrid) {
    if (!matchedGrid || !matchedGrid.length) {
      return { mappedPixelData: [], colorStats: [], gridData: [], colorPalette: [] };
    }

    const mappedData = [];
    const colorStatsMap = {};
    const gridData = [];
    const colorPaletteMap = {};
    let colorIndex = 0;

    for (let y = 0; y < matchedGrid.length; y++) {
      const row = [];
      const gridRow = [];
      const matchedRow = matchedGrid[y];

      if (!matchedRow) continue;

      for (let x = 0; x < matchedRow.length; x++) {
        const cell = matchedRow[x];
        if (!cell) continue;

        const colorObj = {
          id: cell.id || '',
          name: cell.name || cell.id || '',
          hex: this._rgbToHex(cell.r, cell.g, cell.b),
          r: cell.r,
          g: cell.g,
          b: cell.b
        };
        row.push(colorObj);

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

        // 构建 gridData 和 colorPalette
        if (!colorPaletteMap[id]) {
          colorPaletteMap[id] = {
            id: id,
            name: colorObj.name,
            hex: colorObj.hex,
            r: colorObj.r,
            g: colorObj.g,
            b: colorObj.b,
            count: 0,
            index: colorIndex
          };
          colorIndex++;
        }
        colorPaletteMap[id].count++;
        gridRow.push(colorPaletteMap[id].index);
      }
      mappedData.push(row);
      gridData.push(gridRow);
    }

    const colorStats = Object.values(colorStatsMap).sort((a, b) => b.count - a.count);
    const colorPalette = Object.values(colorPaletteMap).sort((a, b) => a.index - b.index);

    return { mappedPixelData: mappedData, colorStats, gridData, colorPalette };
  },

  // RGB转Hex
  _rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(function(x) {
      return ('0' + Math.max(0, Math.min(255, x)).toString(16)).slice(-2);
    }).join('').toUpperCase();
  },

  // 合并相近色号（从 result.js 复制）
  _mergeSimilarMappedColors(mappedResult, threshold) {
    return new Promise((resolve) => {
      const mapped = mappedResult && mappedResult.mappedPixelData ? mappedResult.mappedPixelData : [];
      const th = Math.max(0, Math.min(100, Number(threshold || 0)));
      if (!mapped.length || th <= 0) {
        resolve({ mappedPixelData: mapped, colorStats: mappedResult && mappedResult.colorStats ? mappedResult.colorStats : this._calcColorStats(mapped) });
        return;
      }

      const counts = {};
      const colorMap = {};
      mapped.forEach((row) => (row || []).forEach((cell) => {
        if (!cell || cell.isExternal || !cell.id) return;
        counts[cell.id] = (counts[cell.id] || 0) + 1;
        if (!colorMap[cell.id]) colorMap[cell.id] = { id: cell.id, name: cell.name, hex: cell.hex, r: cell.r, g: cell.g, b: cell.b };
      }));

      const ids = Object.entries(counts).sort((a, b) => b[1] - a[1]).map((it) => it[0]);
      const merged = mapped.map((row) => (row || []).map((cell) => Object.assign({}, cell, { isExternal: !!(cell && cell.isExternal) })));
      const replaced = {};
      for (let i = 0; i < ids.length; i++) {
        const aId = ids[i];
        if (replaced[aId]) continue;
        const a = colorMap[aId];
        if (!a) continue;
        for (let j = i + 1; j < ids.length; j++) {
          const bId = ids[j];
          if (replaced[bId]) continue;
          const b = colorMap[bId];
          if (!b) continue;
          if (this._colorDistance(a, b) < th) {
            replaced[bId] = true;
            for (let y = 0; y < merged.length; y++) {
              const row = merged[y] || [];
              for (let x = 0; x < row.length; x++) {
                if (row[x] && row[x].id === bId) row[x] = { id: a.id, name: a.name, hex: a.hex, r: a.r, g: a.g, b: a.b, isExternal: false };
              }
            }
          }
        }
      }
      resolve({ mappedPixelData: merged, colorStats: this._calcColorStats(merged) });
    });
  },

  // 计算颜色距离（从 result.js 复制）
  _colorDistance(colorA, colorB) {
    const dr = Number(colorA.r || 0) - Number(colorB.r || 0);
    const dg = Number(colorA.g || 0) - Number(colorB.g || 0);
    const db = Number(colorA.b || 0) - Number(colorB.b || 0);
    return Math.sqrt(dr * dr + dg * dg + db * db);
  },

  // 计算颜色统计（从 result.js 复制）
  _calcColorStats(mappedPixelData) {
    const colorStatsMap = {};
    for (let y = 0; y < mappedPixelData.length; y++) {
      const row = mappedPixelData[y] || [];
      for (let x = 0; x < row.length; x++) {
        const cell = row[x];
        if (!cell || cell.isExternal) continue;
        if (!colorStatsMap[cell.id]) {
          colorStatsMap[cell.id] = { id: cell.id, name: cell.name, hex: cell.hex, r: cell.r, g: cell.g, b: cell.b, count: 0 };
        }
        colorStatsMap[cell.id].count++;
      }
    }
    return Object.values(colorStatsMap).sort((a, b) => b.count - a.count);
  },

  // 将 mappedPixelData 转换回 matchedGrid 格式（用于重新生成 gridData 和 colorPalette）
  _convertMappedToMatchedGrid(mappedPixelData) {
    return mappedPixelData.map(row =>
      row.map(cell => ({
        id: cell.id,
        name: cell.name,
        r: cell.r,
        g: cell.g,
        b: cell.b
      }))
    );
  },

  // 渲染效果图和色号图（使用bead-canvas2d组件导出临时图片）
  async _renderImages(mappedPixelData, gridData, colorPalette, gridSize) {
    console.log('[ai-result] _renderImages 开始', {
      mappedPixelDataRows: mappedPixelData.length,
      mappedPixelDataCols: mappedPixelData.length > 0 ? mappedPixelData[0].length : 0,
      gridDataRows: gridData.length,
      colorPaletteLength: colorPalette.length,
      gridSize: gridSize
    });

    const actualRows = mappedPixelData.length;
    const actualCols = mappedPixelData.length > 0 ? mappedPixelData[0].length : 0;

    // 渲染效果图（简单版）
    console.log('[ai-result] 开始渲染效果图...');
    const resultUrl = await this._exportResultImage(mappedPixelData, actualRows, actualCols);
    console.log('[ai-result] 效果图渲染完成，URL:', resultUrl);

    // 渲染色号图（完整版：带坐标轴、标题、色号汇总、水印）
    console.log('[ai-result] 开始渲染色号图...');
    const patternUrl = await this._exportPatternImage(gridData, colorPalette, gridSize);
    console.log('[ai-result] 色号图渲染完成，URL:', patternUrl);

    return { patternUrl, resultUrl };
  },

  // 导出效果图
  async _exportResultImage(mappedPixelData, actualRows, actualCols) {
    const canvasSize = 1024;

    console.log('[ai-result] _exportResultImage 开始');

    return waitCanvas2dReady(this, 'resultCanvas2dComp', {
      label: 'result-export',
      maxCompRetry: 15,
      maxCtxRetry: 20
    }).then(({ comp, ctx }) => {
      console.log('[ai-result] resultCanvas2d 已就绪');
      const cellSize = canvasSize / Math.max(actualRows, actualCols);
      const drawWidth = actualCols * cellSize;
      const drawHeight = actualRows * cellSize;
      const offsetX = (canvasSize - drawWidth) / 2;
      const offsetY = (canvasSize - drawHeight) / 2;

      // 绘制效果图
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvasSize, canvasSize);

      for (let y = 0; y < actualRows; y++) {
        for (let x = 0; x < actualCols; x++) {
          const cell = mappedPixelData[y] && mappedPixelData[y][x];
          if (cell) {
            ctx.fillStyle = 'rgb(' + cell.r + ',' + cell.g + ',' + cell.b + ')';
            ctx.fillRect(offsetX + x * cellSize, offsetY + y * cellSize, cellSize, cellSize);
          }
        }
      }

      console.log('[ai-result] 效果图绘制完成，开始导出');

      // 导出临时图片
      return comp.exportTempFilePath({
        width: canvasSize,
        height: canvasSize
      }).then((tempPath) => {
        console.log('[ai-result] 效果图导出成功:', tempPath);
        // 导出后立即清空 canvas
        ctx.clearRect(0, 0, canvasSize, canvasSize);
        // 将 canvas 尺寸设置为 0 以彻底隐藏
        if (typeof comp.resizeSync === 'function') {
          comp.resizeSync(1, 1);
        }
        console.log('[ai-result] 效果图 canvas 已清空并缩小');
        return tempPath;
      });
    }).catch((err) => {
      console.error('[ai-result] 效果图导出失败:', err);
      return '';
    });
  },

  // 导出色号图
  async _exportPatternImage(gridData, colorPalette, gridSize) {
    console.log('[ai-result] _exportPatternImage 开始渲染色号图', {
      gridDataLength: gridData.length,
      colorPaletteLength: colorPalette.length,
      gridSize: gridSize
    });

    return waitCanvas2dReady(this, 'patternCanvas2dComp', {
      label: 'pattern-export',
      maxCompRetry: 15,
      maxCtxRetry: 20
    }).then(async ({ comp, ctx }) => {
      console.log('[ai-result] patternCanvas2d 已就绪');
      const boardSize = patternBoardSize(gridSize);

      // 获取水印配置（使用公共方法）
      const { appName, watermarkConfig } = await getWatermarkConfig();

      // 准备绘制选项
      const drawOptions = {
        maxCanvasSize: 4096,
        appName: appName,
        watermark: watermarkConfig
      };

      // 第一步：先绘制一次获取实际尺寸
      const layoutPreview = drawPatternWithAxes(ctx, gridData, colorPalette, gridSize, boardSize, drawOptions);

      console.log('[ai-result] 色号图布局:', layoutPreview);

      // 第二步：根据实际尺寸 resize Canvas
      if (typeof comp.resizeSync === 'function') {
        comp.resizeSync(layoutPreview.totalWidth, layoutPreview.totalHeight);
      }

      // 第三步：清空并重新绘制（resize 会清空内容）
      const context2 = comp.getContext();
      const drawCtx = context2 && context2.ctx ? context2.ctx : ctx;
      drawCtx.clearRect(0, 0, layoutPreview.totalWidth, layoutPreview.totalHeight);
      const layout = drawPatternWithAxes(drawCtx, gridData, colorPalette, gridSize, boardSize, drawOptions);

      console.log('[ai-result] 色号图绘制完成，开始导出');

      // 导出临时图片
      return comp.exportTempFilePath({
        width: layout.totalWidth,
        height: layout.totalHeight
      }).then((tempPath) => {
        console.log('[ai-result] 色号图导出成功:', tempPath);
        // 导出后立即清空 canvas
        drawCtx.clearRect(0, 0, layout.totalWidth, layout.totalHeight);
        // 将 canvas 尺寸设置为 0 以彻底隐藏
        if (typeof comp.resizeSync === 'function') {
          comp.resizeSync(1, 1);
        }
        console.log('[ai-result] 色号图 canvas 已清空并缩小');
        return tempPath;
      });
    }).catch((err) => {
      console.error('[ai-result] 色号图导出失败:', err);
      return '';
    });
  },

  onBack() {
    wx.navigateBack();
  },

  onPreviewImage() {
    const { resultImageUrl, colorNumberImageUrl, activeImageTab } = this.data;
    const imageUrl = activeImageTab === 0 ? resultImageUrl : colorNumberImageUrl;

    if (!imageUrl) {
      wx.showToast({ title: '暂无图片可预览', icon: 'none' });
      return;
    }

    console.log('[ai-result] 预览图片:', imageUrl);
    wx.previewImage({
      urls: [imageUrl],
      current: imageUrl
    });
  },

  onEnterEditMode() {
    const { mappedPixelData, gridData, colorPalette, gridSize, brand, colorCount } = this.data;

    if (!mappedPixelData || !mappedPixelData.length) {
      wx.showToast({
        title: '暂无可编辑图纸',
        icon: 'none'
      });
      return;
    }

    // 确保 gridData 和 colorPalette 存在
    if (!gridData || !gridData.length || !colorPalette || !colorPalette.length) {
      wx.showToast({
        title: '图纸数据不完整',
        icon: 'none'
      });
      return;
    }

    const storageKey = 'draw_edit_' + Date.now();
    wx.setStorageSync(storageKey, {
      gridSize,
      gridData,
      colorPalette,
      brand: brand || 'MARD',
      colorCount: colorCount || 0
    });

    wx.navigateTo({
      url: '/pages/draw/draw?source=ai-result&storageKey=' + storageKey
    });
  },

  onEnterImmersive() {
    const { isSaved, boxId } = this.data;

    if (!isSaved) {
      wx.showToast({
        title: '请先保存到图纸箱',
        icon: 'none'
      });
      return;
    }

    // 导航到沉浸式拼豆页面，传递boxId
    wx.navigateTo({
      url: '/pages/focus-mode/focus-mode?boxId=' + (boxId || '')
    });
  },

  async onSaveToAlbum() {
    const { resultImageUrl, colorNumberImageUrl, activeImageTab, savingToAlbum } = this.data;

    if (savingToAlbum) return;

    const imageUrl = activeImageTab === 0 ? resultImageUrl : colorNumberImageUrl;

    if (!imageUrl) {
      wx.showToast({ title: '暂无图片可保存', icon: 'none' });
      return;
    }

    this.setData({ savingToAlbum: true });

    try {
      let filePath = imageUrl;

      // 检查是否需要下载（只有 http/https 开头的才需要下载）
      if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
        const res = await new Promise((resolve, reject) => {
          wx.downloadFile({
            url: imageUrl,
            success: resolve,
            fail: reject
          });
        });
        filePath = res.tempFilePath;
      }

      // 保存到相册
      await new Promise((resolve, reject) => {
        wx.saveImageToPhotosAlbum({
          filePath: filePath,
          success: resolve,
          fail: reject
        });
      });

      wx.showToast({ title: '已保存到相册', icon: 'success' });
    } catch (err) {
      console.error('[保存相册失败]', err);
      if (err.errMsg && err.errMsg.includes('auth deny')) {
        wx.showModal({
          title: '需要相册权限',
          content: '请在设置中开启相册权限',
          confirmText: '去设置',
          success: (res) => {
            if (res.confirm) {
              wx.openSetting();
            }
          }
        });
      } else {
        wx.showToast({ title: '保存失败', icon: 'error' });
      }
    } finally {
      this.setData({ savingToAlbum: false });
    }
  },

  onSaveToBox() {
    // 直接显示命名弹窗
    this.setData({
      showNamingModal: true
    });
  },

  onCloseModal() {
    this.setData({
      showNamingModal: false,
      patternName: ''
    });
  },

  onModalContentTap() {
    // 阻止事件冒泡，防止点击内容区域关闭弹窗
  },

  onNameInput(e) {
    this.setData({
      patternName: e.detail.value
    });
  },

  async onConfirmSave() {
    const ok = await ensureProfileComplete();
    if (!ok) return;

    const finalName = this.data.patternName.trim() || 'AI作品-' + Date.now();
    const { taskId, aiImageUrl, resultImageUrl, colorNumberImageUrl, gridSize, brand, colorList, totalBeads, mappedPixelData } = this.data;

    wx.showLoading({ title: '保存中...', mask: true });

    try {
      // 调用后端接口保存到图纸箱
      const saveData = {
        name: finalName,
        taskId: taskId,
        sourceType: 'AI',
        sourceUrl: aiImageUrl,
        coverUrl: resultImageUrl || colorNumberImageUrl || aiImageUrl,
        gridSize: gridSize,
        brand: brand,
        colorCount: colorList.length,
        totalBeads: totalBeads,
        mappedPixelData: JSON.stringify(mappedPixelData),  // 序列化为JSON字符串
        colorList: colorList
      };

      const res = await request.post('/box/save', saveData);

      wx.hideLoading();

      // 后端返回的是box对象，不是{success: true}格式
      if (res && res.id) {
        this.setData({
          showNamingModal: false,
          patternName: '',
          isSaved: true,  // 触发动画
          boxId: res.id   // 保存boxId用于后续操作
        });

        wx.showToast({
          title: '已保存到图纸箱',
          icon: 'success',
          duration: 2000
        });
      } else {
        throw new Error('保存失败');
      }
    } catch (err) {
      wx.hideLoading();
      console.error('[保存到图纸箱失败]', err);
      wx.showToast({
        title: err.message || '保存失败',
        icon: 'error'
      });
    }
  }
});
