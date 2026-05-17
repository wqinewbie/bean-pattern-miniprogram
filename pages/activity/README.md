# 活动页组件化配置文档

## 概述

活动页现在支持组件化配置，运营人员可以通过后台配置JSON数据来灵活搭建活动页面，无需修改代码。

## 后台API返回数据结构

```json
{
  "activityCode": "bean-carnival-2026",
  "title": "拼豆嘉年华",
  "coverImage": "https://cdn.example.com/cover.jpg",
  "startAt": "2026-05-20T00:00:00Z",
  "endAt": "2026-06-20T23:59:59Z",
  "buttonText": "立即报名参加",
  "buttonAction": "CLAIM",
  "buttonUrl": "",
  "totalQuota": 100,
  "remainQuota": 50,
  "participated": false,
  
  "sections": [
    // 组件列表，按顺序渲染
  ]
}
```

## 支持的组件类型

### 1. 头部Banner组件 (hero)

用于活动页顶部的视觉冲击区域，支持图标、标题、副标题和徽章。

```json
{
  "id": "hero-1",
  "type": "hero",
  "icon": "🎨🧩✨",
  "title": "拼豆嘉年华",
  "subtitle": "✨ 像素创意 · 热融豆趣 ✨",
  "bgColor": "linear-gradient(135deg, #FFB347 0%, #FF8C42 100%)",
  "badges": [
    {"icon": "🏆", "text": "百人创意赛"},
    {"icon": "🎁", "text": "限定豆礼包"},
    {"icon": "📸", "text": "作品展出机会"}
  ]
}
```

**字段说明：**
- `icon`: 头部图标（支持emoji）
- `title`: 活动标题
- `subtitle`: 副标题
- `bgColor`: 背景色（支持纯色或渐变）
- `badges`: 徽章列表，每个徽章包含图标和文字

---

### 2. 图片组件 (image)

展示单张图片。

```json
{
  "id": "image-1",
  "type": "image",
  "url": "https://cdn.example.com/activity-banner.jpg",
  "mode": "widthFix"
}
```

**字段说明：**
- `url`: 图片地址
- `mode`: 图片裁剪模式（可选，默认 `widthFix`）
  - `widthFix`: 宽度不变，高度自动变化
  - `aspectFill`: 保持纵横比缩放，填满容器
  - `aspectFit`: 保持纵横比缩放，完整显示

---

### 3. 标题组件 (title)

用于分段标题。

```json
{
  "id": "title-1",
  "type": "title",
  "icon": "🧩",
  "text": "活动玩法"
}
```

**字段说明：**
- `icon`: 标题图标（可选）
- `text`: 标题文字

---

### 4. 文本组件 (text)

展示普通文本段落。

```json
{
  "id": "text-1",
  "type": "text",
  "content": "这是一段活动说明文字，可以包含多行内容。"
}
```

**字段说明：**
- `content`: 文本内容

---

### 5. 规则列表组件 (rule-list)

展示带序号的规则列表。

```json
{
  "id": "rules-1",
  "type": "rule-list",
  "rules": [
    "使用拼豆模板自由创作主题 "夏日幻想" 或 "萌宠伙伴"",
    "拍照上传作品至"拼豆圈"，带活动话题 #拼豆狂欢节#",
    "点赞 + 官方评审团打分，角逐"最佳创意匠人"",
    "活动期间内累计上传作品 ≥2 件，即可获得抽奖机会"
  ]
}
```

**字段说明：**
- `rules`: 规则数组，每条规则自动编号

---

### 6. 奖品网格组件 (prize-grid)

展示奖品卡片网格。

```json
{
  "id": "prizes-1",
  "type": "prize-grid",
  "prizes": [
    {"emoji": "🌈", "name": "全色系豆桶", "desc": "144色豪华装"},
    {"emoji": "🖼️", "name": "创意模板书", "desc": "50+ 全新像素图"},
    {"emoji": "🏅", "name": "金豆奖杯", "desc": "定制荣誉徽章"},
    {"emoji": "🧸", "name": "豆豆玩偶包", "desc": "定制公仔材料"}
  ]
}
```

**字段说明：**
- `prizes`: 奖品数组
  - `emoji`: 奖品图标
  - `name`: 奖品名称
  - `desc`: 奖品描述

---

### 7. 倒计时组件 (countdown)

展示活动倒计时（自动根据活动结束时间计算）。

```json
{
  "id": "countdown-1",
  "type": "countdown",
  "label": "⏳ 活动倒计时 ⏳",
  "tip": "🔥 每日前50名上传作品额外奖励拼豆小工具 🔥"
}
```

**字段说明：**
- `label`: 倒计时标题（可选，默认"⏳ 活动倒计时 ⏳"）
- `tip`: 底部提示文字（可选）

**注意：** 倒计时会自动使用活动的 `endAt` 字段计算剩余时间。

---

### 8. 图标画廊组件 (icon-gallery)

展示一排图标/emoji。

```json
{
  "id": "gallery-1",
  "type": "icon-gallery",
  "icons": ["🐱", "🍕", "🚀", "🌸", "🌟"],
  "tip": "「 更多脑洞作品等你解锁，上传即有机会登上首页展览 」"
}
```

**字段说明：**
- `icons`: 图标数组（支持emoji）
- `tip`: 底部提示文字（可选）

---

### 9. 富文本组件 (html) - 兜底方案

用于向后兼容，支持简单的HTML内容。

```json
{
  "id": "html-1",
  "type": "html",
  "content": "<h2>标题</h2><p>这是一段文字</p>"
}
```

**字段说明：**
- `content`: HTML字符串（仅支持基础标签）

**注意：** 不支持 `<script>`、`<style>` 等复杂标签。

