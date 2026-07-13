# GoKidCoachWeb | 儿童围棋陪练

一个为 iPad Safari 设计的儿童围棋自适应陪练网页 App。无需安装 App、无需后端服务器，部署到 GitHub Pages 后即可打开使用，并可添加到 iPad 主屏幕。

![围棋陪练宣传图](screenshots/github-social-preview.png)

## 亮点

- **iPad 友好**：横屏棋盘优先，适合孩子直接触摸落子。
- **纯静态部署**：只需要 GitHub Pages、Netlify、Vercel 或任意静态网页托管。
- **本地记忆**：历史记录、能力档案、家长设置和未完成棋局会保存在浏览器里。
- **19 路离线陪练**：固定 19 路棋盘，适合完整棋盘练习。
- **自适应 AI**：每局结束后根据胜负、手数、吃子和完整度调整下一局难度。
- **儿童能力画像**：额外记录布局、提子、打吃、连接、死活、征子、实地、官子、失误率和计算深度。
- **架构冻结**：现有流水线保持稳定，后续重点转向 `Policy` 与 `PositionEvaluator` 棋力提升，而不是继续堆叠新 Engine。
- **Move Quality Controller**：对局过程中持续估计孩子当前强度，并动态控制 AI 精度。
- **多语言界面**：支持中文、粤语、英文、日文和韩文。
- **家长视角**：查看最近趋势、胜率、平均手数，并可导出/导入备份。
- **可扩展 AI**：可填写远程 AI 或 KataGo HTTPS 接口，失败时自动回退本地 AI。
- **离线策略模型**：浏览器会加载 `assets/offline-policy-model.json`，训练完成后覆盖该文件即可参与本地离线落子评分。
- **Pattern Database**：浏览器会加载 `assets/pattern-db.json`，在 Policy 阶段给高频职业局部棋形提供轻量加权。
- **Shape Library**：浏览器会加载 `assets/shape-library.json`，在 Policy V2 内识别常见棋形并补充 `shapeScore`。
- **Fuseki Continuation**：浏览器会加载 `assets/fuseki-db.json`，在开局库信心下降后继续提供全局布局续弈参考。
- **Tactical Pattern Library**：浏览器会加载 `assets/tactical-db.json`，识别常见战术局面并补充 `tacticalScore`。
- **Lightweight Joseki Library**：浏览器会加载 `assets/joseki-db.json`，在角部和边上局部续弈阶段补充 `josekiScore`。
- **Endgame Pattern Library**：浏览器会加载 `assets/endgame-db.json`，在晚盘收官阶段补充 `endgameScore`。
- **Engine V3 Context Fusion Layer**：`context-fusion.js` 不新增知识，只根据局面上下文动态融合已有 Policy 分数并输出 `fusedPolicyScore`。
- **Engine V4 Evaluation Framework V1.1**：`training/evaluate_policy.py` 只做离线评估，产出 `GoKidCoachWeb/evaluation/benchmark-config.json`、`benchmark-report.json` 和 `benchmark-baseline.json`，不进入浏览器运行时。
- **开局库参考**：浏览器会加载 `assets/opening-book.json`，前 30 手优先参考高质量开局库，减少乱下。
- **Rule Engine**：本地规则引擎在开局库之后、策略模型之前过滤非法和明显失误落子，优先提子、救棋、连接。

## 适合谁

- 刚开始学围棋的孩子。
- 想在 iPad 上随时练 19 路完整棋盘的家庭。
- 想要一个轻量、可离线基础打开、可自己部署的围棋练习网页。
- 想把远程 KataGo 或自己的 AI 接口接入前端的开发者。

## 界面预览

![围棋陪练真实界面预览](screenshots/real-use-interface.png)

## 快速体验

本项目是纯前端网页，`index.html` 必须通过网页服务打开。直接把文件拷到 iPad 后用 Safari 打开本地 `index.html`，通常不能正常使用 PWA、缓存和脚本权限。

