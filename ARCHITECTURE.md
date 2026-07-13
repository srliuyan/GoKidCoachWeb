# GoKidCoachWeb Architecture Freeze

## Project Positioning

GoKidCoachWeb 是一个**对弈型自适应儿童围棋陪练 AI**。

核心目标：

- 通过真实对局提升孩子水平
- AI 始终略高于孩子
- 强度变化平滑、自然、像真实棋手
- 不把项目做成课程型教学软件

明确不做：

- Lesson Generator
- Daily Missions
- Homework
- Puzzle Generator
- Separate Training Mode
- 通过继续堆叠新 Engine 来替代棋力提升

## Stable Pipeline

当前稳定流水线冻结为：

```text
OpeningBook
  ->
RuleEngine
  ->
Policy
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
FinalMove
```

原则：

- 不改变主要运行逻辑
- 不删除已有模块
- 不随意新增新的主 Engine
- 新工作优先放在 `Policy` 和 `PositionEvaluator`

## V1.0 Product Layer

V1.0 产品完成阶段新增 `product-support.js`。它不是 Engine，也不参与评分、融合或候选排名。

职责：

- 四个家长可读难度模式到既有 AI level 的映射
- 保守自适应发布配置
- IndexedDB 当前棋局副本
- SGF 构造、解析和 round-trip 回放
- 本地真实对局诊断摘要
- 应用版本和冻结引擎版本记录

边界：

- 不修改 Policy 权重
- 不修改 `PositionEvaluator` 分数
- 不修改 `ContextFusion`
- 不激活 shallow tactical verification
- 不加载 `evaluation/*.json`

## Module Responsibilities

### OpeningBook

职责：

- 前 30 手提供高质量开局参考
- 降低布局乱下概率

边界：

- 不负责中后盘判断
- 不负责非法手过滤

### RuleEngine

定位：**安全底线模块**

职责：

- 合法落子检查
- 自杀过滤
- 提子判断
- 明显送子过滤
- 基础战术硬约束

冻结原则：

- 除非修 Bug，后续不扩展 RuleEngine
- 不把更多复杂棋力逻辑继续塞进 RuleEngine

### Policy

定位：**核心选点能力来源之一**

职责：

- 在安全候选点上提供基础棋力评分
- 叠加 `Pattern Database` 提供的局部职业棋形分
- 叠加 `Shape Library` 提供的常见棋形分
- 叠加 `Joseki Library` 提供的角部局部续弈分
- 叠加 `Fuseki Continuation` 提供的全局布局续弈分
- 叠加 `Tactical Pattern Library` 提供的常见战术局面分
- 叠加 `Endgame Pattern Library` 提供的收官局部分
- 结合模式、形状、布局延续提供自然选点倾向
- 在 Policy V3.0 中通过 `ContextFusion` 把已有知识源动态融合为 `fusedPolicyScore`

当前 Policy V2 子阶段：

- `offline-policy-model.json`
- `pattern-db.json`
- `policy-pattern.js`
- `shape-library.json`
- `shape-library.js`
- `fuseki-db.json`
- `fuseki-library.js`
- `tactical-db.json`
- `tactical-library.js`
- `joseki-db.json`
- `joseki-library.js`
- `endgame-db.json`
- `endgame-library.js`
- `context-fusion.js`

说明：

- `Shape Library` 属于 Policy V2，不是新 Engine
- 它只提升落子质量，不改变稳定流水线
- `Fuseki Continuation` 属于 Policy V2.3，不是新 Engine
- 它只提升 OpeningBook 之后的全局布局续弈质量
- `Tactical Pattern Library` 属于 Policy V2.4，不是新 Engine
- 它只提升常见战术局面的落子质量
- `Joseki Library` 属于 Policy V2.5，不是新 Engine
- 它只提升角部和边上局部续弈质量
- `Endgame Pattern Library` 属于 Policy V2.6，不是新 Engine
- 它只提升晚盘收官质量
- `Context Fusion Layer` 属于 Policy V3.0，不是新 Engine
- 它不新增知识，只根据局面上下文动态组合已有知识

后续重点：

- Context-aware weighting
- Policy decision quality
- PositionEvaluator reliability
- Strength calibration smoothness

### ContextFusion

定位：**Policy V3.0 内部决策融合层**

职责：

- 估计 `opening / early middlegame / middlegame / late middlegame / endgame`
- 估计局部战斗强度
- 估计棋盘稳定度和实地成熟度
- 根据未安定棋块、孩子强度估计和 AI 校准级别生成动态权重
- 输出 `fusedPolicyScore` 给 `DifficultyController`

输入：

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

边界：

- 不加载新数据
- 不新增知识模块
- 不绕过 `RuleEngine`
- 不允许被拒绝候选点重新进入候选
- 每候选点融合应保持浏览器端低延迟

### PositionEvaluator

定位：**核心局面判断模块**

职责：

- 评估实地
- 评估厚势
- 识别弱棋
- 识别断点
- 判断局部优先级

边界：

- 不放行非法手
- 不绕过 RuleEngine
- 只对合理候选点加减分

后续重点：

- 实地判断更稳定
- 厚势判断更可信
- 弱棋判断更准确
- 断点价值更清晰
- 局部与全局优先级更自然

### MidgameStability

定位：**中盘稳定器**

职责：

- 弃子判断
- 必须处理弱棋
- 中盘节奏稳定
- 平滑局面波动

冻结原则：

- 不继续扩展成新系统
- 只调整合理候选点分数
- 不允许把 RuleEngine 已拒绝的点重新带回候选

### CompanionEngine

定位：**Player Modeling Engine**

职责：