---

## 完整示例

```json
{
  "activityCode": "bean-carnival-2026",
  "title": "拼豆嘉年华",
  "coverImage": "https://cdn.example.com/cover.jpg",
  "startAt": "2026-05-20T00:00:00Z",
  "endAt": "2026-06-20T23:59:59Z",
  "buttonText": "✧ 立即报名参加 ✧",
  "buttonAction": "CLAIM",
  "totalQuota": 100,
  "remainQuota": 50,
  
  "sections": [
    {
      "id": "hero-1",
      "type": "hero",
      "icon": "🎨🧩✨",
      "title": "拼豆嘉年华",
      "subtitle": "✨ 像素创意 · 热融豆趣 ✨",
      "bgColor": "linear-gradient(135deg, #FFB347 0%, #FF8C42 100%)",
      "badges": [
        {"icon": "🏆", "text": "百人创意赛"},
        {"icon": "🎁", "text": "限定豆礼包"},
        {"icon": "📸", "text": "作品展出机会"}
      ]
    },
    {
      "id": "title-1",
      "type": "title",
      "icon": "🧩",
      "text": "活动玩法"
    },
    {
      "id": "rules-1",
      "type": "rule-list",
      "rules": [
        "使用拼豆模板自由创作主题 "夏日幻想" 或 "萌宠伙伴"",
        "拍照上传作品至"拼豆圈"，带活动话题 #拼豆狂欢节#",
        "点赞 + 官方评审团打分，角逐"最佳创意匠人"",
        "活动期间内累计上传作品 ≥2 件，即可获得抽奖机会"
      ]
    },
    {
      "id": "title-2",
      "type": "title",
      "icon": "🎁",
      "text": "超甜奖品池"
    },
    {
      "id": "prizes-1",
      "type": "prize-grid",
      "prizes": [
        {"emoji": "🌈", "name": "全色系豆桶", "desc": "144色豪华装"},
        {"emoji": "🖼️", "name": "创意模板书", "desc": "50+ 全新像素图"},
        {"emoji": "🏅", "name": "金豆奖杯", "desc": "定制荣誉徽章"},
        {"emoji": "🧸", "name": "豆豆玩偶包", "desc": "定制公仔材料"}
      ]
    },
    {
      "id": "title-3",
      "type": "title",
      "icon": "🎨",
      "text": "人气拼豆角"
    },
    {
      "id": "gallery-1",
      "type": "icon-gallery",
      "icons": ["🐱", "🍕", "🚀", "🌸", "🌟"],
      "tip": "「 更多脑洞作品等你解锁，上传即有机会登上首页展览 」"
    },
    {
      "id": "countdown-1",
      "type": "countdown",
      "label": "⏳ 活动倒计时 ⏳",
      "tip": "🔥 每日前50名上传作品额外奖励拼豆小工具 🔥"
    }
  ]
}
```

## 向后兼容

如果后台返回的数据中没有 `sections` 字段，页面会自动使用 `contentHtml` 字段，通过 `rich-text` 组件渲染（旧方式）。

```json
{
  "activityCode": "old-activity",
  "title": "旧活动",
  "contentHtml": "<h2>标题</h2><p>内容</p>"
}
```

## 后台开发建议

### 数据库设计

```sql
-- 活动表
CREATE TABLE activities (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  activity_code VARCHAR(100) UNIQUE NOT NULL,
  title VARCHAR(200) NOT NULL,
  cover_image VARCHAR(500),
  start_at DATETIME NOT NULL,
  end_at DATETIME NOT NULL,
  button_text VARCHAR(50) DEFAULT '立即参与',
  button_action VARCHAR(20) DEFAULT 'CLAIM',
  button_url VARCHAR(500),
  total_quota INT DEFAULT 0,
  remain_quota INT DEFAULT 0,
  
  -- 组件配置（JSON格式）
  sections JSON,
  
  -- 兜底富文本（向后兼容）
  content_html TEXT,
  
  status VARCHAR(20) DEFAULT 'DRAFT',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

### API接口

**GET /activity/{code}**

返回示例：
```json
{
  "activityCode": "bean-carnival-2026",
  "title": "拼豆嘉年华",
  "coverImage": "https://cdn.example.com/cover.jpg",
  "startAt": "2026-05-20T00:00:00Z",
  "endAt": "2026-06-20T23:59:59Z",
  "buttonText": "立即报名参加",
  "buttonAction": "CLAIM",
  "totalQuota": 100,
  "remainQuota": 50,
  "participated": false,
  "sections": [...]
}
```

## 运营配置流程

1. **登录后台管理系统**
2. **进入活动管理 → 新建活动**
3. **填写基础信息**：
   - 活动标题
   - 封面图
   - 开始/结束时间
   - 按钮文字和动作
4. **配置组件**：
   - 从组件库选择需要的组件
   - 填写组件内容
   - 调整组件顺序
5. **预览效果**（扫码查看小程序实际效果）
6. **保存并发布**

## 常见问题

### Q: 如何修改组件样式？
A: 组件样式在 `activity.wxss` 中定义，如需调整颜色、字体等，修改对应的CSS类即可。

### Q: 可以自定义新组件吗？
A: 可以。在 `activity.wxml` 中添加新的组件类型判断，在 `activity.wxss` 中添加样式即可。

### Q: 倒计时不准确怎么办？
A: 确保后台返回的 `endAt` 字段是标准的ISO 8601格式（如 `2026-06-20T23:59:59Z`）。

### Q: 旧活动会受影响吗？
A: 不会。如果 `sections` 字段为空，会自动使用 `contentHtml` 字段渲染（向后兼容）。

## 技术支持

如有问题，请联系前端开发团队。