在电脑本地试用：

```bash
python3 -m http.server 8080
```

然后在同一 Wi-Fi 下，用 iPad Safari 打开：

```text
http://电脑局域网IP:8080
```

打开后点击 Safari 分享按钮，选择“添加到主屏幕”。

## 部署到 GitHub Pages

推荐上传到 GitHub Pages，这样 iPad 不需要依赖电脑开服务器。

1. 在 GitHub 新建公开仓库，例如 `gokidcoach-web`。
2. 上传本目录全部文件，确保 `index.html` 在仓库根目录。
3. 进入仓库 `Settings` -> `Pages`。
4. `Build and deployment` 选择 `Deploy from a branch`。
5. Branch 选择 `main`，Folder 选择 `/root`，保存。
6. 等待几分钟后，用 iPad Safari 打开 GitHub Pages 生成的网址。
7. 在 Safari 里点“分享” -> “添加到主屏幕”。

发布后的地址通常是：

```text
https://你的GitHub用户名.github.io/仓库名/
```

## 功能

- 固定 19 路棋盘，不再提供棋盘尺寸切换。
- 孩子可选择执黑或执白；孩子执白时 AI 自动先行。
- 提供四个家长可读陪练模式：入门陪练、基础陪练、进阶陪练、自适应陪练。
- 支持落子、提子、禁自杀、停一手、悔棋。
- 支持全局同形禁着，避免简单劫争立即回提。
- 双方连续停一手后弹出终局确认。
- 终局估算采用棋子 + 空点归属 + 贴目。
- 支持 SGF 棋谱导出，包含日期、应用版本、冻结引擎版本、难度模式和完整手顺。
- 支持多个孩子档案，每个孩子有独立能力、历史和当前棋局。
- 当前未完成棋局会自动保存到 localStorage，并写入 IndexedDB 耐久副本。下次打开继续保留棋盘、手数、提子、劫状态、停一手状态、难度模式和孩子执棋。
- PWA 已包含图标、manifest 和 Service Worker，添加到主屏幕后支持基础离线打开。

## V1.0 Release Candidate

V1.0 停止引擎研究，目标是稳定可玩的 iPad 产品。浏览器引擎保持冻结 baseline；`product-support.js` 只处理发布层能力，包括四个难度模式、IndexedDB 存档、SGF 构造/解析、对局诊断摘要和版本信息。

四个模式的发布映射：

- 入门陪练：映射到既有 AI level 640，只在有意义的合法候选中放松选择。
- 基础陪练：映射到既有 AI level 760，通常选择 good 候选，允许有限 acceptable 候选。
- 进阶陪练：映射到既有 AI level 880，偏向 strongest candidates。
- 自适应陪练：以 level 880 起步，只根据完成的真实对局缓慢调整。

本地诊断只保存在设备上，不上传服务器。正常对局只保存轻量摘要，不保存每个候选点的完整分数。

## 记忆和难度机制

记忆功能使用浏览器 `localStorage` 和 IndexedDB。`localStorage` 用于快速同步恢复，IndexedDB 保存耐久副本。同一台 iPad、同一个 Safari 站点地址下，关闭网页或从主屏幕重新打开，记录会继续保留。

AI 难度会在每局结束后自动调整。系统会根据胜负、孩子吃子情况、开局落点、中后盘完成度生成表现分，再上调或下调下一局 AI 强度和学习阶段。

现在还会额外保存一份 `Student Model`，每个孩子独立记录以下维度，范围 `0-100`：

- `opening`
- `capture`
- `atari`
- `connection`
- `lifeDeath`
- `ladder`
- `territory`
- `endgame`
- `blunderRate`
- `readingDepth`

这些数据保存在浏览器 `localStorage`，键名前缀为：

```text
gokidcoach-student-model-v1:
```

例如默认第一个孩子可能会看到：

```text
gokidcoach-student-model-v1:child-1
```

