/**
 * 多品牌拼豆色板
 * 支持：Hama / Perler / Artkal
 */

// ── Hama（丹麦）60色 ──────────────────────────────────────────────────────────
var HAMA_COLORS = [
  { id:'H01', name:'白色',     r:255,g:255,b:255 },
  { id:'H02', name:'奶油色',   r:255,g:250,b:205 },
  { id:'H03', name:'浅黄色',   r:255,g:239,b:153 },
  { id:'H04', name:'黄色',     r:255,g:220,b:0   },
  { id:'H05', name:'深黄色',   r:240,g:180,b:0   },
  { id:'H06', name:'橙色',     r:255,g:140,b:0   },
  { id:'H07', name:'深橙色',   r:220,g:90, b:0   },
  { id:'H08', name:'浅红色',   r:255,g:120,b:100 },
  { id:'H09', name:'红色',     r:220,g:20, b:20  },
  { id:'H10', name:'深红色',   r:160,g:0,  b:0   },
  { id:'H11', name:'玫红色',   r:220,g:30, b:90  },
  { id:'H12', name:'粉色',     r:255,g:180,b:200 },
  { id:'H13', name:'浅粉色',   r:255,g:210,b:230 },
  { id:'H14', name:'紫红色',   r:180,g:0,  b:100 },
  { id:'H15', name:'紫色',     r:130,g:0,  b:160 },
  { id:'H16', name:'深紫色',   r:80, g:0,  b:120 },
  { id:'H17', name:'淡紫色',   r:200,g:160,b:220 },
  { id:'H18', name:'蓝紫色',   r:100,g:80, b:180 },
  { id:'H19', name:'深蓝色',   r:0,  g:0,  b:160 },
  { id:'H20', name:'蓝色',     r:0,  g:60, b:220 },
  { id:'H21', name:'亮蓝色',   r:30, g:120,b:255 },
  { id:'H22', name:'天蓝色',   r:100,g:180,b:255 },
  { id:'H23', name:'浅蓝色',   r:180,g:220,b:255 },
  { id:'H24', name:'冰蓝色',   r:210,g:240,b:255 },
  { id:'H25', name:'青色',     r:0,  g:180,b:200 },
  { id:'H26', name:'深青色',   r:0,  g:120,b:140 },
  { id:'H27', name:'薄荷绿',   r:150,g:230,b:200 },
  { id:'H28', name:'浅绿色',   r:170,g:230,b:130 },
  { id:'H29', name:'草绿色',   r:100,g:200,b:60  },
  { id:'H30', name:'绿色',     r:0,  g:160,b:0   },
  { id:'H31', name:'深绿色',   r:0,  g:100,b:0   },
  { id:'H32', name:'墨绿色',   r:0,  g:60, b:40  },
  { id:'H33', name:'黄绿色',   r:180,g:210,b:0   },
  { id:'H34', name:'橄榄色',   r:130,g:130,b:0   },
  { id:'H35', name:'卡其色',   r:180,g:160,b:100 },
  { id:'H36', name:'浅棕色',   r:210,g:170,b:120 },
  { id:'H37', name:'棕色',     r:160,g:100,b:50  },
  { id:'H38', name:'深棕色',   r:100,g:55, b:20  },
  { id:'H39', name:'巧克力色', r:70, g:35, b:10  },
  { id:'H40', name:'肤色',     r:255,g:210,b:170 },
  { id:'H41', name:'浅肤色',   r:255,g:230,b:200 },
  { id:'H42', name:'深肤色',   r:180,g:120,b:80  },
  { id:'H43', name:'浅灰色',   r:210,g:210,b:210 },
  { id:'H44', name:'灰色',     r:160,g:160,b:160 },
  { id:'H45', name:'深灰色',   r:100,g:100,b:100 },
  { id:'H46', name:'炭灰色',   r:60, g:60, b:60  },
  { id:'H47', name:'黑色',     r:20, g:20, b:20  },
  { id:'H48', name:'金色',     r:220,g:180,b:50  },
  { id:'H49', name:'银色',     r:190,g:195,b:200 },
  { id:'H50', name:'荧光黄',   r:240,g:255,b:0   },
  { id:'H51', name:'荧光橙',   r:255,g:160,b:0   },
  { id:'H52', name:'荧光粉',   r:255,g:80, b:180 },
  { id:'H53', name:'荧光绿',   r:0,  g:255,b:80  },
  { id:'H54', name:'荧光蓝',   r:0,  g:200,b:255 },
  { id:'H55', name:'珍珠白',   r:245,g:245,b:235 },
  { id:'H56', name:'玫瑰金',   r:220,g:150,b:130 },
  { id:'H57', name:'丁香紫',   r:170,g:130,b:200 },
  { id:'H58', name:'牛仔蓝',   r:70, g:100,b:160 },
  { id:'H59', name:'松石绿',   r:60, g:180,b:160 },
  { id:'H60', name:'珊瑚红',   r:255,g:100,b:90  },
];

