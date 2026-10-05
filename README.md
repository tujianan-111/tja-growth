# Tja的成长之路

一个无后端、无运行时依赖的习惯打卡 PWA。数据保存在当前浏览器的 `localStorage` 中，可离线使用，并可导出 JSON 备份。

## 本地预览

需要 Node.js 18 或更高版本。仓库不需要安装任何依赖。

```powershell
node tools/serve.mjs
```

然后访问 [http://localhost:8080](http://localhost:8080)。不要直接双击 `index.html`，因为 Service Worker 与模块加载需要在 HTTP 环境下运行。

## 测试

```powershell
node --test test/core.test.js
```

## 部署到 GitHub Pages

1. 在 GitHub 创建一个空仓库，并把本目录作为仓库根目录。
2. 将默认分支设为 `main` 或 `master`，推送代码。
3. 进入仓库的 **Settings → Pages**，把 Source 设为 **GitHub Actions**。
4. `.github/workflows/pages.yml` 会在推送后自动构建并发布；后续在手机浏览器打开 Pages 地址，即可“添加到主屏幕”。

所有资源使用相对路径，因此项目发布在仓库子路径下也能正常加载。GitHub Pages 提供 HTTPS，Service Worker 可缓存应用外壳，首次加载后可离线打开。

## 数据说明

- 数据只存在当前浏览器，不包含账号与云同步。
- 清理浏览器网站数据会删除记录；请在“设置 → 备份与恢复”中导出 JSON。
- 导入备份会替换当前数据。
- 归档习惯会保留历史；永久删除会同时清除其打卡记录。

## 目录

- `index.html`：页面结构
- `styles.css`：响应式与主题样式
- `js/core.js`：日期、排期、统计和备份校验等纯逻辑
- `js/app.js`：界面、交互与本地存储
- `sw.js`：离线缓存
- `manifest.webmanifest`：PWA 安装信息
- `tools/generate-icons.mjs`：无依赖生成 PWA PNG 图标