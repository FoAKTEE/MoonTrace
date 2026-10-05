# 月隐 · Moontrace v2 — 说明

狼人杀发言记录与概率推演，离线单文件网页，这次重做了外观，并打成了可安装的手机版本。

## 包里有什么

| 路径 | 用途 |
|---|---|
| `moontrace-v2.apk` | **Android 安装包**，已签名，直接安装 |
| `ios/` | **iOS 工程**（Xcode 直接打开、装到自己的 iPhone） |
| `pwa/` | 网页版，放到任意 https 静态站点后，手机"添加到主屏幕"即可当 App 用（iOS 不用 Mac 也能装的办法） |
| `web/index.html` | 单文件网页，任何浏览器都能直接打开 |
| `android/` | APK 的源码与一键构建脚本（不需要 Android Studio） |
| `source/` | 网页源码、构建脚本与测试 |
| `screenshots/` | 新版截图与新旧对比 |

概率引擎、解析规则、存档格式（`version: 1`）都没有改，旧的 JSON 存档可以直接导入。

## 安装

**Android**：把 `moontrace-v2.apk` 传到手机，点开安装；系统问"允许安装未知来源应用"时允许即可。支持 Android 7.0 以上。
- 导出存档会弹出系统"保存到"对话框；导入用系统文件选择器。
- 返回键依次关闭弹层 → 还原缩放 → 回到关系页，最后才退出。

**iOS（装到自己的手机，需要一台 Mac）**：
1. 用 Xcode 打开 `ios/Moontrace.xcodeproj`。
2. 选中项目 → Signing & Capabilities → Team 选你的 Apple ID（免费账号即可，不用付费开发者）。
3. 插上 iPhone，选它为运行目标，按 ▶ 运行。首次需要在手机 设置 → 通用 → VPN 与设备管理 里信任这个开发者。
4. 免费账号签的 App 7 天后要重新从 Xcode 运行一次；付费开发者账号则一年。
- 导出存档走系统分享面板，选"存储到文件"；导入用系统文件选择器。

**iOS / Android 不装 App 的办法（PWA）**：把 `pwa/` 整个目录放到任意 https 静态托管（GitHub Pages、Cloudflare Pages、Vercel 都行），用 Safari / Chrome 打开网址 → 分享 → "添加到主屏幕"。之后离线也能打开，有自己的图标，存档保存在该浏览器内。

## 这次改了什么

**外观**
- 配色从"黑底薄荷绿"改为夜色靛蓝底 + 米白月光；米白只用于主操作与当前选中，怀疑 / 保好 / 投票各自一种固定颜色（朱红 / 青玉 / 紫），颜色只表达含义，不做装饰。
- 数字（座号、百分比、计数）用系统衬线字体，文字用系统无衬线字体；大号百分比更醒目。
- 页签改为文字 + 下划线；去掉了常驻口号、眉标、水印、分隔点。
- 弹层、卡片、控件统一圆角层级；表单对比度与字号整体提高（最小 12px）。
- 新的 App 图标（靛蓝底月牙）。

**关系图渲染（简化）**
- 圆盘只保留一层柔光与一圈细边，去掉了 48 个刻度、三圈虚线、十字准星和水印。
- 节点由四层圆压成两层：底盘 + 一圈概率弧，弧的长度就是狼概率；选中者加一圈米白光环。
- 连线标签改为"先放弧线中点，再沿弧滑动 / 向内推"的统一寻位，按弧长从短到长放置；只有被挤开的标签才画一条细引线。16 人、30 人全场模式下标签不再互相遮挡，也不再压住座号。
- 概率颜色由三档离散改为青玉 → 砂色 → 朱红连续插值，相邻玩家的差异看得出来。

**原生壳**
- Android：无第三方依赖的 WebView 壳，网页从私有 https 源加载（本机存储稳定持久），不发任何网络请求；导出 / 导入接到系统文件框。
- iOS：WKWebView + 自定义 URL scheme 处理器，同样离线；导出接系统分享面板。

**没有变的**：概率模型、发言解析、CH¹ 圆盘几何、存档格式、所有元素 id（原有测试全部通过：784 个狼数约束用例、1001 个几何用例、15 个解析用例、87 项移动端交互检查）。

## 自己改、自己重新打包

网页源码在 `source/src/`（`shell.html` 结构、`style.css` 样式、`core.js` 引擎、`ui.js` 界面）。改完运行：

```sh
cd source && python3 build.py
```

它会同时更新 `web/`、`pwa/`、`android/assets/www/`、`ios/Moontrace/www/` 里的页面，之后：

- **Android**：`cd android && ./fetch-tools.sh`（只需一次，从 npm 取 aapt2 / d8 / apksigner / android.jar / ecj，约 50 MB）然后 `./build.sh`，产物在 `android/build/moontrace.apk`。需要 JDK 17+、python3、node。签名用 `android/moontrace-release.jks`（密码 `moontrace`）；**以后升级版本请继续用这个文件签名**，否则手机会要求先卸载旧版。版本号改 `build.sh` 顶部的 `VERSION_CODE` / `VERSION_NAME`。
- **iOS**：在 Xcode 里重新运行即可（`www` 是文件夹引用，页面更新会直接带进去）。
- **测试**：`cd source && python3 tests/test_mobile.py`（需要 `pip install playwright` 和 Chromium）。

## 边界与提醒

- 概率是手工设定倍率的启发式模型，没有用真实对局校准，不是身份结论。
- 存档只在设备本地（浏览器 localStorage / App 私有存储），卸载 App 或清理浏览器数据会丢失，重要对局请导出 JSON。
- APK 在 Chromium 移动端模拟中测试通过，iOS 工程按 Xcode 15 / iOS 15+ 编写；两者都没有在真机上验收过，第一次运行若有问题，先看 `android/src/.../MainActivity.java` 或 `ios/Moontrace/ViewController.swift`，逻辑都很短。
