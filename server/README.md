# 月隐服务器（可选）

给网页的「AI 识别」和 iMessage 记录用。它只做三件事：

1. 保管 Anthropic API key，把发言文字交给 Claude 解析成“怀疑 / 保好 / 投票 / 查杀 / 金水”关系；
2. 为每个 iMessage 房间保存记录，网页按序号拉取；
3. 托管 `pwa/` 网页，所以网页和接口是同一个地址。

**狼面概率只在网页里计算**，服务器和 Claude 都不参与。Claude 的结果在网页里还会再校验一遍（座位范围、关系类型），强度只取固定的两档（明确 0.85 / 保留语气 0.65），和本地规则识别一致。

## 部署（Cloudflare Workers）

需要 Node 18+、Cloudflare 账号和 Anthropic API key。

```sh
cd server
npm install
npx wrangler login
npx wrangler secret put ANTHROPIC_API_KEY   # 粘贴 API key
npx wrangler secret put MOONTRACE_TOKEN     # 自己设一个足够长的口令，网页和 Mac 中继都要填
npx wrangler deploy
```

部署后得到 `https://moontrace.<你的子域>.workers.dev`：

- 手机打开这个地址就是网页版，可以「添加到主屏幕」；
- 在网页「⋯ → AI 识别与 iMessage」里填这个地址和口令，点「测试连接」。

改了网页（`python3 source/build.py`）之后，再运行一次 `npx wrangler deploy`。

## 设置

`wrangler.toml` 里的 `[vars]`：

| 变量 | 默认 | 说明 |
|---|---|---|
| `MODEL` | `claude-opus-5-5` | 想省钱可改成 `claude-sonnet-5-5` |
| `EFFORT` | `low` | 识别更快；复杂发言识别不准时可改为 `medium` |

请求开启了 server-side fallback（`fallbacks: "default"`），Claude 偶尔拒绝处理时会自动换模型重试。

## 接口

都需要 `Authorization: Bearer <MOONTRACE_TOKEN>`。

| 方法 | 路径 | 用途 |
|---|---|---|
| GET | `/api/health` | 测试连接 |
| POST | `/api/parse` | 解析一段发言：`{mode: "speech", text, speaker, n, claims}` |
| POST | `/api/rooms/<房间号>/messages` | iMessage 中继送来的一条消息；也处理「撤销」「帮助」「链接」 |
| POST | `/api/rooms/<房间号>/sync` | 网页拉取房间记录：`{after, n, claims}` |

## 测试

```sh
npm test           # 解析结果清洗与回复格式
npm run test:e2e   # 本地启动 Worker 和模拟的 Anthropic 接口；不需要 key，不产生费用
```

## 隐私

- 点「AI 识别」或在 iMessage 里记录时，原文会经过你的 Worker 发给 Anthropic API。
- iMessage 房间记录保存在 Cloudflare Durable Object 里。读取需要房间号和口令。
- 口令只保存在各自设备上，不会写进对局存档或分享链接。