数据只保存在当前设备浏览器里。换设备、换浏览器、清除 Safari 网站数据，记录会消失。家长面板支持导出/导入 JSON 备份。

## 远程 AI / KataGo

家长查看里可以填写远程 AI 地址或 KataGo 分析地址。GitHub Pages 是 HTTPS 页面，因此远程接口也必须使用 HTTPS，并在服务端允许 CORS。

当前推荐先使用浏览器内离线 AI：训练完成后，把导出的轻量策略权重覆盖到：

```text
assets/offline-policy-model.json
```

如需强化布局，可同时生成并覆盖：

```text
assets/opening-book.json
```

网页启动时会自动加载这个文件，iPad 不需要连接局域网服务，也不需要填写“远程AI地址”。如果模型文件还没训练好，程序会继续使用内置增强启发式 AI，保证可以正常对弈。

高级可选：如果以后熟悉局域网部署，也可以在电脑上启动本项目自带的 KataGo 本地桥接服务，然后把“远程AI地址”填成电脑局域网地址：

```bash
cd tools/katago
PORT=8765 node local-ai-server.mjs
```

然后在 iPad Safari 的家长查看里填写：

```text
http://电脑局域网IP:8765/game/move
```

这个方式不需要公网，但 iPad 必须能访问运行 KataGo 的电脑。暂时不熟悉局域网时可以先不用这一段。

前端会发送当前棋盘、棋谱、贴目、执棋方和学习阶段。接口可返回：

```json
{ "x": 3, "y": 3 }
```

或：

```json
{ "move": { "x": 3, "y": 3 } }
```

或：

```json
{ "move": "D4" }
```

如果远程接口失败，页面会自动回退到本地增强启发式 AI，并在家长面板显示状态。本地 AI 会优先考虑救弱棋、打吃、连接、分断、开局大场和避免早期一二线随手棋。

离线 AI 部署入口已经预留在 `offline-policy.js`：

1. 训练脚本导出浏览器可读的轻量策略权重到 `assets/offline-policy-model.json`。
2. JSON 保持 `boardSize: 19`，可包含 `weights` 和 `pointBias`。
3. 页面启动后会注册 `window.GoKidCoachPolicyModel.scoreMove(...)`，本地 AI 评分时自动叠加模型分。
4. 如果模型文件缺失、格式错误或尚未训练完成，程序会继续使用内置启发式 AI，不影响离线对弈。

布局库入口已经预留在 `opening-book.js`：

1. 从清洗后的 19 路棋谱导出前 30 手开局统计到 `assets/opening-book.json`。
2. 页面启动后会加载开局库，并在前 30 手对本地选点额外加权。
3. 这样即使未连接远程 KataGo，也能减少 AI 在布局阶段乱下。

Pattern Database 入口已经预留在 `policy-pattern.js`：

1. 用 `training/build_pattern_db.py` 从 `clean_sgf` 提取 `3x3` / `5x5` 局部棋形。
2. 输出轻量 `assets/pattern-db.json`，供浏览器直接加载。
3. Policy 阶段会把 `patternScore` 和 `confidence` 叠加到候选点评分里。
4. 如果 `pattern-db.json` 缺失，程序会自动回退到现有 Policy，不影响正常对弈。

Shape Library 入口已经预留在 `shape-library.js`：

1. 用 `training/build_shape_library.py` 从 `clean_sgf` 和 `pattern-db.json` 统计常见棋形。
2. 输出轻量 `assets/shape-library.json`，供浏览器直接加载。
3. Policy 阶段会把 `shapeScore` 叠加到候选点评分里。
4. 如果 `shape-library.json` 缺失，程序会自动回退到现有 Policy，不影响正常对弈。

Fuseki Continuation 入口已经预留在 `fuseki-library.js`：

1. 用 `training/build_fuseki_db.py` 从 `clean_sgf` 提取 `20-80` 手的全局布局续弈统计。
2. 输出轻量 `assets/fuseki-db.json`，供浏览器直接加载。
3. 在 OpeningBook 信心下降后，为 Policy 阶段补充 `fusekiScore`。
4. 如果 `fuseki-db.json` 缺失，程序会自动回退到现有 Policy，不影响正常对弈。