// ── Perler（美国）60色 ────────────────────────────────────────────────────────
var PERLER_COLORS = [
  { id:'P01', name:'白色',     r:255,g:255,b:255 },
  { id:'P02', name:'奶白色',   r:252,g:248,b:220 },
  { id:'P03', name:'黄色',     r:255,g:225,b:0   },
  { id:'P04', name:'柠檬黄',   r:250,g:240,b:100 },
  { id:'P05', name:'橙色',     r:255,g:135,b:0   },
  { id:'P06', name:'浅橙色',   r:255,g:175,b:80  },
  { id:'P07', name:'红色',     r:210,g:15, b:15  },
  { id:'P08', name:'深红色',   r:155,g:0,  b:0   },
  { id:'P09', name:'樱桃红',   r:220,g:40, b:60  },
  { id:'P10', name:'粉红色',   r:255,g:170,b:190 },
  { id:'P11', name:'浅粉色',   r:255,g:205,b:225 },
  { id:'P12', name:'热粉色',   r:255,g:60, b:140 },
  { id:'P13', name:'紫红色',   r:175,g:0,  b:95  },
  { id:'P14', name:'紫色',     r:125,g:0,  b:155 },
  { id:'P15', name:'薰衣草紫', r:195,g:155,b:215 },
  { id:'P16', name:'深紫色',   r:75, g:0,  b:115 },
  { id:'P17', name:'蓝紫色',   r:95, g:75, b:175 },
  { id:'P18', name:'深蓝色',   r:0,  g:0,  b:155 },
  { id:'P19', name:'蓝色',     r:0,  g:55, b:215 },
  { id:'P20', name:'皇家蓝',   r:25, g:85, b:185 },
  { id:'P21', name:'天蓝色',   r:90, g:175,b:255 },
  { id:'P22', name:'浅蓝色',   r:175,g:215,b:255 },
  { id:'P23', name:'冰蓝色',   r:205,g:235,b:255 },
  { id:'P24', name:'青色',     r:0,  g:175,b:195 },
  { id:'P25', name:'深青色',   r:0,  g:115,b:135 },
  { id:'P26', name:'薄荷色',   r:145,g:225,b:195 },
  { id:'P27', name:'浅绿色',   r:165,g:225,b:125 },
  { id:'P28', name:'绿色',     r:0,  g:155,b:0   },
  { id:'P29', name:'草绿色',   r:95, g:195,b:55  },
  { id:'P30', name:'深绿色',   r:0,  g:95, b:0   },
  { id:'P31', name:'墨绿色',   r:0,  g:55, b:35  },
  { id:'P32', name:'橄榄绿',   r:125,g:125,b:0   },
  { id:'P33', name:'黄绿色',   r:175,g:205,b:0   },
  { id:'P34', name:'卡其色',   r:175,g:155,b:95  },
  { id:'P35', name:'浅棕色',   r:205,g:165,b:115 },
  { id:'P36', name:'棕色',     r:155,g:95, b:45  },
  { id:'P37', name:'深棕色',   r:95, g:50, b:15  },
  { id:'P38', name:'巧克力色', r:65, g:30, b:5   },
  { id:'P39', name:'肤色',     r:255,g:205,b:165 },
  { id:'P40', name:'浅肤色',   r:255,g:225,b:195 },
  { id:'P41', name:'深肤色',   r:175,g:115,b:75  },
  { id:'P42', name:'浅灰色',   r:205,g:205,b:205 },
  { id:'P43', name:'灰色',     r:155,g:155,b:155 },
  { id:'P44', name:'深灰色',   r:95, g:95, b:95  },
  { id:'P45', name:'炭灰色',   r:55, g:55, b:55  },
  { id:'P46', name:'黑色',     r:15, g:15, b:15  },
  { id:'P47', name:'金色',     r:215,g:175,b:45  },
  { id:'P48', name:'银色',     r:185,g:190,b:195 },
  { id:'P49', name:'荧光黄',   r:235,g:255,b:0   },
  { id:'P50', name:'荧光橙',   r:255,g:155,b:0   },
  { id:'P51', name:'荧光粉',   r:255,g:75, b:175 },
  { id:'P52', name:'荧光绿',   r:0,  g:250,b:75  },
  { id:'P53', name:'珍珠白',   r:240,g:240,b:230 },
  { id:'P54', name:'糖果蓝',   r:115,g:195,b:255 },
  { id:'P55', name:'珊瑚红',   r:255,g:95, b:85  },
  { id:'P56', name:'玫瑰金',   r:215,g:145,b:125 },
  { id:'P57', name:'松石绿',   r:55, g:175,b:155 },
  { id:'P58', name:'丁香紫',   r:165,g:125,b:195 },
  { id:'P59', name:'牛仔蓝',   r:65, g:95, b:155 },
  { id:'P60', name:'苔藓绿',   r:85, g:115,b:55  },
];

