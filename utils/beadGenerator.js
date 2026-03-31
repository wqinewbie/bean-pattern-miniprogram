/**
 * 拼豆图纸前端生成算法（后端颜色匹配版）
 * 1. 本地采样获取 RGB 网格
 * 2. 发送到后端 /api/bead/match-colors 做颜色匹配
 * 3. 用匹配结果绘制结果图和图纸
 */
var request = require('./request');

var SAMPLE_PX = 512;
var DRAW_LONG = 624;

function generateBeadPattern(imagePath, gridSize, style, brand) {
  brand = brand || 'hama';
  return new Promise(function(resolve, reject) {
    wx.getImageInfo({
      src: imagePath,
      success: function(info) {
        var ratio = info.width / info.height;
        var gridW, gridH;
        if (ratio >= 1) {
          gridW = gridSize;
          gridH = Math.max(1, Math.round(gridSize / ratio));
        } else {
          gridH = gridSize;
          gridW = Math.max(1, Math.round(gridSize * ratio));
        }
        var sampW, sampH;
        if (ratio >= 1) {
          sampW = SAMPLE_PX;
          sampH = Math.max(1, Math.round(SAMPLE_PX / ratio));
        } else {
          sampH = SAMPLE_PX;
          sampW = Math.max(1, Math.round(SAMPLE_PX * ratio));
        }
        var drawW, drawH;
        if (ratio >= 1) {
          drawW = DRAW_LONG;
          drawH = Math.max(1, Math.round(DRAW_LONG / ratio));
        } else {
          drawH = DRAW_LONG;
          drawW = Math.max(1, Math.round(DRAW_LONG * ratio));
        }
        var cellW = drawW / gridW;
        var cellH = drawH / gridH;

        // 采样
        var sCtx = wx.createCanvasContext('bead-sample-canvas');
        sCtx.drawImage(imagePath, 0, 0, sampW, sampH);
        sCtx.draw(false, function() {
          wx.canvasGetImageData({
            canvasId: 'bead-sample-canvas',
            x: 0, y: 0, width: sampW, height: sampH,
            success: function(pd) {
              try {
                var rgbGrid = sampleGrid(pd.data, sampW, sampH, gridW, gridH);
                // 发给后端匹配颜色
                request.post('/api/bead/match-colors', { brand: brand, grid: rgbGrid })
                  .then(function(matchedGrid) {
                    console.log('[bead] match ok, rows:', matchedGrid && matchedGrid.length);
                    return drawResult(matchedGrid, gridW, gridH, cellW, cellH, drawW, drawH)
                      .then(function(rp) {
                        return drawPattern(matchedGrid, gridW, gridH, cellW, cellH, drawW, drawH)
                          .then(function(pp) {
                            var colorStats = calcStats(matchedGrid);
                            resolve({ resultPath: rp, patternPath: pp, colorStats: colorStats });
                          });
                      });
                  })
                  .catch(reject);
              } catch(e) { reject(e); }
            },
            fail: reject
          });
        });
      },
      fail: reject
    });
  });
}

// 采样：返回二维 RGB 数组 [[[r,g,b], ...], ...]
function sampleGrid(data, sw, sh, gw, gh) {
  var cw = sw / gw, ch = sh / gh;
  var grid = [];
  for (var gy = 0; gy < gh; gy++) {
    var row = [];
    for (var gx = 0; gx < gw; gx++) {
      var x0 = Math.floor(gx * cw), x1 = Math.min(Math.ceil((gx+1)*cw), sw);
      var y0 = Math.floor(gy * ch), y1 = Math.min(Math.ceil((gy+1)*ch), sh);
      var r=0,g=0,b=0,a=0,n=0;
      for (var py=y0; py<y1; py++) {
        for (var px=x0; px<x1; px++) {
          var i=(py*sw+px)*4;
          r+=data[i]; g+=data[i+1]; b+=data[i+2]; a+=data[i+3]; n++;
        }
      }
      if (n===0||a/n<64) row.push([255,255,255]);
      else row.push([Math.round(r/n), Math.round(g/n), Math.round(b/n)]);
    }
    grid.push(row);
  }
  return grid;
}