Tactical Pattern Library 入口已经预留在 `tactical-library.js`：

1. 用 `training/build_tactical_db.py` 从 `clean_sgf` 提取常见战术局面统计。
2. 输出轻量 `assets/tactical-db.json`，供浏览器直接加载。
3. Policy 阶段会把 `tacticalScore` 叠加到候选点评分里。
4. 如果 `tactical-db.json` 缺失，程序会自动回退到现有 Policy，不影响正常对弈。

Lightweight Joseki Library 入口已经预留在 `joseki-library.js`：

1. 用 `training/build_joseki_db.py` 从 `clean_sgf` 提取 `1-80` 手的轻量角部局部续弈统计。
2. 输出轻量 `assets/joseki-db.json`，供浏览器直接加载。
3. 在 OpeningBook 之后、全局 Fuseki 之前，为 Policy 阶段补充 `josekiScore`。
4. 如果 `joseki-db.json` 缺失，程序会自动回退到现有 Policy，不影响正常对弈。

Endgame Pattern Library 入口已经预留在 `endgame-library.js`：

1. 用 `training/build_endgame_db.py` 从 `clean_sgf` 提取 `120+` 手及高稳定局面的轻量收官统计。
2. 输出轻量 `assets/endgame-db.json`，供浏览器直接加载。
3. 在晚盘或大部分棋块已经稳定时，为 Policy 阶段补充 `endgameScore`。
4. 如果 `endgame-db.json` 缺失，程序会自动回退到现有 Policy，不影响正常对弈。

## Evaluation V1.1 / Policy Baseline

Engine V4 Evaluation Framework V1.1 是离线基准，不进入 GitHub Pages、PWA 或 iPad Safari 运行时，也不修改浏览器端 Policy 行为。

核心原则：

- 精确 SGF 命中率只表示 imitation accuracy，不等同棋力。
- 围棋同一局面可能有多手合理选择，所以评估同时记录候选质量。
- 默认使用固定随机种子 `20260710`，按 `opening / fuseki / middlegame / endgame` 各请求 `250` 个位置，目标最少 `1000` 个评估位置。
- `benchmark-report.json` 记录当前结果；`benchmark-baseline.json` 记录稳定基线。
- 默认运行只比较当前报告和基线，不自动覆盖基线。
- 只有显式传入 `--update-baseline` 时才更新基线。

质量分层沿用 MoveQualityController 的候选分层概念，但在 Python 中离线近似实现，不导入浏览器 DOM 或运行时代码：

- `best`
- `strong`
- `good`
- `acceptable`
- `weak`
- `rejected`

报告会明确区分三类指标：

- `exactMatchRate`：AI 最高分候选是否等于 SGF 实战手，只衡量精确模仿。
- `top3MatchRate / top5MatchRate / goodOrBetterRate`：SGF 实战手在候选列表中的质量位置，用于衡量候选合理性。
- `averageLatencyMs`：离线评分耗时，用于观察性能趋势，不代表浏览器端真实帧率。

回归规则：

- `FAIL`：`rejectedMoveRate` 上升。
- `FAIL`：`goodOrBetterRate` 下降超过 `2` 个百分点。
- `FAIL`：`averageScoreLossFromBest` 恶化超过 `5%`。
- `FAIL`：任一阶段 `goodOrBetterRate` 下降超过 `4` 个百分点。
- `FAIL`：平均延迟上升超过 `25%`。
- 无阈值触发时为 `PASS`；轻微非失败漂移可为 `WARN`。

未来任何 Policy 权重、Pattern、Shape、Fuseki、Tactical、Joseki 或 Endgame 相关修改，都必须先运行评估并通过回归比较后再合并：