// ── Artkal（中国，色号丰富）80色 ─────────────────────────────────────────────
var ARTKAL_COLORS = [
  { id:'A01', name:'白色',     r:255,g:255,b:255 },
  { id:'A02', name:'米白色',   r:250,g:245,b:210 },
  { id:'A03', name:'浅黄',     r:255,g:238,b:140 },
  { id:'A04', name:'黄色',     r:255,g:215,b:0   },
  { id:'A05', name:'金黄色',   r:235,g:175,b:0   },
  { id:'A06', name:'橙黄色',   r:255,g:155,b:0   },
  { id:'A07', name:'橙色',     r:240,g:100,b:0   },
  { id:'A08', name:'朱红色',   r:230,g:45, b:15  },
  { id:'A09', name:'红色',     r:205,g:10, b:10  },
  { id:'A10', name:'深红色',   r:145,g:0,  b:0   },
  { id:'A11', name:'酒红色',   r:120,g:0,  b:30  },
  { id:'A12', name:'玫红色',   r:215,g:25, b:85  },
  { id:'A13', name:'粉红色',   r:255,g:165,b:185 },
  { id:'A14', name:'浅粉色',   r:255,g:200,b:220 },
  { id:'A15', name:'樱花粉',   r:255,g:220,b:235 },
  { id:'A16', name:'紫红色',   r:170,g:0,  b:90  },
  { id:'A17', name:'紫色',     r:120,g:0,  b:150 },
  { id:'A18', name:'深紫色',   r:70, g:0,  b:110 },
  { id:'A19', name:'淡紫色',   r:195,g:155,b:215 },
  { id:'A20', name:'蓝紫色',   r:90, g:70, b:170 },
  { id:'A21', name:'深蓝色',   r:0,  g:0,  b:150 },
  { id:'A22', name:'蓝色',     r:0,  g:50, b:210 },
  { id:'A23', name:'皇家蓝',   r:20, g:80, b:180 },
  { id:'A24', name:'天蓝色',   r:85, g:170,b:250 },
  { id:'A25', name:'浅蓝色',   r:170,g:210,b:255 },
  { id:'A26', name:'冰蓝色',   r:200,g:235,b:255 },
  { id:'A27', name:'青色',     r:0,  g:170,b:190 },
  { id:'A28', name:'深青色',   r:0,  g:110,b:130 },
  { id:'A29', name:'薄荷绿',   r:140,g:220,b:190 },
  { id:'A30', name:'浅绿色',   r:160,g:225,b:120 },
  { id:'A31', name:'草绿色',   r:90, g:190,b:50  },
  { id:'A32', name:'绿色',     r:0,  g:150,b:0   },
  { id:'A33', name:'深绿色',   r:0,  g:90, b:0   },
  { id:'A34', name:'墨绿色',   r:0,  g:50, b:30  },
  { id:'A35', name:'黄绿色',   r:170,g:205,b:0   },
  { id:'A36', name:'橄榄色',   r:120,g:120,b:0   },
  { id:'A37', name:'卡其色',   r:170,g:150,b:90  },
  { id:'A38', name:'浅棕色',   r:200,g:160,b:110 },
  { id:'A39', name:'棕色',     r:150,g:90, b:40  },
  { id:'A40', name:'深棕色',   r:90, g:45, b:10  },
  { id:'A41', name:'巧克力色', r:60, g:25, b:5   },
  { id:'A42', name:'肤色',     r:255,g:205,b:165 },
  { id:'A43', name:'浅肤色',   r:255,g:225,b:195 },
  { id:'A44', name:'深肤色',   r:170,g:110,b:70  },
  { id:'A45', name:'浅灰色',   r:200,g:200,b:200 },
  { id:'A46', name:'灰色',     r:150,g:150,b:150 },
  { id:'A47', name:'深灰色',   r:90, g:90, b:90  },
  { id:'A48', name:'炭灰色',   r:50, g:50, b:50  },
  { id:'A49', name:'黑色',     r:10, g:10, b:10  },
  { id:'A50', name:'金色',     r:210,g:170,b:40  },
  { id:'A51', name:'银色',     r:180,g:185,b:190 },
  { id:'A52', name:'铜色',     r:180,g:115,b:60  },
  { id:'A53', name:'荧光黄',   r:230,g:255,b:0   },
  { id:'A54', name:'荧光橙',   r:255,g:150,b:0   },
  { id:'A55', name:'荧光粉',   r:255,g:70, b:170 },
  { id:'A56', name:'荧光绿',   r:0,  g:245,b:70  },
  { id:'A57', name:'荧光蓝',   r:0,  g:195,b:250 },
  { id:'A58', name:'珍珠白',   r:238,g:238,b:228 },
  { id:'A59', name:'珍珠粉',   r:245,g:200,b:210 },
  { id:'A60', name:'珍珠蓝',   r:180,g:210,b:240 },
  { id:'A61', name:'玫瑰金',   r:210,g:140,b:120 },
  { id:'A62', name:'松石绿',   r:50, g:170,b:150 },
  { id:'A63', name:'丁香紫',   r:160,g:120,b:190 },
  { id:'A64', name:'牛仔蓝',   r:60, g:90, b:150 },
  { id:'A65', name:'苔藓绿',   r:80, g:110,b:50  },
  { id:'A66', name:'珊瑚红',   r:250,g:90, b:80  },
  { id:'A67', name:'茄紫色',   r:80, g:20, b:80  },
  { id:'A68', name:'宝石蓝',   r:0,  g:70, b:140 },
  { id:'A69', name:'孔雀绿',   r:0,  g:130,b:120 },
  { id:'A70', name:'杏色',     r:255,g:195,b:145 },
  { id:'A71', name:'象牙白',   r:248,g:245,b:225 },
  { id:'A72', name:'烟灰色',   r:130,g:130,b:125 },
  { id:'A73', name:'军绿色',   r:75, g:85, b:45  },
  { id:'A74', name:'砖红色',   r:185,g:70, b:50  },
  { id:'A75', name:'土黄色',   r:195,g:155,b:65  },
  { id:'A76', name:'蔚蓝色',   r:30, g:145,b:210 },
  { id:'A77', name:'嫩绿色',   r:130,g:215,b:80  },
  { id:'A78', name:'深桃红',   r:200,g:50, b:100 },
  { id:'A79', name:'午夜蓝',   r:20, g:20, b:80  },
  { id:'A80', name:'暗棕色',   r:80, g:40, b:20  },
];

