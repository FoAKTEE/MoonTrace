# iMessage 中继（可选，macOS）

在 iMessage 群里直接打速记，网页自动记入、更新关系图。需要一台登录了 iMessage、保持开机的 Mac。

## 准备

1. 先按 [server/README.md](../server/README.md) 部署服务器。在网页「⋯ → AI 识别与 iMessage」里填好地址和口令，点「新建」生成房间号，勾选「接收这个房间的 iMessage 记录」，保存。
2. 建一个专门记录用的 iMessage 群（比如“狼人杀记录”）。不建议用和自己的对话，同一条消息可能出现两次。
3. 给「终端」开完全磁盘访问权限：系统设置 → 隐私与安全性 → 完全磁盘访问权限。第一次回复时，系统还会问是否允许终端控制「信息」。

## 运行

```sh
python3 imessage/relay.py --list-chats        # 找到群名或 guid
export MOONTRACE_TOKEN='你的口令'
python3 imessage/relay.py --endpoint https://moontrace.xxx.workers.dev --room abcd-efgh-jkmn --chat 狼人杀记录
```

保持终端开着，在群里发：

| 发送 | 回复 |
|---|---|
| `3号踩6保8，9号归票6` | `🌙 已记 3号 疑6 保8；9号 投6` |
| `5跳预言家 查杀7` | `🌙 已记 5号 跳预言家 查杀7` |
| `撤销` | 撤回上一条（网页上也会移除） |
| `链接` | 网页地址；发给朋友，打开后填口令就能同步 |
| `帮助` | 用法说明 |

带 `?` 的是弱表态（“可能”“暂时”等），计入概率时权重较低。

## 选项

- `--prefix 记`：只处理以「记」开头的消息，适合群里还聊别的
- `--no-reply`：不在群里回复识别结果
- `--interval 2`：轮询间隔秒数

## 说明

- 只读取指定那个聊天、从启动时刻起的新消息；进度保存在 `~/.moontrace-relay.json`。
- 网页打开时才会把房间记录记入对局，记在当时的轮次；网页关着时，记录在服务器上排队。
- 群里每条消息都会发到你的服务器和 Anthropic 解析，请告诉群里的人。
- 依赖 macOS 的内部数据库格式和 AppleScript，不是苹果的官方接口，系统升级后可能需要调整。

## 测试

```sh
python3 imessage/test_relay.py   # 用模拟的 chat.db 和本地服务器，不读你的真实消息
```