```bash
python3 -m py_compile training/evaluate_policy.py
python3 training/evaluate_policy.py --config GoKidCoachWeb/evaluation/benchmark-config.json
node GoKidCoachWeb/test-evaluation-framework.js
```

## Rule Engine 架构

## Architecture Freeze

当前版本进入架构冻结阶段：

- 保留现有流水线，不新增新的主 Engine
- 不把项目继续做成课程型教学软件
- 不引入每日任务、题库、作业、教学页、专项训练模式
- 后续主要提升 `Policy Engine` 和 `PositionEvaluator` 的真实棋力
- 现有模块只修 Bug、补边界、提稳定性，不随意扩张职责

项目定位明确为：

- **对弈型自适应儿童围棋陪练 AI**
- 通过真实对局提升孩子水平
- AI 始终略高于孩子，而不是课程系统或题库系统

完整职责说明见 [ARCHITECTURE.md](/home/sr/codex-test/WeiqiCoachProject/GoKidCoachWeb/ARCHITECTURE.md)。

本地落子流程现在是：

```text
OpeningBook
  ->
RuleEngine
  ->
Policy Engine
  ->
ContextFusion
  ->
PositionEvaluator
  ->
MidgameStability
  ->
CompanionEngine
  ->
DifficultyController
  ->
MoveQualityController
  ->
FinalScore
```

其中：

- `OpeningBook`：前 30 手优先参考清洗棋谱生成的开局库
- `RuleEngine`：安全底线模块，只处理合法落子、自杀过滤、提子判断、明显送子过滤和基础战术硬约束
- `Policy Engine`：在规则过滤和开局优先之后，生成 `policyScore / patternScore / shapeScore / fusekiScore / tacticalScore / josekiScore / endgameScore / confidence`
- `ContextFusion`：Policy V3 决策融合层，根据手数、阶段、战斗强度、实地成熟度、弱棋数量、孩子强度和 AI 校准级别输出 `fusedPolicyScore`
- `PositionEvaluator`：评估厚势、实地、弱棋、断点和局部优先级，为合理候选点提供位置分；这是后续棋力提升核心之一
- `MidgameStability`：只负责弃子判断、必须处理弱棋和中盘节奏稳定；后续冻结，不扩展成新系统
- `CompanionEngine`：作为 Player Modeling Engine，持续观察孩子实战中的落子质量，并实时更新局内强度估计
- `DifficultyController`：作为 Strength Calibration，平滑控制 AI 始终比孩子略强 `5%~10%`
- `MoveQualityController`：作为 Candidate Selection，在合理候选点中选择 `Top1 / Top2 / Top3 / Top4`，保证 AI 可变强可变弱，但不会乱下

`RuleEngine` 当前覆盖：

- 立即提子优先
- 己方仅剩一口气时优先救棋/连接/反提
- 禁止自杀、重复劫、已有棋子位置落子
- 过滤明显送子
- 开局前 30 手限制一线乱下和远离棋形的飞点

## Student Model

`student-model.js` 负责：

1. 读取当前孩子的学习画像 `loadStudentProfile()`
2. 写回画像 `saveStudentProfile()`
3. 每盘结束后根据棋局结果更新各项能力 `updateProfileFromGame(gameRecord)`
4. 找出当前最弱的能力项 `getWeakAreas()`
5. 计算总体水平 `getOverallLevel()`

当前实现是对局内自适应启发式更新，不训练模型，也不依赖服务端。

## Policy V2 / Pattern Database

`policy-pattern.js` 负责：

1. 加载 `assets/pattern-db.json`
2. 从候选点提取 `3x3` 和 `5x5` 局部棋形
3. 结合手数、角边中腹、周围棋子数量、气数、打吃、提子、连接、断点等特征查询 pattern
4. 返回 `patternScore`
5. 返回隐藏 `confidence`
6. 在数据库缺失时自动回退

因此当前候选点在 Policy 阶段会携带：

- `policyScore`
- `patternScore`
- `shapeScore`
- `fusekiScore`
- `tacticalScore`
- `josekiScore`
- `endgameScore`
- `confidence`