// ── 品牌映射表 ────────────────────────────────────────────────────────────────
var BRAND_MAP = {
  hama:   HAMA_COLORS,
  perler: PERLER_COLORS,
  artkal: ARTKAL_COLORS
};

// 默认品牌
var _currentColors = HAMA_COLORS;

/**
 * 切换当前使用的品牌色板
 * @param {'hama'|'perler'|'artkal'} brand
 */
function setBrand(brand) {
  _currentColors = BRAND_MAP[brand] || HAMA_COLORS;
  // 重新预计算 Lab 值
  _currentColorsLab = _currentColors.map(function(c) {
    return Object.assign({}, c, { lab: rgbToLab(c.r, c.g, c.b) });
  });
}

// ── CIE Lab 色差算法 ──────────────────────────────────────────────────────────
function rgbToLab(r, g, b) {
  var R = r/255, G = g/255, B = b/255;
  R = R > 0.04045 ? Math.pow((R+0.055)/1.055, 2.4) : R/12.92;
  G = G > 0.04045 ? Math.pow((G+0.055)/1.055, 2.4) : G/12.92;
  B = B > 0.04045 ? Math.pow((B+0.055)/1.055, 2.4) : B/12.92;
  var X = (R*0.4124 + G*0.3576 + B*0.1805)/0.95047;
  var Y = (R*0.2126 + G*0.7152 + B*0.0722)/1.00000;
  var Z = (R*0.0193 + G*0.1192 + B*0.9505)/1.08883;
  var f = function(t){ return t > 0.008856 ? Math.pow(t,1/3) : 7.787*t + 16/116; };
  return [116*f(Y)-16, 500*(f(X)-f(Y)), 200*(f(Y)-f(Z))];
}

var _currentColorsLab = HAMA_COLORS.map(function(c) {
  return Object.assign({}, c, { lab: rgbToLab(c.r, c.g, c.b) });
});

function findClosestColor(r, g, b) {
  var src = rgbToLab(r, g, b);
  var best = _currentColorsLab[0];
  var bestDist = Infinity;
  for (var i = 0; i < _currentColorsLab.length; i++) {
    var c = _currentColorsLab[i];
    var dL = src[0]-c.lab[0];
    var da = src[1]-c.lab[1];
    var db = src[2]-c.lab[2];
    // a* b* 加权2.5倍，拉大有彩色（肤色）和无彩色（灰）距离
    var d = dL*dL + da*da*2.5 + db*db*2.5;
    if (d < bestDist) { bestDist = d; best = c; }
  }
  return best;
}

module.exports = {
  HAMA_COLORS: HAMA_COLORS,
  PERLER_COLORS: PERLER_COLORS,
  ARTKAL_COLORS: ARTKAL_COLORS,
  setBrand: setBrand,
  findClosestColor: findClosestColor
};