function drawResult(grid, gw, gh, cw, ch, canvasW, canvasH) {
  return new Promise(function(resolve, reject) {
    var ctx = wx.createCanvasContext('bead-result-canvas');
    ctx.setFillStyle('#bbbbbb');
    ctx.fillRect(0, 0, canvasW, canvasH);
    for (var y=0; y<gh; y++) {
      for (var x=0; x<gw; x++) {
        var c = grid[y][x];
        ctx.setFillStyle('rgb('+c.r+','+c.g+','+c.b+')');
        var gap = Math.min(cw,ch)>3 ? 0.5 : 0;
        ctx.fillRect(x*cw+gap, y*ch+gap, cw-gap*2, ch-gap*2);
      }
    }
    ctx.draw(false, function() {
      wx.canvasToTempFilePath({
        canvasId:'bead-result-canvas',
        x:0,y:0,width:canvasW,height:canvasH,
        destWidth:canvasW,destHeight:canvasH,fileType:'png',
        success:function(r){resolve(r.tempFilePath);},fail:reject
      });
    });
  });
}

function drawPattern(grid, gw, gh, cw, ch, canvasW, canvasH) {
  return new Promise(function(resolve, reject) {
    var ctx = wx.createCanvasContext('bead-pattern-canvas');
    ctx.setFillStyle('#ffffff');
    ctx.fillRect(0, 0, canvasW, canvasH);
    var minCell = Math.min(cw, ch);
    var showLabel = minCell >= 7;
    var fs = Math.max(4, Math.floor(minCell * 0.38));
    for (var y=0; y<gh; y++) {
      for (var x=0; x<gw; x++) {
        var c = grid[y][x];
        ctx.setFillStyle('rgb('+c.r+','+c.g+','+c.b+')');
        ctx.fillRect(x*cw, y*ch, cw, ch);
        if (showLabel) {
          var lum = 0.299*c.r+0.587*c.g+0.114*c.b;
          ctx.setFillStyle(lum>140?'rgba(0,0,0,0.72)':'rgba(255,255,255,0.88)');
          ctx.setFontSize(fs);
          ctx.setTextAlign('center');
          ctx.setTextBaseline('middle');
          ctx.fillText(c.id, x*cw+cw/2, y*ch+ch/2);
        }
      }
    }
    ctx.setStrokeStyle('rgba(0,0,0,0.15)');
    ctx.setLineWidth(0.5);
    for (var i=0; i<=gw; i++) {
      ctx.beginPath();ctx.moveTo(i*cw,0);ctx.lineTo(i*cw,canvasH);ctx.stroke();
    }
    for (var j=0; j<=gh; j++) {
      ctx.beginPath();ctx.moveTo(0,j*ch);ctx.lineTo(canvasW,j*ch);ctx.stroke();
    }
    ctx.draw(false, function() {
      wx.canvasToTempFilePath({
        canvasId:'bead-pattern-canvas',
        x:0,y:0,width:canvasW,height:canvasH,
        destWidth:canvasW,destHeight:canvasH,fileType:'png',
        success:function(r){resolve(r.tempFilePath);},fail:reject
      });
    });
  });
}

function calcStats(grid) {
  var map = {};
  for (var i=0; i<grid.length; i++) {
    for (var j=0; j<grid[i].length; j++) {
      var c = grid[i][j];
      if (!map[c.id]) map[c.id]={id:c.id,name:c.name,r:c.r,g:c.g,b:c.b,count:0};
      map[c.id].count++;
    }
  }
  var arr=[];
  for (var k in map) arr.push(map[k]);
  return arr.sort(function(a,b){return b.count-a.count;});
}

module.exports = { generateBeadPattern: generateBeadPattern };