## Policy V2 / Shape Library

`shape-library.js` 负责：

1. 加载 `assets/shape-library.json`
2. 识别虎口、竹节、一间跳、小飞、大飞、尖、实接、空三角等常见棋形
3. 结合棋形统计为候选点补充 `shapeScore`
4. 在 Shape Library 缺失时自动回退

它属于 **Policy V2 的内部增强**，不是新 Engine，也不改变整体流水线。

## Policy V2.3 / Fuseki Continuation

`fuseki-library.js` 负责：

1. 加载 `assets/fuseki-db.json`
2. 评估 `20-80` 手的全局布局摘要
3. 识别角到边、边到中腹、扩张方向和大场开发
4. 在 OpeningBook 变弱后补充 `fusekiScore`
5. 在数据库缺失时自动回退

它仍然属于 **Policy V2 的内部增强**，不是新 Engine，也不改变整体流水线。

## Policy V2.4 / Tactical Pattern Library

`tactical-library.js` 负责：

1. 加载 `assets/tactical-db.json`
2. 识别打吃、双打吃、提子、征子、枷、断、连接、假眼等常见战术局面
3. 为候选点补充 `tacticalScore`
4. 在数据库缺失时自动回退

它仍然属于 **Policy V2 的内部增强**，不是新 Engine，也不改变整体流水线。

## Policy V2.5 / Lightweight Joseki Library

`joseki-library.js` 负责：

1. 加载 `assets/joseki-db.json`
2. 归一化四个角的局部模式和序列
3. 识别星位、小目、三三、目外、高目等常见角部起手后的轻量续弈偏好
4. 为候选点补充 `josekiScore`
5. 在数据库缺失时自动回退

它仍然属于 **Policy V2 的内部增强**，不是新 Engine，也不改变整体流水线。

## Policy V2.6 / Endgame Pattern Library

`endgame-library.js` 负责：

1. 加载 `assets/endgame-db.json`
2. 识别收官阶段的角部、边部、小官子、连接官子和中性点
3. 判断 sente/gote 倾向、dame/neutral penalty 和小目数收益
4. 为候选点补充 `endgameScore`
5. 在数据库缺失时自动回退

它仍然属于 **Policy V2 的内部增强**，不是新 Engine，也不改变整体流水线。

## Policy V3.0 / Context Fusion Layer

`context-fusion.js` 负责：

1. 估计当前阶段：`opening / early middlegame / middlegame / late middlegame / endgame`
2. 估计候选点局部战斗强度
3. 估计棋盘稳定度和实地成熟度
4. 根据孩子当前强度估计和 AI 校准级别生成动态权重
5. 把已有知识源融合为 `fusedPolicyScore`

输入仍然是现有 Policy 来源：

- `openingBookScore`
- `policyScore`
- `positionScore`
- `patternScore`
- `shapeScore`
- `fusekiScore`
- `tacticalScore`
- `josekiScore`
- `endgameScore`
- `confidence`

输出为：

- `fusedPolicyScore`
- `contextFusion.phase`
- `contextFusion.weights`
- `contextFusion.localTacticalIntensity`
- `contextFusion.boardStability`
- `contextFusion.territoryMaturity`
- `contextFusion.unsettledGroups`

它属于 **Engine V3 的 Policy 内部决策层**，不是新 Engine，不加载新知识库，不改变 RuleEngine 的最高优先级。`RuleEngine` 已拒绝的候选点会保持拒绝状态，不能因为融合分数重新进入候选。

## Difficulty Controller / Strength Calibration

`difficulty-controller.js` 负责：

1. 根据学生画像和最近胜负生成本局难度参数
2. 孩子连续赢 3 盘时自动增强 AI
3. 孩子连续输 3 盘时自动降低压力
4. 降难度时只在“合法且合理”的候选点中选次优好棋
5. 如果弱项是布局，会更稳定使用 `OpeningBook`
6. 如果弱项是死活/打吃，会提高战术严格度

