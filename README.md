# 专注 · 放下手机

一个帮助拖延症患者的 PWA App。

## 功能
- **☽ 收手模式**：设定最后的刷机时间，时间到封印屏幕，长按3秒确认放下
- **◎ 专注计时**：设定目标与时长，AI 定时提醒

---

## 部署到 Vercel（免费，约5分钟）

### 第一步：准备图标
你需要两张 App 图标（可以用任意在线工具生成）：
- `public/icon-192.png`（192×192 px）
- `public/icon-512.png`（512×512 px）

推荐用 https://favicon.io 生成，选 emoji "⏰" 或 "🌙"，下载后放入 `public/` 文件夹。

### 第二步：上传到 GitHub
1. 去 https://github.com，注册/登录
2. 点右上角 "+" → "New repository"
3. 名字随意，选 Public，点 "Create repository"
4. 把整个 `pwa-app` 文件夹里的内容上传（拖拽上传即可）

### 第三步：部署到 Vercel
1. 去 https://vercel.com，用 GitHub 账号登录
2. 点 "Add New Project" → 选你刚创建的 repo
3. Framework Preset 选 **Create React App**
4. 点 "Deploy"，等 2 分钟

### 第四步：手机添加到主屏幕
- **iPhone**：Safari 打开你的 Vercel 链接 → 点底部分享按钮 → "添加到主屏幕"
- **Android**：Chrome 打开链接 → 右上角菜单 → "添加到主屏幕"

完成！图标会出现在手机桌面，像原生 App 一样全屏运行。

---

## 本地开发
```bash
npm install
npm start
```

## 关于 API Key
本项目使用 Anthropic Claude API 生成提醒语句。
在 Vercel 部署后，AI 功能需要配置 API Key：
- Vercel 后台 → Settings → Environment Variables
- 添加 `REACT_APP_ANTHROPIC_KEY` = 你的 key

或者不配置也没关系，App 有内置的备用提示语，所有核心功能正常运行。
