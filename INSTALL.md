# 月隐 Moontrace · 安装与使用

## 下载

到 [Releases 页面](https://github.com/FoAKTEE/MoonTrace/releases/latest)下载最新版：

| 文件 | 平台 |
|---|---|
| `Moontrace-3.0.apk` | Android 7.0 及以上 |
| `Moontrace-3.0-unsigned.ipa` | iOS 15 及以上（需自签） |
| `Moontrace-3.0-web.html` | 任意浏览器，离线可用 |

仓库内 `dist/Moontrace-3.0.apk` 也可直接下载。

## Android 安装

1. 用手机浏览器下载 `.apk`，点击打开。
2. 系统提示“禁止安装未知来源应用”时，按提示允许该浏览器/文件管理器安装应用。
3. 点“安装”，完成后桌面出现“月隐”。

已装旧版可直接覆盖升级（签名一致）。**升级前建议先在旧版菜单中导出 JSON 备份。**

## iOS 安装

苹果不允许直接安装未签名的 IPA，任选一种方式：

- **自签安装**：在电脑上用 [AltStore](https://altstore.io) 或 [Sideloadly](https://sideloadly.io) 打开 `.ipa`，登录自己的 Apple ID 签名后装到 iPhone。之后在“设置 → 通用 → VPN与设备管理”中信任该开发者。免费 Apple ID 签名 7 天后过期，需重新签名。
- **免安装（推荐给普通用户）**：将 `pwa/` 目录部署到任意 HTTPS 静态站点，用 Safari 打开 → 分享 → “添加到主屏幕”，即可像 App 一样离线使用。
- **Xcode**：打开 `ios/Moontrace.xcodeproj`，在 Signing 中选自己的 Team，连接手机运行。

## 快速上手

1. **设定人数**：在“人数、狼数与高级选项”中设置玩家人数和狼数；圆环上点玩家查看详情。
2. **角色与板子**（圆环下方）：选择示例板子或手动增减角色，可开启配额约束。
3. **记录发言**：直接输入发言内容，说“我是女巫”等会自动生成可取消的自称记录。
4. **记技能**：选择使用者、技能、对象、轮次与昼夜，区分“声称”和“已确认”。
5. **标记身份**：玩家详情中分别填写“自称”和“已确认”，已确认身份会参与概率计算。
6. **备份**：菜单中“导出存档”保存 JSON，也可导入，`examples/17-role-demo.json` 为示例对局。

所有数据只保存在本机，不联网。概率仅供参考，未经实战校准。更多说明见 [README.md](README.md)。