职责边界：

- 目标是强度校准，不是教学编排
- 目标是平滑，不允许忽强忽弱
- 不允许为了降难度而选择明显坏棋
- 不负责生成训练任务、课程或题目

可调核心参数：

- `openingBookWeight`
- `ruleEngineWeight`
- `policyTemperature`
- `mistakeTolerance`
- `candidateTopK`
- `tacticalStrictness`
- `endgamePrecision`
- `randomness`

## Companion Engine / Player Modeling Engine

`companion-engine.js` 负责：

1. 观察孩子在真实对局中的每一步落子
2. 把落子持续判断为 `good / acceptable / inaccurate / mistake / blunder`
3. 在对局过程中持续修正孩子当前局内强度估计
4. 把这个估计传给 `DifficultyController`
5. 只影响未来几手 AI 的选点，不打断对局，不弹教学页

职责边界：

- 不生成课程
- 不生成每日任务
- 不生成专项练习
- 不中断对局讲解
- 不跳转到独立教学模式

## Position Evaluation Engine

`position-evaluator.js` 负责：

1. 评估当前棋盘整体局势
2. 识别危险棋块
3. 识别断点
4. 估算实地潜力
5. 估算厚势
6. 判断角、边、中腹的价值
7. 给合理候选点补充 `PositionScore`

它不会放行非法手，也不会绕过 `RuleEngine`。它只在已经合法的候选点上加分或减分。

## Midgame Stability Engine

`midgame-stability.js` 负责：

1. 判断弱棋是否值得救
2. 判断小块是否可以弃
3. 提高必须处理弱棋的优先级
4. 降低无关紧要小块的优先级
5. 平滑 `PositionEvaluator` 的局面波动
6. 让 AI 中盘更像真实棋手，而不是一手一变

职责边界：

- 冻结为中盘稳定器，不继续扩展成新 Engine 系统
- 只调整合理候选点分数
- 不能让 `RuleEngine` 已拒绝的点重新进入候选

## Move Quality Controller / Candidate Selection

`move-quality-controller.js` 负责：

1. 接收全部合法候选点
2. 结合 `OpeningBookScore / RuleScore / PolicyScore / CompanionState / DifficultySettings`
3. 将候选点分层为：
   `bestMove / strongMoves / goodMoves / acceptableMoves / weakButLegalMoves / rejectedMoves`
4. 在平滑后的强度带里选择最终落子
5. 为每个候选点生成隐藏 `confidence score`

控制原则：

- 降难度时选次优好棋，不选坏棋
- 必须先通过 `Rule Engine`
- 不允许自杀
- 不允许明显送子
- 不允许无意义乱飞
- 孩子连续输时轻微降低压迫感
- 孩子连续赢时逐步提高精度
- 最近 8-12 手表现会参与平滑，单手棋不会导致强度剧烈跳变

职责边界：

- 只在合理候选点中做分层和选择
- AI 变弱时选次优好棋，不选坏棋
- 不负责新增棋力模块，只负责候选管理和最终选择

## 强度估计逻辑

默认逻辑：

1. 从 `Student Model` 读取孩子基础水平
2. 结合当前吃子差、目差、弱棋数量、开局纪律和完成度
3. 估计这盘棋里孩子此刻的真实强度
4. 让 AI 保持约 `5%~10%` 的强度优势
5. 输出当前回合的 `Move Quality Plan`

`Move Quality Plan` 会控制：

- `best move`
- `second-best move`
- `third-best move`
- `candidate diversity`
- `tactical sharpness`
- `territorial preference`
- `opening precision`
- `endgame precision`
- hidden `confidence score`

## 自适应难度流程图

