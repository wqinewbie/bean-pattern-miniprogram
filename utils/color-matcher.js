/**
 * 颜色匹配算法共享模块
 * 供 result.js 和 ai-result.js 共用，消除 ~150 行重复代码
 */

const request = require('./request');

/**
 * 从采样数据中生成 RGB 网格
 * @param {Uint8ClampedArray} data - ImageData.data
 * @param {number} sw - 采样宽度
 * @param {number} sh - 采样高度
 * @param {number} gridSize - 目标网格尺寸
 * @param {string} mode - 'average'|'dominant' 采样模式
 */
function sampleGrid(data, sw, sh, gridSize, mode) {
  const aspect = sw / sh;
  const gw = aspect >= 1 ? gridSize : Math.max(1, Math.round(gridSize * aspect));
  const gh = aspect >= 1 ? Math.max(1, Math.round(gridSize / aspect)) : gridSize;
  const cw = sw / gw;
  const ch = sh / gh;
  const grid = [];
  const useDominant = mode === 'dominant';

  for (let gy = 0; gy < gh; gy++) {
    const row = [];
    for (let gx = 0; gx < gw; gx++) {
      const x0 = Math.floor(gx * cw), x1 = Math.min(Math.ceil((gx + 1) * cw), sw);
      const y0 = Math.floor(gy * ch), y1 = Math.min(Math.ceil((gy + 1) * ch), sh);
      const pixels = [];

      for (let py = y0; py < y1; py++) {
        for (let px = x0; px < x1; px++) {
          const i = (py * sw + px) * 4;
          if (data[i + 3] < 128) continue;
          pixels.push([data[i], data[i + 1], data[i + 2]]);
        }
      }

      if (!pixels.length) {
        row.push([255, 255, 255]);
      } else if (useDominant) {
        const m = {};
        let d = null, c = 0;
        pixels.forEach((rgb) => {
          const k = rgb.join(',');
          m[k] = (m[k] || 0) + 1;
          if (m[k] > c) { c = m[k]; d = rgb; }
        });
        row.push(d || [255, 255, 255]);
      } else {
        let r = 0, g = 0, b = 0;
        pixels.forEach((rgb) => { r += rgb[0]; g += rgb[1]; b += rgb[2]; });
        row.push([Math.round(r / pixels.length), Math.round(g / pixels.length), Math.round(b / pixels.length)]);
      }
    }
    grid.push(row);
  }
  return grid;
}

/**
 * 计算两个颜色之间的欧几里得距离
 */
function colorDistance(colorA, colorB) {
  const dr = Number(colorA.r || 0) - Number(colorB.r || 0);
  const dg = Number(colorA.g || 0) - Number(colorB.g || 0);
  const db = Number(colorA.b || 0) - Number(colorB.b || 0);
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/**
 * RGB 转 HEX
 */
function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(v => {
    const hex = (v || 0).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
}

/**
 * 从 mappedPixelData 统计颜色使用情况
 */
function calcColorStats(mappedPixelData) {
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
}

/**
 * 合并相似颜色（基于色差阈值）
 */
function mergeSimilarColors(mappedResult, threshold) {
  return new Promise((resolve) => {
    const mapped = mappedResult && mappedResult.mappedPixelData ? mappedResult.mappedPixelData : [];
    const th = Math.max(0, Math.min(100, Number(threshold || 0)));
    if (!mapped.length || th <= 0) {
      resolve({ mappedPixelData: mapped, colorStats: mappedResult && mappedResult.colorStats ? mappedResult.colorStats : calcColorStats(mapped) });
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
        if (colorDistance(a, b) < th) {
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
    const colorStats = calcColorStats(merged);
    const gridData = merged.map(row => row.map(cell => cell.id));
    const colorPalette = colorStats.map(s => ({ id: s.id, name: s.name, hex: s.hex, r: s.r, g: s.g, b: s.b }));
    resolve({ mappedPixelData: merged, colorStats, gridData, colorPalette });
  });
}

/**
 * 将匹配结果转换为 mappedPixelData 格式
 */
function convertToMappedPixelData(matchedGrid) {
  if (!matchedGrid || !matchedGrid.length) {
    return { mappedPixelData: [], colorStats: [] };
  }
  const mappedData = [];
  const colorStatsMap = {};
  for (let y = 0; y < matchedGrid.length; y++) {
    const row = [];
    const mrow = matchedGrid[y];
    if (!mrow) continue;
    for (let x = 0; x < mrow.length; x++) {
      const cell = mrow[x];
      if (!cell) continue;
      const item = { id: cell.id || '', name: cell.name || cell.id || '', hex: rgbToHex(cell.r, cell.g, cell.b), r: cell.r, g: cell.g, b: cell.b, isExternal: false };
      row.push(item);
      if (!colorStatsMap[item.id]) {
        colorStatsMap[item.id] = { id: item.id, name: item.name, hex: item.hex, r: item.r, g: item.g, b: item.b, count: 0 };
      }
      colorStatsMap[item.id].count++;
    }
    mappedData.push(row);
  }
  const colorStats = Object.values(colorStatsMap).sort((a, b) => b.count - a.count);
  const gridData = mappedData.map(row => row.map(cell => cell.id));
  const colorPalette = colorStats.map(s => ({ id: s.id, name: s.name, hex: s.hex, r: s.r, g: s.g, b: s.b }));
  return { mappedPixelData: mappedData, colorStats, gridData, colorPalette };
}

/**
 * 调用后端 API 匹配颜色
 */
function matchColors(rgbGrid, brand, colorCount, mode) {
  return new Promise((resolve, reject) => {
    request.post('/bead/match-colors', {
      brand: brand.toLowerCase(),
      colorCount: Number(colorCount || 0),
      grid: rgbGrid,
      algo: mode === 'dominant' ? 'dominant' : 'standard',
      similarityThreshold: 0,
    }).then((res) => resolve(res.data || res)).catch(reject);
  });
}

module.exports = {
  sampleGrid,
  colorDistance,
  rgbToHex,
  calcColorStats,
  mergeSimilarColors,
  convertToMappedPixelData,
  matchColors,
};
