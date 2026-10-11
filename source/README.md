# Moontrace v3 网页源码

在用户提供的v2代码上增量添加多角色层，保留其靛蓝/月白外观和触摸操作。

## 文件结构

| 文件 | 职责 |
|---|---|
| `src/core.js` | 原条件伯努利概率核心、解析器、双曲几何；调用角色层校验与迁移 |
| `src/roles-core.js` | 20角色目录、21技能类型、板子、配额边缘概率、技能账本、规则提醒 |
| `src/ui.js` | 原网页交互；在构建时注入角色UI模块 |
| `src/roles-ui.js` | 角色选择、板子配置、技能编辑、多轮记录的触摸界面 |
| `src/shell.html` / `src/roles-dialogs.html` | 页面结构与新增底部抽屉 |
| `src/ai-ui.js` / `src/ai-dialogs.html` / `src/ai.css` | 可选的 AI 识别按钮、iMessage 收件箱同步与设置抽屉 |
| `src/style.css` / `src/roles.css` | v2样式与v3新增控件 |
| `src/model.html` | 网页内可查看的数学说明与边界 |
| `build.py` | 将上述文件合并成`index.html`，同步所有发布目录 |

不要只改生成的`app.js`或`index.html`，下次构建会覆盖。修改对应`src/`文件，然后运行：

```sh
python3 build.py
```

所有模块在同一个IIFE作用域内，无打包器和CDN。`window.Moontrace`提供只读状态快照、推理函数和测试入口。其`version`为存档schema版本2；`appVersion`为3.0。

## 数据

保留旧字段`players[].role`作为自由备注，不自动解析成真实角色。新增：

```js
{
  version: 2,
  roles: {
    enabled: true,
    counts: { wolf: 3, whiteWolfKing: 1, /* ... */ },
    custom: [],
    rules: { guardRepeat: false, witchDouble: false, witchSelfSave: 'first',
             poisonStopsShot: true, blackWolfSelfExplode: false, note: '' }
  },
  sheriff: 0,
  players: [{ id: 1, claimedRole: '', confirmedRole: '',
              thirdParty: false, deathReason: 'unknown', /* 原字段保留 */ }],
  events: [{ via: 'ai' /* 或 'imessage'，可选 */, rid: '房间号:序号' /* iMessage 记录才有 */ },
           { kind: 'skill', speaker: 1, round: 2, phase: 'night',
             skill: { roleId: 'witch', type: 'poison', targets: [8],
                      status: 'claimed', result: '未记录', note: '', override: false },
             /* 原事件字段、原文和零权重技能连线保留 */ }]
}
```

仅`claimedRole`标记不参与推理。确认角色必须与`fixed`阵营一致；配额启用时需满足人数、狼数和已确认角色数量。所有提交先在克隆状态校验再原子提交。

导入接受schema1和schema2。schema1的备注不升级成硬身份；缺失的新字段使用安全默认值。新本机存储键`moontrace-v3`，只读迁移旧键`moontrace-v1`并保留原键。非法原存档尝试备份至`moontrace-v3-recovery`。重要数据仍应导出JSON。

技能记录与身份/生死状态分离。编辑、删除技能重新计算使用次数，不逆向篡改手动记录的身份或死亡状态。`roleResources()`不是技能解析器，只按已确认记录估算剩余次数。

## AI 识别与 iMessage（可选）

服务器只返回“谁对谁表态”的关系。`normalizeRemote()`把它当作不可信输入：只保留怀疑、保好、投票、查杀、金水五类；检查座位范围；强度只取 0.85 / 0.65 两档（`hedged`）；同一对玩家按`mergeRelation()`合并，和本地规则一致。概率仍由`infer()`计算。服务器地址、口令、房间号和同步进度保存在单独的`moontrace-ai-v1`键里，不进入导出存档。服务器见`../server`，Mac中继见`../imessage`。

## 数学

`inferBase()`联合推断“谁是狼”和“谁的话可信”。每条关系 i→j 有两个对数似然比：i 是好人时 g，i 是狼时 w（`TYPES[type].lambda` / `.wolf`）。在全局狼数约束下：

```
P(x) ∝ exp( Σ aⱼxⱼ + Σᵢ→ⱼ [ gᵢⱼ·xⱼ + (wᵢⱼ − gᵢⱼ)·xᵢxⱼ ] − κ·Σ对跳(多出的好人自称者) ),  Σxᵢ = 狼数
```

- aⱼ：出局玩家的死因（`DEATH_PRIOR`：狼刀、自爆、被自爆带走、毒杀）。
- 查杀 / 金水只在说话者自称或确认预言家时按预言家倍率，否则当普通怀疑 / 保好。
- 同一来源→目标每轮取最后一条，跨轮最多计为单条的 1.5 倍；强度、来源权重、敏感度、衰减按对数比例缩放。
- 未知组合 ≤ 100 万种时精确枚举（`exactMarginals`），否则带阻尼的平均场（`meanFieldMarginals`），结果里的`exact`标明用的是哪种。
- `evidence[j]`按来源当前的狼面给出期望贡献；`own[i]`是此人自己的表态对其狼面的影响；`notes[j]`是死因与对跳。

倍率是手工设定的假设：狼的读法取“和好人一样”与“完全反着说”的中点，查杀 / 金水取预言家名义 ×12 的一半（对数）。参数用`tests/model_eval.mjs`在多种模拟对局上按“最差情形也不比旧版差”挑选，再对照`examples/real-game-2.json`。只有一局真实数据，没有校准。

`inferRoles()`在已确认角色之外，对每个未确认玩家按同阵营剩余配额分配角色概率：

```
P_i(r) = P_i(camp(r)) * remaining(r) / remaining(camp(r))
```

每种角色的边缘概率总和应等于板子张数。总狼概率继续包含已出局玩家。`TYPES.skill.lambda = 0`，技能记账不计分。

## 测试

```sh
python3 tests/test_mobile.py
python3 tests/test_roles.py
python3 tests/test_ai.py
node tests/core_exact.mjs   # 联合推断与暴力枚举逐一对照
node tests/model_eval.mjs   # 新旧模型在模拟对局与真实对局上的对比，不需要浏览器
```

需要`playwright`和Chromium，原测试允许用`CHROMIUM_PATH`指定浏览器。新增测试使用系统`chromium`。测试采用set_content和localStorage替身：没有验证设备真实存储、原生插件、软件键盘与iOS WebKit。

`tests/test_ai.py`用`page.route`模拟服务器，覆盖AI识别、远程结果校验和iMessage收件箱。`tests/numerical.js`保留原核心测试；`tests/roles_numerical.js`新增角色守恒、迁移、技能消耗、桌规和解析安全用例。报告与截图输出到`tests/v3/`。

发布文件、Android构建、iOS工程及签名说明见上级`README.md`。
