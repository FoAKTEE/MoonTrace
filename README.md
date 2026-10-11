# 月隐 Moontrace

离线狼人杀发言记录与狼面概率工具。

## 下载

[Releases](https://github.com/FoAKTEE/MoonTrace/releases/latest) 或 `dist/` 目录。

## 安装

- **Android**：下载 `.apk` 打开，允许“安装未知来源应用”后安装。
- **iOS**：用 [AltStore](https://altstore.io) / [Sideloadly](https://sideloadly.io) 自签安装 `.ipa`；或用 Xcode 打开 `ios/Moontrace.xcodeproj` 运行。
- **网页**：浏览器直接打开 `web/index.html`。

## 使用

1. 设置玩家人数与狼数。
2. 选择角色板子。
3. 记录每位玩家的发言与技能。
4. 查看狼面概率；菜单中可导出存档备份。

数据仅保存在本机。

## AI 识别与 iMessage（可选）

记发言时可以让 Claude 识别关系，也可以在 iMessage 群里直接打字记录、网页自动更新关系图。狼面概率始终在本机计算，不交给 AI。需要自己部署服务器：见 [server/README.md](server/README.md) 和 [imessage/README.md](imessage/README.md)。开启后，发言原文会发到你的服务器和 Anthropic 解析。