```text
StudentProfile + RecentResults
  ->
DifficultySettings

StudentProfile + CurrentGameState
  ->
CompanionPlan

CompanionState + DifficultySettings + CandidateScores
  ->
MoveQualityPlan

Board Position
  ->
OpeningBook
  ->
RuleEngine
  ->
Policy Engine
  ->
ContextFusion
  ->
PositionEvaluator
  ->
MidgameStability
  ->
CompanionEngine
  ->
DifficultyController
  ->
MoveQualityController
  ->
Adaptive Final Move
```

## 如何根据孩子状态自动调节对弈

系统不会再单独安排日常任务、教学页或题目，而是在真实对局中持续调整强度：

- 读取孩子基础能力分数
- 读取当前局面表现
- 估计孩子当前局内强度
- 生成当前回合精度计划
- 在安全候选点中选最合适的合理落子

这意味着 AI 不是固定难度，也不是故意乱下，而是通过真实对局持续陪练。

## Engine V3 路线

后续开发方向不再是继续新增 Engine，而是进入 Engine V3，重点提升已有知识的组合决策质量：

- `ContextFusion`
- `Policy Engine` decision quality
- `PositionEvaluator` reliability

`ContextFusion` 优先方向：

- 按阶段动态分配知识源权重
- 按局部战斗强度提高战术权重
- 按实地成熟度提高收官和位置权重
- 按孩子强度估计和 AI 校准级别调整精度
- 保持每候选点浏览器端低延迟

## Engine V4 路线

Engine V4 不再扩展棋力模块，只建立离线评估闭环：

- `training/evaluate_policy.py`
- `GoKidCoachWeb/evaluation/benchmark-config.json`
- `GoKidCoachWeb/evaluation/benchmark-report.json`

职责：

- 从 `clean_sgf` 自动生成分阶段基准样本
- 记录 Top1 / Top3 / Top5 命中、置信度、融合分数、相位与局面特征
- 生成总体准确率、分阶段准确率、平均延迟、平均置信度和回归对比
- 将上一版 `benchmark-report.json` 作为自动基线比较对象
- 保持浏览器运行时完全不受影响

`PositionEvaluator` 优先方向：

- 实地判断
- 厚势判断
- 弱棋判断
- 断点判断
- 局部优先级判断

原则：

- 不新增课程型系统
- 不新增独立教学模式
- 不通过堆叠更多 Engine 解决棋力问题
- 优先提升已有核心模块的真实对局判断能力

## 下一阶段建议

- 优先补强 `Policy Engine` 的棋形与定式延续
- 优先补强 `PositionEvaluator` 的实地、厚势和弱棋判断
- 在不扩模块的前提下提升中盘与官子稳定性

## 查看和清空孩子学习数据

查看方式：

- Safari 开发者工具或浏览器控制台查看 `localStorage`
- 导出家长备份 JSON，里面会包含 `studentProfiles`

清空方式：

```js
localStorage.removeItem("gokidcoach-student-model-v1:child-1");
```

如果想全部清空当前站点的学习数据，也可以直接清除 Safari 的网站数据。

## 其他部署方式

也可以使用 Netlify Drop：

1. 打开 https://app.netlify.com/drop
2. 把整个项目文件夹拖进去。
3. Netlify 会生成一个网址。
4. 在 iPad Safari 打开这个网址。
5. 点“分享” -> “添加到主屏幕”。

## 项目结构

```text
.
├── 404.html
├── .gitignore
├── index.html
├── styles.css
├── app.js
├── manifest.webmanifest
├── sw.js
├── LICENSE
├── assets/
└── screenshots/
```

## 当前限制

- 规则裁判已支持基础禁自杀和全局同形禁着，但不是完整职业规则引擎。
- 胜负评估是教学向简化估算，不是正式数子或数目。
- 内置 AI 是本地增强启发式陪练，并预留轻量策略模型接口；仍不等同于 KataGo。
- 本地记忆依赖浏览器存储，清除网站数据会删除记录。

## License

MIT License

## GitHub 仓库简介建议

```text
儿童围棋自适应陪练网页 App，支持 iPad Safari、PWA、本地记忆、多语言和 AI 难度调整。
```
