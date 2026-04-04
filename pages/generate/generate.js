const { API_BASE_URL } = require('../../utils/config');
const request = require('../../utils/request');
const { ensureProfileComplete } = require('../../utils/profile-guard');

Page({
  data: {
    imageUrl: '', loading: false, loadingText: '处理中...', resultReady: false,
    resultUrl: '', patternUrl: '', colorStats: [], activeTab: 'result',
    mirrorOn: false,
    customMode: false,
    customConfirmed: false,
    customSizeVal: '',
    showColorSheet: false,
    // 品牌相关
    brandList: [],
    brandIndex: 0,
    // 色号相关（从后端动态加载）
    colorCountLabel: '全部色号',
    colorCountValue: 0,
    colorCountOptions: [{ value: 0, label: '全部色号' }],
    gridSizeIndex: 3,
    gridSizeOptions: [
      { value: 24, label: '24×24' },
      { value: 50, label: '50×50' },
      { value: 52, label: '52×52' },
      { value: 64, label: '64×64' },
      { value: 78, label: '78×78' },
      { value: 104, label: '104×104' }
    ],
    algoIndex: 0,
    algoOptions: [
      { value: 'standard', label: '标准模式' },
      { value: 'portrait', label: '人像模式' },
      { value: 'pixel',    label: '像素风格' }
    ]
  },

  onLoad(options) {
    if (options && options.imageUrl) {
      const url = decodeURIComponent(options.imageUrl);
      this.setData({ imageUrl: url });
    }
    this.loadBrandsFromServer();
  },

  loadBrandsFromServer() {
    request.get('/bead/brands').then((data) => {
      if (!data || typeof data !== 'object') return;
      const brandList = Object.keys(data);
      if (brandList.length === 0) return;
      // 默认选第一个品牌
      const firstBrand = brandList[0];
      const kits = data[firstBrand] || [];
      const colorCountOptions = [
        { value: 0, label: '全部色号' },
        ...kits.map(k => ({ value: k, label: k + '色' }))
      ];
      this.setData({
        brandList,
        brandIndex: 0,
        colorCountOptions,
        colorCountLabel: '全部色号',
        colorCountValue: 0,
        _brandsData: data
      });
    }).catch(() => {
      // 加载失败降级：使用 MARD 默认
      this.setData({
        brandList: ['MARD'],
        brandIndex: 0,
        colorCountOptions: [
          { value: 0, label: '全部色号' },
          { value: 24, label: '24色' }, { value: 48, label: '48色' },
          { value: 72, label: '72色' }, { value: 96, label: '96色' }
        ],
        colorCountLabel: '全部色号',
        colorCountValue: 0
      });
    });
  },

  onBack() {
    wx.navigateBack({ delta: 1 });
  },

  onBrandChange(e) {
    const idx = parseInt(e.detail.value);
    const brand = this.data.brandList[idx];
    const brandsData = this.data._brandsData || {};
    const kits = brandsData[brand] || [];
    const colorCountOptions = [
      { value: 0, label: '全部色号' },
      ...kits.map(k => ({ value: k, label: k + '色' }))
    ];
    this.setData({
      brandIndex: idx,
      colorCountOptions,
      colorCountLabel: '全部色号',
      colorCountValue: 0
    });
  },

  onGridSizeChange(e) {
    const index = e.detail !== undefined ? parseInt(e.detail.value) : parseInt(e.currentTarget.dataset.index);
    this.setData({ gridSizeIndex: index, customMode: false, customConfirmed: false, customSizeVal: '' });
  },

  onMirrorToggle() {
    this.setData({ mirrorOn: !this.data.mirrorOn });
  },

  onCustomMode() {
    if (this.data.customMode) {
      // 点确定：验证并保存
      let val = parseInt(this.data.customSizeVal, 10);
      if (isNaN(val) || val < 10) val = 24;
      if (val > 200) val = 200;
      this.setData({ customMode: false, customConfirmed: true, customSizeVal: String(val) });
    } else if (this.data.customConfirmed) {
      // 点重设：清除自定义，回到picker
      this.setData({ customMode: false, customConfirmed: false, customSizeVal: '' });
    } else {
      // 点自定义：进入输入模式
      this.setData({ customMode: true, customSizeVal: '' });
    }
  },

  onEditCustom() {
    // 点击自定义值：重新进入编辑
    this.setData({ customMode: true });
  },

  onCustomSizeInput(e) {
    this.setData({ customSizeVal: e.detail.value });
  },

  onCustomSizeBlur() {
    let val = parseInt(this.data.customSizeVal, 10);
    if (isNaN(val) || val < 10) val = 15;
    if (val > 100) val = 100;
    this.setData({ customSizeVal: String(val) });
  },

  onChooseImage() {
    wx.chooseMedia({ count:1, mediaType:['image'], sourceType:['album','camera'],
      success:(res)=>{this.setData({imageUrl:res.tempFiles[0].tempFilePath,
        resultReady:false,resultUrl:'',patternUrl:'',colorStats:[]});}});},

  onColorCountChange(e){this.setData({colorCountIndex:parseInt(e.detail.value)});},

  onShowColorSheet() {
    this.setData({ showColorSheet: true });
  },

  onHideColorSheet() {
    this.setData({ showColorSheet: false });
  },

  onSelectColorCount(e) {
    const { label, value } = e.currentTarget.dataset;
    this.setData({ colorCountLabel: label, colorCountValue: parseInt(value), showColorSheet: false });
  },

  onAlgoChange(e){this.setData({algoIndex:parseInt(e.detail.value)});},
  onTabChange(e){this.setData({activeTab:e.currentTarget.dataset.tab});},

  onGenerate(){
    ensureProfileComplete().then((ok) => {
      if (!ok) return;
      if(!this.data.imageUrl){this.onChooseImage();return;}
      this.startGenerate();
    });
  },

  startGenerate(){
    const{imageUrl,gridSizeOptions,gridSizeIndex,colorCountOptions,colorCountIndex,algoOptions,algoIndex,customMode,customConfirmed,customSizeVal,mirrorOn}=this.data;
    const gridSize=customConfirmed&&customSizeVal?parseInt(customSizeVal):gridSizeOptions[gridSizeIndex].value;
    const brand=this.data.brandList[this.data.brandIndex]||'MARD';
    const algo=algoOptions[algoIndex].value;
    const maxColors=this.data.colorCountValue||0;
    this.setData({loading:true,loadingText:'采样中...'});
    wx.getImageInfo({src:imageUrl,success:(info)=>{
      const ratio=info.width/info.height;
      const gridW=gridSize;
      const gridH=gridSize;
      const sampW=320,sampH=320;
      const drawW = ratio >= 1 ? sampW : Math.round(sampH * ratio);
      const drawH = ratio >= 1 ? Math.round(sampW / ratio) : sampH;
      const drawX = Math.floor((sampW - drawW) / 2);
      const drawY = Math.floor((sampH - drawH) / 2);
      const sCtx=wx.createCanvasContext('gen-sample-canvas');
      sCtx.setFillStyle('#FFFFFF');
      sCtx.fillRect(0,0,sampW,sampH);
      sCtx.drawImage(imageUrl,drawX,drawY,drawW,drawH);
      sCtx.draw(false,()=>{
        wx.canvasGetImageData({canvasId:'gen-sample-canvas',x:0,y:0,width:sampW,height:sampH,
          success:(pd)=>{
            const rawData=algo==='portrait'?this.enhancePortrait(pd.data,sampW,sampH):algo==='pixel'?this.sharpenPixel(pd.data,sampW,sampH):pd.data;
            const rawGrid=this.sampleGrid(rawData,sampW,sampH,gridW,gridH);
            const rgbGrid=mirrorOn?rawGrid.map(row=>[...row].reverse()):rawGrid;
            this.setData({loadingText:'颜色匹配中...'});
            request.post('/bead/match-colors',{brand,algo,colorCount:maxColors,grid:rgbGrid})
              .then((matched)=>{
                const grid=matched;
                this.setData({loadingText:'绘制图纸...'});
                return Promise.all([this.drawResult(grid,gridW,gridH),this.drawPattern(grid,gridW,gridH)])
                  .then(([rp,pp])=>({grid,rp,pp}));
              })
              .then(({grid,rp,pp})=>{
                const stats=this.calcStats(grid);
                this.setData({loadingText:'上传中...'});
                const sid=wx.getStorageSync('sessionId')||'';
                return Promise.all([this.uploadFile(imageUrl,sid),this.uploadFile(rp,sid),this.uploadFile(pp,sid)])
                  .then(([ou,ru,pu])=>request.post('/bead/pattern-local',{
                    imageUrl:ou,resultUrl:ru,patternUrl:pu,colorStats:JSON.stringify(stats)
                  }).then((data)=>({ru,pu,stats,taskId:data&&data.taskId?data.taskId:''})));
              })
              .then(({ru,pu,stats,taskId})=>{
                this.setData({loading:false});
                wx.navigateTo({
                  url: '/pages/result/result?taskId=' + (taskId||'') +
                       '&originalUrl=' + encodeURIComponent(imageUrl) +
                       '&resultUrl=' + encodeURIComponent(ru) +
                       '&patternUrl=' + encodeURIComponent(pu) +
                       '&colorStats=' + encodeURIComponent(JSON.stringify(stats)) +
                       '&gridSize=' + gridSize +
                       '&brand=' + encodeURIComponent(brand)
                });
              })
              .catch((err)=>{this.setData({loading:false});const msg=err&&err.message?err.message:(err&&err.errMsg?err.errMsg:'unknown');wx.showToast({title:'失败:'+msg.slice(0,20),icon:'none',duration:3000});});
          },fail:()=>{this.setData({loading:false});}
        });
      });
    },fail:()=>{this.setData({loading:false});}});
  },

  sampleGrid(data,sw,sh,gw,gh){
    const grid=[];
    for(let gy=0;gy<gh;gy++){
      const row=[];
      for(let gx=0;gx<gw;gx++){
        const x0=Math.floor(gx*sw/gw),x1=Math.min(Math.ceil((gx+1)*sw/gw),sw);
        const y0=Math.floor(gy*sh/gh),y1=Math.min(Math.ceil((gy+1)*sh/gh),sh);
        let r=0,g=0,b=0,a=0,n=0;
        for(let py=y0;py<y1;py++)for(let px=x0;px<x1;px++){
          const i=(py*sw+px)*4;r+=data[i];g+=data[i+1];b+=data[i+2];a+=data[i+3];n++;
        }
        row.push(n===0||a/n<64?[255,255,255]:[Math.round(r/n),Math.round(g/n),Math.round(b/n)]);
      }
      grid.push(row);
    }
    return grid;
  },

  limitColors(grid,maxColors){
    const stats=this.calcStats(grid);
    const top=stats.slice(0,maxColors);
    const allowed=new Set(top.map(c=>c.id));
    return grid.map(row=>row.map(c=>{
      if(allowed.has(c.id))return c;
      let best=top[0],bestD=Infinity;
      top.forEach(ac=>{const d=(c.r-ac.r)**2+(c.g-ac.g)**2+(c.b-ac.b)**2;if(d<bestD){bestD=d;best=ac;}});
      return best;
    }));
  },

  drawResult(grid,gw,gh){
    return new Promise((resolve,reject)=>{
      const BASE=624;
      const DW=gw>=gh?BASE:Math.round(BASE*gw/gh);
      const DH=gh>=gw?BASE:Math.round(BASE*gh/gw);
      const cw=DW/gw,ch=DH/gh;
      const ctx=wx.createCanvasContext('gen-result-canvas');
      ctx.setFillStyle('#ccc');ctx.fillRect(0,0,DW,DH);
      for(let y=0;y<gh;y++)for(let x=0;x<gw;x++){
        const c=grid[y][x];ctx.setFillStyle('rgb('+c.r+','+c.g+','+c.b+')');ctx.fillRect(x*cw,y*ch,Math.ceil(cw),Math.ceil(ch));
      }
      ctx.draw(false,()=>wx.canvasToTempFilePath({canvasId:'gen-result-canvas',
        x:0,y:0,width:DW,height:DH,destWidth:DW,destHeight:DH,fileType:'png',
        success:r=>resolve(r.tempFilePath),fail:reject}));
    });
  },

  drawPattern(grid,gw,gh){
    return new Promise((resolve,reject)=>{
      const MAXPX=1900,MARGIN=48,CELL=Math.max(16,Math.min(40,Math.floor((MAXPX-MARGIN)/Math.max(gw,gh))));
      const W=MARGIN+gw*CELL,H=MARGIN+gh*CELL;
      const stats=this.calcStats(grid);
      const DOT=16,GAP=8,ROW_H=28,COLS=Math.max(1,Math.floor((W-MARGIN)/120));
      const STATS_H=30+Math.ceil(stats.length/COLS)*ROW_H+20;
      const TOTAL_H=H+STATS_H;
      const ctx=wx.createCanvasContext('gen-pattern-canvas');
      ctx.setFillStyle('#fff');ctx.fillRect(0,0,W,TOTAL_H);
      const fs=Math.max(7,Math.floor(CELL*0.55));
      for(let y=0;y<gh;y++)for(let x=0;x<gw;x++){
        const c=grid[y][x],px=MARGIN+x*CELL,py=MARGIN+y*CELL;
        ctx.setFillStyle('rgb('+c.r+','+c.g+','+c.b+')');ctx.fillRect(px,py,CELL,CELL);
        if(CELL>=12){
          const lum=0.299*c.r+0.587*c.g+0.114*c.b;
          ctx.setFillStyle(lum>140?'rgba(0,0,0,0.6)':'rgba(255,255,255,0.85)');
          ctx.setFontSize(fs);ctx.font='bold '+fs+'px sans-serif';ctx.setTextAlign('center');ctx.setTextBaseline('middle');
          ctx.fillText(c.id,px+CELL/2,py+CELL/2);
        }
      }
      ctx.setStrokeStyle('rgba(0,0,0,0.1)');ctx.setLineWidth(0.5);
      for(let i=0;i<=gw;i++){ctx.beginPath();ctx.moveTo(MARGIN+i*CELL,MARGIN);ctx.lineTo(MARGIN+i*CELL,MARGIN+gh*CELL);ctx.stroke();}
      for(let j=0;j<=gh;j++){ctx.beginPath();ctx.moveTo(MARGIN,MARGIN+j*CELL);ctx.lineTo(MARGIN+gw*CELL,MARGIN+j*CELL);ctx.stroke();}
      const lfs=Math.max(6,Math.floor(MARGIN*0.45));
      ctx.setFontSize(lfs);ctx.setFillStyle('#333');ctx.setTextAlign('center');ctx.setTextBaseline('middle');
      // 每格都显示行列号，字体超小
      const numFs=Math.max(4,Math.min(8,Math.floor(MARGIN*0.38)));
      ctx.setFontSize(numFs);
      for(let x=0;x<gw;x++)ctx.fillText(''+(x+1),MARGIN+x*CELL+CELL/2,MARGIN/2);
      for(let y=0;y<gh;y++)ctx.fillText(''+(y+1),MARGIN/2,MARGIN+y*CELL+CELL/2);
      const sy0=H+10;
      ctx.setFontSize(10);ctx.setFillStyle('#333');ctx.setTextAlign('left');ctx.setTextBaseline('top');
      ctx.fillText('共 '+stats.length+' 种颜色',MARGIN,sy0);
      let sx=MARGIN,sy=sy0+20;
      stats.forEach((c,i)=>{
        if(i>0&&i%COLS===0){sx=MARGIN;sy+=ROW_H;}
        ctx.setFillStyle('rgb('+c.r+','+c.g+','+c.b+')');ctx.fillRect(sx,sy,DOT,DOT);
        ctx.setStrokeStyle('rgba(0,0,0,0.15)');ctx.setLineWidth(0.5);ctx.strokeRect(sx,sy,DOT,DOT);
        ctx.setFillStyle('#222');ctx.setFontSize(9);ctx.setTextBaseline('middle');
        ctx.fillText(c.id+'×'+c.count,sx+DOT+GAP,sy+DOT/2);
        sx+=120;
      });
      ctx.draw(false,()=>wx.canvasToTempFilePath({canvasId:'gen-pattern-canvas',
        x:0,y:0,width:W,height:TOTAL_H,destWidth:W,destHeight:TOTAL_H,fileType:'png',
        success:r=>resolve(r.tempFilePath),fail:reject}));
    });
  },

  // 人像模式：提升饱和度+对比度
  enhancePortrait(data,w,h){
    const out=new Uint8ClampedArray(data.length);
    for(let i=0;i<data.length;i+=4){
      let r=data[i],g=data[i+1],b=data[i+2],a=data[i+3];
      // brightness lift +20 to reduce dark shadows
      r=Math.min(255,r+20); g=Math.min(255,g+20); b=Math.min(255,b+20);
      // mild contrast 1.1
      r=Math.min(255,Math.max(0,Math.round((r-128)*1.1+128)));
      g=Math.min(255,Math.max(0,Math.round((g-128)*1.1+128)));
      b=Math.min(255,Math.max(0,Math.round((b-128)*1.1+128)));
      // saturation boost x1.4
      const max=Math.max(r,g,b),mn=Math.min(r,g,b),d=max-mn;
      if(d>0){
        const l=(max+mn)/2;
        const s=d/(l>127?510-max-mn:max+mn);
        const ns=Math.min(1,s*1.4);
        const scale=ns/s;
        const mid=(r+g+b)/3;
        r=Math.min(255,Math.max(0,Math.round(mid+(r-mid)*scale)));
        g=Math.min(255,Math.max(0,Math.round(mid+(g-mid)*scale)));
        b=Math.min(255,Math.max(0,Math.round(mid+(b-mid)*scale)));
      }
      out[i]=r;out[i+1]=g;out[i+2]=b;out[i+3]=a;
    }
    return out;
  },

  // 像素风格：锐化边缘
  sharpenPixel(data,w,h){
    const out=new Uint8ClampedArray(data.length);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const i=(y*w+x)*4;
      for(let c=0;c<3;c++){
        const v=data[i+c]*5;
        const t=y>0?data[((y-1)*w+x)*4+c]:data[i+c];
        const b2=y<h-1?data[((y+1)*w+x)*4+c]:data[i+c];
        const l=x>0?data[(y*w+x-1)*4+c]:data[i+c];
        const r=x<w-1?data[(y*w+x+1)*4+c]:data[i+c];
        out[i+c]=Math.min(255,Math.max(0,v-t-b2-l-r));
      }
      out[i+3]=data[i+3];
    }
    return out;
  },

  calcStats(grid){
    const map={};
    grid.forEach(row=>row.forEach(c=>{
      if(!map[c.id])map[c.id]={id:c.id,name:c.name||'',r:c.r,g:c.g,b:c.b,count:0};
      map[c.id].count++;
    }));
    return Object.values(map).sort((a,b)=>b.count-a.count);
  },

  uploadFile(filePath,sessionId){
    return new Promise((resolve,reject)=>{
      wx.uploadFile({
        url:API_BASE_URL+'/image/upload',filePath,name:'file',
        header:{'X-Session-Id':sessionId},
        success:(res)=>{
          try{const body=JSON.parse(res.data);
            if(res.statusCode===200&&body.code===0){resolve(body.data.imageUrl||body.data.originalUrl);return;}
          }catch(e){}
          reject(new Error('上传失败'));
        },fail:reject
      });
    });
  },

  onPreviewOriginal(){
    if(this.data.imageUrl)wx.previewImage({urls:[this.data.imageUrl],current:this.data.imageUrl});
  },

  onPreviewResult(){
    const{activeTab,imageUrl,resultUrl,patternUrl}=this.data;
    const cur=activeTab==='original'?imageUrl:activeTab==='result'?resultUrl:patternUrl;
    if(cur)wx.previewImage({urls:[imageUrl,resultUrl,patternUrl].filter(Boolean),current:cur});
  },

  onSaveImage(){
    const{activeTab,imageUrl,resultUrl,patternUrl}=this.data;
    const url=activeTab==='original'?imageUrl:activeTab==='result'?resultUrl:patternUrl;
    if(!url){wx.showToast({title:'暂无图片',icon:'none'});return;}
    const save=(fp)=>wx.saveImageToPhotosAlbum({filePath:fp,
      success:()=>wx.showToast({title:'已保存到相册',icon:'success'}),
      fail:()=>wx.showToast({title:'保存失败',icon:'none'})});
    if(url.startsWith('http')){
      wx.downloadFile({url,success:(r)=>{if(r.statusCode===200)save(r.tempFilePath);},fail:()=>{}});
    }else{save(url);}
  },

  onStatTap(e){
    const item=e.currentTarget.dataset.item;
    wx.showToast({title:item.id+' '+item.name+' '+item.count+'颗',icon:'none',duration:2000});
  }

});