- 观察孩子落子
- 判断 `good / acceptable / inaccurate / mistake / blunder`
- 持续更新 StudentModel
- 记录最近 `8-12` 手表现
- 给 DifficultyController 提供强度估计

禁止事项：

- 生成课程
- 生成每日任务
- 生成专项练习
- 中断对局讲课
- 打开独立教学页

### DifficultyController

定位：**Strength Calibration**

职责：

- 让 AI 始终比孩子略强 `5%~10%`
- 根据最近表现平滑调整强度
- 防止忽强忽弱
- 不允许为了降低难度而选择明显坏棋

边界：

- 只做强度校准
- 不做教学编排

### MoveQualityController

定位：**Candidate Selection**

职责：

- 将候选点分层
- 在合理候选点中选择最终落子
- 根据当前强度选择 `Top1 / Top2 / Top3 / Top4`
- AI 变弱时选择次优好棋，而不是坏棋

边界：

- 不选择 `rejectedMoves`
- 不让非法手、自杀、送子重新进入候选
- 不负责新增棋力模块

## Prohibited Directions

从当前阶段开始，以下方向冻结：

- 不再继续新增主 Engine
- 不把产品做成课程型教学平台
- 不加入每日任务、作业、题库、单独训练页
- 不通过随机坏棋降低难度
- 不让 AI 忽强忽弱

## Development Principles

后续开发原则：

- 先提升已有模块真实棋力，再考虑结构变化
- 先提升 `Policy` 和 `PositionEvaluator`
- 用自然、合理、像真实棋手的方式调节难度
- AI 可以变弱，但不能乱下
- AI 可以变强，但不能突然碾压

## Engine V3 Roadmap

Engine V3 的重点不是新增模块，而是提升已有知识的组合决策质量。

### Priority 1: Context Fusion

- Context-aware weighting
- Phase-specific source balance
- Tactical intensity response
- Territory maturity response
- Child-strength-aware calibration

### Priority 2: PositionEvaluator

- 实地判断
- 厚势判断
- 弱棋判断
- 断点判断
- 局部优先级

### Priority 3: Stability Tuning

- 中盘节奏更稳定
- 强度平滑更自然
- 降难度仍保持合理选点质量

## Engine V4 Evaluation Framework V1.1

Engine V4 不改变对弈运行链路，只建立离线评估和回归比较闭环。V1.1 的目标是在优化 Policy 前先建立稳定、确定性、质量感知的基准。

### Scope

- `training/evaluate_policy.py`
- `GoKidCoachWeb/evaluation/benchmark-config.json`
- `GoKidCoachWeb/evaluation/benchmark-report.json`
- `GoKidCoachWeb/evaluation/benchmark-baseline.json`

### Responsibilities

- 从 `clean_sgf` 使用固定随机种子自动抽样生成分阶段基准位置
- 分别覆盖 `opening / fuseki / middlegame / endgame`
- 默认每阶段请求 `250` 个位置，目标最少 `1000` 个评估位置
- 尽量避免同一棋局内重复局面进入样本
- 记录 Top1、Top3、Top5 命中率、融合分数、置信度、局面标签和知识源命中
- 用离线近似的 MoveQualityController 阈值记录 `best / strong / good / acceptable / weak / rejected`
- 计算精确模仿准确率、候选质量、平均候选排名、分数损失、平均延迟和分阶段指标
- 对 `pattern / shape / fuseki / tactical / joseki / endgame` 来源生成诊断
- 默认将当前结果与 `benchmark-baseline.json` 比较

### Boundaries

- 只做离线评估
- 不进入浏览器运行时
- 不修改 Policy 逻辑
- 不修改 UI
- 不新增任何 Engine
- 不导入浏览器 DOM 代码到 Python
- 不把精确 SGF 命中率宣称为棋力

### Output Contract

- `benchmark-config.json` 记录样本规模、随机种子和基线路径
- `benchmark-report.json` 记录 `summary / qualityMetrics / phaseMetrics / qualityDistribution / sourceDiagnostics / regressionComparison`
- `benchmark-baseline.json` 记录稳定基线
- 默认运行只比较基线，不自动覆盖基线
- 只有显式传入 `--update-baseline` 才允许更新基线
- 后续任何 Policy 调整都必须先过这套基准再合并

### Metric Semantics

- `exactMatchRate` 是精确模仿指标：AI 最高分候选是否等于 SGF 实战手。
- `top3MatchRate / top5MatchRate` 是候选覆盖指标：SGF 实战手是否落在 AI 候选前 3 或前 5。
- `goodOrBetterRate / acceptableOrBetterRate` 是质量指标：SGF 实战手在候选列表里是否仍属于合理层级。
- `averageScoreLossFromBest` 是候选质量损失：SGF 实战手相对当前最佳候选的融合分差。
- `averageLatencyMs` 是离线评估性能指标，不代表浏览器 UI 延迟。

### Regression Rules

回归比较输出 `PASS / WARN / FAIL`。

`FAIL` 条件：

- `rejectedMoveRate` 上升
- `goodOrBetterRate` 下降超过 `2` 个百分点
- `averageScoreLossFromBest` 恶化超过 `5%`
- 任一阶段 `goodOrBetterRate` 下降超过 `4` 个百分点
- 平均延迟上升超过 `25%`

`WARN` 用于缺少基线或存在轻微非失败漂移。

`PASS` 表示没有触发回归阈值。

## Summary

当前版本的结构已经够用。

从现在开始，重点不再是“继续加 Engine”，而是把现有 `Policy` 与 `PositionEvaluator` 做强，让 AI 在真实对局中长期保持“略高于孩子水平”的自然陪练状态。
