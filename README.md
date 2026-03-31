# Bean Pattern Mini Program

拼豆魔法屋微信小程序，用户端应用。

## 功能模块

- 首页展示（推荐图纸、Banner）
- AI 魔法生成（文字转图纸）
- 图纸转换（图片转拼豆图纸）
- 手绘转换（手绘转拼豆图纸）
- 历史记录（查看生成历史）
- 我的图纸（用户上传的图纸）
- VIP 套餐（充值购买）
- 个人中心（用户信息、登录）

## 技术栈

- 微信小程序原生开发
- JavaScript ES6+
- WXML / WXSS
- 微信云开发（可选）

## 快速开始

### 环境要求

- 微信开发者工具
- 微信小程序账号

### 安装

1. 克隆项目
```bash
git clone https://github.com/your-username/bean-pattern-miniprogram.git
```

2. 在微信开发者工具中打开项目目录

3. 修改 `utils/config.js` 中的 API 地址：
```javascript
const API_BASE = 'https://your-api-domain/api'
```

4. 点击"编译"运行项目

## 项目结构

```
miniprogram/
├── pages/               # 页面
│   ├── index/          # 首页
│   ├── home/           # 首页（主要）
│   ├── ai-generate/    # AI 生成
│   ├── convert/        # 图片转换
│   ├── draw/           # 手绘转换
│   ├── history/        # 历史记录
│   ├── my-patterns/    # 我的图纸
│   ├── vip/            # VIP 套餐
│   ├── profile/        # 个人中心
│   ├── login/          # 登录
│   ├── generate/       # 生成中
│   ├── generating/     # 生成进度
│   └── result/         # 结果展示
├── components/         # 自定义组件
├── custom-tab-bar/     # 底部导航
├── utils/              # 工具函数
├── assets/             # 资源文件
├── app.js              # 应用入口
├── app.json            # 应用配置
├── app.wxss            # 全局样式
└── project.config.json # 项目配置
```

## 主要功能说明

### AI 魔法生成
用户输入文字描述，调用后端 AI 接口生成拼豆图纸

### 图片转换
用户上传图片，后端处理转换为拼豆图纸

### 手绘转换
用户在小程序中手绘，后端识别转换为拼豆图纸

### VIP 套餐
展示充值套餐，用户可购买获得更多生成次数

## API 配置

修改 `utils/config.js`：

```javascript
export const API_BASE = 'https://your-api-domain/api'
export const API_TIMEOUT = 30000
```

## 许可证

MIT
