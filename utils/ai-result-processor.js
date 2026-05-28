const { waitCanvas2dReady } = require('./canvas2d/controller');
const colorMatcher = require('./color-matcher');
const { patternBoardSize } = require('./canvas2d/size-strategies');
const { getWatermarkConfig } = require('./watermark-helper');
const { drawPatternWithAxes } = require('./pattern-canvas');

function sampleImage(page, imagePath, gridSize) {
  const SAMPLE_PX = 512;

  return new Promise((resolve, reject) => {
    wx.getImageInfo({
      src: imagePath,
      success: (info) => {
        const ratio = info.width / info.height;
        let sampW;
        let sampH;

        if (ratio >= 1) {
          sampW = SAMPLE_PX;
          sampH = Math.max(1, Math.round(SAMPLE_PX / ratio));
        } else {
          sampH = SAMPLE_PX;
          sampW = Math.max(1, Math.round(SAMPLE_PX * ratio));
        }

        waitCanvas2dReady(page, 'sampleCanvas2dComp', {
          label: 'ai-sample-canvas',
          maxCompRetry: 15,
          maxCtxRetry: 20
        }).then(({ comp, ctx, canvas }) => {
          if (typeof comp.resizeSync === 'function') {
            comp.resizeSync(sampW, sampH);
          }

          const img = canvas.createImage();
          img.onload = () => {
            ctx.drawImage(img, 0, 0, sampW, sampH);
            const imgData = ctx.getImageData(0, 0, sampW, sampH);
            resolve(colorMatcher.sampleGrid(imgData.data, sampW, sampH, gridSize, 'average'));
          };
          img.onerror = reject;
          img.src = imagePath;
        }).catch(reject);
      },
      fail: reject
    });
  });
}

function mirrorGridRows(grid) {
  return (grid || []).map(row => Array.isArray(row) ? row.slice().reverse() : row);
}

function convertMappedToMatchedGrid(mappedPixelData) {
  return (mappedPixelData || []).map(row =>
    row.map(cell => ({
      id: cell.id,
      name: cell.name,
      r: cell.r,
      g: cell.g,
      b: cell.b
    }))
  );
}

async function exportResultImage(page, mappedPixelData, actualRows, actualCols) {
  const canvasSize = 1024;

  return waitCanvas2dReady(page, 'resultCanvas2dComp', {
    label: 'ai-result-export',
    maxCompRetry: 15,
    maxCtxRetry: 20
  }).then(({ comp, ctx }) => {
    const cellSize = canvasSize / Math.max(actualRows, actualCols);
    const drawWidth = actualCols * cellSize;
    const drawHeight = actualRows * cellSize;
    const offsetX = (canvasSize - drawWidth) / 2;
    const offsetY = (canvasSize - drawHeight) / 2;

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

    return comp.exportTempFilePath({
      width: canvasSize,
      height: canvasSize
    }).then((tempPath) => {
      ctx.clearRect(0, 0, canvasSize, canvasSize);
      if (typeof comp.resizeSync === 'function') comp.resizeSync(1, 1);
      return tempPath;
    });
  }).catch((err) => {
    console.error('[ai-result-processor] result image export failed', err);
    return '';
  });
}

async function exportPatternImage(page, gridData, colorPalette, gridSize) {
  return waitCanvas2dReady(page, 'patternCanvas2dComp', {
    label: 'ai-pattern-export',
    maxCompRetry: 15,
    maxCtxRetry: 20
  }).then(async ({ comp, ctx }) => {
    const boardSize = patternBoardSize(gridSize, gridSize);
    const { appName, watermarkConfig } = await getWatermarkConfig();
    const drawOptions = {
      maxCanvasSize: 4096,
      appName,
      watermark: watermarkConfig
    };

    const layoutPreview = drawPatternWithAxes(ctx, gridData, colorPalette, gridSize, boardSize, drawOptions);
    if (typeof comp.resizeSync === 'function') {
      comp.resizeSync(layoutPreview.totalWidth, layoutPreview.totalHeight);
    }

    const context2 = comp.getContext();
    const drawCtx = context2 && context2.ctx ? context2.ctx : ctx;
    drawCtx.clearRect(0, 0, layoutPreview.totalWidth, layoutPreview.totalHeight);
    const layout = drawPatternWithAxes(drawCtx, gridData, colorPalette, gridSize, boardSize, drawOptions);

    return comp.exportTempFilePath({
      width: layout.totalWidth,
      height: layout.totalHeight
    }).then((tempPath) => {
      drawCtx.clearRect(0, 0, layout.totalWidth, layout.totalHeight);
      if (typeof comp.resizeSync === 'function') comp.resizeSync(1, 1);
      return tempPath;
    });
  }).catch((err) => {
    console.error('[ai-result-processor] pattern image export failed', err);
    return '';
  });
}

async function processAiResult(page, imageUrl, options = {}) {
  const gridSize = Number(options.gridSize || 48);
  const brand = options.brand || 'MARD';
  const similarityThreshold = Number(options.similarityThreshold || 30);

  const rgbGrid = await sampleImage(page, imageUrl, gridSize);
  const matchedGrid = await colorMatcher.matchColors(rgbGrid, brand, 0, 'standard');
  let { mappedPixelData, colorStats, gridData, colorPalette } = colorMatcher.convertToMappedPixelData(matchedGrid);

  const mergedResult = await colorMatcher.mergeSimilarColors({ mappedPixelData, colorStats }, similarityThreshold);
  mappedPixelData = mergedResult.mappedPixelData;
  colorStats = mergedResult.colorStats;

  if (options.mirror) {
    mappedPixelData = mirrorGridRows(mappedPixelData);
  }

  const converted = colorMatcher.convertToMappedPixelData(convertMappedToMatchedGrid(mappedPixelData));
  gridData = converted.gridData;
  colorPalette = converted.colorPalette;
  colorStats = colorMatcher.calcColorStats(mappedPixelData);

  const totalBeads = colorStats.reduce((sum, item) => sum + (item.count || 0), 0);
  const actualRows = mappedPixelData.length;
  const actualCols = mappedPixelData.length > 0 ? mappedPixelData[0].length : 0;
  const resultImageUrl = await exportResultImage(page, mappedPixelData, actualRows, actualCols);
  const colorNumberImageUrl = await exportPatternImage(page, gridData, colorPalette, gridSize);

  return {
    mappedPixelData,
    colorList: colorStats,
    colorPalette,
    gridData,
    totalBeads,
    colorCount: colorStats.length,
    resultImageUrl,
    colorNumberImageUrl
  };
}

module.exports = {
  processAiResult
};
