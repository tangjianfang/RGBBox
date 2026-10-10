# TASK-UNIVERSE — 任务宇宙（系统枚举版）

> 生成时间 2026-10-09T14:23:41.311Z；生成器 scripts/generate-task-universe.mjs（重跑即刷新）。
> **用法**：22 个旗舰任务（PRD R232-R253 计划）是脊柱；本宇宙是系统化枚举的执行面。
> **执行模型**：每个族 = 一个 worktree 分支 + 一个 R-N；实例 = 族分支内的可勾选行（每行独立验收）。
> **质量三关**（每实例必过）：有参数化验收 ✓ 可独立验证 ✓ 砍掉可感知 ✓。P0 先行、P1 排期、P2 择机。

| 族 | 标题 | 价值 | 执行者 | 优先级 | 实例数 |
|---|---|---|---|---|---|
| F1 | 真实录制语料格（手势×环境×人物） | 识别泛化的数据底座——每个格子是真实世界的一个工况点，缺失即商业场景盲区 | user+auto | P0 | 360 |
| F2 | 合成变体识别边界格 | 锁住识别边界：每个变体格是对引擎判定的一个回归锁（秒级、CI 常绿、零摄像头） | auto | P0 | 972 |
| F3 | 效果库逐效果审计 | 55 个效果各过 4 关：默认参数合理/参数元数据完整/双语文案/预览确定性——商业品质面 | auto | P1 | 220 |
| F4 | 视图×主题×语言视觉审 | 12 视图 × 2 主题 × 2 语言 = 48 个真实像素组合逐一 AI 目视复核——把双主题双语做实而非抽查 | auto | P1 | 48 |
| F5 | i18n 键全量审计（1706 键 ÷ 12/批） | 每个键过：zh/en 双存在、语义一致、无硬编码旁路、插值变量对齐——上架多语言硬门槛 | auto | P1 | 143 |
| F6 | IPC 通道契约测试（137 通道） | 每通道 2 件：载荷 schema 类型化 + 失败路径（超时/错误形状）——巨石 main 解构的前置地基 | auto | P1 | 274 |
| F7 | landmark 注入健壮性（21 点×5 形变） | 引擎对每一点的每类畸形输入零崩溃零污染——03/V-17 的系统化收口 | auto | P1 | 105 |
| F8 | 协议消息 fuzz（22 消息×3 畸形类） | 每消息喂 畸形载荷/未知字段/超长值——宿主不崩不断流，错误可上报 | auto | P2 | 66 |
| F9 | 五游戏体感接入审计 | 每游戏 4 关：输入映射/暂停收敛/撤销路径/帧率守护——体感游戏商业面 | auto | P1 | 20 |
| F10 | 吞错点清理（43 处实证） | 每处 `.catch(()=>undefined)`/空 catch 换成：分类日志或用户可见状态——黑箱终结 | auto | P0 | 43 |
| F11 | 用户旅程 E2E（30 条） | 每条端到端剧本=一个商业用户故事的可执行证明 | auto | P1 | 30 |
| F12 | 模块文档化（12 模块） | architecture.md 逐模块对代码核对重写——文档漂移（评审 #1 可信度杀手）系统收口 | auto | P2 | 12 |
| F13 | 双主题快照基线矩阵 | 亮色主题目前无基线——12 视图×2 主题=24 份基线，双主题像素回归全覆盖 | auto | P1 | 24 |
| F14 | 手势×场景映射决策（6×8） | 每格决策：该手势在此场景是否消费/映射什么/防误触等级——产品语义矩阵（宏系统前修） | auto+user | P2 | 48 |
| F15 | 性能预算格（12 视图×3 指标） | 每视图量：空闲 fps/30min 内存/关键动作延迟——商业性能承诺的数字底座 | auto | P2 | 36 |
| **Σ** | | | | | **2401** |

---

## F1 真实录制语料格（手势×环境×人物）

**价值**：识别泛化的数据底座——每个格子是真实世界的一个工况点，缺失即商业场景盲区  
**执行者**：user+auto｜**优先级**：P0｜**worktree**：`wt/f1-<r-n>`（族内实例共享分支，逐行勾选）

| clip | 手势 | 环境 | 人物 | 验收 |
|---|---|---|---|---|
| F1-alice-normal-dir8 | dir8 | normal | alice | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[normal,hand:alice]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-alice-normal-pinch | pinch | normal | alice | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[normal,hand:alice]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-alice-normal-palm | palm | normal | alice | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[normal,hand:alice]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-alice-normal-chord-menu | chord-menu | normal | alice | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[normal,hand:alice]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-alice-normal-chord-light | chord-light | normal | alice | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[normal,hand:alice]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-alice-normal-double-pinch | double-pinch | normal | alice | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[normal,hand:alice]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-alice-dim-dir8 | dir8 | dim | alice | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[dim,hand:alice]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-alice-dim-pinch | pinch | dim | alice | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[dim,hand:alice]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-alice-dim-palm | palm | dim | alice | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[dim,hand:alice]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-alice-dim-chord-menu | chord-menu | dim | alice | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[dim,hand:alice]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-alice-dim-chord-light | chord-light | dim | alice | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[dim,hand:alice]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-alice-dim-double-pinch | double-pinch | dim | alice | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[dim,hand:alice]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-alice-backlight-dir8 | dir8 | backlight | alice | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[backlight,hand:alice]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-alice-backlight-pinch | pinch | backlight | alice | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[backlight,hand:alice]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-alice-backlight-palm | palm | backlight | alice | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[backlight,hand:alice]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-alice-backlight-chord-menu | chord-menu | backlight | alice | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[backlight,hand:alice]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-alice-backlight-chord-light | chord-light | backlight | alice | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[backlight,hand:alice]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-alice-backlight-double-pinch | double-pinch | backlight | alice | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[backlight,hand:alice]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-alice-far-dir8 | dir8 | far | alice | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[far,hand:alice]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-alice-far-pinch | pinch | far | alice | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[far,hand:alice]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-alice-far-palm | palm | far | alice | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[far,hand:alice]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-alice-far-chord-menu | chord-menu | far | alice | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[far,hand:alice]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-alice-far-chord-light | chord-light | far | alice | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[far,hand:alice]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-alice-far-double-pinch | double-pinch | far | alice | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[far,hand:alice]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-alice-close-dir8 | dir8 | close | alice | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[close,hand:alice]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-alice-close-pinch | pinch | close | alice | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[close,hand:alice]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-alice-close-palm | palm | close | alice | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[close,hand:alice]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-alice-close-chord-menu | chord-menu | close | alice | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[close,hand:alice]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-alice-close-chord-light | chord-light | close | alice | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[close,hand:alice]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-alice-close-double-pinch | double-pinch | close | alice | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[close,hand:alice]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-alice-fast-dir8 | dir8 | fast | alice | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[fast,hand:alice]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-alice-fast-pinch | pinch | fast | alice | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[fast,hand:alice]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-alice-fast-palm | palm | fast | alice | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[fast,hand:alice]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-alice-fast-chord-menu | chord-menu | fast | alice | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[fast,hand:alice]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-alice-fast-chord-light | chord-light | fast | alice | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[fast,hand:alice]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-alice-fast-double-pinch | double-pinch | fast | alice | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[fast,hand:alice]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-alice-slow-dir8 | dir8 | slow | alice | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[slow,hand:alice]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-alice-slow-pinch | pinch | slow | alice | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[slow,hand:alice]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-alice-slow-palm | palm | slow | alice | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[slow,hand:alice]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-alice-slow-chord-menu | chord-menu | slow | alice | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[slow,hand:alice]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-alice-slow-chord-light | chord-light | slow | alice | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[slow,hand:alice]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-alice-slow-double-pinch | double-pinch | slow | alice | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[slow,hand:alice]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-alice-exit-enter-dir8 | dir8 | exit-enter | alice | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[exit-enter,hand:alice]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-alice-exit-enter-pinch | pinch | exit-enter | alice | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[exit-enter,hand:alice]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-alice-exit-enter-palm | palm | exit-enter | alice | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[exit-enter,hand:alice]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-alice-exit-enter-chord-menu | chord-menu | exit-enter | alice | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[exit-enter,hand:alice]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-alice-exit-enter-chord-light | chord-light | exit-enter | alice | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[exit-enter,hand:alice]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-alice-exit-enter-double-pinch | double-pinch | exit-enter | alice | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[exit-enter,hand:alice]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-alice-two-person-dir8 | dir8 | two-person | alice | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[two-person,hand:alice]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-alice-two-person-pinch | pinch | two-person | alice | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[two-person,hand:alice]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-alice-two-person-palm | palm | two-person | alice | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[two-person,hand:alice]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-alice-two-person-chord-menu | chord-menu | two-person | alice | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[two-person,hand:alice]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-alice-two-person-chord-light | chord-light | two-person | alice | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[two-person,hand:alice]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-alice-two-person-double-pinch | double-pinch | two-person | alice | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[two-person,hand:alice]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-alice-left-hand-dir8 | dir8 | left-hand | alice | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[left-hand,hand:alice]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-alice-left-hand-pinch | pinch | left-hand | alice | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[left-hand,hand:alice]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-alice-left-hand-palm | palm | left-hand | alice | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[left-hand,hand:alice]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-alice-left-hand-chord-menu | chord-menu | left-hand | alice | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[left-hand,hand:alice]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-alice-left-hand-chord-light | chord-light | left-hand | alice | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[left-hand,hand:alice]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-alice-left-hand-double-pinch | double-pinch | left-hand | alice | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[left-hand,hand:alice]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-alice-sitting-dir8 | dir8 | sitting | alice | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[sitting,hand:alice]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-alice-sitting-pinch | pinch | sitting | alice | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[sitting,hand:alice]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-alice-sitting-palm | palm | sitting | alice | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[sitting,hand:alice]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-alice-sitting-chord-menu | chord-menu | sitting | alice | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[sitting,hand:alice]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-alice-sitting-chord-light | chord-light | sitting | alice | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[sitting,hand:alice]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-alice-sitting-double-pinch | double-pinch | sitting | alice | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[sitting,hand:alice]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-alice-standing-dir8 | dir8 | standing | alice | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[standing,hand:alice]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-alice-standing-pinch | pinch | standing | alice | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[standing,hand:alice]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-alice-standing-palm | palm | standing | alice | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[standing,hand:alice]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-alice-standing-chord-menu | chord-menu | standing | alice | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[standing,hand:alice]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-alice-standing-chord-light | chord-light | standing | alice | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[standing,hand:alice]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-alice-standing-double-pinch | double-pinch | standing | alice | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[standing,hand:alice]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-bob-normal-dir8 | dir8 | normal | bob | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[normal,hand:bob]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-bob-normal-pinch | pinch | normal | bob | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[normal,hand:bob]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-bob-normal-palm | palm | normal | bob | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[normal,hand:bob]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-bob-normal-chord-menu | chord-menu | normal | bob | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[normal,hand:bob]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-bob-normal-chord-light | chord-light | normal | bob | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[normal,hand:bob]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-bob-normal-double-pinch | double-pinch | normal | bob | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[normal,hand:bob]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-bob-dim-dir8 | dir8 | dim | bob | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[dim,hand:bob]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-bob-dim-pinch | pinch | dim | bob | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[dim,hand:bob]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-bob-dim-palm | palm | dim | bob | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[dim,hand:bob]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-bob-dim-chord-menu | chord-menu | dim | bob | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[dim,hand:bob]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-bob-dim-chord-light | chord-light | dim | bob | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[dim,hand:bob]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-bob-dim-double-pinch | double-pinch | dim | bob | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[dim,hand:bob]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-bob-backlight-dir8 | dir8 | backlight | bob | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[backlight,hand:bob]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-bob-backlight-pinch | pinch | backlight | bob | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[backlight,hand:bob]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-bob-backlight-palm | palm | backlight | bob | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[backlight,hand:bob]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-bob-backlight-chord-menu | chord-menu | backlight | bob | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[backlight,hand:bob]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-bob-backlight-chord-light | chord-light | backlight | bob | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[backlight,hand:bob]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-bob-backlight-double-pinch | double-pinch | backlight | bob | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[backlight,hand:bob]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-bob-far-dir8 | dir8 | far | bob | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[far,hand:bob]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-bob-far-pinch | pinch | far | bob | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[far,hand:bob]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-bob-far-palm | palm | far | bob | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[far,hand:bob]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-bob-far-chord-menu | chord-menu | far | bob | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[far,hand:bob]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-bob-far-chord-light | chord-light | far | bob | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[far,hand:bob]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-bob-far-double-pinch | double-pinch | far | bob | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[far,hand:bob]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-bob-close-dir8 | dir8 | close | bob | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[close,hand:bob]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-bob-close-pinch | pinch | close | bob | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[close,hand:bob]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-bob-close-palm | palm | close | bob | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[close,hand:bob]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-bob-close-chord-menu | chord-menu | close | bob | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[close,hand:bob]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-bob-close-chord-light | chord-light | close | bob | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[close,hand:bob]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-bob-close-double-pinch | double-pinch | close | bob | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[close,hand:bob]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-bob-fast-dir8 | dir8 | fast | bob | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[fast,hand:bob]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-bob-fast-pinch | pinch | fast | bob | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[fast,hand:bob]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-bob-fast-palm | palm | fast | bob | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[fast,hand:bob]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-bob-fast-chord-menu | chord-menu | fast | bob | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[fast,hand:bob]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-bob-fast-chord-light | chord-light | fast | bob | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[fast,hand:bob]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-bob-fast-double-pinch | double-pinch | fast | bob | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[fast,hand:bob]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-bob-slow-dir8 | dir8 | slow | bob | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[slow,hand:bob]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-bob-slow-pinch | pinch | slow | bob | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[slow,hand:bob]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-bob-slow-palm | palm | slow | bob | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[slow,hand:bob]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-bob-slow-chord-menu | chord-menu | slow | bob | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[slow,hand:bob]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-bob-slow-chord-light | chord-light | slow | bob | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[slow,hand:bob]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-bob-slow-double-pinch | double-pinch | slow | bob | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[slow,hand:bob]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-bob-exit-enter-dir8 | dir8 | exit-enter | bob | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[exit-enter,hand:bob]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-bob-exit-enter-pinch | pinch | exit-enter | bob | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[exit-enter,hand:bob]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-bob-exit-enter-palm | palm | exit-enter | bob | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[exit-enter,hand:bob]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-bob-exit-enter-chord-menu | chord-menu | exit-enter | bob | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[exit-enter,hand:bob]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-bob-exit-enter-chord-light | chord-light | exit-enter | bob | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[exit-enter,hand:bob]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-bob-exit-enter-double-pinch | double-pinch | exit-enter | bob | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[exit-enter,hand:bob]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-bob-two-person-dir8 | dir8 | two-person | bob | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[two-person,hand:bob]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-bob-two-person-pinch | pinch | two-person | bob | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[two-person,hand:bob]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-bob-two-person-palm | palm | two-person | bob | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[two-person,hand:bob]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-bob-two-person-chord-menu | chord-menu | two-person | bob | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[two-person,hand:bob]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-bob-two-person-chord-light | chord-light | two-person | bob | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[two-person,hand:bob]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-bob-two-person-double-pinch | double-pinch | two-person | bob | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[two-person,hand:bob]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-bob-left-hand-dir8 | dir8 | left-hand | bob | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[left-hand,hand:bob]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-bob-left-hand-pinch | pinch | left-hand | bob | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[left-hand,hand:bob]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-bob-left-hand-palm | palm | left-hand | bob | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[left-hand,hand:bob]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-bob-left-hand-chord-menu | chord-menu | left-hand | bob | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[left-hand,hand:bob]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-bob-left-hand-chord-light | chord-light | left-hand | bob | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[left-hand,hand:bob]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-bob-left-hand-double-pinch | double-pinch | left-hand | bob | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[left-hand,hand:bob]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-bob-sitting-dir8 | dir8 | sitting | bob | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[sitting,hand:bob]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-bob-sitting-pinch | pinch | sitting | bob | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[sitting,hand:bob]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-bob-sitting-palm | palm | sitting | bob | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[sitting,hand:bob]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-bob-sitting-chord-menu | chord-menu | sitting | bob | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[sitting,hand:bob]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-bob-sitting-chord-light | chord-light | sitting | bob | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[sitting,hand:bob]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-bob-sitting-double-pinch | double-pinch | sitting | bob | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[sitting,hand:bob]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-bob-standing-dir8 | dir8 | standing | bob | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[standing,hand:bob]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-bob-standing-pinch | pinch | standing | bob | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[standing,hand:bob]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-bob-standing-palm | palm | standing | bob | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[standing,hand:bob]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-bob-standing-chord-menu | chord-menu | standing | bob | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[standing,hand:bob]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-bob-standing-chord-light | chord-light | standing | bob | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[standing,hand:bob]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-bob-standing-double-pinch | double-pinch | standing | bob | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[standing,hand:bob]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-carol-normal-dir8 | dir8 | normal | carol | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[normal,hand:carol]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-carol-normal-pinch | pinch | normal | carol | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[normal,hand:carol]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-carol-normal-palm | palm | normal | carol | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[normal,hand:carol]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-carol-normal-chord-menu | chord-menu | normal | carol | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[normal,hand:carol]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-carol-normal-chord-light | chord-light | normal | carol | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[normal,hand:carol]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-carol-normal-double-pinch | double-pinch | normal | carol | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[normal,hand:carol]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-carol-dim-dir8 | dir8 | dim | carol | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[dim,hand:carol]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-carol-dim-pinch | pinch | dim | carol | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[dim,hand:carol]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-carol-dim-palm | palm | dim | carol | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[dim,hand:carol]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-carol-dim-chord-menu | chord-menu | dim | carol | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[dim,hand:carol]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-carol-dim-chord-light | chord-light | dim | carol | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[dim,hand:carol]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-carol-dim-double-pinch | double-pinch | dim | carol | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[dim,hand:carol]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-carol-backlight-dir8 | dir8 | backlight | carol | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[backlight,hand:carol]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-carol-backlight-pinch | pinch | backlight | carol | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[backlight,hand:carol]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-carol-backlight-palm | palm | backlight | carol | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[backlight,hand:carol]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-carol-backlight-chord-menu | chord-menu | backlight | carol | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[backlight,hand:carol]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-carol-backlight-chord-light | chord-light | backlight | carol | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[backlight,hand:carol]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-carol-backlight-double-pinch | double-pinch | backlight | carol | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[backlight,hand:carol]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-carol-far-dir8 | dir8 | far | carol | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[far,hand:carol]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-carol-far-pinch | pinch | far | carol | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[far,hand:carol]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-carol-far-palm | palm | far | carol | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[far,hand:carol]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-carol-far-chord-menu | chord-menu | far | carol | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[far,hand:carol]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-carol-far-chord-light | chord-light | far | carol | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[far,hand:carol]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-carol-far-double-pinch | double-pinch | far | carol | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[far,hand:carol]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-carol-close-dir8 | dir8 | close | carol | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[close,hand:carol]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-carol-close-pinch | pinch | close | carol | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[close,hand:carol]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-carol-close-palm | palm | close | carol | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[close,hand:carol]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-carol-close-chord-menu | chord-menu | close | carol | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[close,hand:carol]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-carol-close-chord-light | chord-light | close | carol | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[close,hand:carol]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-carol-close-double-pinch | double-pinch | close | carol | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[close,hand:carol]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-carol-fast-dir8 | dir8 | fast | carol | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[fast,hand:carol]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-carol-fast-pinch | pinch | fast | carol | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[fast,hand:carol]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-carol-fast-palm | palm | fast | carol | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[fast,hand:carol]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-carol-fast-chord-menu | chord-menu | fast | carol | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[fast,hand:carol]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-carol-fast-chord-light | chord-light | fast | carol | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[fast,hand:carol]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-carol-fast-double-pinch | double-pinch | fast | carol | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[fast,hand:carol]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-carol-slow-dir8 | dir8 | slow | carol | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[slow,hand:carol]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-carol-slow-pinch | pinch | slow | carol | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[slow,hand:carol]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-carol-slow-palm | palm | slow | carol | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[slow,hand:carol]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-carol-slow-chord-menu | chord-menu | slow | carol | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[slow,hand:carol]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-carol-slow-chord-light | chord-light | slow | carol | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[slow,hand:carol]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-carol-slow-double-pinch | double-pinch | slow | carol | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[slow,hand:carol]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-carol-exit-enter-dir8 | dir8 | exit-enter | carol | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[exit-enter,hand:carol]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-carol-exit-enter-pinch | pinch | exit-enter | carol | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[exit-enter,hand:carol]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-carol-exit-enter-palm | palm | exit-enter | carol | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[exit-enter,hand:carol]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-carol-exit-enter-chord-menu | chord-menu | exit-enter | carol | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[exit-enter,hand:carol]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-carol-exit-enter-chord-light | chord-light | exit-enter | carol | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[exit-enter,hand:carol]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-carol-exit-enter-double-pinch | double-pinch | exit-enter | carol | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[exit-enter,hand:carol]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-carol-two-person-dir8 | dir8 | two-person | carol | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[two-person,hand:carol]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-carol-two-person-pinch | pinch | two-person | carol | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[two-person,hand:carol]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-carol-two-person-palm | palm | two-person | carol | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[two-person,hand:carol]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-carol-two-person-chord-menu | chord-menu | two-person | carol | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[two-person,hand:carol]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-carol-two-person-chord-light | chord-light | two-person | carol | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[two-person,hand:carol]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-carol-two-person-double-pinch | double-pinch | two-person | carol | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[two-person,hand:carol]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-carol-left-hand-dir8 | dir8 | left-hand | carol | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[left-hand,hand:carol]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-carol-left-hand-pinch | pinch | left-hand | carol | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[left-hand,hand:carol]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-carol-left-hand-palm | palm | left-hand | carol | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[left-hand,hand:carol]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-carol-left-hand-chord-menu | chord-menu | left-hand | carol | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[left-hand,hand:carol]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-carol-left-hand-chord-light | chord-light | left-hand | carol | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[left-hand,hand:carol]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-carol-left-hand-double-pinch | double-pinch | left-hand | carol | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[left-hand,hand:carol]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-carol-sitting-dir8 | dir8 | sitting | carol | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[sitting,hand:carol]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-carol-sitting-pinch | pinch | sitting | carol | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[sitting,hand:carol]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-carol-sitting-palm | palm | sitting | carol | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[sitting,hand:carol]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-carol-sitting-chord-menu | chord-menu | sitting | carol | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[sitting,hand:carol]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-carol-sitting-chord-light | chord-light | sitting | carol | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[sitting,hand:carol]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-carol-sitting-double-pinch | double-pinch | sitting | carol | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[sitting,hand:carol]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-carol-standing-dir8 | dir8 | standing | carol | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[standing,hand:carol]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-carol-standing-pinch | pinch | standing | carol | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[standing,hand:carol]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-carol-standing-palm | palm | standing | carol | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[standing,hand:carol]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-carol-standing-chord-menu | chord-menu | standing | carol | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[standing,hand:carol]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-carol-standing-chord-light | chord-light | standing | carol | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[standing,hand:carol]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-carol-standing-double-pinch | double-pinch | standing | carol | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[standing,hand:carol]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-dave-normal-dir8 | dir8 | normal | dave | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[normal,hand:dave]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-dave-normal-pinch | pinch | normal | dave | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[normal,hand:dave]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-dave-normal-palm | palm | normal | dave | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[normal,hand:dave]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-dave-normal-chord-menu | chord-menu | normal | dave | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[normal,hand:dave]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-dave-normal-chord-light | chord-light | normal | dave | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[normal,hand:dave]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-dave-normal-double-pinch | double-pinch | normal | dave | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[normal,hand:dave]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-dave-dim-dir8 | dir8 | dim | dave | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[dim,hand:dave]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-dave-dim-pinch | pinch | dim | dave | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[dim,hand:dave]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-dave-dim-palm | palm | dim | dave | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[dim,hand:dave]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-dave-dim-chord-menu | chord-menu | dim | dave | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[dim,hand:dave]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-dave-dim-chord-light | chord-light | dim | dave | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[dim,hand:dave]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-dave-dim-double-pinch | double-pinch | dim | dave | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[dim,hand:dave]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-dave-backlight-dir8 | dir8 | backlight | dave | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[backlight,hand:dave]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-dave-backlight-pinch | pinch | backlight | dave | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[backlight,hand:dave]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-dave-backlight-palm | palm | backlight | dave | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[backlight,hand:dave]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-dave-backlight-chord-menu | chord-menu | backlight | dave | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[backlight,hand:dave]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-dave-backlight-chord-light | chord-light | backlight | dave | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[backlight,hand:dave]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-dave-backlight-double-pinch | double-pinch | backlight | dave | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[backlight,hand:dave]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-dave-far-dir8 | dir8 | far | dave | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[far,hand:dave]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-dave-far-pinch | pinch | far | dave | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[far,hand:dave]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-dave-far-palm | palm | far | dave | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[far,hand:dave]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-dave-far-chord-menu | chord-menu | far | dave | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[far,hand:dave]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-dave-far-chord-light | chord-light | far | dave | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[far,hand:dave]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-dave-far-double-pinch | double-pinch | far | dave | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[far,hand:dave]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-dave-close-dir8 | dir8 | close | dave | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[close,hand:dave]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-dave-close-pinch | pinch | close | dave | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[close,hand:dave]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-dave-close-palm | palm | close | dave | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[close,hand:dave]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-dave-close-chord-menu | chord-menu | close | dave | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[close,hand:dave]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-dave-close-chord-light | chord-light | close | dave | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[close,hand:dave]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-dave-close-double-pinch | double-pinch | close | dave | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[close,hand:dave]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-dave-fast-dir8 | dir8 | fast | dave | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[fast,hand:dave]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-dave-fast-pinch | pinch | fast | dave | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[fast,hand:dave]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-dave-fast-palm | palm | fast | dave | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[fast,hand:dave]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-dave-fast-chord-menu | chord-menu | fast | dave | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[fast,hand:dave]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-dave-fast-chord-light | chord-light | fast | dave | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[fast,hand:dave]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-dave-fast-double-pinch | double-pinch | fast | dave | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[fast,hand:dave]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-dave-slow-dir8 | dir8 | slow | dave | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[slow,hand:dave]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-dave-slow-pinch | pinch | slow | dave | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[slow,hand:dave]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-dave-slow-palm | palm | slow | dave | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[slow,hand:dave]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-dave-slow-chord-menu | chord-menu | slow | dave | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[slow,hand:dave]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-dave-slow-chord-light | chord-light | slow | dave | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[slow,hand:dave]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-dave-slow-double-pinch | double-pinch | slow | dave | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[slow,hand:dave]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-dave-exit-enter-dir8 | dir8 | exit-enter | dave | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[exit-enter,hand:dave]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-dave-exit-enter-pinch | pinch | exit-enter | dave | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[exit-enter,hand:dave]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-dave-exit-enter-palm | palm | exit-enter | dave | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[exit-enter,hand:dave]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-dave-exit-enter-chord-menu | chord-menu | exit-enter | dave | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[exit-enter,hand:dave]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-dave-exit-enter-chord-light | chord-light | exit-enter | dave | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[exit-enter,hand:dave]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-dave-exit-enter-double-pinch | double-pinch | exit-enter | dave | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[exit-enter,hand:dave]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-dave-two-person-dir8 | dir8 | two-person | dave | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[two-person,hand:dave]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-dave-two-person-pinch | pinch | two-person | dave | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[two-person,hand:dave]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-dave-two-person-palm | palm | two-person | dave | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[two-person,hand:dave]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-dave-two-person-chord-menu | chord-menu | two-person | dave | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[two-person,hand:dave]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-dave-two-person-chord-light | chord-light | two-person | dave | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[two-person,hand:dave]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-dave-two-person-double-pinch | double-pinch | two-person | dave | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[two-person,hand:dave]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-dave-left-hand-dir8 | dir8 | left-hand | dave | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[left-hand,hand:dave]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-dave-left-hand-pinch | pinch | left-hand | dave | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[left-hand,hand:dave]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-dave-left-hand-palm | palm | left-hand | dave | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[left-hand,hand:dave]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-dave-left-hand-chord-menu | chord-menu | left-hand | dave | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[left-hand,hand:dave]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-dave-left-hand-chord-light | chord-light | left-hand | dave | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[left-hand,hand:dave]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-dave-left-hand-double-pinch | double-pinch | left-hand | dave | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[left-hand,hand:dave]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-dave-sitting-dir8 | dir8 | sitting | dave | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[sitting,hand:dave]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-dave-sitting-pinch | pinch | sitting | dave | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[sitting,hand:dave]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-dave-sitting-palm | palm | sitting | dave | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[sitting,hand:dave]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-dave-sitting-chord-menu | chord-menu | sitting | dave | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[sitting,hand:dave]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-dave-sitting-chord-light | chord-light | sitting | dave | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[sitting,hand:dave]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-dave-sitting-double-pinch | double-pinch | sitting | dave | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[sitting,hand:dave]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-dave-standing-dir8 | dir8 | standing | dave | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[standing,hand:dave]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-dave-standing-pinch | pinch | standing | dave | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[standing,hand:dave]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-dave-standing-palm | palm | standing | dave | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[standing,hand:dave]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-dave-standing-chord-menu | chord-menu | standing | dave | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[standing,hand:dave]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-dave-standing-chord-light | chord-light | standing | dave | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[standing,hand:dave]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-dave-standing-double-pinch | double-pinch | standing | dave | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[standing,hand:dave]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-erin-normal-dir8 | dir8 | normal | erin | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[normal,hand:erin]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-erin-normal-pinch | pinch | normal | erin | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[normal,hand:erin]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-erin-normal-palm | palm | normal | erin | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[normal,hand:erin]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-erin-normal-chord-menu | chord-menu | normal | erin | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[normal,hand:erin]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-erin-normal-chord-light | chord-light | normal | erin | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[normal,hand:erin]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-erin-normal-double-pinch | double-pinch | normal | erin | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[normal,hand:erin]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-erin-dim-dir8 | dir8 | dim | erin | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[dim,hand:erin]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-erin-dim-pinch | pinch | dim | erin | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[dim,hand:erin]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-erin-dim-palm | palm | dim | erin | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[dim,hand:erin]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-erin-dim-chord-menu | chord-menu | dim | erin | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[dim,hand:erin]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-erin-dim-chord-light | chord-light | dim | erin | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[dim,hand:erin]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-erin-dim-double-pinch | double-pinch | dim | erin | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[dim,hand:erin]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-erin-backlight-dir8 | dir8 | backlight | erin | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[backlight,hand:erin]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-erin-backlight-pinch | pinch | backlight | erin | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[backlight,hand:erin]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-erin-backlight-palm | palm | backlight | erin | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[backlight,hand:erin]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-erin-backlight-chord-menu | chord-menu | backlight | erin | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[backlight,hand:erin]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-erin-backlight-chord-light | chord-light | backlight | erin | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[backlight,hand:erin]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-erin-backlight-double-pinch | double-pinch | backlight | erin | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[backlight,hand:erin]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-erin-far-dir8 | dir8 | far | erin | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[far,hand:erin]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-erin-far-pinch | pinch | far | erin | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[far,hand:erin]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-erin-far-palm | palm | far | erin | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[far,hand:erin]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-erin-far-chord-menu | chord-menu | far | erin | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[far,hand:erin]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-erin-far-chord-light | chord-light | far | erin | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[far,hand:erin]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-erin-far-double-pinch | double-pinch | far | erin | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[far,hand:erin]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-erin-close-dir8 | dir8 | close | erin | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[close,hand:erin]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-erin-close-pinch | pinch | close | erin | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[close,hand:erin]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-erin-close-palm | palm | close | erin | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[close,hand:erin]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-erin-close-chord-menu | chord-menu | close | erin | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[close,hand:erin]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-erin-close-chord-light | chord-light | close | erin | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[close,hand:erin]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-erin-close-double-pinch | double-pinch | close | erin | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[close,hand:erin]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-erin-fast-dir8 | dir8 | fast | erin | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[fast,hand:erin]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-erin-fast-pinch | pinch | fast | erin | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[fast,hand:erin]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-erin-fast-palm | palm | fast | erin | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[fast,hand:erin]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-erin-fast-chord-menu | chord-menu | fast | erin | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[fast,hand:erin]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-erin-fast-chord-light | chord-light | fast | erin | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[fast,hand:erin]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-erin-fast-double-pinch | double-pinch | fast | erin | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[fast,hand:erin]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-erin-slow-dir8 | dir8 | slow | erin | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[slow,hand:erin]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-erin-slow-pinch | pinch | slow | erin | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[slow,hand:erin]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-erin-slow-palm | palm | slow | erin | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[slow,hand:erin]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-erin-slow-chord-menu | chord-menu | slow | erin | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[slow,hand:erin]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-erin-slow-chord-light | chord-light | slow | erin | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[slow,hand:erin]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-erin-slow-double-pinch | double-pinch | slow | erin | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[slow,hand:erin]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-erin-exit-enter-dir8 | dir8 | exit-enter | erin | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[exit-enter,hand:erin]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-erin-exit-enter-pinch | pinch | exit-enter | erin | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[exit-enter,hand:erin]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-erin-exit-enter-palm | palm | exit-enter | erin | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[exit-enter,hand:erin]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-erin-exit-enter-chord-menu | chord-menu | exit-enter | erin | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[exit-enter,hand:erin]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-erin-exit-enter-chord-light | chord-light | exit-enter | erin | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[exit-enter,hand:erin]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-erin-exit-enter-double-pinch | double-pinch | exit-enter | erin | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[exit-enter,hand:erin]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-erin-two-person-dir8 | dir8 | two-person | erin | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[two-person,hand:erin]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-erin-two-person-pinch | pinch | two-person | erin | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[two-person,hand:erin]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-erin-two-person-palm | palm | two-person | erin | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[two-person,hand:erin]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-erin-two-person-chord-menu | chord-menu | two-person | erin | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[two-person,hand:erin]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-erin-two-person-chord-light | chord-light | two-person | erin | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[two-person,hand:erin]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-erin-two-person-double-pinch | double-pinch | two-person | erin | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[two-person,hand:erin]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-erin-left-hand-dir8 | dir8 | left-hand | erin | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[left-hand,hand:erin]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-erin-left-hand-pinch | pinch | left-hand | erin | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[left-hand,hand:erin]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-erin-left-hand-palm | palm | left-hand | erin | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[left-hand,hand:erin]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-erin-left-hand-chord-menu | chord-menu | left-hand | erin | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[left-hand,hand:erin]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-erin-left-hand-chord-light | chord-light | left-hand | erin | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[left-hand,hand:erin]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-erin-left-hand-double-pinch | double-pinch | left-hand | erin | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[left-hand,hand:erin]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-erin-sitting-dir8 | dir8 | sitting | erin | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[sitting,hand:erin]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-erin-sitting-pinch | pinch | sitting | erin | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[sitting,hand:erin]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-erin-sitting-palm | palm | sitting | erin | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[sitting,hand:erin]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-erin-sitting-chord-menu | chord-menu | sitting | erin | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[sitting,hand:erin]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-erin-sitting-chord-light | chord-light | sitting | erin | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[sitting,hand:erin]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-erin-sitting-double-pinch | double-pinch | sitting | erin | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[sitting,hand:erin]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-erin-standing-dir8 | dir8 | standing | erin | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[standing,hand:erin]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-erin-standing-pinch | pinch | standing | erin | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[standing,hand:erin]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-erin-standing-palm | palm | standing | erin | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[standing,hand:erin]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-erin-standing-chord-menu | chord-menu | standing | erin | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[standing,hand:erin]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-erin-standing-chord-light | chord-light | standing | erin | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[standing,hand:erin]；replay 召回 ≥0.8 且无误触发超 gates |
| F1-erin-standing-double-pinch | double-pinch | standing | erin | 按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[standing,hand:erin]；replay 召回 ≥0.8 且无误触发超 gates |

## F2 合成变体识别边界格

**价值**：锁住识别边界：每个变体格是对引擎判定的一个回归锁（秒级、CI 常绿、零摄像头）  
**执行者**：auto｜**优先级**：P0｜**worktree**：`wt/f2-<r-n>`（族内实例共享分支，逐行勾选）

| cell | 手势 | scale | noise | dropout | 遮挡 | 速度 | 验收 |
|---|---|---|---|---|---|---|---|
| F2-dir8-0.12-0.004-0-none-slow | dir8 | 0.12 | 0.004 | 0 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.12-0.004-0-none-normal | dir8 | 0.12 | 0.004 | 0 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.12-0.004-0-none-fast | dir8 | 0.12 | 0.004 | 0 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.12-0.004-0-partial-slow | dir8 | 0.12 | 0.004 | 0 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.12-0.004-0-partial-normal | dir8 | 0.12 | 0.004 | 0 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.12-0.004-0-partial-fast | dir8 | 0.12 | 0.004 | 0 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.12-0.004-0.1-none-slow | dir8 | 0.12 | 0.004 | 0.1 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.12-0.004-0.1-none-normal | dir8 | 0.12 | 0.004 | 0.1 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.12-0.004-0.1-none-fast | dir8 | 0.12 | 0.004 | 0.1 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.12-0.004-0.1-partial-slow | dir8 | 0.12 | 0.004 | 0.1 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.12-0.004-0.1-partial-normal | dir8 | 0.12 | 0.004 | 0.1 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.12-0.004-0.1-partial-fast | dir8 | 0.12 | 0.004 | 0.1 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.12-0.004-0.25-none-slow | dir8 | 0.12 | 0.004 | 0.25 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.12-0.004-0.25-none-normal | dir8 | 0.12 | 0.004 | 0.25 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.12-0.004-0.25-none-fast | dir8 | 0.12 | 0.004 | 0.25 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.12-0.004-0.25-partial-slow | dir8 | 0.12 | 0.004 | 0.25 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.12-0.004-0.25-partial-normal | dir8 | 0.12 | 0.004 | 0.25 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.12-0.004-0.25-partial-fast | dir8 | 0.12 | 0.004 | 0.25 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.12-0.008-0-none-slow | dir8 | 0.12 | 0.008 | 0 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.12-0.008-0-none-normal | dir8 | 0.12 | 0.008 | 0 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.12-0.008-0-none-fast | dir8 | 0.12 | 0.008 | 0 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.12-0.008-0-partial-slow | dir8 | 0.12 | 0.008 | 0 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.12-0.008-0-partial-normal | dir8 | 0.12 | 0.008 | 0 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.12-0.008-0-partial-fast | dir8 | 0.12 | 0.008 | 0 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.12-0.008-0.1-none-slow | dir8 | 0.12 | 0.008 | 0.1 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.12-0.008-0.1-none-normal | dir8 | 0.12 | 0.008 | 0.1 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.12-0.008-0.1-none-fast | dir8 | 0.12 | 0.008 | 0.1 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.12-0.008-0.1-partial-slow | dir8 | 0.12 | 0.008 | 0.1 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.12-0.008-0.1-partial-normal | dir8 | 0.12 | 0.008 | 0.1 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.12-0.008-0.1-partial-fast | dir8 | 0.12 | 0.008 | 0.1 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.12-0.008-0.25-none-slow | dir8 | 0.12 | 0.008 | 0.25 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.12-0.008-0.25-none-normal | dir8 | 0.12 | 0.008 | 0.25 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.12-0.008-0.25-none-fast | dir8 | 0.12 | 0.008 | 0.25 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.12-0.008-0.25-partial-slow | dir8 | 0.12 | 0.008 | 0.25 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.12-0.008-0.25-partial-normal | dir8 | 0.12 | 0.008 | 0.25 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.12-0.008-0.25-partial-fast | dir8 | 0.12 | 0.008 | 0.25 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.12-0.016-0-none-slow | dir8 | 0.12 | 0.016 | 0 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.12-0.016-0-none-normal | dir8 | 0.12 | 0.016 | 0 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.12-0.016-0-none-fast | dir8 | 0.12 | 0.016 | 0 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.12-0.016-0-partial-slow | dir8 | 0.12 | 0.016 | 0 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.12-0.016-0-partial-normal | dir8 | 0.12 | 0.016 | 0 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.12-0.016-0-partial-fast | dir8 | 0.12 | 0.016 | 0 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.12-0.016-0.1-none-slow | dir8 | 0.12 | 0.016 | 0.1 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.12-0.016-0.1-none-normal | dir8 | 0.12 | 0.016 | 0.1 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.12-0.016-0.1-none-fast | dir8 | 0.12 | 0.016 | 0.1 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.12-0.016-0.1-partial-slow | dir8 | 0.12 | 0.016 | 0.1 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.12-0.016-0.1-partial-normal | dir8 | 0.12 | 0.016 | 0.1 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.12-0.016-0.1-partial-fast | dir8 | 0.12 | 0.016 | 0.1 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.12-0.016-0.25-none-slow | dir8 | 0.12 | 0.016 | 0.25 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.12-0.016-0.25-none-normal | dir8 | 0.12 | 0.016 | 0.25 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.12-0.016-0.25-none-fast | dir8 | 0.12 | 0.016 | 0.25 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.12-0.016-0.25-partial-slow | dir8 | 0.12 | 0.016 | 0.25 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.12-0.016-0.25-partial-normal | dir8 | 0.12 | 0.016 | 0.25 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.12-0.016-0.25-partial-fast | dir8 | 0.12 | 0.016 | 0.25 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.18-0.004-0-none-slow | dir8 | 0.18 | 0.004 | 0 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.18-0.004-0-none-normal | dir8 | 0.18 | 0.004 | 0 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.18-0.004-0-none-fast | dir8 | 0.18 | 0.004 | 0 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.18-0.004-0-partial-slow | dir8 | 0.18 | 0.004 | 0 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.18-0.004-0-partial-normal | dir8 | 0.18 | 0.004 | 0 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.18-0.004-0-partial-fast | dir8 | 0.18 | 0.004 | 0 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.18-0.004-0.1-none-slow | dir8 | 0.18 | 0.004 | 0.1 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.18-0.004-0.1-none-normal | dir8 | 0.18 | 0.004 | 0.1 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.18-0.004-0.1-none-fast | dir8 | 0.18 | 0.004 | 0.1 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.18-0.004-0.1-partial-slow | dir8 | 0.18 | 0.004 | 0.1 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.18-0.004-0.1-partial-normal | dir8 | 0.18 | 0.004 | 0.1 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.18-0.004-0.1-partial-fast | dir8 | 0.18 | 0.004 | 0.1 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.18-0.004-0.25-none-slow | dir8 | 0.18 | 0.004 | 0.25 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.18-0.004-0.25-none-normal | dir8 | 0.18 | 0.004 | 0.25 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.18-0.004-0.25-none-fast | dir8 | 0.18 | 0.004 | 0.25 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.18-0.004-0.25-partial-slow | dir8 | 0.18 | 0.004 | 0.25 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.18-0.004-0.25-partial-normal | dir8 | 0.18 | 0.004 | 0.25 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.18-0.004-0.25-partial-fast | dir8 | 0.18 | 0.004 | 0.25 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.18-0.008-0-none-slow | dir8 | 0.18 | 0.008 | 0 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.18-0.008-0-none-normal | dir8 | 0.18 | 0.008 | 0 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.18-0.008-0-none-fast | dir8 | 0.18 | 0.008 | 0 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.18-0.008-0-partial-slow | dir8 | 0.18 | 0.008 | 0 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.18-0.008-0-partial-normal | dir8 | 0.18 | 0.008 | 0 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.18-0.008-0-partial-fast | dir8 | 0.18 | 0.008 | 0 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.18-0.008-0.1-none-slow | dir8 | 0.18 | 0.008 | 0.1 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.18-0.008-0.1-none-normal | dir8 | 0.18 | 0.008 | 0.1 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.18-0.008-0.1-none-fast | dir8 | 0.18 | 0.008 | 0.1 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.18-0.008-0.1-partial-slow | dir8 | 0.18 | 0.008 | 0.1 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.18-0.008-0.1-partial-normal | dir8 | 0.18 | 0.008 | 0.1 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.18-0.008-0.1-partial-fast | dir8 | 0.18 | 0.008 | 0.1 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.18-0.008-0.25-none-slow | dir8 | 0.18 | 0.008 | 0.25 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.18-0.008-0.25-none-normal | dir8 | 0.18 | 0.008 | 0.25 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.18-0.008-0.25-none-fast | dir8 | 0.18 | 0.008 | 0.25 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.18-0.008-0.25-partial-slow | dir8 | 0.18 | 0.008 | 0.25 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.18-0.008-0.25-partial-normal | dir8 | 0.18 | 0.008 | 0.25 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.18-0.008-0.25-partial-fast | dir8 | 0.18 | 0.008 | 0.25 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.18-0.016-0-none-slow | dir8 | 0.18 | 0.016 | 0 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.18-0.016-0-none-normal | dir8 | 0.18 | 0.016 | 0 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.18-0.016-0-none-fast | dir8 | 0.18 | 0.016 | 0 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.18-0.016-0-partial-slow | dir8 | 0.18 | 0.016 | 0 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.18-0.016-0-partial-normal | dir8 | 0.18 | 0.016 | 0 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.18-0.016-0-partial-fast | dir8 | 0.18 | 0.016 | 0 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.18-0.016-0.1-none-slow | dir8 | 0.18 | 0.016 | 0.1 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.18-0.016-0.1-none-normal | dir8 | 0.18 | 0.016 | 0.1 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.18-0.016-0.1-none-fast | dir8 | 0.18 | 0.016 | 0.1 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.18-0.016-0.1-partial-slow | dir8 | 0.18 | 0.016 | 0.1 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.18-0.016-0.1-partial-normal | dir8 | 0.18 | 0.016 | 0.1 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.18-0.016-0.1-partial-fast | dir8 | 0.18 | 0.016 | 0.1 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.18-0.016-0.25-none-slow | dir8 | 0.18 | 0.016 | 0.25 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.18-0.016-0.25-none-normal | dir8 | 0.18 | 0.016 | 0.25 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.18-0.016-0.25-none-fast | dir8 | 0.18 | 0.016 | 0.25 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.18-0.016-0.25-partial-slow | dir8 | 0.18 | 0.016 | 0.25 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.18-0.016-0.25-partial-normal | dir8 | 0.18 | 0.016 | 0.25 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.18-0.016-0.25-partial-fast | dir8 | 0.18 | 0.016 | 0.25 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.24-0.004-0-none-slow | dir8 | 0.24 | 0.004 | 0 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.24-0.004-0-none-normal | dir8 | 0.24 | 0.004 | 0 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.24-0.004-0-none-fast | dir8 | 0.24 | 0.004 | 0 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.24-0.004-0-partial-slow | dir8 | 0.24 | 0.004 | 0 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.24-0.004-0-partial-normal | dir8 | 0.24 | 0.004 | 0 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.24-0.004-0-partial-fast | dir8 | 0.24 | 0.004 | 0 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.24-0.004-0.1-none-slow | dir8 | 0.24 | 0.004 | 0.1 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.24-0.004-0.1-none-normal | dir8 | 0.24 | 0.004 | 0.1 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.24-0.004-0.1-none-fast | dir8 | 0.24 | 0.004 | 0.1 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.24-0.004-0.1-partial-slow | dir8 | 0.24 | 0.004 | 0.1 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.24-0.004-0.1-partial-normal | dir8 | 0.24 | 0.004 | 0.1 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.24-0.004-0.1-partial-fast | dir8 | 0.24 | 0.004 | 0.1 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.24-0.004-0.25-none-slow | dir8 | 0.24 | 0.004 | 0.25 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.24-0.004-0.25-none-normal | dir8 | 0.24 | 0.004 | 0.25 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.24-0.004-0.25-none-fast | dir8 | 0.24 | 0.004 | 0.25 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.24-0.004-0.25-partial-slow | dir8 | 0.24 | 0.004 | 0.25 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.24-0.004-0.25-partial-normal | dir8 | 0.24 | 0.004 | 0.25 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.24-0.004-0.25-partial-fast | dir8 | 0.24 | 0.004 | 0.25 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.24-0.008-0-none-slow | dir8 | 0.24 | 0.008 | 0 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.24-0.008-0-none-normal | dir8 | 0.24 | 0.008 | 0 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.24-0.008-0-none-fast | dir8 | 0.24 | 0.008 | 0 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.24-0.008-0-partial-slow | dir8 | 0.24 | 0.008 | 0 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.24-0.008-0-partial-normal | dir8 | 0.24 | 0.008 | 0 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.24-0.008-0-partial-fast | dir8 | 0.24 | 0.008 | 0 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.24-0.008-0.1-none-slow | dir8 | 0.24 | 0.008 | 0.1 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.24-0.008-0.1-none-normal | dir8 | 0.24 | 0.008 | 0.1 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.24-0.008-0.1-none-fast | dir8 | 0.24 | 0.008 | 0.1 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.24-0.008-0.1-partial-slow | dir8 | 0.24 | 0.008 | 0.1 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.24-0.008-0.1-partial-normal | dir8 | 0.24 | 0.008 | 0.1 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.24-0.008-0.1-partial-fast | dir8 | 0.24 | 0.008 | 0.1 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.24-0.008-0.25-none-slow | dir8 | 0.24 | 0.008 | 0.25 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.24-0.008-0.25-none-normal | dir8 | 0.24 | 0.008 | 0.25 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.24-0.008-0.25-none-fast | dir8 | 0.24 | 0.008 | 0.25 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.24-0.008-0.25-partial-slow | dir8 | 0.24 | 0.008 | 0.25 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.24-0.008-0.25-partial-normal | dir8 | 0.24 | 0.008 | 0.25 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.24-0.008-0.25-partial-fast | dir8 | 0.24 | 0.008 | 0.25 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.24-0.016-0-none-slow | dir8 | 0.24 | 0.016 | 0 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.24-0.016-0-none-normal | dir8 | 0.24 | 0.016 | 0 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.24-0.016-0-none-fast | dir8 | 0.24 | 0.016 | 0 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.24-0.016-0-partial-slow | dir8 | 0.24 | 0.016 | 0 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.24-0.016-0-partial-normal | dir8 | 0.24 | 0.016 | 0 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.24-0.016-0-partial-fast | dir8 | 0.24 | 0.016 | 0 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.24-0.016-0.1-none-slow | dir8 | 0.24 | 0.016 | 0.1 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.24-0.016-0.1-none-normal | dir8 | 0.24 | 0.016 | 0.1 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.24-0.016-0.1-none-fast | dir8 | 0.24 | 0.016 | 0.1 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.24-0.016-0.1-partial-slow | dir8 | 0.24 | 0.016 | 0.1 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.24-0.016-0.1-partial-normal | dir8 | 0.24 | 0.016 | 0.1 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.24-0.016-0.1-partial-fast | dir8 | 0.24 | 0.016 | 0.1 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.24-0.016-0.25-none-slow | dir8 | 0.24 | 0.016 | 0.25 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.24-0.016-0.25-none-normal | dir8 | 0.24 | 0.016 | 0.25 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.24-0.016-0.25-none-fast | dir8 | 0.24 | 0.016 | 0.25 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.24-0.016-0.25-partial-slow | dir8 | 0.24 | 0.016 | 0.25 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.24-0.016-0.25-partial-normal | dir8 | 0.24 | 0.016 | 0.25 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-dir8-0.24-0.016-0.25-partial-fast | dir8 | 0.24 | 0.016 | 0.25 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.12-0.004-0-none-slow | pinch | 0.12 | 0.004 | 0 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.12-0.004-0-none-normal | pinch | 0.12 | 0.004 | 0 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.12-0.004-0-none-fast | pinch | 0.12 | 0.004 | 0 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.12-0.004-0-partial-slow | pinch | 0.12 | 0.004 | 0 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.12-0.004-0-partial-normal | pinch | 0.12 | 0.004 | 0 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.12-0.004-0-partial-fast | pinch | 0.12 | 0.004 | 0 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.12-0.004-0.1-none-slow | pinch | 0.12 | 0.004 | 0.1 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.12-0.004-0.1-none-normal | pinch | 0.12 | 0.004 | 0.1 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.12-0.004-0.1-none-fast | pinch | 0.12 | 0.004 | 0.1 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.12-0.004-0.1-partial-slow | pinch | 0.12 | 0.004 | 0.1 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.12-0.004-0.1-partial-normal | pinch | 0.12 | 0.004 | 0.1 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.12-0.004-0.1-partial-fast | pinch | 0.12 | 0.004 | 0.1 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.12-0.004-0.25-none-slow | pinch | 0.12 | 0.004 | 0.25 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.12-0.004-0.25-none-normal | pinch | 0.12 | 0.004 | 0.25 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.12-0.004-0.25-none-fast | pinch | 0.12 | 0.004 | 0.25 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.12-0.004-0.25-partial-slow | pinch | 0.12 | 0.004 | 0.25 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.12-0.004-0.25-partial-normal | pinch | 0.12 | 0.004 | 0.25 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.12-0.004-0.25-partial-fast | pinch | 0.12 | 0.004 | 0.25 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.12-0.008-0-none-slow | pinch | 0.12 | 0.008 | 0 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.12-0.008-0-none-normal | pinch | 0.12 | 0.008 | 0 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.12-0.008-0-none-fast | pinch | 0.12 | 0.008 | 0 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.12-0.008-0-partial-slow | pinch | 0.12 | 0.008 | 0 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.12-0.008-0-partial-normal | pinch | 0.12 | 0.008 | 0 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.12-0.008-0-partial-fast | pinch | 0.12 | 0.008 | 0 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.12-0.008-0.1-none-slow | pinch | 0.12 | 0.008 | 0.1 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.12-0.008-0.1-none-normal | pinch | 0.12 | 0.008 | 0.1 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.12-0.008-0.1-none-fast | pinch | 0.12 | 0.008 | 0.1 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.12-0.008-0.1-partial-slow | pinch | 0.12 | 0.008 | 0.1 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.12-0.008-0.1-partial-normal | pinch | 0.12 | 0.008 | 0.1 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.12-0.008-0.1-partial-fast | pinch | 0.12 | 0.008 | 0.1 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.12-0.008-0.25-none-slow | pinch | 0.12 | 0.008 | 0.25 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.12-0.008-0.25-none-normal | pinch | 0.12 | 0.008 | 0.25 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.12-0.008-0.25-none-fast | pinch | 0.12 | 0.008 | 0.25 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.12-0.008-0.25-partial-slow | pinch | 0.12 | 0.008 | 0.25 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.12-0.008-0.25-partial-normal | pinch | 0.12 | 0.008 | 0.25 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.12-0.008-0.25-partial-fast | pinch | 0.12 | 0.008 | 0.25 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.12-0.016-0-none-slow | pinch | 0.12 | 0.016 | 0 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.12-0.016-0-none-normal | pinch | 0.12 | 0.016 | 0 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.12-0.016-0-none-fast | pinch | 0.12 | 0.016 | 0 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.12-0.016-0-partial-slow | pinch | 0.12 | 0.016 | 0 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.12-0.016-0-partial-normal | pinch | 0.12 | 0.016 | 0 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.12-0.016-0-partial-fast | pinch | 0.12 | 0.016 | 0 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.12-0.016-0.1-none-slow | pinch | 0.12 | 0.016 | 0.1 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.12-0.016-0.1-none-normal | pinch | 0.12 | 0.016 | 0.1 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.12-0.016-0.1-none-fast | pinch | 0.12 | 0.016 | 0.1 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.12-0.016-0.1-partial-slow | pinch | 0.12 | 0.016 | 0.1 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.12-0.016-0.1-partial-normal | pinch | 0.12 | 0.016 | 0.1 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.12-0.016-0.1-partial-fast | pinch | 0.12 | 0.016 | 0.1 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.12-0.016-0.25-none-slow | pinch | 0.12 | 0.016 | 0.25 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.12-0.016-0.25-none-normal | pinch | 0.12 | 0.016 | 0.25 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.12-0.016-0.25-none-fast | pinch | 0.12 | 0.016 | 0.25 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.12-0.016-0.25-partial-slow | pinch | 0.12 | 0.016 | 0.25 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.12-0.016-0.25-partial-normal | pinch | 0.12 | 0.016 | 0.25 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.12-0.016-0.25-partial-fast | pinch | 0.12 | 0.016 | 0.25 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.18-0.004-0-none-slow | pinch | 0.18 | 0.004 | 0 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.18-0.004-0-none-normal | pinch | 0.18 | 0.004 | 0 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.18-0.004-0-none-fast | pinch | 0.18 | 0.004 | 0 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.18-0.004-0-partial-slow | pinch | 0.18 | 0.004 | 0 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.18-0.004-0-partial-normal | pinch | 0.18 | 0.004 | 0 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.18-0.004-0-partial-fast | pinch | 0.18 | 0.004 | 0 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.18-0.004-0.1-none-slow | pinch | 0.18 | 0.004 | 0.1 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.18-0.004-0.1-none-normal | pinch | 0.18 | 0.004 | 0.1 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.18-0.004-0.1-none-fast | pinch | 0.18 | 0.004 | 0.1 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.18-0.004-0.1-partial-slow | pinch | 0.18 | 0.004 | 0.1 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.18-0.004-0.1-partial-normal | pinch | 0.18 | 0.004 | 0.1 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.18-0.004-0.1-partial-fast | pinch | 0.18 | 0.004 | 0.1 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.18-0.004-0.25-none-slow | pinch | 0.18 | 0.004 | 0.25 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.18-0.004-0.25-none-normal | pinch | 0.18 | 0.004 | 0.25 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.18-0.004-0.25-none-fast | pinch | 0.18 | 0.004 | 0.25 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.18-0.004-0.25-partial-slow | pinch | 0.18 | 0.004 | 0.25 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.18-0.004-0.25-partial-normal | pinch | 0.18 | 0.004 | 0.25 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.18-0.004-0.25-partial-fast | pinch | 0.18 | 0.004 | 0.25 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.18-0.008-0-none-slow | pinch | 0.18 | 0.008 | 0 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.18-0.008-0-none-normal | pinch | 0.18 | 0.008 | 0 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.18-0.008-0-none-fast | pinch | 0.18 | 0.008 | 0 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.18-0.008-0-partial-slow | pinch | 0.18 | 0.008 | 0 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.18-0.008-0-partial-normal | pinch | 0.18 | 0.008 | 0 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.18-0.008-0-partial-fast | pinch | 0.18 | 0.008 | 0 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.18-0.008-0.1-none-slow | pinch | 0.18 | 0.008 | 0.1 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.18-0.008-0.1-none-normal | pinch | 0.18 | 0.008 | 0.1 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.18-0.008-0.1-none-fast | pinch | 0.18 | 0.008 | 0.1 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.18-0.008-0.1-partial-slow | pinch | 0.18 | 0.008 | 0.1 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.18-0.008-0.1-partial-normal | pinch | 0.18 | 0.008 | 0.1 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.18-0.008-0.1-partial-fast | pinch | 0.18 | 0.008 | 0.1 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.18-0.008-0.25-none-slow | pinch | 0.18 | 0.008 | 0.25 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.18-0.008-0.25-none-normal | pinch | 0.18 | 0.008 | 0.25 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.18-0.008-0.25-none-fast | pinch | 0.18 | 0.008 | 0.25 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.18-0.008-0.25-partial-slow | pinch | 0.18 | 0.008 | 0.25 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.18-0.008-0.25-partial-normal | pinch | 0.18 | 0.008 | 0.25 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.18-0.008-0.25-partial-fast | pinch | 0.18 | 0.008 | 0.25 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.18-0.016-0-none-slow | pinch | 0.18 | 0.016 | 0 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.18-0.016-0-none-normal | pinch | 0.18 | 0.016 | 0 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.18-0.016-0-none-fast | pinch | 0.18 | 0.016 | 0 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.18-0.016-0-partial-slow | pinch | 0.18 | 0.016 | 0 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.18-0.016-0-partial-normal | pinch | 0.18 | 0.016 | 0 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.18-0.016-0-partial-fast | pinch | 0.18 | 0.016 | 0 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.18-0.016-0.1-none-slow | pinch | 0.18 | 0.016 | 0.1 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.18-0.016-0.1-none-normal | pinch | 0.18 | 0.016 | 0.1 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.18-0.016-0.1-none-fast | pinch | 0.18 | 0.016 | 0.1 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.18-0.016-0.1-partial-slow | pinch | 0.18 | 0.016 | 0.1 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.18-0.016-0.1-partial-normal | pinch | 0.18 | 0.016 | 0.1 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.18-0.016-0.1-partial-fast | pinch | 0.18 | 0.016 | 0.1 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.18-0.016-0.25-none-slow | pinch | 0.18 | 0.016 | 0.25 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.18-0.016-0.25-none-normal | pinch | 0.18 | 0.016 | 0.25 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.18-0.016-0.25-none-fast | pinch | 0.18 | 0.016 | 0.25 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.18-0.016-0.25-partial-slow | pinch | 0.18 | 0.016 | 0.25 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.18-0.016-0.25-partial-normal | pinch | 0.18 | 0.016 | 0.25 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.18-0.016-0.25-partial-fast | pinch | 0.18 | 0.016 | 0.25 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.24-0.004-0-none-slow | pinch | 0.24 | 0.004 | 0 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.24-0.004-0-none-normal | pinch | 0.24 | 0.004 | 0 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.24-0.004-0-none-fast | pinch | 0.24 | 0.004 | 0 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.24-0.004-0-partial-slow | pinch | 0.24 | 0.004 | 0 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.24-0.004-0-partial-normal | pinch | 0.24 | 0.004 | 0 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.24-0.004-0-partial-fast | pinch | 0.24 | 0.004 | 0 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.24-0.004-0.1-none-slow | pinch | 0.24 | 0.004 | 0.1 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.24-0.004-0.1-none-normal | pinch | 0.24 | 0.004 | 0.1 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.24-0.004-0.1-none-fast | pinch | 0.24 | 0.004 | 0.1 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.24-0.004-0.1-partial-slow | pinch | 0.24 | 0.004 | 0.1 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.24-0.004-0.1-partial-normal | pinch | 0.24 | 0.004 | 0.1 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.24-0.004-0.1-partial-fast | pinch | 0.24 | 0.004 | 0.1 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.24-0.004-0.25-none-slow | pinch | 0.24 | 0.004 | 0.25 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.24-0.004-0.25-none-normal | pinch | 0.24 | 0.004 | 0.25 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.24-0.004-0.25-none-fast | pinch | 0.24 | 0.004 | 0.25 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.24-0.004-0.25-partial-slow | pinch | 0.24 | 0.004 | 0.25 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.24-0.004-0.25-partial-normal | pinch | 0.24 | 0.004 | 0.25 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.24-0.004-0.25-partial-fast | pinch | 0.24 | 0.004 | 0.25 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.24-0.008-0-none-slow | pinch | 0.24 | 0.008 | 0 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.24-0.008-0-none-normal | pinch | 0.24 | 0.008 | 0 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.24-0.008-0-none-fast | pinch | 0.24 | 0.008 | 0 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.24-0.008-0-partial-slow | pinch | 0.24 | 0.008 | 0 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.24-0.008-0-partial-normal | pinch | 0.24 | 0.008 | 0 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.24-0.008-0-partial-fast | pinch | 0.24 | 0.008 | 0 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.24-0.008-0.1-none-slow | pinch | 0.24 | 0.008 | 0.1 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.24-0.008-0.1-none-normal | pinch | 0.24 | 0.008 | 0.1 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.24-0.008-0.1-none-fast | pinch | 0.24 | 0.008 | 0.1 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.24-0.008-0.1-partial-slow | pinch | 0.24 | 0.008 | 0.1 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.24-0.008-0.1-partial-normal | pinch | 0.24 | 0.008 | 0.1 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.24-0.008-0.1-partial-fast | pinch | 0.24 | 0.008 | 0.1 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.24-0.008-0.25-none-slow | pinch | 0.24 | 0.008 | 0.25 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.24-0.008-0.25-none-normal | pinch | 0.24 | 0.008 | 0.25 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.24-0.008-0.25-none-fast | pinch | 0.24 | 0.008 | 0.25 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.24-0.008-0.25-partial-slow | pinch | 0.24 | 0.008 | 0.25 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.24-0.008-0.25-partial-normal | pinch | 0.24 | 0.008 | 0.25 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.24-0.008-0.25-partial-fast | pinch | 0.24 | 0.008 | 0.25 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.24-0.016-0-none-slow | pinch | 0.24 | 0.016 | 0 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.24-0.016-0-none-normal | pinch | 0.24 | 0.016 | 0 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.24-0.016-0-none-fast | pinch | 0.24 | 0.016 | 0 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.24-0.016-0-partial-slow | pinch | 0.24 | 0.016 | 0 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.24-0.016-0-partial-normal | pinch | 0.24 | 0.016 | 0 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.24-0.016-0-partial-fast | pinch | 0.24 | 0.016 | 0 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.24-0.016-0.1-none-slow | pinch | 0.24 | 0.016 | 0.1 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.24-0.016-0.1-none-normal | pinch | 0.24 | 0.016 | 0.1 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.24-0.016-0.1-none-fast | pinch | 0.24 | 0.016 | 0.1 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.24-0.016-0.1-partial-slow | pinch | 0.24 | 0.016 | 0.1 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.24-0.016-0.1-partial-normal | pinch | 0.24 | 0.016 | 0.1 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.24-0.016-0.1-partial-fast | pinch | 0.24 | 0.016 | 0.1 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.24-0.016-0.25-none-slow | pinch | 0.24 | 0.016 | 0.25 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.24-0.016-0.25-none-normal | pinch | 0.24 | 0.016 | 0.25 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.24-0.016-0.25-none-fast | pinch | 0.24 | 0.016 | 0.25 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.24-0.016-0.25-partial-slow | pinch | 0.24 | 0.016 | 0.25 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.24-0.016-0.25-partial-normal | pinch | 0.24 | 0.016 | 0.25 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-pinch-0.24-0.016-0.25-partial-fast | pinch | 0.24 | 0.016 | 0.25 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.12-0.004-0-none-slow | palm | 0.12 | 0.004 | 0 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.12-0.004-0-none-normal | palm | 0.12 | 0.004 | 0 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.12-0.004-0-none-fast | palm | 0.12 | 0.004 | 0 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.12-0.004-0-partial-slow | palm | 0.12 | 0.004 | 0 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.12-0.004-0-partial-normal | palm | 0.12 | 0.004 | 0 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.12-0.004-0-partial-fast | palm | 0.12 | 0.004 | 0 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.12-0.004-0.1-none-slow | palm | 0.12 | 0.004 | 0.1 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.12-0.004-0.1-none-normal | palm | 0.12 | 0.004 | 0.1 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.12-0.004-0.1-none-fast | palm | 0.12 | 0.004 | 0.1 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.12-0.004-0.1-partial-slow | palm | 0.12 | 0.004 | 0.1 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.12-0.004-0.1-partial-normal | palm | 0.12 | 0.004 | 0.1 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.12-0.004-0.1-partial-fast | palm | 0.12 | 0.004 | 0.1 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.12-0.004-0.25-none-slow | palm | 0.12 | 0.004 | 0.25 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.12-0.004-0.25-none-normal | palm | 0.12 | 0.004 | 0.25 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.12-0.004-0.25-none-fast | palm | 0.12 | 0.004 | 0.25 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.12-0.004-0.25-partial-slow | palm | 0.12 | 0.004 | 0.25 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.12-0.004-0.25-partial-normal | palm | 0.12 | 0.004 | 0.25 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.12-0.004-0.25-partial-fast | palm | 0.12 | 0.004 | 0.25 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.12-0.008-0-none-slow | palm | 0.12 | 0.008 | 0 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.12-0.008-0-none-normal | palm | 0.12 | 0.008 | 0 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.12-0.008-0-none-fast | palm | 0.12 | 0.008 | 0 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.12-0.008-0-partial-slow | palm | 0.12 | 0.008 | 0 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.12-0.008-0-partial-normal | palm | 0.12 | 0.008 | 0 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.12-0.008-0-partial-fast | palm | 0.12 | 0.008 | 0 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.12-0.008-0.1-none-slow | palm | 0.12 | 0.008 | 0.1 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.12-0.008-0.1-none-normal | palm | 0.12 | 0.008 | 0.1 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.12-0.008-0.1-none-fast | palm | 0.12 | 0.008 | 0.1 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.12-0.008-0.1-partial-slow | palm | 0.12 | 0.008 | 0.1 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.12-0.008-0.1-partial-normal | palm | 0.12 | 0.008 | 0.1 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.12-0.008-0.1-partial-fast | palm | 0.12 | 0.008 | 0.1 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.12-0.008-0.25-none-slow | palm | 0.12 | 0.008 | 0.25 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.12-0.008-0.25-none-normal | palm | 0.12 | 0.008 | 0.25 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.12-0.008-0.25-none-fast | palm | 0.12 | 0.008 | 0.25 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.12-0.008-0.25-partial-slow | palm | 0.12 | 0.008 | 0.25 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.12-0.008-0.25-partial-normal | palm | 0.12 | 0.008 | 0.25 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.12-0.008-0.25-partial-fast | palm | 0.12 | 0.008 | 0.25 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.12-0.016-0-none-slow | palm | 0.12 | 0.016 | 0 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.12-0.016-0-none-normal | palm | 0.12 | 0.016 | 0 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.12-0.016-0-none-fast | palm | 0.12 | 0.016 | 0 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.12-0.016-0-partial-slow | palm | 0.12 | 0.016 | 0 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.12-0.016-0-partial-normal | palm | 0.12 | 0.016 | 0 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.12-0.016-0-partial-fast | palm | 0.12 | 0.016 | 0 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.12-0.016-0.1-none-slow | palm | 0.12 | 0.016 | 0.1 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.12-0.016-0.1-none-normal | palm | 0.12 | 0.016 | 0.1 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.12-0.016-0.1-none-fast | palm | 0.12 | 0.016 | 0.1 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.12-0.016-0.1-partial-slow | palm | 0.12 | 0.016 | 0.1 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.12-0.016-0.1-partial-normal | palm | 0.12 | 0.016 | 0.1 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.12-0.016-0.1-partial-fast | palm | 0.12 | 0.016 | 0.1 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.12-0.016-0.25-none-slow | palm | 0.12 | 0.016 | 0.25 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.12-0.016-0.25-none-normal | palm | 0.12 | 0.016 | 0.25 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.12-0.016-0.25-none-fast | palm | 0.12 | 0.016 | 0.25 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.12-0.016-0.25-partial-slow | palm | 0.12 | 0.016 | 0.25 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.12-0.016-0.25-partial-normal | palm | 0.12 | 0.016 | 0.25 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.12-0.016-0.25-partial-fast | palm | 0.12 | 0.016 | 0.25 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.18-0.004-0-none-slow | palm | 0.18 | 0.004 | 0 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.18-0.004-0-none-normal | palm | 0.18 | 0.004 | 0 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.18-0.004-0-none-fast | palm | 0.18 | 0.004 | 0 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.18-0.004-0-partial-slow | palm | 0.18 | 0.004 | 0 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.18-0.004-0-partial-normal | palm | 0.18 | 0.004 | 0 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.18-0.004-0-partial-fast | palm | 0.18 | 0.004 | 0 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.18-0.004-0.1-none-slow | palm | 0.18 | 0.004 | 0.1 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.18-0.004-0.1-none-normal | palm | 0.18 | 0.004 | 0.1 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.18-0.004-0.1-none-fast | palm | 0.18 | 0.004 | 0.1 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.18-0.004-0.1-partial-slow | palm | 0.18 | 0.004 | 0.1 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.18-0.004-0.1-partial-normal | palm | 0.18 | 0.004 | 0.1 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.18-0.004-0.1-partial-fast | palm | 0.18 | 0.004 | 0.1 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.18-0.004-0.25-none-slow | palm | 0.18 | 0.004 | 0.25 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.18-0.004-0.25-none-normal | palm | 0.18 | 0.004 | 0.25 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.18-0.004-0.25-none-fast | palm | 0.18 | 0.004 | 0.25 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.18-0.004-0.25-partial-slow | palm | 0.18 | 0.004 | 0.25 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.18-0.004-0.25-partial-normal | palm | 0.18 | 0.004 | 0.25 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.18-0.004-0.25-partial-fast | palm | 0.18 | 0.004 | 0.25 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.18-0.008-0-none-slow | palm | 0.18 | 0.008 | 0 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.18-0.008-0-none-normal | palm | 0.18 | 0.008 | 0 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.18-0.008-0-none-fast | palm | 0.18 | 0.008 | 0 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.18-0.008-0-partial-slow | palm | 0.18 | 0.008 | 0 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.18-0.008-0-partial-normal | palm | 0.18 | 0.008 | 0 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.18-0.008-0-partial-fast | palm | 0.18 | 0.008 | 0 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.18-0.008-0.1-none-slow | palm | 0.18 | 0.008 | 0.1 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.18-0.008-0.1-none-normal | palm | 0.18 | 0.008 | 0.1 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.18-0.008-0.1-none-fast | palm | 0.18 | 0.008 | 0.1 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.18-0.008-0.1-partial-slow | palm | 0.18 | 0.008 | 0.1 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.18-0.008-0.1-partial-normal | palm | 0.18 | 0.008 | 0.1 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.18-0.008-0.1-partial-fast | palm | 0.18 | 0.008 | 0.1 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.18-0.008-0.25-none-slow | palm | 0.18 | 0.008 | 0.25 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.18-0.008-0.25-none-normal | palm | 0.18 | 0.008 | 0.25 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.18-0.008-0.25-none-fast | palm | 0.18 | 0.008 | 0.25 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.18-0.008-0.25-partial-slow | palm | 0.18 | 0.008 | 0.25 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.18-0.008-0.25-partial-normal | palm | 0.18 | 0.008 | 0.25 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.18-0.008-0.25-partial-fast | palm | 0.18 | 0.008 | 0.25 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.18-0.016-0-none-slow | palm | 0.18 | 0.016 | 0 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.18-0.016-0-none-normal | palm | 0.18 | 0.016 | 0 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.18-0.016-0-none-fast | palm | 0.18 | 0.016 | 0 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.18-0.016-0-partial-slow | palm | 0.18 | 0.016 | 0 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.18-0.016-0-partial-normal | palm | 0.18 | 0.016 | 0 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.18-0.016-0-partial-fast | palm | 0.18 | 0.016 | 0 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.18-0.016-0.1-none-slow | palm | 0.18 | 0.016 | 0.1 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.18-0.016-0.1-none-normal | palm | 0.18 | 0.016 | 0.1 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.18-0.016-0.1-none-fast | palm | 0.18 | 0.016 | 0.1 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.18-0.016-0.1-partial-slow | palm | 0.18 | 0.016 | 0.1 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.18-0.016-0.1-partial-normal | palm | 0.18 | 0.016 | 0.1 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.18-0.016-0.1-partial-fast | palm | 0.18 | 0.016 | 0.1 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.18-0.016-0.25-none-slow | palm | 0.18 | 0.016 | 0.25 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.18-0.016-0.25-none-normal | palm | 0.18 | 0.016 | 0.25 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.18-0.016-0.25-none-fast | palm | 0.18 | 0.016 | 0.25 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.18-0.016-0.25-partial-slow | palm | 0.18 | 0.016 | 0.25 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.18-0.016-0.25-partial-normal | palm | 0.18 | 0.016 | 0.25 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.18-0.016-0.25-partial-fast | palm | 0.18 | 0.016 | 0.25 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.24-0.004-0-none-slow | palm | 0.24 | 0.004 | 0 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.24-0.004-0-none-normal | palm | 0.24 | 0.004 | 0 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.24-0.004-0-none-fast | palm | 0.24 | 0.004 | 0 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.24-0.004-0-partial-slow | palm | 0.24 | 0.004 | 0 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.24-0.004-0-partial-normal | palm | 0.24 | 0.004 | 0 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.24-0.004-0-partial-fast | palm | 0.24 | 0.004 | 0 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.24-0.004-0.1-none-slow | palm | 0.24 | 0.004 | 0.1 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.24-0.004-0.1-none-normal | palm | 0.24 | 0.004 | 0.1 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.24-0.004-0.1-none-fast | palm | 0.24 | 0.004 | 0.1 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.24-0.004-0.1-partial-slow | palm | 0.24 | 0.004 | 0.1 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.24-0.004-0.1-partial-normal | palm | 0.24 | 0.004 | 0.1 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.24-0.004-0.1-partial-fast | palm | 0.24 | 0.004 | 0.1 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.24-0.004-0.25-none-slow | palm | 0.24 | 0.004 | 0.25 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.24-0.004-0.25-none-normal | palm | 0.24 | 0.004 | 0.25 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.24-0.004-0.25-none-fast | palm | 0.24 | 0.004 | 0.25 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.24-0.004-0.25-partial-slow | palm | 0.24 | 0.004 | 0.25 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.24-0.004-0.25-partial-normal | palm | 0.24 | 0.004 | 0.25 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.24-0.004-0.25-partial-fast | palm | 0.24 | 0.004 | 0.25 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.24-0.008-0-none-slow | palm | 0.24 | 0.008 | 0 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.24-0.008-0-none-normal | palm | 0.24 | 0.008 | 0 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.24-0.008-0-none-fast | palm | 0.24 | 0.008 | 0 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.24-0.008-0-partial-slow | palm | 0.24 | 0.008 | 0 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.24-0.008-0-partial-normal | palm | 0.24 | 0.008 | 0 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.24-0.008-0-partial-fast | palm | 0.24 | 0.008 | 0 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.24-0.008-0.1-none-slow | palm | 0.24 | 0.008 | 0.1 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.24-0.008-0.1-none-normal | palm | 0.24 | 0.008 | 0.1 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.24-0.008-0.1-none-fast | palm | 0.24 | 0.008 | 0.1 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.24-0.008-0.1-partial-slow | palm | 0.24 | 0.008 | 0.1 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.24-0.008-0.1-partial-normal | palm | 0.24 | 0.008 | 0.1 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.24-0.008-0.1-partial-fast | palm | 0.24 | 0.008 | 0.1 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.24-0.008-0.25-none-slow | palm | 0.24 | 0.008 | 0.25 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.24-0.008-0.25-none-normal | palm | 0.24 | 0.008 | 0.25 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.24-0.008-0.25-none-fast | palm | 0.24 | 0.008 | 0.25 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.24-0.008-0.25-partial-slow | palm | 0.24 | 0.008 | 0.25 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.24-0.008-0.25-partial-normal | palm | 0.24 | 0.008 | 0.25 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.24-0.008-0.25-partial-fast | palm | 0.24 | 0.008 | 0.25 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.24-0.016-0-none-slow | palm | 0.24 | 0.016 | 0 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.24-0.016-0-none-normal | palm | 0.24 | 0.016 | 0 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.24-0.016-0-none-fast | palm | 0.24 | 0.016 | 0 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.24-0.016-0-partial-slow | palm | 0.24 | 0.016 | 0 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.24-0.016-0-partial-normal | palm | 0.24 | 0.016 | 0 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.24-0.016-0-partial-fast | palm | 0.24 | 0.016 | 0 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.24-0.016-0.1-none-slow | palm | 0.24 | 0.016 | 0.1 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.24-0.016-0.1-none-normal | palm | 0.24 | 0.016 | 0.1 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.24-0.016-0.1-none-fast | palm | 0.24 | 0.016 | 0.1 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.24-0.016-0.1-partial-slow | palm | 0.24 | 0.016 | 0.1 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.24-0.016-0.1-partial-normal | palm | 0.24 | 0.016 | 0.1 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.24-0.016-0.1-partial-fast | palm | 0.24 | 0.016 | 0.1 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.24-0.016-0.25-none-slow | palm | 0.24 | 0.016 | 0.25 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.24-0.016-0.25-none-normal | palm | 0.24 | 0.016 | 0.25 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.24-0.016-0.25-none-fast | palm | 0.24 | 0.016 | 0.25 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.24-0.016-0.25-partial-slow | palm | 0.24 | 0.016 | 0.25 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.24-0.016-0.25-partial-normal | palm | 0.24 | 0.016 | 0.25 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-palm-0.24-0.016-0.25-partial-fast | palm | 0.24 | 0.016 | 0.25 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.12-0.004-0-none-slow | chord-menu | 0.12 | 0.004 | 0 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.12-0.004-0-none-normal | chord-menu | 0.12 | 0.004 | 0 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.12-0.004-0-none-fast | chord-menu | 0.12 | 0.004 | 0 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.12-0.004-0-partial-slow | chord-menu | 0.12 | 0.004 | 0 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.12-0.004-0-partial-normal | chord-menu | 0.12 | 0.004 | 0 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.12-0.004-0-partial-fast | chord-menu | 0.12 | 0.004 | 0 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.12-0.004-0.1-none-slow | chord-menu | 0.12 | 0.004 | 0.1 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.12-0.004-0.1-none-normal | chord-menu | 0.12 | 0.004 | 0.1 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.12-0.004-0.1-none-fast | chord-menu | 0.12 | 0.004 | 0.1 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.12-0.004-0.1-partial-slow | chord-menu | 0.12 | 0.004 | 0.1 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.12-0.004-0.1-partial-normal | chord-menu | 0.12 | 0.004 | 0.1 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.12-0.004-0.1-partial-fast | chord-menu | 0.12 | 0.004 | 0.1 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.12-0.004-0.25-none-slow | chord-menu | 0.12 | 0.004 | 0.25 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.12-0.004-0.25-none-normal | chord-menu | 0.12 | 0.004 | 0.25 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.12-0.004-0.25-none-fast | chord-menu | 0.12 | 0.004 | 0.25 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.12-0.004-0.25-partial-slow | chord-menu | 0.12 | 0.004 | 0.25 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.12-0.004-0.25-partial-normal | chord-menu | 0.12 | 0.004 | 0.25 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.12-0.004-0.25-partial-fast | chord-menu | 0.12 | 0.004 | 0.25 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.12-0.008-0-none-slow | chord-menu | 0.12 | 0.008 | 0 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.12-0.008-0-none-normal | chord-menu | 0.12 | 0.008 | 0 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.12-0.008-0-none-fast | chord-menu | 0.12 | 0.008 | 0 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.12-0.008-0-partial-slow | chord-menu | 0.12 | 0.008 | 0 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.12-0.008-0-partial-normal | chord-menu | 0.12 | 0.008 | 0 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.12-0.008-0-partial-fast | chord-menu | 0.12 | 0.008 | 0 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.12-0.008-0.1-none-slow | chord-menu | 0.12 | 0.008 | 0.1 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.12-0.008-0.1-none-normal | chord-menu | 0.12 | 0.008 | 0.1 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.12-0.008-0.1-none-fast | chord-menu | 0.12 | 0.008 | 0.1 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.12-0.008-0.1-partial-slow | chord-menu | 0.12 | 0.008 | 0.1 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.12-0.008-0.1-partial-normal | chord-menu | 0.12 | 0.008 | 0.1 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.12-0.008-0.1-partial-fast | chord-menu | 0.12 | 0.008 | 0.1 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.12-0.008-0.25-none-slow | chord-menu | 0.12 | 0.008 | 0.25 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.12-0.008-0.25-none-normal | chord-menu | 0.12 | 0.008 | 0.25 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.12-0.008-0.25-none-fast | chord-menu | 0.12 | 0.008 | 0.25 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.12-0.008-0.25-partial-slow | chord-menu | 0.12 | 0.008 | 0.25 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.12-0.008-0.25-partial-normal | chord-menu | 0.12 | 0.008 | 0.25 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.12-0.008-0.25-partial-fast | chord-menu | 0.12 | 0.008 | 0.25 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.12-0.016-0-none-slow | chord-menu | 0.12 | 0.016 | 0 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.12-0.016-0-none-normal | chord-menu | 0.12 | 0.016 | 0 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.12-0.016-0-none-fast | chord-menu | 0.12 | 0.016 | 0 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.12-0.016-0-partial-slow | chord-menu | 0.12 | 0.016 | 0 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.12-0.016-0-partial-normal | chord-menu | 0.12 | 0.016 | 0 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.12-0.016-0-partial-fast | chord-menu | 0.12 | 0.016 | 0 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.12-0.016-0.1-none-slow | chord-menu | 0.12 | 0.016 | 0.1 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.12-0.016-0.1-none-normal | chord-menu | 0.12 | 0.016 | 0.1 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.12-0.016-0.1-none-fast | chord-menu | 0.12 | 0.016 | 0.1 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.12-0.016-0.1-partial-slow | chord-menu | 0.12 | 0.016 | 0.1 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.12-0.016-0.1-partial-normal | chord-menu | 0.12 | 0.016 | 0.1 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.12-0.016-0.1-partial-fast | chord-menu | 0.12 | 0.016 | 0.1 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.12-0.016-0.25-none-slow | chord-menu | 0.12 | 0.016 | 0.25 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.12-0.016-0.25-none-normal | chord-menu | 0.12 | 0.016 | 0.25 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.12-0.016-0.25-none-fast | chord-menu | 0.12 | 0.016 | 0.25 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.12-0.016-0.25-partial-slow | chord-menu | 0.12 | 0.016 | 0.25 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.12-0.016-0.25-partial-normal | chord-menu | 0.12 | 0.016 | 0.25 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.12-0.016-0.25-partial-fast | chord-menu | 0.12 | 0.016 | 0.25 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.18-0.004-0-none-slow | chord-menu | 0.18 | 0.004 | 0 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.18-0.004-0-none-normal | chord-menu | 0.18 | 0.004 | 0 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.18-0.004-0-none-fast | chord-menu | 0.18 | 0.004 | 0 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.18-0.004-0-partial-slow | chord-menu | 0.18 | 0.004 | 0 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.18-0.004-0-partial-normal | chord-menu | 0.18 | 0.004 | 0 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.18-0.004-0-partial-fast | chord-menu | 0.18 | 0.004 | 0 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.18-0.004-0.1-none-slow | chord-menu | 0.18 | 0.004 | 0.1 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.18-0.004-0.1-none-normal | chord-menu | 0.18 | 0.004 | 0.1 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.18-0.004-0.1-none-fast | chord-menu | 0.18 | 0.004 | 0.1 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.18-0.004-0.1-partial-slow | chord-menu | 0.18 | 0.004 | 0.1 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.18-0.004-0.1-partial-normal | chord-menu | 0.18 | 0.004 | 0.1 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.18-0.004-0.1-partial-fast | chord-menu | 0.18 | 0.004 | 0.1 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.18-0.004-0.25-none-slow | chord-menu | 0.18 | 0.004 | 0.25 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.18-0.004-0.25-none-normal | chord-menu | 0.18 | 0.004 | 0.25 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.18-0.004-0.25-none-fast | chord-menu | 0.18 | 0.004 | 0.25 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.18-0.004-0.25-partial-slow | chord-menu | 0.18 | 0.004 | 0.25 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.18-0.004-0.25-partial-normal | chord-menu | 0.18 | 0.004 | 0.25 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.18-0.004-0.25-partial-fast | chord-menu | 0.18 | 0.004 | 0.25 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.18-0.008-0-none-slow | chord-menu | 0.18 | 0.008 | 0 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.18-0.008-0-none-normal | chord-menu | 0.18 | 0.008 | 0 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.18-0.008-0-none-fast | chord-menu | 0.18 | 0.008 | 0 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.18-0.008-0-partial-slow | chord-menu | 0.18 | 0.008 | 0 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.18-0.008-0-partial-normal | chord-menu | 0.18 | 0.008 | 0 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.18-0.008-0-partial-fast | chord-menu | 0.18 | 0.008 | 0 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.18-0.008-0.1-none-slow | chord-menu | 0.18 | 0.008 | 0.1 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.18-0.008-0.1-none-normal | chord-menu | 0.18 | 0.008 | 0.1 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.18-0.008-0.1-none-fast | chord-menu | 0.18 | 0.008 | 0.1 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.18-0.008-0.1-partial-slow | chord-menu | 0.18 | 0.008 | 0.1 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.18-0.008-0.1-partial-normal | chord-menu | 0.18 | 0.008 | 0.1 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.18-0.008-0.1-partial-fast | chord-menu | 0.18 | 0.008 | 0.1 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.18-0.008-0.25-none-slow | chord-menu | 0.18 | 0.008 | 0.25 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.18-0.008-0.25-none-normal | chord-menu | 0.18 | 0.008 | 0.25 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.18-0.008-0.25-none-fast | chord-menu | 0.18 | 0.008 | 0.25 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.18-0.008-0.25-partial-slow | chord-menu | 0.18 | 0.008 | 0.25 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.18-0.008-0.25-partial-normal | chord-menu | 0.18 | 0.008 | 0.25 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.18-0.008-0.25-partial-fast | chord-menu | 0.18 | 0.008 | 0.25 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.18-0.016-0-none-slow | chord-menu | 0.18 | 0.016 | 0 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.18-0.016-0-none-normal | chord-menu | 0.18 | 0.016 | 0 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.18-0.016-0-none-fast | chord-menu | 0.18 | 0.016 | 0 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.18-0.016-0-partial-slow | chord-menu | 0.18 | 0.016 | 0 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.18-0.016-0-partial-normal | chord-menu | 0.18 | 0.016 | 0 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.18-0.016-0-partial-fast | chord-menu | 0.18 | 0.016 | 0 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.18-0.016-0.1-none-slow | chord-menu | 0.18 | 0.016 | 0.1 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.18-0.016-0.1-none-normal | chord-menu | 0.18 | 0.016 | 0.1 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.18-0.016-0.1-none-fast | chord-menu | 0.18 | 0.016 | 0.1 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.18-0.016-0.1-partial-slow | chord-menu | 0.18 | 0.016 | 0.1 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.18-0.016-0.1-partial-normal | chord-menu | 0.18 | 0.016 | 0.1 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.18-0.016-0.1-partial-fast | chord-menu | 0.18 | 0.016 | 0.1 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.18-0.016-0.25-none-slow | chord-menu | 0.18 | 0.016 | 0.25 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.18-0.016-0.25-none-normal | chord-menu | 0.18 | 0.016 | 0.25 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.18-0.016-0.25-none-fast | chord-menu | 0.18 | 0.016 | 0.25 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.18-0.016-0.25-partial-slow | chord-menu | 0.18 | 0.016 | 0.25 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.18-0.016-0.25-partial-normal | chord-menu | 0.18 | 0.016 | 0.25 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.18-0.016-0.25-partial-fast | chord-menu | 0.18 | 0.016 | 0.25 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.24-0.004-0-none-slow | chord-menu | 0.24 | 0.004 | 0 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.24-0.004-0-none-normal | chord-menu | 0.24 | 0.004 | 0 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.24-0.004-0-none-fast | chord-menu | 0.24 | 0.004 | 0 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.24-0.004-0-partial-slow | chord-menu | 0.24 | 0.004 | 0 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.24-0.004-0-partial-normal | chord-menu | 0.24 | 0.004 | 0 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.24-0.004-0-partial-fast | chord-menu | 0.24 | 0.004 | 0 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.24-0.004-0.1-none-slow | chord-menu | 0.24 | 0.004 | 0.1 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.24-0.004-0.1-none-normal | chord-menu | 0.24 | 0.004 | 0.1 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.24-0.004-0.1-none-fast | chord-menu | 0.24 | 0.004 | 0.1 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.24-0.004-0.1-partial-slow | chord-menu | 0.24 | 0.004 | 0.1 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.24-0.004-0.1-partial-normal | chord-menu | 0.24 | 0.004 | 0.1 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.24-0.004-0.1-partial-fast | chord-menu | 0.24 | 0.004 | 0.1 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.24-0.004-0.25-none-slow | chord-menu | 0.24 | 0.004 | 0.25 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.24-0.004-0.25-none-normal | chord-menu | 0.24 | 0.004 | 0.25 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.24-0.004-0.25-none-fast | chord-menu | 0.24 | 0.004 | 0.25 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.24-0.004-0.25-partial-slow | chord-menu | 0.24 | 0.004 | 0.25 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.24-0.004-0.25-partial-normal | chord-menu | 0.24 | 0.004 | 0.25 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.24-0.004-0.25-partial-fast | chord-menu | 0.24 | 0.004 | 0.25 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.24-0.008-0-none-slow | chord-menu | 0.24 | 0.008 | 0 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.24-0.008-0-none-normal | chord-menu | 0.24 | 0.008 | 0 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.24-0.008-0-none-fast | chord-menu | 0.24 | 0.008 | 0 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.24-0.008-0-partial-slow | chord-menu | 0.24 | 0.008 | 0 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.24-0.008-0-partial-normal | chord-menu | 0.24 | 0.008 | 0 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.24-0.008-0-partial-fast | chord-menu | 0.24 | 0.008 | 0 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.24-0.008-0.1-none-slow | chord-menu | 0.24 | 0.008 | 0.1 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.24-0.008-0.1-none-normal | chord-menu | 0.24 | 0.008 | 0.1 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.24-0.008-0.1-none-fast | chord-menu | 0.24 | 0.008 | 0.1 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.24-0.008-0.1-partial-slow | chord-menu | 0.24 | 0.008 | 0.1 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.24-0.008-0.1-partial-normal | chord-menu | 0.24 | 0.008 | 0.1 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.24-0.008-0.1-partial-fast | chord-menu | 0.24 | 0.008 | 0.1 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.24-0.008-0.25-none-slow | chord-menu | 0.24 | 0.008 | 0.25 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.24-0.008-0.25-none-normal | chord-menu | 0.24 | 0.008 | 0.25 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.24-0.008-0.25-none-fast | chord-menu | 0.24 | 0.008 | 0.25 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.24-0.008-0.25-partial-slow | chord-menu | 0.24 | 0.008 | 0.25 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.24-0.008-0.25-partial-normal | chord-menu | 0.24 | 0.008 | 0.25 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.24-0.008-0.25-partial-fast | chord-menu | 0.24 | 0.008 | 0.25 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.24-0.016-0-none-slow | chord-menu | 0.24 | 0.016 | 0 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.24-0.016-0-none-normal | chord-menu | 0.24 | 0.016 | 0 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.24-0.016-0-none-fast | chord-menu | 0.24 | 0.016 | 0 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.24-0.016-0-partial-slow | chord-menu | 0.24 | 0.016 | 0 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.24-0.016-0-partial-normal | chord-menu | 0.24 | 0.016 | 0 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.24-0.016-0-partial-fast | chord-menu | 0.24 | 0.016 | 0 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.24-0.016-0.1-none-slow | chord-menu | 0.24 | 0.016 | 0.1 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.24-0.016-0.1-none-normal | chord-menu | 0.24 | 0.016 | 0.1 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.24-0.016-0.1-none-fast | chord-menu | 0.24 | 0.016 | 0.1 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.24-0.016-0.1-partial-slow | chord-menu | 0.24 | 0.016 | 0.1 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.24-0.016-0.1-partial-normal | chord-menu | 0.24 | 0.016 | 0.1 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.24-0.016-0.1-partial-fast | chord-menu | 0.24 | 0.016 | 0.1 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.24-0.016-0.25-none-slow | chord-menu | 0.24 | 0.016 | 0.25 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.24-0.016-0.25-none-normal | chord-menu | 0.24 | 0.016 | 0.25 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.24-0.016-0.25-none-fast | chord-menu | 0.24 | 0.016 | 0.25 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.24-0.016-0.25-partial-slow | chord-menu | 0.24 | 0.016 | 0.25 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.24-0.016-0.25-partial-normal | chord-menu | 0.24 | 0.016 | 0.25 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-menu-0.24-0.016-0.25-partial-fast | chord-menu | 0.24 | 0.016 | 0.25 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.12-0.004-0-none-slow | chord-light | 0.12 | 0.004 | 0 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.12-0.004-0-none-normal | chord-light | 0.12 | 0.004 | 0 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.12-0.004-0-none-fast | chord-light | 0.12 | 0.004 | 0 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.12-0.004-0-partial-slow | chord-light | 0.12 | 0.004 | 0 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.12-0.004-0-partial-normal | chord-light | 0.12 | 0.004 | 0 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.12-0.004-0-partial-fast | chord-light | 0.12 | 0.004 | 0 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.12-0.004-0.1-none-slow | chord-light | 0.12 | 0.004 | 0.1 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.12-0.004-0.1-none-normal | chord-light | 0.12 | 0.004 | 0.1 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.12-0.004-0.1-none-fast | chord-light | 0.12 | 0.004 | 0.1 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.12-0.004-0.1-partial-slow | chord-light | 0.12 | 0.004 | 0.1 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.12-0.004-0.1-partial-normal | chord-light | 0.12 | 0.004 | 0.1 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.12-0.004-0.1-partial-fast | chord-light | 0.12 | 0.004 | 0.1 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.12-0.004-0.25-none-slow | chord-light | 0.12 | 0.004 | 0.25 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.12-0.004-0.25-none-normal | chord-light | 0.12 | 0.004 | 0.25 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.12-0.004-0.25-none-fast | chord-light | 0.12 | 0.004 | 0.25 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.12-0.004-0.25-partial-slow | chord-light | 0.12 | 0.004 | 0.25 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.12-0.004-0.25-partial-normal | chord-light | 0.12 | 0.004 | 0.25 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.12-0.004-0.25-partial-fast | chord-light | 0.12 | 0.004 | 0.25 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.12-0.008-0-none-slow | chord-light | 0.12 | 0.008 | 0 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.12-0.008-0-none-normal | chord-light | 0.12 | 0.008 | 0 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.12-0.008-0-none-fast | chord-light | 0.12 | 0.008 | 0 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.12-0.008-0-partial-slow | chord-light | 0.12 | 0.008 | 0 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.12-0.008-0-partial-normal | chord-light | 0.12 | 0.008 | 0 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.12-0.008-0-partial-fast | chord-light | 0.12 | 0.008 | 0 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.12-0.008-0.1-none-slow | chord-light | 0.12 | 0.008 | 0.1 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.12-0.008-0.1-none-normal | chord-light | 0.12 | 0.008 | 0.1 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.12-0.008-0.1-none-fast | chord-light | 0.12 | 0.008 | 0.1 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.12-0.008-0.1-partial-slow | chord-light | 0.12 | 0.008 | 0.1 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.12-0.008-0.1-partial-normal | chord-light | 0.12 | 0.008 | 0.1 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.12-0.008-0.1-partial-fast | chord-light | 0.12 | 0.008 | 0.1 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.12-0.008-0.25-none-slow | chord-light | 0.12 | 0.008 | 0.25 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.12-0.008-0.25-none-normal | chord-light | 0.12 | 0.008 | 0.25 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.12-0.008-0.25-none-fast | chord-light | 0.12 | 0.008 | 0.25 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.12-0.008-0.25-partial-slow | chord-light | 0.12 | 0.008 | 0.25 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.12-0.008-0.25-partial-normal | chord-light | 0.12 | 0.008 | 0.25 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.12-0.008-0.25-partial-fast | chord-light | 0.12 | 0.008 | 0.25 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.12-0.016-0-none-slow | chord-light | 0.12 | 0.016 | 0 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.12-0.016-0-none-normal | chord-light | 0.12 | 0.016 | 0 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.12-0.016-0-none-fast | chord-light | 0.12 | 0.016 | 0 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.12-0.016-0-partial-slow | chord-light | 0.12 | 0.016 | 0 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.12-0.016-0-partial-normal | chord-light | 0.12 | 0.016 | 0 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.12-0.016-0-partial-fast | chord-light | 0.12 | 0.016 | 0 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.12-0.016-0.1-none-slow | chord-light | 0.12 | 0.016 | 0.1 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.12-0.016-0.1-none-normal | chord-light | 0.12 | 0.016 | 0.1 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.12-0.016-0.1-none-fast | chord-light | 0.12 | 0.016 | 0.1 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.12-0.016-0.1-partial-slow | chord-light | 0.12 | 0.016 | 0.1 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.12-0.016-0.1-partial-normal | chord-light | 0.12 | 0.016 | 0.1 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.12-0.016-0.1-partial-fast | chord-light | 0.12 | 0.016 | 0.1 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.12-0.016-0.25-none-slow | chord-light | 0.12 | 0.016 | 0.25 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.12-0.016-0.25-none-normal | chord-light | 0.12 | 0.016 | 0.25 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.12-0.016-0.25-none-fast | chord-light | 0.12 | 0.016 | 0.25 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.12-0.016-0.25-partial-slow | chord-light | 0.12 | 0.016 | 0.25 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.12-0.016-0.25-partial-normal | chord-light | 0.12 | 0.016 | 0.25 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.12-0.016-0.25-partial-fast | chord-light | 0.12 | 0.016 | 0.25 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.18-0.004-0-none-slow | chord-light | 0.18 | 0.004 | 0 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.18-0.004-0-none-normal | chord-light | 0.18 | 0.004 | 0 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.18-0.004-0-none-fast | chord-light | 0.18 | 0.004 | 0 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.18-0.004-0-partial-slow | chord-light | 0.18 | 0.004 | 0 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.18-0.004-0-partial-normal | chord-light | 0.18 | 0.004 | 0 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.18-0.004-0-partial-fast | chord-light | 0.18 | 0.004 | 0 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.18-0.004-0.1-none-slow | chord-light | 0.18 | 0.004 | 0.1 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.18-0.004-0.1-none-normal | chord-light | 0.18 | 0.004 | 0.1 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.18-0.004-0.1-none-fast | chord-light | 0.18 | 0.004 | 0.1 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.18-0.004-0.1-partial-slow | chord-light | 0.18 | 0.004 | 0.1 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.18-0.004-0.1-partial-normal | chord-light | 0.18 | 0.004 | 0.1 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.18-0.004-0.1-partial-fast | chord-light | 0.18 | 0.004 | 0.1 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.18-0.004-0.25-none-slow | chord-light | 0.18 | 0.004 | 0.25 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.18-0.004-0.25-none-normal | chord-light | 0.18 | 0.004 | 0.25 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.18-0.004-0.25-none-fast | chord-light | 0.18 | 0.004 | 0.25 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.18-0.004-0.25-partial-slow | chord-light | 0.18 | 0.004 | 0.25 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.18-0.004-0.25-partial-normal | chord-light | 0.18 | 0.004 | 0.25 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.18-0.004-0.25-partial-fast | chord-light | 0.18 | 0.004 | 0.25 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.18-0.008-0-none-slow | chord-light | 0.18 | 0.008 | 0 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.18-0.008-0-none-normal | chord-light | 0.18 | 0.008 | 0 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.18-0.008-0-none-fast | chord-light | 0.18 | 0.008 | 0 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.18-0.008-0-partial-slow | chord-light | 0.18 | 0.008 | 0 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.18-0.008-0-partial-normal | chord-light | 0.18 | 0.008 | 0 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.18-0.008-0-partial-fast | chord-light | 0.18 | 0.008 | 0 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.18-0.008-0.1-none-slow | chord-light | 0.18 | 0.008 | 0.1 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.18-0.008-0.1-none-normal | chord-light | 0.18 | 0.008 | 0.1 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.18-0.008-0.1-none-fast | chord-light | 0.18 | 0.008 | 0.1 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.18-0.008-0.1-partial-slow | chord-light | 0.18 | 0.008 | 0.1 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.18-0.008-0.1-partial-normal | chord-light | 0.18 | 0.008 | 0.1 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.18-0.008-0.1-partial-fast | chord-light | 0.18 | 0.008 | 0.1 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.18-0.008-0.25-none-slow | chord-light | 0.18 | 0.008 | 0.25 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.18-0.008-0.25-none-normal | chord-light | 0.18 | 0.008 | 0.25 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.18-0.008-0.25-none-fast | chord-light | 0.18 | 0.008 | 0.25 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.18-0.008-0.25-partial-slow | chord-light | 0.18 | 0.008 | 0.25 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.18-0.008-0.25-partial-normal | chord-light | 0.18 | 0.008 | 0.25 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.18-0.008-0.25-partial-fast | chord-light | 0.18 | 0.008 | 0.25 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.18-0.016-0-none-slow | chord-light | 0.18 | 0.016 | 0 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.18-0.016-0-none-normal | chord-light | 0.18 | 0.016 | 0 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.18-0.016-0-none-fast | chord-light | 0.18 | 0.016 | 0 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.18-0.016-0-partial-slow | chord-light | 0.18 | 0.016 | 0 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.18-0.016-0-partial-normal | chord-light | 0.18 | 0.016 | 0 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.18-0.016-0-partial-fast | chord-light | 0.18 | 0.016 | 0 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.18-0.016-0.1-none-slow | chord-light | 0.18 | 0.016 | 0.1 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.18-0.016-0.1-none-normal | chord-light | 0.18 | 0.016 | 0.1 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.18-0.016-0.1-none-fast | chord-light | 0.18 | 0.016 | 0.1 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.18-0.016-0.1-partial-slow | chord-light | 0.18 | 0.016 | 0.1 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.18-0.016-0.1-partial-normal | chord-light | 0.18 | 0.016 | 0.1 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.18-0.016-0.1-partial-fast | chord-light | 0.18 | 0.016 | 0.1 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.18-0.016-0.25-none-slow | chord-light | 0.18 | 0.016 | 0.25 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.18-0.016-0.25-none-normal | chord-light | 0.18 | 0.016 | 0.25 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.18-0.016-0.25-none-fast | chord-light | 0.18 | 0.016 | 0.25 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.18-0.016-0.25-partial-slow | chord-light | 0.18 | 0.016 | 0.25 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.18-0.016-0.25-partial-normal | chord-light | 0.18 | 0.016 | 0.25 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.18-0.016-0.25-partial-fast | chord-light | 0.18 | 0.016 | 0.25 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.24-0.004-0-none-slow | chord-light | 0.24 | 0.004 | 0 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.24-0.004-0-none-normal | chord-light | 0.24 | 0.004 | 0 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.24-0.004-0-none-fast | chord-light | 0.24 | 0.004 | 0 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.24-0.004-0-partial-slow | chord-light | 0.24 | 0.004 | 0 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.24-0.004-0-partial-normal | chord-light | 0.24 | 0.004 | 0 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.24-0.004-0-partial-fast | chord-light | 0.24 | 0.004 | 0 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.24-0.004-0.1-none-slow | chord-light | 0.24 | 0.004 | 0.1 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.24-0.004-0.1-none-normal | chord-light | 0.24 | 0.004 | 0.1 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.24-0.004-0.1-none-fast | chord-light | 0.24 | 0.004 | 0.1 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.24-0.004-0.1-partial-slow | chord-light | 0.24 | 0.004 | 0.1 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.24-0.004-0.1-partial-normal | chord-light | 0.24 | 0.004 | 0.1 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.24-0.004-0.1-partial-fast | chord-light | 0.24 | 0.004 | 0.1 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.24-0.004-0.25-none-slow | chord-light | 0.24 | 0.004 | 0.25 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.24-0.004-0.25-none-normal | chord-light | 0.24 | 0.004 | 0.25 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.24-0.004-0.25-none-fast | chord-light | 0.24 | 0.004 | 0.25 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.24-0.004-0.25-partial-slow | chord-light | 0.24 | 0.004 | 0.25 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.24-0.004-0.25-partial-normal | chord-light | 0.24 | 0.004 | 0.25 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.24-0.004-0.25-partial-fast | chord-light | 0.24 | 0.004 | 0.25 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.24-0.008-0-none-slow | chord-light | 0.24 | 0.008 | 0 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.24-0.008-0-none-normal | chord-light | 0.24 | 0.008 | 0 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.24-0.008-0-none-fast | chord-light | 0.24 | 0.008 | 0 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.24-0.008-0-partial-slow | chord-light | 0.24 | 0.008 | 0 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.24-0.008-0-partial-normal | chord-light | 0.24 | 0.008 | 0 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.24-0.008-0-partial-fast | chord-light | 0.24 | 0.008 | 0 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.24-0.008-0.1-none-slow | chord-light | 0.24 | 0.008 | 0.1 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.24-0.008-0.1-none-normal | chord-light | 0.24 | 0.008 | 0.1 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.24-0.008-0.1-none-fast | chord-light | 0.24 | 0.008 | 0.1 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.24-0.008-0.1-partial-slow | chord-light | 0.24 | 0.008 | 0.1 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.24-0.008-0.1-partial-normal | chord-light | 0.24 | 0.008 | 0.1 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.24-0.008-0.1-partial-fast | chord-light | 0.24 | 0.008 | 0.1 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.24-0.008-0.25-none-slow | chord-light | 0.24 | 0.008 | 0.25 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.24-0.008-0.25-none-normal | chord-light | 0.24 | 0.008 | 0.25 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.24-0.008-0.25-none-fast | chord-light | 0.24 | 0.008 | 0.25 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.24-0.008-0.25-partial-slow | chord-light | 0.24 | 0.008 | 0.25 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.24-0.008-0.25-partial-normal | chord-light | 0.24 | 0.008 | 0.25 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.24-0.008-0.25-partial-fast | chord-light | 0.24 | 0.008 | 0.25 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.24-0.016-0-none-slow | chord-light | 0.24 | 0.016 | 0 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.24-0.016-0-none-normal | chord-light | 0.24 | 0.016 | 0 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.24-0.016-0-none-fast | chord-light | 0.24 | 0.016 | 0 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.24-0.016-0-partial-slow | chord-light | 0.24 | 0.016 | 0 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.24-0.016-0-partial-normal | chord-light | 0.24 | 0.016 | 0 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.24-0.016-0-partial-fast | chord-light | 0.24 | 0.016 | 0 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.24-0.016-0.1-none-slow | chord-light | 0.24 | 0.016 | 0.1 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.24-0.016-0.1-none-normal | chord-light | 0.24 | 0.016 | 0.1 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.24-0.016-0.1-none-fast | chord-light | 0.24 | 0.016 | 0.1 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.24-0.016-0.1-partial-slow | chord-light | 0.24 | 0.016 | 0.1 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.24-0.016-0.1-partial-normal | chord-light | 0.24 | 0.016 | 0.1 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.24-0.016-0.1-partial-fast | chord-light | 0.24 | 0.016 | 0.1 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.24-0.016-0.25-none-slow | chord-light | 0.24 | 0.016 | 0.25 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.24-0.016-0.25-none-normal | chord-light | 0.24 | 0.016 | 0.25 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.24-0.016-0.25-none-fast | chord-light | 0.24 | 0.016 | 0.25 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.24-0.016-0.25-partial-slow | chord-light | 0.24 | 0.016 | 0.25 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.24-0.016-0.25-partial-normal | chord-light | 0.24 | 0.016 | 0.25 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-chord-light-0.24-0.016-0.25-partial-fast | chord-light | 0.24 | 0.016 | 0.25 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.12-0.004-0-none-slow | double-pinch | 0.12 | 0.004 | 0 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.12-0.004-0-none-normal | double-pinch | 0.12 | 0.004 | 0 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.12-0.004-0-none-fast | double-pinch | 0.12 | 0.004 | 0 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.12-0.004-0-partial-slow | double-pinch | 0.12 | 0.004 | 0 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.12-0.004-0-partial-normal | double-pinch | 0.12 | 0.004 | 0 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.12-0.004-0-partial-fast | double-pinch | 0.12 | 0.004 | 0 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.12-0.004-0.1-none-slow | double-pinch | 0.12 | 0.004 | 0.1 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.12-0.004-0.1-none-normal | double-pinch | 0.12 | 0.004 | 0.1 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.12-0.004-0.1-none-fast | double-pinch | 0.12 | 0.004 | 0.1 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.12-0.004-0.1-partial-slow | double-pinch | 0.12 | 0.004 | 0.1 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.12-0.004-0.1-partial-normal | double-pinch | 0.12 | 0.004 | 0.1 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.12-0.004-0.1-partial-fast | double-pinch | 0.12 | 0.004 | 0.1 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.12-0.004-0.25-none-slow | double-pinch | 0.12 | 0.004 | 0.25 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.12-0.004-0.25-none-normal | double-pinch | 0.12 | 0.004 | 0.25 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.12-0.004-0.25-none-fast | double-pinch | 0.12 | 0.004 | 0.25 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.12-0.004-0.25-partial-slow | double-pinch | 0.12 | 0.004 | 0.25 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.12-0.004-0.25-partial-normal | double-pinch | 0.12 | 0.004 | 0.25 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.12-0.004-0.25-partial-fast | double-pinch | 0.12 | 0.004 | 0.25 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.12-0.008-0-none-slow | double-pinch | 0.12 | 0.008 | 0 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.12-0.008-0-none-normal | double-pinch | 0.12 | 0.008 | 0 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.12-0.008-0-none-fast | double-pinch | 0.12 | 0.008 | 0 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.12-0.008-0-partial-slow | double-pinch | 0.12 | 0.008 | 0 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.12-0.008-0-partial-normal | double-pinch | 0.12 | 0.008 | 0 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.12-0.008-0-partial-fast | double-pinch | 0.12 | 0.008 | 0 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.12-0.008-0.1-none-slow | double-pinch | 0.12 | 0.008 | 0.1 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.12-0.008-0.1-none-normal | double-pinch | 0.12 | 0.008 | 0.1 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.12-0.008-0.1-none-fast | double-pinch | 0.12 | 0.008 | 0.1 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.12-0.008-0.1-partial-slow | double-pinch | 0.12 | 0.008 | 0.1 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.12-0.008-0.1-partial-normal | double-pinch | 0.12 | 0.008 | 0.1 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.12-0.008-0.1-partial-fast | double-pinch | 0.12 | 0.008 | 0.1 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.12-0.008-0.25-none-slow | double-pinch | 0.12 | 0.008 | 0.25 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.12-0.008-0.25-none-normal | double-pinch | 0.12 | 0.008 | 0.25 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.12-0.008-0.25-none-fast | double-pinch | 0.12 | 0.008 | 0.25 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.12-0.008-0.25-partial-slow | double-pinch | 0.12 | 0.008 | 0.25 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.12-0.008-0.25-partial-normal | double-pinch | 0.12 | 0.008 | 0.25 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.12-0.008-0.25-partial-fast | double-pinch | 0.12 | 0.008 | 0.25 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.12-0.016-0-none-slow | double-pinch | 0.12 | 0.016 | 0 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.12-0.016-0-none-normal | double-pinch | 0.12 | 0.016 | 0 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.12-0.016-0-none-fast | double-pinch | 0.12 | 0.016 | 0 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.12-0.016-0-partial-slow | double-pinch | 0.12 | 0.016 | 0 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.12-0.016-0-partial-normal | double-pinch | 0.12 | 0.016 | 0 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.12-0.016-0-partial-fast | double-pinch | 0.12 | 0.016 | 0 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.12-0.016-0.1-none-slow | double-pinch | 0.12 | 0.016 | 0.1 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.12-0.016-0.1-none-normal | double-pinch | 0.12 | 0.016 | 0.1 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.12-0.016-0.1-none-fast | double-pinch | 0.12 | 0.016 | 0.1 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.12-0.016-0.1-partial-slow | double-pinch | 0.12 | 0.016 | 0.1 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.12-0.016-0.1-partial-normal | double-pinch | 0.12 | 0.016 | 0.1 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.12-0.016-0.1-partial-fast | double-pinch | 0.12 | 0.016 | 0.1 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.12-0.016-0.25-none-slow | double-pinch | 0.12 | 0.016 | 0.25 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.12-0.016-0.25-none-normal | double-pinch | 0.12 | 0.016 | 0.25 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.12-0.016-0.25-none-fast | double-pinch | 0.12 | 0.016 | 0.25 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.12-0.016-0.25-partial-slow | double-pinch | 0.12 | 0.016 | 0.25 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.12-0.016-0.25-partial-normal | double-pinch | 0.12 | 0.016 | 0.25 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.12-0.016-0.25-partial-fast | double-pinch | 0.12 | 0.016 | 0.25 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.18-0.004-0-none-slow | double-pinch | 0.18 | 0.004 | 0 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.18-0.004-0-none-normal | double-pinch | 0.18 | 0.004 | 0 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.18-0.004-0-none-fast | double-pinch | 0.18 | 0.004 | 0 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.18-0.004-0-partial-slow | double-pinch | 0.18 | 0.004 | 0 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.18-0.004-0-partial-normal | double-pinch | 0.18 | 0.004 | 0 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.18-0.004-0-partial-fast | double-pinch | 0.18 | 0.004 | 0 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.18-0.004-0.1-none-slow | double-pinch | 0.18 | 0.004 | 0.1 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.18-0.004-0.1-none-normal | double-pinch | 0.18 | 0.004 | 0.1 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.18-0.004-0.1-none-fast | double-pinch | 0.18 | 0.004 | 0.1 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.18-0.004-0.1-partial-slow | double-pinch | 0.18 | 0.004 | 0.1 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.18-0.004-0.1-partial-normal | double-pinch | 0.18 | 0.004 | 0.1 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.18-0.004-0.1-partial-fast | double-pinch | 0.18 | 0.004 | 0.1 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.18-0.004-0.25-none-slow | double-pinch | 0.18 | 0.004 | 0.25 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.18-0.004-0.25-none-normal | double-pinch | 0.18 | 0.004 | 0.25 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.18-0.004-0.25-none-fast | double-pinch | 0.18 | 0.004 | 0.25 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.18-0.004-0.25-partial-slow | double-pinch | 0.18 | 0.004 | 0.25 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.18-0.004-0.25-partial-normal | double-pinch | 0.18 | 0.004 | 0.25 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.18-0.004-0.25-partial-fast | double-pinch | 0.18 | 0.004 | 0.25 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.18-0.008-0-none-slow | double-pinch | 0.18 | 0.008 | 0 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.18-0.008-0-none-normal | double-pinch | 0.18 | 0.008 | 0 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.18-0.008-0-none-fast | double-pinch | 0.18 | 0.008 | 0 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.18-0.008-0-partial-slow | double-pinch | 0.18 | 0.008 | 0 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.18-0.008-0-partial-normal | double-pinch | 0.18 | 0.008 | 0 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.18-0.008-0-partial-fast | double-pinch | 0.18 | 0.008 | 0 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.18-0.008-0.1-none-slow | double-pinch | 0.18 | 0.008 | 0.1 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.18-0.008-0.1-none-normal | double-pinch | 0.18 | 0.008 | 0.1 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.18-0.008-0.1-none-fast | double-pinch | 0.18 | 0.008 | 0.1 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.18-0.008-0.1-partial-slow | double-pinch | 0.18 | 0.008 | 0.1 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.18-0.008-0.1-partial-normal | double-pinch | 0.18 | 0.008 | 0.1 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.18-0.008-0.1-partial-fast | double-pinch | 0.18 | 0.008 | 0.1 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.18-0.008-0.25-none-slow | double-pinch | 0.18 | 0.008 | 0.25 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.18-0.008-0.25-none-normal | double-pinch | 0.18 | 0.008 | 0.25 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.18-0.008-0.25-none-fast | double-pinch | 0.18 | 0.008 | 0.25 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.18-0.008-0.25-partial-slow | double-pinch | 0.18 | 0.008 | 0.25 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.18-0.008-0.25-partial-normal | double-pinch | 0.18 | 0.008 | 0.25 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.18-0.008-0.25-partial-fast | double-pinch | 0.18 | 0.008 | 0.25 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.18-0.016-0-none-slow | double-pinch | 0.18 | 0.016 | 0 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.18-0.016-0-none-normal | double-pinch | 0.18 | 0.016 | 0 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.18-0.016-0-none-fast | double-pinch | 0.18 | 0.016 | 0 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.18-0.016-0-partial-slow | double-pinch | 0.18 | 0.016 | 0 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.18-0.016-0-partial-normal | double-pinch | 0.18 | 0.016 | 0 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.18-0.016-0-partial-fast | double-pinch | 0.18 | 0.016 | 0 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.18-0.016-0.1-none-slow | double-pinch | 0.18 | 0.016 | 0.1 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.18-0.016-0.1-none-normal | double-pinch | 0.18 | 0.016 | 0.1 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.18-0.016-0.1-none-fast | double-pinch | 0.18 | 0.016 | 0.1 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.18-0.016-0.1-partial-slow | double-pinch | 0.18 | 0.016 | 0.1 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.18-0.016-0.1-partial-normal | double-pinch | 0.18 | 0.016 | 0.1 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.18-0.016-0.1-partial-fast | double-pinch | 0.18 | 0.016 | 0.1 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.18-0.016-0.25-none-slow | double-pinch | 0.18 | 0.016 | 0.25 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.18-0.016-0.25-none-normal | double-pinch | 0.18 | 0.016 | 0.25 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.18-0.016-0.25-none-fast | double-pinch | 0.18 | 0.016 | 0.25 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.18-0.016-0.25-partial-slow | double-pinch | 0.18 | 0.016 | 0.25 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.18-0.016-0.25-partial-normal | double-pinch | 0.18 | 0.016 | 0.25 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.18-0.016-0.25-partial-fast | double-pinch | 0.18 | 0.016 | 0.25 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.24-0.004-0-none-slow | double-pinch | 0.24 | 0.004 | 0 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.24-0.004-0-none-normal | double-pinch | 0.24 | 0.004 | 0 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.24-0.004-0-none-fast | double-pinch | 0.24 | 0.004 | 0 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.24-0.004-0-partial-slow | double-pinch | 0.24 | 0.004 | 0 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.24-0.004-0-partial-normal | double-pinch | 0.24 | 0.004 | 0 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.24-0.004-0-partial-fast | double-pinch | 0.24 | 0.004 | 0 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.24-0.004-0.1-none-slow | double-pinch | 0.24 | 0.004 | 0.1 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.24-0.004-0.1-none-normal | double-pinch | 0.24 | 0.004 | 0.1 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.24-0.004-0.1-none-fast | double-pinch | 0.24 | 0.004 | 0.1 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.24-0.004-0.1-partial-slow | double-pinch | 0.24 | 0.004 | 0.1 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.24-0.004-0.1-partial-normal | double-pinch | 0.24 | 0.004 | 0.1 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.24-0.004-0.1-partial-fast | double-pinch | 0.24 | 0.004 | 0.1 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.24-0.004-0.25-none-slow | double-pinch | 0.24 | 0.004 | 0.25 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.24-0.004-0.25-none-normal | double-pinch | 0.24 | 0.004 | 0.25 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.24-0.004-0.25-none-fast | double-pinch | 0.24 | 0.004 | 0.25 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.24-0.004-0.25-partial-slow | double-pinch | 0.24 | 0.004 | 0.25 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.24-0.004-0.25-partial-normal | double-pinch | 0.24 | 0.004 | 0.25 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.24-0.004-0.25-partial-fast | double-pinch | 0.24 | 0.004 | 0.25 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.24-0.008-0-none-slow | double-pinch | 0.24 | 0.008 | 0 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.24-0.008-0-none-normal | double-pinch | 0.24 | 0.008 | 0 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.24-0.008-0-none-fast | double-pinch | 0.24 | 0.008 | 0 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.24-0.008-0-partial-slow | double-pinch | 0.24 | 0.008 | 0 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.24-0.008-0-partial-normal | double-pinch | 0.24 | 0.008 | 0 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.24-0.008-0-partial-fast | double-pinch | 0.24 | 0.008 | 0 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.24-0.008-0.1-none-slow | double-pinch | 0.24 | 0.008 | 0.1 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.24-0.008-0.1-none-normal | double-pinch | 0.24 | 0.008 | 0.1 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.24-0.008-0.1-none-fast | double-pinch | 0.24 | 0.008 | 0.1 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.24-0.008-0.1-partial-slow | double-pinch | 0.24 | 0.008 | 0.1 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.24-0.008-0.1-partial-normal | double-pinch | 0.24 | 0.008 | 0.1 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.24-0.008-0.1-partial-fast | double-pinch | 0.24 | 0.008 | 0.1 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.24-0.008-0.25-none-slow | double-pinch | 0.24 | 0.008 | 0.25 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.24-0.008-0.25-none-normal | double-pinch | 0.24 | 0.008 | 0.25 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.24-0.008-0.25-none-fast | double-pinch | 0.24 | 0.008 | 0.25 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.24-0.008-0.25-partial-slow | double-pinch | 0.24 | 0.008 | 0.25 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.24-0.008-0.25-partial-normal | double-pinch | 0.24 | 0.008 | 0.25 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.24-0.008-0.25-partial-fast | double-pinch | 0.24 | 0.008 | 0.25 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.24-0.016-0-none-slow | double-pinch | 0.24 | 0.016 | 0 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.24-0.016-0-none-normal | double-pinch | 0.24 | 0.016 | 0 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.24-0.016-0-none-fast | double-pinch | 0.24 | 0.016 | 0 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.24-0.016-0-partial-slow | double-pinch | 0.24 | 0.016 | 0 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.24-0.016-0-partial-normal | double-pinch | 0.24 | 0.016 | 0 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.24-0.016-0-partial-fast | double-pinch | 0.24 | 0.016 | 0 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.24-0.016-0.1-none-slow | double-pinch | 0.24 | 0.016 | 0.1 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.24-0.016-0.1-none-normal | double-pinch | 0.24 | 0.016 | 0.1 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.24-0.016-0.1-none-fast | double-pinch | 0.24 | 0.016 | 0.1 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.24-0.016-0.1-partial-slow | double-pinch | 0.24 | 0.016 | 0.1 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.24-0.016-0.1-partial-normal | double-pinch | 0.24 | 0.016 | 0.1 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.24-0.016-0.1-partial-fast | double-pinch | 0.24 | 0.016 | 0.1 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.24-0.016-0.25-none-slow | double-pinch | 0.24 | 0.016 | 0.25 | none | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.24-0.016-0.25-none-normal | double-pinch | 0.24 | 0.016 | 0.25 | none | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.24-0.016-0.25-none-fast | double-pinch | 0.24 | 0.016 | 0.25 | none | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.24-0.016-0.25-partial-slow | double-pinch | 0.24 | 0.016 | 0.25 | partial | slow | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.24-0.016-0.25-partial-normal | double-pinch | 0.24 | 0.016 | 0.25 | partial | normal | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |
| F2-double-pinch-0.24-0.016-0.25-partial-fast | double-pinch | 0.24 | 0.016 | 0.25 | partial | fast | synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触） |

## F3 效果库逐效果审计

**价值**：55 个效果各过 4 关：默认参数合理/参数元数据完整/双语文案/预览确定性——商业品质面  
**执行者**：auto｜**优先级**：P1｜**worktree**：`wt/f3-<r-n>`（族内实例共享分支，逐行勾选）

| task | 效果 | 检查 | 验收 |
|---|---|---|---|
| F3-screen-ambient-defaults-sane | screen-ambient | defaults-sane | 默认参数点亮主视觉且无死区（真机截图留档） |
| F3-screen-ambient-param-meta-complete | screen-ambient | param-meta-complete | paramMeta 声明齐全（name/min/max/default/step），随机器可用 |
| F3-screen-ambient-i18n-label-desc | screen-ambient | i18n-label-desc | zh/en label+description 非空非同文、长度不溢出卡片 |
| F3-screen-ambient-preview-deterministic | screen-ambient | preview-deterministic | 同参数两次渲染逐像素一致（canvas 截图 diff=0） |
| F3-static-defaults-sane | static | defaults-sane | 默认参数点亮主视觉且无死区（真机截图留档） |
| F3-static-param-meta-complete | static | param-meta-complete | paramMeta 声明齐全（name/min/max/default/step），随机器可用 |
| F3-static-i18n-label-desc | static | i18n-label-desc | zh/en label+description 非空非同文、长度不溢出卡片 |
| F3-static-preview-deterministic | static | preview-deterministic | 同参数两次渲染逐像素一致（canvas 截图 diff=0） |
| F3-breathing-defaults-sane | breathing | defaults-sane | 默认参数点亮主视觉且无死区（真机截图留档） |
| F3-breathing-param-meta-complete | breathing | param-meta-complete | paramMeta 声明齐全（name/min/max/default/step），随机器可用 |
| F3-breathing-i18n-label-desc | breathing | i18n-label-desc | zh/en label+description 非空非同文、长度不溢出卡片 |
| F3-breathing-preview-deterministic | breathing | preview-deterministic | 同参数两次渲染逐像素一致（canvas 截图 diff=0） |
| F3-rainbow-defaults-sane | rainbow | defaults-sane | 默认参数点亮主视觉且无死区（真机截图留档） |
| F3-rainbow-param-meta-complete | rainbow | param-meta-complete | paramMeta 声明齐全（name/min/max/default/step），随机器可用 |
| F3-rainbow-i18n-label-desc | rainbow | i18n-label-desc | zh/en label+description 非空非同文、长度不溢出卡片 |
| F3-rainbow-preview-deterministic | rainbow | preview-deterministic | 同参数两次渲染逐像素一致（canvas 截图 diff=0） |
| F3-wave-defaults-sane | wave | defaults-sane | 默认参数点亮主视觉且无死区（真机截图留档） |
| F3-wave-param-meta-complete | wave | param-meta-complete | paramMeta 声明齐全（name/min/max/default/step），随机器可用 |
| F3-wave-i18n-label-desc | wave | i18n-label-desc | zh/en label+description 非空非同文、长度不溢出卡片 |
| F3-wave-preview-deterministic | wave | preview-deterministic | 同参数两次渲染逐像素一致（canvas 截图 diff=0） |
| F3-zone-gradient-defaults-sane | zone-gradient | defaults-sane | 默认参数点亮主视觉且无死区（真机截图留档） |
| F3-zone-gradient-param-meta-complete | zone-gradient | param-meta-complete | paramMeta 声明齐全（name/min/max/default/step），随机器可用 |
| F3-zone-gradient-i18n-label-desc | zone-gradient | i18n-label-desc | zh/en label+description 非空非同文、长度不溢出卡片 |
| F3-zone-gradient-preview-deterministic | zone-gradient | preview-deterministic | 同参数两次渲染逐像素一致（canvas 截图 diff=0） |
| F3-fire-defaults-sane | fire | defaults-sane | 默认参数点亮主视觉且无死区（真机截图留档） |
| F3-fire-param-meta-complete | fire | param-meta-complete | paramMeta 声明齐全（name/min/max/default/step），随机器可用 |
| F3-fire-i18n-label-desc | fire | i18n-label-desc | zh/en label+description 非空非同文、长度不溢出卡片 |
| F3-fire-preview-deterministic | fire | preview-deterministic | 同参数两次渲染逐像素一致（canvas 截图 diff=0） |
| F3-starlight-defaults-sane | starlight | defaults-sane | 默认参数点亮主视觉且无死区（真机截图留档） |
| F3-starlight-param-meta-complete | starlight | param-meta-complete | paramMeta 声明齐全（name/min/max/default/step），随机器可用 |
| F3-starlight-i18n-label-desc | starlight | i18n-label-desc | zh/en label+description 非空非同文、长度不溢出卡片 |
| F3-starlight-preview-deterministic | starlight | preview-deterministic | 同参数两次渲染逐像素一致（canvas 截图 diff=0） |
| F3-ripple-defaults-sane | ripple | defaults-sane | 默认参数点亮主视觉且无死区（真机截图留档） |
| F3-ripple-param-meta-complete | ripple | param-meta-complete | paramMeta 声明齐全（name/min/max/default/step），随机器可用 |
| F3-ripple-i18n-label-desc | ripple | i18n-label-desc | zh/en label+description 非空非同文、长度不溢出卡片 |
| F3-ripple-preview-deterministic | ripple | preview-deterministic | 同参数两次渲染逐像素一致（canvas 截图 diff=0） |
| F3-spectrum-defaults-sane | spectrum | defaults-sane | 默认参数点亮主视觉且无死区（真机截图留档） |
| F3-spectrum-param-meta-complete | spectrum | param-meta-complete | paramMeta 声明齐全（name/min/max/default/step），随机器可用 |
| F3-spectrum-i18n-label-desc | spectrum | i18n-label-desc | zh/en label+description 非空非同文、长度不溢出卡片 |
| F3-spectrum-preview-deterministic | spectrum | preview-deterministic | 同参数两次渲染逐像素一致（canvas 截图 diff=0） |
| F3-comet-defaults-sane | comet | defaults-sane | 默认参数点亮主视觉且无死区（真机截图留档） |
| F3-comet-param-meta-complete | comet | param-meta-complete | paramMeta 声明齐全（name/min/max/default/step），随机器可用 |
| F3-comet-i18n-label-desc | comet | i18n-label-desc | zh/en label+description 非空非同文、长度不溢出卡片 |
| F3-comet-preview-deterministic | comet | preview-deterministic | 同参数两次渲染逐像素一致（canvas 截图 diff=0） |
| F3-lightning-defaults-sane | lightning | defaults-sane | 默认参数点亮主视觉且无死区（真机截图留档） |
| F3-lightning-param-meta-complete | lightning | param-meta-complete | paramMeta 声明齐全（name/min/max/default/step），随机器可用 |
| F3-lightning-i18n-label-desc | lightning | i18n-label-desc | zh/en label+description 非空非同文、长度不溢出卡片 |
| F3-lightning-preview-deterministic | lightning | preview-deterministic | 同参数两次渲染逐像素一致（canvas 截图 diff=0） |
| F3-aurora-defaults-sane | aurora | defaults-sane | 默认参数点亮主视觉且无死区（真机截图留档） |
| F3-aurora-param-meta-complete | aurora | param-meta-complete | paramMeta 声明齐全（name/min/max/default/step），随机器可用 |
| F3-aurora-i18n-label-desc | aurora | i18n-label-desc | zh/en label+description 非空非同文、长度不溢出卡片 |
| F3-aurora-preview-deterministic | aurora | preview-deterministic | 同参数两次渲染逐像素一致（canvas 截图 diff=0） |
| F3-explode-defaults-sane | explode | defaults-sane | 默认参数点亮主视觉且无死区（真机截图留档） |
| F3-explode-param-meta-complete | explode | param-meta-complete | paramMeta 声明齐全（name/min/max/default/step），随机器可用 |
| F3-explode-i18n-label-desc | explode | i18n-label-desc | zh/en label+description 非空非同文、长度不溢出卡片 |
| F3-explode-preview-deterministic | explode | preview-deterministic | 同参数两次渲染逐像素一致（canvas 截图 diff=0） |
| F3-audio-beat-defaults-sane | audio-beat | defaults-sane | 默认参数点亮主视觉且无死区（真机截图留档） |
| F3-audio-beat-param-meta-complete | audio-beat | param-meta-complete | paramMeta 声明齐全（name/min/max/default/step），随机器可用 |
| F3-audio-beat-i18n-label-desc | audio-beat | i18n-label-desc | zh/en label+description 非空非同文、长度不溢出卡片 |
| F3-audio-beat-preview-deterministic | audio-beat | preview-deterministic | 同参数两次渲染逐像素一致（canvas 截图 diff=0） |
| F3-audio-equalizer-defaults-sane | audio-equalizer | defaults-sane | 默认参数点亮主视觉且无死区（真机截图留档） |
| F3-audio-equalizer-param-meta-complete | audio-equalizer | param-meta-complete | paramMeta 声明齐全（name/min/max/default/step），随机器可用 |
| F3-audio-equalizer-i18n-label-desc | audio-equalizer | i18n-label-desc | zh/en label+description 非空非同文、长度不溢出卡片 |
| F3-audio-equalizer-preview-deterministic | audio-equalizer | preview-deterministic | 同参数两次渲染逐像素一致（canvas 截图 diff=0） |
| F3-random-color-defaults-sane | random-color | defaults-sane | 默认参数点亮主视觉且无死区（真机截图留档） |
| F3-random-color-param-meta-complete | random-color | param-meta-complete | paramMeta 声明齐全（name/min/max/default/step），随机器可用 |
| F3-random-color-i18n-label-desc | random-color | i18n-label-desc | zh/en label+description 非空非同文、长度不溢出卡片 |
| F3-random-color-preview-deterministic | random-color | preview-deterministic | 同参数两次渲染逐像素一致（canvas 截图 diff=0） |
| F3-custom-paint-defaults-sane | custom-paint | defaults-sane | 默认参数点亮主视觉且无死区（真机截图留档） |
| F3-custom-paint-param-meta-complete | custom-paint | param-meta-complete | paramMeta 声明齐全（name/min/max/default/step），随机器可用 |
| F3-custom-paint-i18n-label-desc | custom-paint | i18n-label-desc | zh/en label+description 非空非同文、长度不溢出卡片 |
| F3-custom-paint-preview-deterministic | custom-paint | preview-deterministic | 同参数两次渲染逐像素一致（canvas 截图 diff=0） |
| F3-image-paint-defaults-sane | image-paint | defaults-sane | 默认参数点亮主视觉且无死区（真机截图留档） |
| F3-image-paint-param-meta-complete | image-paint | param-meta-complete | paramMeta 声明齐全（name/min/max/default/step），随机器可用 |
| F3-image-paint-i18n-label-desc | image-paint | i18n-label-desc | zh/en label+description 非空非同文、长度不溢出卡片 |
| F3-image-paint-preview-deterministic | image-paint | preview-deterministic | 同参数两次渲染逐像素一致（canvas 截图 diff=0） |
| F3-plasma-defaults-sane | plasma | defaults-sane | 默认参数点亮主视觉且无死区（真机截图留档） |
| F3-plasma-param-meta-complete | plasma | param-meta-complete | paramMeta 声明齐全（name/min/max/default/step），随机器可用 |
| F3-plasma-i18n-label-desc | plasma | i18n-label-desc | zh/en label+description 非空非同文、长度不溢出卡片 |
| F3-plasma-preview-deterministic | plasma | preview-deterministic | 同参数两次渲染逐像素一致（canvas 截图 diff=0） |
| F3-vortex-defaults-sane | vortex | defaults-sane | 默认参数点亮主视觉且无死区（真机截图留档） |
| F3-vortex-param-meta-complete | vortex | param-meta-complete | paramMeta 声明齐全（name/min/max/default/step），随机器可用 |
| F3-vortex-i18n-label-desc | vortex | i18n-label-desc | zh/en label+description 非空非同文、长度不溢出卡片 |
| F3-vortex-preview-deterministic | vortex | preview-deterministic | 同参数两次渲染逐像素一致（canvas 截图 diff=0） |
| F3-tunnel-defaults-sane | tunnel | defaults-sane | 默认参数点亮主视觉且无死区（真机截图留档） |
| F3-tunnel-param-meta-complete | tunnel | param-meta-complete | paramMeta 声明齐全（name/min/max/default/step），随机器可用 |
| F3-tunnel-i18n-label-desc | tunnel | i18n-label-desc | zh/en label+description 非空非同文、长度不溢出卡片 |
| F3-tunnel-preview-deterministic | tunnel | preview-deterministic | 同参数两次渲染逐像素一致（canvas 截图 diff=0） |
| F3-crystal-defaults-sane | crystal | defaults-sane | 默认参数点亮主视觉且无死区（真机截图留档） |
| F3-crystal-param-meta-complete | crystal | param-meta-complete | paramMeta 声明齐全（name/min/max/default/step），随机器可用 |
| F3-crystal-i18n-label-desc | crystal | i18n-label-desc | zh/en label+description 非空非同文、长度不溢出卡片 |
| F3-crystal-preview-deterministic | crystal | preview-deterministic | 同参数两次渲染逐像素一致（canvas 截图 diff=0） |
| F3-glitch-defaults-sane | glitch | defaults-sane | 默认参数点亮主视觉且无死区（真机截图留档） |
| F3-glitch-param-meta-complete | glitch | param-meta-complete | paramMeta 声明齐全（name/min/max/default/step），随机器可用 |
| F3-glitch-i18n-label-desc | glitch | i18n-label-desc | zh/en label+description 非空非同文、长度不溢出卡片 |
| F3-glitch-preview-deterministic | glitch | preview-deterministic | 同参数两次渲染逐像素一致（canvas 截图 diff=0） |
| F3-matrix-rain-defaults-sane | matrix-rain | defaults-sane | 默认参数点亮主视觉且无死区（真机截图留档） |
| F3-matrix-rain-param-meta-complete | matrix-rain | param-meta-complete | paramMeta 声明齐全（name/min/max/default/step），随机器可用 |
| F3-matrix-rain-i18n-label-desc | matrix-rain | i18n-label-desc | zh/en label+description 非空非同文、长度不溢出卡片 |
| F3-matrix-rain-preview-deterministic | matrix-rain | preview-deterministic | 同参数两次渲染逐像素一致（canvas 截图 diff=0） |
| F3-neon-pulse-defaults-sane | neon-pulse | defaults-sane | 默认参数点亮主视觉且无死区（真机截图留档） |
| F3-neon-pulse-param-meta-complete | neon-pulse | param-meta-complete | paramMeta 声明齐全（name/min/max/default/step），随机器可用 |
| F3-neon-pulse-i18n-label-desc | neon-pulse | i18n-label-desc | zh/en label+description 非空非同文、长度不溢出卡片 |
| F3-neon-pulse-preview-deterministic | neon-pulse | preview-deterministic | 同参数两次渲染逐像素一致（canvas 截图 diff=0） |
| F3-nebula-defaults-sane | nebula | defaults-sane | 默认参数点亮主视觉且无死区（真机截图留档） |
| F3-nebula-param-meta-complete | nebula | param-meta-complete | paramMeta 声明齐全（name/min/max/default/step），随机器可用 |
| F3-nebula-i18n-label-desc | nebula | i18n-label-desc | zh/en label+description 非空非同文、长度不溢出卡片 |
| F3-nebula-preview-deterministic | nebula | preview-deterministic | 同参数两次渲染逐像素一致（canvas 截图 diff=0） |
| F3-fluid-flow-defaults-sane | fluid-flow | defaults-sane | 默认参数点亮主视觉且无死区（真机截图留档） |
| F3-fluid-flow-param-meta-complete | fluid-flow | param-meta-complete | paramMeta 声明齐全（name/min/max/default/step），随机器可用 |
| F3-fluid-flow-i18n-label-desc | fluid-flow | i18n-label-desc | zh/en label+description 非空非同文、长度不溢出卡片 |
| F3-fluid-flow-preview-deterministic | fluid-flow | preview-deterministic | 同参数两次渲染逐像素一致（canvas 截图 diff=0） |
| F3-mirror-symmetry-defaults-sane | mirror-symmetry | defaults-sane | 默认参数点亮主视觉且无死区（真机截图留档） |
| F3-mirror-symmetry-param-meta-complete | mirror-symmetry | param-meta-complete | paramMeta 声明齐全（name/min/max/default/step），随机器可用 |
| F3-mirror-symmetry-i18n-label-desc | mirror-symmetry | i18n-label-desc | zh/en label+description 非空非同文、长度不溢出卡片 |
| F3-mirror-symmetry-preview-deterministic | mirror-symmetry | preview-deterministic | 同参数两次渲染逐像素一致（canvas 截图 diff=0） |
| F3-dna-helix-defaults-sane | dna-helix | defaults-sane | 默认参数点亮主视觉且无死区（真机截图留档） |
| F3-dna-helix-param-meta-complete | dna-helix | param-meta-complete | paramMeta 声明齐全（name/min/max/default/step），随机器可用 |
| F3-dna-helix-i18n-label-desc | dna-helix | i18n-label-desc | zh/en label+description 非空非同文、长度不溢出卡片 |
| F3-dna-helix-preview-deterministic | dna-helix | preview-deterministic | 同参数两次渲染逐像素一致（canvas 截图 diff=0） |
| F3-black-hole-defaults-sane | black-hole | defaults-sane | 默认参数点亮主视觉且无死区（真机截图留档） |
| F3-black-hole-param-meta-complete | black-hole | param-meta-complete | paramMeta 声明齐全（name/min/max/default/step），随机器可用 |
| F3-black-hole-i18n-label-desc | black-hole | i18n-label-desc | zh/en label+description 非空非同文、长度不溢出卡片 |
| F3-black-hole-preview-deterministic | black-hole | preview-deterministic | 同参数两次渲染逐像素一致（canvas 截图 diff=0） |
| F3-solar-system-defaults-sane | solar-system | defaults-sane | 默认参数点亮主视觉且无死区（真机截图留档） |
| F3-solar-system-param-meta-complete | solar-system | param-meta-complete | paramMeta 声明齐全（name/min/max/default/step），随机器可用 |
| F3-solar-system-i18n-label-desc | solar-system | i18n-label-desc | zh/en label+description 非空非同文、长度不溢出卡片 |
| F3-solar-system-preview-deterministic | solar-system | preview-deterministic | 同参数两次渲染逐像素一致（canvas 截图 diff=0） |
| F3-spiral-galaxy-defaults-sane | spiral-galaxy | defaults-sane | 默认参数点亮主视觉且无死区（真机截图留档） |
| F3-spiral-galaxy-param-meta-complete | spiral-galaxy | param-meta-complete | paramMeta 声明齐全（name/min/max/default/step），随机器可用 |
| F3-spiral-galaxy-i18n-label-desc | spiral-galaxy | i18n-label-desc | zh/en label+description 非空非同文、长度不溢出卡片 |
| F3-spiral-galaxy-preview-deterministic | spiral-galaxy | preview-deterministic | 同参数两次渲染逐像素一致（canvas 截图 diff=0） |
| F3-orion-nebula-defaults-sane | orion-nebula | defaults-sane | 默认参数点亮主视觉且无死区（真机截图留档） |
| F3-orion-nebula-param-meta-complete | orion-nebula | param-meta-complete | paramMeta 声明齐全（name/min/max/default/step），随机器可用 |
| F3-orion-nebula-i18n-label-desc | orion-nebula | i18n-label-desc | zh/en label+description 非空非同文、长度不溢出卡片 |
| F3-orion-nebula-preview-deterministic | orion-nebula | preview-deterministic | 同参数两次渲染逐像素一致（canvas 截图 diff=0） |
| F3-pulsar-beacon-defaults-sane | pulsar-beacon | defaults-sane | 默认参数点亮主视觉且无死区（真机截图留档） |
| F3-pulsar-beacon-param-meta-complete | pulsar-beacon | param-meta-complete | paramMeta 声明齐全（name/min/max/default/step），随机器可用 |
| F3-pulsar-beacon-i18n-label-desc | pulsar-beacon | i18n-label-desc | zh/en label+description 非空非同文、长度不溢出卡片 |
| F3-pulsar-beacon-preview-deterministic | pulsar-beacon | preview-deterministic | 同参数两次渲染逐像素一致（canvas 截图 diff=0） |
| F3-hurricane-eye-defaults-sane | hurricane-eye | defaults-sane | 默认参数点亮主视觉且无死区（真机截图留档） |
| F3-hurricane-eye-param-meta-complete | hurricane-eye | param-meta-complete | paramMeta 声明齐全（name/min/max/default/step），随机器可用 |
| F3-hurricane-eye-i18n-label-desc | hurricane-eye | i18n-label-desc | zh/en label+description 非空非同文、长度不溢出卡片 |
| F3-hurricane-eye-preview-deterministic | hurricane-eye | preview-deterministic | 同参数两次渲染逐像素一致（canvas 截图 diff=0） |
| F3-lightning-leader-defaults-sane | lightning-leader | defaults-sane | 默认参数点亮主视觉且无死区（真机截图留档） |
| F3-lightning-leader-param-meta-complete | lightning-leader | param-meta-complete | paramMeta 声明齐全（name/min/max/default/step），随机器可用 |
| F3-lightning-leader-i18n-label-desc | lightning-leader | i18n-label-desc | zh/en label+description 非空非同文、长度不溢出卡片 |
| F3-lightning-leader-preview-deterministic | lightning-leader | preview-deterministic | 同参数两次渲染逐像素一致（canvas 截图 diff=0） |
| F3-icosahedral-virus-defaults-sane | icosahedral-virus | defaults-sane | 默认参数点亮主视觉且无死区（真机截图留档） |
| F3-icosahedral-virus-param-meta-complete | icosahedral-virus | param-meta-complete | paramMeta 声明齐全（name/min/max/default/step），随机器可用 |
| F3-icosahedral-virus-i18n-label-desc | icosahedral-virus | i18n-label-desc | zh/en label+description 非空非同文、长度不溢出卡片 |
| F3-icosahedral-virus-preview-deterministic | icosahedral-virus | preview-deterministic | 同参数两次渲染逐像素一致（canvas 截图 diff=0） |
| F3-protein-folding-defaults-sane | protein-folding | defaults-sane | 默认参数点亮主视觉且无死区（真机截图留档） |
| F3-protein-folding-param-meta-complete | protein-folding | param-meta-complete | paramMeta 声明齐全（name/min/max/default/step），随机器可用 |
| F3-protein-folding-i18n-label-desc | protein-folding | i18n-label-desc | zh/en label+description 非空非同文、长度不溢出卡片 |
| F3-protein-folding-preview-deterministic | protein-folding | preview-deterministic | 同参数两次渲染逐像素一致（canvas 截图 diff=0） |
| F3-mitosis-spindle-defaults-sane | mitosis-spindle | defaults-sane | 默认参数点亮主视觉且无死区（真机截图留档） |
| F3-mitosis-spindle-param-meta-complete | mitosis-spindle | param-meta-complete | paramMeta 声明齐全（name/min/max/default/step），随机器可用 |
| F3-mitosis-spindle-i18n-label-desc | mitosis-spindle | i18n-label-desc | zh/en label+description 非空非同文、长度不溢出卡片 |
| F3-mitosis-spindle-preview-deterministic | mitosis-spindle | preview-deterministic | 同参数两次渲染逐像素一致（canvas 截图 diff=0） |
| F3-synapse-pulse-defaults-sane | synapse-pulse | defaults-sane | 默认参数点亮主视觉且无死区（真机截图留档） |
| F3-synapse-pulse-param-meta-complete | synapse-pulse | param-meta-complete | paramMeta 声明齐全（name/min/max/default/step），随机器可用 |
| F3-synapse-pulse-i18n-label-desc | synapse-pulse | i18n-label-desc | zh/en label+description 非空非同文、长度不溢出卡片 |
| F3-synapse-pulse-preview-deterministic | synapse-pulse | preview-deterministic | 同参数两次渲染逐像素一致（canvas 截图 diff=0） |
| F3-quantum-collapse-defaults-sane | quantum-collapse | defaults-sane | 默认参数点亮主视觉且无死区（真机截图留档） |
| F3-quantum-collapse-param-meta-complete | quantum-collapse | param-meta-complete | paramMeta 声明齐全（name/min/max/default/step），随机器可用 |
| F3-quantum-collapse-i18n-label-desc | quantum-collapse | i18n-label-desc | zh/en label+description 非空非同文、长度不溢出卡片 |
| F3-quantum-collapse-preview-deterministic | quantum-collapse | preview-deterministic | 同参数两次渲染逐像素一致（canvas 截图 diff=0） |
| F3-microvilli-field-defaults-sane | microvilli-field | defaults-sane | 默认参数点亮主视觉且无死区（真机截图留档） |
| F3-microvilli-field-param-meta-complete | microvilli-field | param-meta-complete | paramMeta 声明齐全（name/min/max/default/step），随机器可用 |
| F3-microvilli-field-i18n-label-desc | microvilli-field | i18n-label-desc | zh/en label+description 非空非同文、长度不溢出卡片 |
| F3-microvilli-field-preview-deterministic | microvilli-field | preview-deterministic | 同参数两次渲染逐像素一致（canvas 截图 diff=0） |
| F3-eclipse-alignment-defaults-sane | eclipse-alignment | defaults-sane | 默认参数点亮主视觉且无死区（真机截图留档） |
| F3-eclipse-alignment-param-meta-complete | eclipse-alignment | param-meta-complete | paramMeta 声明齐全（name/min/max/default/step），随机器可用 |
| F3-eclipse-alignment-i18n-label-desc | eclipse-alignment | i18n-label-desc | zh/en label+description 非空非同文、长度不溢出卡片 |
| F3-eclipse-alignment-preview-deterministic | eclipse-alignment | preview-deterministic | 同参数两次渲染逐像素一致（canvas 截图 diff=0） |
| F3-comet-tail-defaults-sane | comet-tail | defaults-sane | 默认参数点亮主视觉且无死区（真机截图留档） |
| F3-comet-tail-param-meta-complete | comet-tail | param-meta-complete | paramMeta 声明齐全（name/min/max/default/step），随机器可用 |
| F3-comet-tail-i18n-label-desc | comet-tail | i18n-label-desc | zh/en label+description 非空非同文、长度不溢出卡片 |
| F3-comet-tail-preview-deterministic | comet-tail | preview-deterministic | 同参数两次渲染逐像素一致（canvas 截图 diff=0） |
| F3-magnetosphere-aurora-defaults-sane | magnetosphere-aurora | defaults-sane | 默认参数点亮主视觉且无死区（真机截图留档） |
| F3-magnetosphere-aurora-param-meta-complete | magnetosphere-aurora | param-meta-complete | paramMeta 声明齐全（name/min/max/default/step），随机器可用 |
| F3-magnetosphere-aurora-i18n-label-desc | magnetosphere-aurora | i18n-label-desc | zh/en label+description 非空非同文、长度不溢出卡片 |
| F3-magnetosphere-aurora-preview-deterministic | magnetosphere-aurora | preview-deterministic | 同参数两次渲染逐像素一致（canvas 截图 diff=0） |
| F3-wave-diffraction-defaults-sane | wave-diffraction | defaults-sane | 默认参数点亮主视觉且无死区（真机截图留档） |
| F3-wave-diffraction-param-meta-complete | wave-diffraction | param-meta-complete | paramMeta 声明齐全（name/min/max/default/step），随机器可用 |
| F3-wave-diffraction-i18n-label-desc | wave-diffraction | i18n-label-desc | zh/en label+description 非空非同文、长度不溢出卡片 |
| F3-wave-diffraction-preview-deterministic | wave-diffraction | preview-deterministic | 同参数两次渲染逐像素一致（canvas 截图 diff=0） |
| F3-vortex-flame-defaults-sane | vortex-flame | defaults-sane | 默认参数点亮主视觉且无死区（真机截图留档） |
| F3-vortex-flame-param-meta-complete | vortex-flame | param-meta-complete | paramMeta 声明齐全（name/min/max/default/step），随机器可用 |
| F3-vortex-flame-i18n-label-desc | vortex-flame | i18n-label-desc | zh/en label+description 非空非同文、长度不溢出卡片 |
| F3-vortex-flame-preview-deterministic | vortex-flame | preview-deterministic | 同参数两次渲染逐像素一致（canvas 截图 diff=0） |
| F3-tokamak-plasma-defaults-sane | tokamak-plasma | defaults-sane | 默认参数点亮主视觉且无死区（真机截图留档） |
| F3-tokamak-plasma-param-meta-complete | tokamak-plasma | param-meta-complete | paramMeta 声明齐全（name/min/max/default/step），随机器可用 |
| F3-tokamak-plasma-i18n-label-desc | tokamak-plasma | i18n-label-desc | zh/en label+description 非空非同文、长度不溢出卡片 |
| F3-tokamak-plasma-preview-deterministic | tokamak-plasma | preview-deterministic | 同参数两次渲染逐像素一致（canvas 截图 diff=0） |
| F3-sphere-pulse-defaults-sane | sphere-pulse | defaults-sane | 默认参数点亮主视觉且无死区（真机截图留档） |
| F3-sphere-pulse-param-meta-complete | sphere-pulse | param-meta-complete | paramMeta 声明齐全（name/min/max/default/step），随机器可用 |
| F3-sphere-pulse-i18n-label-desc | sphere-pulse | i18n-label-desc | zh/en label+description 非空非同文、长度不溢出卡片 |
| F3-sphere-pulse-preview-deterministic | sphere-pulse | preview-deterministic | 同参数两次渲染逐像素一致（canvas 截图 diff=0） |
| F3-warp-portal-defaults-sane | warp-portal | defaults-sane | 默认参数点亮主视觉且无死区（真机截图留档） |
| F3-warp-portal-param-meta-complete | warp-portal | param-meta-complete | paramMeta 声明齐全（name/min/max/default/step），随机器可用 |
| F3-warp-portal-i18n-label-desc | warp-portal | i18n-label-desc | zh/en label+description 非空非同文、长度不溢出卡片 |
| F3-warp-portal-preview-deterministic | warp-portal | preview-deterministic | 同参数两次渲染逐像素一致（canvas 截图 diff=0） |
| F3-neon-galaxy-defaults-sane | neon-galaxy | defaults-sane | 默认参数点亮主视觉且无死区（真机截图留档） |
| F3-neon-galaxy-param-meta-complete | neon-galaxy | param-meta-complete | paramMeta 声明齐全（name/min/max/default/step），随机器可用 |
| F3-neon-galaxy-i18n-label-desc | neon-galaxy | i18n-label-desc | zh/en label+description 非空非同文、长度不溢出卡片 |
| F3-neon-galaxy-preview-deterministic | neon-galaxy | preview-deterministic | 同参数两次渲染逐像素一致（canvas 截图 diff=0） |
| F3-lava-sphere-defaults-sane | lava-sphere | defaults-sane | 默认参数点亮主视觉且无死区（真机截图留档） |
| F3-lava-sphere-param-meta-complete | lava-sphere | param-meta-complete | paramMeta 声明齐全（name/min/max/default/step），随机器可用 |
| F3-lava-sphere-i18n-label-desc | lava-sphere | i18n-label-desc | zh/en label+description 非空非同文、长度不溢出卡片 |
| F3-lava-sphere-preview-deterministic | lava-sphere | preview-deterministic | 同参数两次渲染逐像素一致（canvas 截图 diff=0） |
| F3-laser-show-defaults-sane | laser-show | defaults-sane | 默认参数点亮主视觉且无死区（真机截图留档） |
| F3-laser-show-param-meta-complete | laser-show | param-meta-complete | paramMeta 声明齐全（name/min/max/default/step），随机器可用 |
| F3-laser-show-i18n-label-desc | laser-show | i18n-label-desc | zh/en label+description 非空非同文、长度不溢出卡片 |
| F3-laser-show-preview-deterministic | laser-show | preview-deterministic | 同参数两次渲染逐像素一致（canvas 截图 diff=0） |
| F3-hologram-defaults-sane | hologram | defaults-sane | 默认参数点亮主视觉且无死区（真机截图留档） |
| F3-hologram-param-meta-complete | hologram | param-meta-complete | paramMeta 声明齐全（name/min/max/default/step），随机器可用 |
| F3-hologram-i18n-label-desc | hologram | i18n-label-desc | zh/en label+description 非空非同文、长度不溢出卡片 |
| F3-hologram-preview-deterministic | hologram | preview-deterministic | 同参数两次渲染逐像素一致（canvas 截图 diff=0） |

## F4 视图×主题×语言视觉审

**价值**：12 视图 × 2 主题 × 2 语言 = 48 个真实像素组合逐一 AI 目视复核——把双主题双语做实而非抽查  
**执行者**：auto｜**优先级**：P1｜**worktree**：`wt/f4-<r-n>`（族内实例共享分支，逐行勾选）

| task | 视图 | 主题 | 语言 | 验收 |
|---|---|---|---|---|
| F4-dashboard-dark-zh | dashboard | dark | zh | CDP 截图（切换至该主题/语言）+ AI 目视复核清单：无裁切/无中文直出(en)/无对比度违例/无布局断裂；截图入库 docs/ui-review/universe/ |
| F4-dashboard-dark-en | dashboard | dark | en | CDP 截图（切换至该主题/语言）+ AI 目视复核清单：无裁切/无中文直出(en)/无对比度违例/无布局断裂；截图入库 docs/ui-review/universe/ |
| F4-dashboard-light-zh | dashboard | light | zh | CDP 截图（切换至该主题/语言）+ AI 目视复核清单：无裁切/无中文直出(en)/无对比度违例/无布局断裂；截图入库 docs/ui-review/universe/ |
| F4-dashboard-light-en | dashboard | light | en | CDP 截图（切换至该主题/语言）+ AI 目视复核清单：无裁切/无中文直出(en)/无对比度违例/无布局断裂；截图入库 docs/ui-review/universe/ |
| F4-workspace-dark-zh | workspace | dark | zh | CDP 截图（切换至该主题/语言）+ AI 目视复核清单：无裁切/无中文直出(en)/无对比度违例/无布局断裂；截图入库 docs/ui-review/universe/ |
| F4-workspace-dark-en | workspace | dark | en | CDP 截图（切换至该主题/语言）+ AI 目视复核清单：无裁切/无中文直出(en)/无对比度违例/无布局断裂；截图入库 docs/ui-review/universe/ |
| F4-workspace-light-zh | workspace | light | zh | CDP 截图（切换至该主题/语言）+ AI 目视复核清单：无裁切/无中文直出(en)/无对比度违例/无布局断裂；截图入库 docs/ui-review/universe/ |
| F4-workspace-light-en | workspace | light | en | CDP 截图（切换至该主题/语言）+ AI 目视复核清单：无裁切/无中文直出(en)/无对比度违例/无布局断裂；截图入库 docs/ui-review/universe/ |
| F4-effects-dark-zh | effects | dark | zh | CDP 截图（切换至该主题/语言）+ AI 目视复核清单：无裁切/无中文直出(en)/无对比度违例/无布局断裂；截图入库 docs/ui-review/universe/ |
| F4-effects-dark-en | effects | dark | en | CDP 截图（切换至该主题/语言）+ AI 目视复核清单：无裁切/无中文直出(en)/无对比度违例/无布局断裂；截图入库 docs/ui-review/universe/ |
| F4-effects-light-zh | effects | light | zh | CDP 截图（切换至该主题/语言）+ AI 目视复核清单：无裁切/无中文直出(en)/无对比度违例/无布局断裂；截图入库 docs/ui-review/universe/ |
| F4-effects-light-en | effects | light | en | CDP 截图（切换至该主题/语言）+ AI 目视复核清单：无裁切/无中文直出(en)/无对比度违例/无布局断裂；截图入库 docs/ui-review/universe/ |
| F4-video-dark-zh | video | dark | zh | CDP 截图（切换至该主题/语言）+ AI 目视复核清单：无裁切/无中文直出(en)/无对比度违例/无布局断裂；截图入库 docs/ui-review/universe/ |
| F4-video-dark-en | video | dark | en | CDP 截图（切换至该主题/语言）+ AI 目视复核清单：无裁切/无中文直出(en)/无对比度违例/无布局断裂；截图入库 docs/ui-review/universe/ |
| F4-video-light-zh | video | light | zh | CDP 截图（切换至该主题/语言）+ AI 目视复核清单：无裁切/无中文直出(en)/无对比度违例/无布局断裂；截图入库 docs/ui-review/universe/ |
| F4-video-light-en | video | light | en | CDP 截图（切换至该主题/语言）+ AI 目视复核清单：无裁切/无中文直出(en)/无对比度违例/无布局断裂；截图入库 docs/ui-review/universe/ |
| F4-audio-dark-zh | audio | dark | zh | CDP 截图（切换至该主题/语言）+ AI 目视复核清单：无裁切/无中文直出(en)/无对比度违例/无布局断裂；截图入库 docs/ui-review/universe/ |
| F4-audio-dark-en | audio | dark | en | CDP 截图（切换至该主题/语言）+ AI 目视复核清单：无裁切/无中文直出(en)/无对比度违例/无布局断裂；截图入库 docs/ui-review/universe/ |
| F4-audio-light-zh | audio | light | zh | CDP 截图（切换至该主题/语言）+ AI 目视复核清单：无裁切/无中文直出(en)/无对比度违例/无布局断裂；截图入库 docs/ui-review/universe/ |
| F4-audio-light-en | audio | light | en | CDP 截图（切换至该主题/语言）+ AI 目视复核清单：无裁切/无中文直出(en)/无对比度违例/无布局断裂；截图入库 docs/ui-review/universe/ |
| F4-games-dark-zh | games | dark | zh | CDP 截图（切换至该主题/语言）+ AI 目视复核清单：无裁切/无中文直出(en)/无对比度违例/无布局断裂；截图入库 docs/ui-review/universe/ |
| F4-games-dark-en | games | dark | en | CDP 截图（切换至该主题/语言）+ AI 目视复核清单：无裁切/无中文直出(en)/无对比度违例/无布局断裂；截图入库 docs/ui-review/universe/ |
| F4-games-light-zh | games | light | zh | CDP 截图（切换至该主题/语言）+ AI 目视复核清单：无裁切/无中文直出(en)/无对比度违例/无布局断裂；截图入库 docs/ui-review/universe/ |
| F4-games-light-en | games | light | en | CDP 截图（切换至该主题/语言）+ AI 目视复核清单：无裁切/无中文直出(en)/无对比度违例/无布局断裂；截图入库 docs/ui-review/universe/ |
| F4-diagnostics-dark-zh | diagnostics | dark | zh | CDP 截图（切换至该主题/语言）+ AI 目视复核清单：无裁切/无中文直出(en)/无对比度违例/无布局断裂；截图入库 docs/ui-review/universe/ |
| F4-diagnostics-dark-en | diagnostics | dark | en | CDP 截图（切换至该主题/语言）+ AI 目视复核清单：无裁切/无中文直出(en)/无对比度违例/无布局断裂；截图入库 docs/ui-review/universe/ |
| F4-diagnostics-light-zh | diagnostics | light | zh | CDP 截图（切换至该主题/语言）+ AI 目视复核清单：无裁切/无中文直出(en)/无对比度违例/无布局断裂；截图入库 docs/ui-review/universe/ |
| F4-diagnostics-light-en | diagnostics | light | en | CDP 截图（切换至该主题/语言）+ AI 目视复核清单：无裁切/无中文直出(en)/无对比度违例/无布局断裂；截图入库 docs/ui-review/universe/ |
| F4-architecture-dark-zh | architecture | dark | zh | CDP 截图（切换至该主题/语言）+ AI 目视复核清单：无裁切/无中文直出(en)/无对比度违例/无布局断裂；截图入库 docs/ui-review/universe/ |
| F4-architecture-dark-en | architecture | dark | en | CDP 截图（切换至该主题/语言）+ AI 目视复核清单：无裁切/无中文直出(en)/无对比度违例/无布局断裂；截图入库 docs/ui-review/universe/ |
| F4-architecture-light-zh | architecture | light | zh | CDP 截图（切换至该主题/语言）+ AI 目视复核清单：无裁切/无中文直出(en)/无对比度违例/无布局断裂；截图入库 docs/ui-review/universe/ |
| F4-architecture-light-en | architecture | light | en | CDP 截图（切换至该主题/语言）+ AI 目视复核清单：无裁切/无中文直出(en)/无对比度违例/无布局断裂；截图入库 docs/ui-review/universe/ |
| F4-ai-dark-zh | ai | dark | zh | CDP 截图（切换至该主题/语言）+ AI 目视复核清单：无裁切/无中文直出(en)/无对比度违例/无布局断裂；截图入库 docs/ui-review/universe/ |
| F4-ai-dark-en | ai | dark | en | CDP 截图（切换至该主题/语言）+ AI 目视复核清单：无裁切/无中文直出(en)/无对比度违例/无布局断裂；截图入库 docs/ui-review/universe/ |
| F4-ai-light-zh | ai | light | zh | CDP 截图（切换至该主题/语言）+ AI 目视复核清单：无裁切/无中文直出(en)/无对比度违例/无布局断裂；截图入库 docs/ui-review/universe/ |
| F4-ai-light-en | ai | light | en | CDP 截图（切换至该主题/语言）+ AI 目视复核清单：无裁切/无中文直出(en)/无对比度违例/无布局断裂；截图入库 docs/ui-review/universe/ |
| F4-profiles-dark-zh | profiles | dark | zh | CDP 截图（切换至该主题/语言）+ AI 目视复核清单：无裁切/无中文直出(en)/无对比度违例/无布局断裂；截图入库 docs/ui-review/universe/ |
| F4-profiles-dark-en | profiles | dark | en | CDP 截图（切换至该主题/语言）+ AI 目视复核清单：无裁切/无中文直出(en)/无对比度违例/无布局断裂；截图入库 docs/ui-review/universe/ |
| F4-profiles-light-zh | profiles | light | zh | CDP 截图（切换至该主题/语言）+ AI 目视复核清单：无裁切/无中文直出(en)/无对比度违例/无布局断裂；截图入库 docs/ui-review/universe/ |
| F4-profiles-light-en | profiles | light | en | CDP 截图（切换至该主题/语言）+ AI 目视复核清单：无裁切/无中文直出(en)/无对比度违例/无布局断裂；截图入库 docs/ui-review/universe/ |
| F4-model3d-dark-zh | model3d | dark | zh | CDP 截图（切换至该主题/语言）+ AI 目视复核清单：无裁切/无中文直出(en)/无对比度违例/无布局断裂；截图入库 docs/ui-review/universe/ |
| F4-model3d-dark-en | model3d | dark | en | CDP 截图（切换至该主题/语言）+ AI 目视复核清单：无裁切/无中文直出(en)/无对比度违例/无布局断裂；截图入库 docs/ui-review/universe/ |
| F4-model3d-light-zh | model3d | light | zh | CDP 截图（切换至该主题/语言）+ AI 目视复核清单：无裁切/无中文直出(en)/无对比度违例/无布局断裂；截图入库 docs/ui-review/universe/ |
| F4-model3d-light-en | model3d | light | en | CDP 截图（切换至该主题/语言）+ AI 目视复核清单：无裁切/无中文直出(en)/无对比度违例/无布局断裂；截图入库 docs/ui-review/universe/ |
| F4-settings-dark-zh | settings | dark | zh | CDP 截图（切换至该主题/语言）+ AI 目视复核清单：无裁切/无中文直出(en)/无对比度违例/无布局断裂；截图入库 docs/ui-review/universe/ |
| F4-settings-dark-en | settings | dark | en | CDP 截图（切换至该主题/语言）+ AI 目视复核清单：无裁切/无中文直出(en)/无对比度违例/无布局断裂；截图入库 docs/ui-review/universe/ |
| F4-settings-light-zh | settings | light | zh | CDP 截图（切换至该主题/语言）+ AI 目视复核清单：无裁切/无中文直出(en)/无对比度违例/无布局断裂；截图入库 docs/ui-review/universe/ |
| F4-settings-light-en | settings | light | en | CDP 截图（切换至该主题/语言）+ AI 目视复核清单：无裁切/无中文直出(en)/无对比度违例/无布局断裂；截图入库 docs/ui-review/universe/ |

## F5 i18n 键全量审计（1706 键 ÷ 12/批）

**价值**：每个键过：zh/en 双存在、语义一致、无硬编码旁路、插值变量对齐——上架多语言硬门槛  
**执行者**：auto｜**优先级**：P1｜**worktree**：`wt/f5-<r-n>`（族内实例共享分支，逐行勾选）

| task | 键区间 | 验收 |
|---|---|---|
| F5-batch-1 | #1-12 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-2 | #13-24 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-3 | #25-36 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-4 | #37-48 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-5 | #49-60 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-6 | #61-72 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-7 | #73-84 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-8 | #85-96 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-9 | #97-108 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-10 | #109-120 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-11 | #121-132 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-12 | #133-144 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-13 | #145-156 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-14 | #157-168 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-15 | #169-180 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-16 | #181-192 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-17 | #193-204 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-18 | #205-216 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-19 | #217-228 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-20 | #229-240 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-21 | #241-252 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-22 | #253-264 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-23 | #265-276 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-24 | #277-288 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-25 | #289-300 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-26 | #301-312 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-27 | #313-324 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-28 | #325-336 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-29 | #337-348 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-30 | #349-360 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-31 | #361-372 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-32 | #373-384 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-33 | #385-396 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-34 | #397-408 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-35 | #409-420 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-36 | #421-432 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-37 | #433-444 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-38 | #445-456 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-39 | #457-468 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-40 | #469-480 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-41 | #481-492 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-42 | #493-504 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-43 | #505-516 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-44 | #517-528 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-45 | #529-540 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-46 | #541-552 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-47 | #553-564 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-48 | #565-576 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-49 | #577-588 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-50 | #589-600 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-51 | #601-612 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-52 | #613-624 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-53 | #625-636 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-54 | #637-648 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-55 | #649-660 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-56 | #661-672 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-57 | #673-684 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-58 | #685-696 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-59 | #697-708 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-60 | #709-720 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-61 | #721-732 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-62 | #733-744 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-63 | #745-756 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-64 | #757-768 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-65 | #769-780 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-66 | #781-792 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-67 | #793-804 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-68 | #805-816 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-69 | #817-828 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-70 | #829-840 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-71 | #841-852 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-72 | #853-864 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-73 | #865-876 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-74 | #877-888 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-75 | #889-900 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-76 | #901-912 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-77 | #913-924 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-78 | #925-936 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-79 | #937-948 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-80 | #949-960 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-81 | #961-972 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-82 | #973-984 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-83 | #985-996 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-84 | #997-1008 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-85 | #1009-1020 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-86 | #1021-1032 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-87 | #1033-1044 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-88 | #1045-1056 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-89 | #1057-1068 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-90 | #1069-1080 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-91 | #1081-1092 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-92 | #1093-1104 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-93 | #1105-1116 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-94 | #1117-1128 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-95 | #1129-1140 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-96 | #1141-1152 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-97 | #1153-1164 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-98 | #1165-1176 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-99 | #1177-1188 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-100 | #1189-1200 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-101 | #1201-1212 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-102 | #1213-1224 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-103 | #1225-1236 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-104 | #1237-1248 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-105 | #1249-1260 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-106 | #1261-1272 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-107 | #1273-1284 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-108 | #1285-1296 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-109 | #1297-1308 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-110 | #1309-1320 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-111 | #1321-1332 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-112 | #1333-1344 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-113 | #1345-1356 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-114 | #1357-1368 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-115 | #1369-1380 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-116 | #1381-1392 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-117 | #1393-1404 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-118 | #1405-1416 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-119 | #1417-1428 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-120 | #1429-1440 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-121 | #1441-1452 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-122 | #1453-1464 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-123 | #1465-1476 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-124 | #1477-1488 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-125 | #1489-1500 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-126 | #1501-1512 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-127 | #1513-1524 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-128 | #1525-1536 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-129 | #1537-1548 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-130 | #1549-1560 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-131 | #1561-1572 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-132 | #1573-1584 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-133 | #1585-1596 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-134 | #1597-1608 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-135 | #1609-1620 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-136 | #1621-1632 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-137 | #1633-1644 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-138 | #1645-1656 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-139 | #1657-1668 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-140 | #1669-1680 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-141 | #1681-1692 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-142 | #1693-1704 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |
| F5-batch-143 | #1705-1706 | 脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言 |

## F6 IPC 通道契约测试（137 通道）

**价值**：每通道 2 件：载荷 schema 类型化 + 失败路径（超时/错误形状）——巨石 main 解构的前置地基  
**执行者**：auto｜**优先级**：P1｜**worktree**：`wt/f6-<r-n>`（族内实例共享分支，逐行勾选）

| task | 通道 | 件 | 验收 |
|---|---|---|---|
| F6-appVersion-schema | appVersion | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-appVersion-failure | appVersion | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-getDisplayTopology-schema | getDisplayTopology | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-getDisplayTopology-failure | getDisplayTopology | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-getDefaultProfile-schema | getDefaultProfile | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-getDefaultProfile-failure | getDefaultProfile | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-saveProfile-schema | saveProfile | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-saveProfile-failure | saveProfile | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-getEngineStatus-schema | getEngineStatus | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-getEngineStatus-failure | getEngineStatus | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-setEngineRunning-schema | setEngineRunning | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-setEngineRunning-failure | setEngineRunning | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-renderPreviewFrame-schema | renderPreviewFrame | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-renderPreviewFrame-failure | renderPreviewFrame | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-captureScreenSample-schema | captureScreenSample | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-captureScreenSample-failure | captureScreenSample | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-getCaptureProviderStatus-schema | getCaptureProviderStatus | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-getCaptureProviderStatus-failure | getCaptureProviderStatus | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-getProcessCpuSamples-schema | getProcessCpuSamples | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-getProcessCpuSamples-failure | getProcessCpuSamples | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-crashLogList-schema | crashLogList | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-crashLogList-failure | crashLogList | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-crashLogExport-schema | crashLogExport | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-crashLogExport-failure | crashLogExport | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-perfSelfTestToggleOverlay-schema | perfSelfTestToggleOverlay | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-perfSelfTestToggleOverlay-failure | perfSelfTestToggleOverlay | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-perfSelfTestCollectOverlayTiming-schema | perfSelfTestCollectOverlayTiming | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-perfSelfTestCollectOverlayTiming-failure | perfSelfTestCollectOverlayTiming | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-perfSelfTestOverlayTimingReport-schema | perfSelfTestOverlayTimingReport | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-perfSelfTestOverlayTimingReport-failure | perfSelfTestOverlayTimingReport | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-overlayPushFrame-schema | overlayPushFrame | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-overlayPushFrame-failure | overlayPushFrame | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-overlayPushFrameForDisplay-schema | overlayPushFrameForDisplay | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-overlayPushFrameForDisplay-failure | overlayPushFrameForDisplay | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-openOverlay-schema | openOverlay | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-openOverlay-failure | openOverlay | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-closeOverlay-schema | closeOverlay | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-closeOverlay-failure | closeOverlay | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-setOverlayConfig-schema | setOverlayConfig | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-setOverlayConfig-failure | setOverlayConfig | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-getOverlayDisplayIds-schema | getOverlayDisplayIds | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-getOverlayDisplayIds-failure | getOverlayDisplayIds | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-overlayClosed-schema | overlayClosed | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-overlayClosed-failure | overlayClosed | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-overlayShowContextMenu-schema | overlayShowContextMenu | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-overlayShowContextMenu-failure | overlayShowContextMenu | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-overlayEffectChanged-schema | overlayEffectChanged | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-overlayEffectChanged-failure | overlayEffectChanged | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-setPowerSaveBlock-schema | setPowerSaveBlock | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-setPowerSaveBlock-failure | setPowerSaveBlock | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-getPowerSaveBlock-schema | getPowerSaveBlock | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-getPowerSaveBlock-failure | getPowerSaveBlock | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-getAutoLaunch-schema | getAutoLaunch | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-getAutoLaunch-failure | getAutoLaunch | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-setAutoLaunch-schema | setAutoLaunch | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-setAutoLaunch-failure | setAutoLaunch | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-getDesktopAudioSourceId-schema | getDesktopAudioSourceId | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-getDesktopAudioSourceId-failure | getDesktopAudioSourceId | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-getDesktopAudioSources-schema | getDesktopAudioSources | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-getDesktopAudioSources-failure | getDesktopAudioSources | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-getCaptureSources-schema | getCaptureSources | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-getCaptureSources-failure | getCaptureSources | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-selectCaptureSource-schema | selectCaptureSource | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-selectCaptureSource-failure | selectCaptureSource | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-displayTopologyChanged-schema | displayTopologyChanged | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-displayTopologyChanged-failure | displayTopologyChanged | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-mainWindowVisibilityChanged-schema | mainWindowVisibilityChanged | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-mainWindowVisibilityChanged-failure | mainWindowVisibilityChanged | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-listProfiles-schema | listProfiles | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-listProfiles-failure | listProfiles | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-loadProfileById-schema | loadProfileById | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-loadProfileById-failure | loadProfileById | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-saveProfileAs-schema | saveProfileAs | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-saveProfileAs-failure | saveProfileAs | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-deleteProfile-schema | deleteProfile | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-deleteProfile-failure | deleteProfile | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-exportProfileDialog-schema | exportProfileDialog | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-exportProfileDialog-failure | exportProfileDialog | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-importProfileDialog-schema | importProfileDialog | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-importProfileDialog-failure | importProfileDialog | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-modelGetCachedPaths-schema | modelGetCachedPaths | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-modelGetCachedPaths-failure | modelGetCachedPaths | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-modelDownload-schema | modelDownload | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-modelDownload-failure | modelDownload | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-modelDownloadProgress-schema | modelDownloadProgress | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-modelDownloadProgress-failure | modelDownloadProgress | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-denoiseStart-schema | denoiseStart | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-denoiseStart-failure | denoiseStart | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-denoiseFrames-schema | denoiseFrames | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-denoiseFrames-failure | denoiseFrames | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-denoiseStop-schema | denoiseStop | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-denoiseStop-failure | denoiseStop | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-denoiseFramesOut-schema | denoiseFramesOut | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-denoiseFramesOut-failure | denoiseFramesOut | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-audioGetSavedPaths-schema | audioGetSavedPaths | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-audioGetSavedPaths-failure | audioGetSavedPaths | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-audioSavePaths-schema | audioSavePaths | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-audioSavePaths-failure | audioSavePaths | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-audioOpenFiles-schema | audioOpenFiles | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-audioOpenFiles-failure | audioOpenFiles | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-audioOpenFolder-schema | audioOpenFolder | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-audioOpenFolder-failure | audioOpenFolder | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-videoGetSavedPaths-schema | videoGetSavedPaths | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-videoGetSavedPaths-failure | videoGetSavedPaths | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-videoSavePaths-schema | videoSavePaths | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-videoSavePaths-failure | videoSavePaths | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-videoOpenFiles-schema | videoOpenFiles | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-videoOpenFiles-failure | videoOpenFiles | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-videoOpenFolder-schema | videoOpenFolder | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-videoOpenFolder-failure | videoOpenFolder | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-getDisplays-schema | getDisplays | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-getDisplays-failure | getDisplays | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-openAudioVizWindow-schema | openAudioVizWindow | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-openAudioVizWindow-failure | openAudioVizWindow | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-closeAudioVizWindow-schema | closeAudioVizWindow | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-closeAudioVizWindow-failure | closeAudioVizWindow | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-getAudioVizWindowIds-schema | getAudioVizWindowIds | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-getAudioVizWindowIds-failure | getAudioVizWindowIds | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-visionHostOpen-schema | visionHostOpen | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-visionHostOpen-failure | visionHostOpen | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-visionHostClose-schema | visionHostClose | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-visionHostClose-failure | visionHostClose | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-shutdownArm-schema | shutdownArm | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-shutdownArm-failure | shutdownArm | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-shutdownCancel-schema | shutdownCancel | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-shutdownCancel-failure | shutdownCancel | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-shutdownStatus-schema | shutdownStatus | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-shutdownStatus-failure | shutdownStatus | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-screensaverGetSettings-schema | screensaverGetSettings | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-screensaverGetSettings-failure | screensaverGetSettings | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-screensaverSetSettings-schema | screensaverSetSettings | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-screensaverSetSettings-failure | screensaverSetSettings | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-clipboardWriteImage-schema | clipboardWriteImage | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-clipboardWriteImage-failure | clipboardWriteImage | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-capturesList-schema | capturesList | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-capturesList-failure | capturesList | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-capturesAdd-schema | capturesAdd | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-capturesAdd-failure | capturesAdd | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-capturesDelete-schema | capturesDelete | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-capturesDelete-failure | capturesDelete | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-capturesRead-schema | capturesRead | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-capturesRead-failure | capturesRead | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-capturesImport-schema | capturesImport | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-capturesImport-failure | capturesImport | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-clipboardWriteText-schema | clipboardWriteText | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-clipboardWriteText-failure | clipboardWriteText | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-clipboardWriteRich-schema | clipboardWriteRich | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-clipboardWriteRich-failure | clipboardWriteRich | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-ai8SaveArtifact-schema | ai8SaveArtifact | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-ai8SaveArtifact-failure | ai8SaveArtifact | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-ai8ShowItemInFolder-schema | ai8ShowItemInFolder | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-ai8ShowItemInFolder-failure | ai8ShowItemInFolder | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-clipboardReadText-schema | clipboardReadText | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-clipboardReadText-failure | clipboardReadText | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-ocrRecognize-schema | ocrRecognize | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-ocrRecognize-failure | ocrRecognize | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-snipPushFrame-schema | snipPushFrame | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-snipPushFrame-failure | snipPushFrame | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-snipFramePainted-schema | snipFramePainted | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-snipFramePainted-failure | snipFramePainted | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-snipFinish-schema | snipFinish | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-snipFinish-failure | snipFinish | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-snipCancel-schema | snipCancel | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-snipCancel-failure | snipCancel | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-uiSetLocale-schema | uiSetLocale | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-uiSetLocale-failure | uiSetLocale | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-uiSetTitleBarTheme-schema | uiSetTitleBarTheme | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-uiSetTitleBarTheme-failure | uiSetTitleBarTheme | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-snipGetHotkey-schema | snipGetHotkey | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-snipGetHotkey-failure | snipGetHotkey | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-snipSetHotkey-schema | snipSetHotkey | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-snipSetHotkey-failure | snipSetHotkey | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-aiGetSettings-schema | aiGetSettings | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-aiGetSettings-failure | aiGetSettings | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-aiSetSettings-schema | aiSetSettings | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-aiSetSettings-failure | aiSetSettings | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-aiCleanupText-schema | aiCleanupText | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-aiCleanupText-failure | aiCleanupText | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-aiTranslateText-schema | aiTranslateText | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-aiTranslateText-failure | aiTranslateText | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-aiTestConnection-schema | aiTestConnection | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-aiTestConnection-failure | aiTestConnection | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-aiChat-schema | aiChat | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-aiChat-failure | aiChat | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-aiGetProfiles-schema | aiGetProfiles | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-aiGetProfiles-failure | aiGetProfiles | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-aiSaveProfile-schema | aiSaveProfile | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-aiSaveProfile-failure | aiSaveProfile | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-aiDeleteProfile-schema | aiDeleteProfile | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-aiDeleteProfile-failure | aiDeleteProfile | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-aiSetActiveProfile-schema | aiSetActiveProfile | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-aiSetActiveProfile-failure | aiSetActiveProfile | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-ai8OpenLogin-schema | ai8OpenLogin | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-ai8OpenLogin-failure | ai8OpenLogin | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-ai8SaveCredentials-schema | ai8SaveCredentials | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-ai8SaveCredentials-failure | ai8SaveCredentials | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-ai8ClearCredentials-schema | ai8ClearCredentials | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-ai8ClearCredentials-failure | ai8ClearCredentials | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-ai8AutoLogin-schema | ai8AutoLogin | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-ai8AutoLogin-failure | ai8AutoLogin | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-ai8PickMdFolder-schema | ai8PickMdFolder | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-ai8PickMdFolder-failure | ai8PickMdFolder | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-ai8SaveImageToFolder-schema | ai8SaveImageToFolder | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-ai8SaveImageToFolder-failure | ai8SaveImageToFolder | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-audioAiStatus-schema | audioAiStatus | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-audioAiStatus-failure | audioAiStatus | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-audioAiRunVad-schema | audioAiRunVad | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-audioAiRunVad-failure | audioAiRunVad | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-audioAiRunAst-schema | audioAiRunAst | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-audioAiRunAst-failure | audioAiRunAst | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-audioAiStreamStart-schema | audioAiStreamStart | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-audioAiStreamStart-failure | audioAiStreamStart | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-audioAiStreamFeed-schema | audioAiStreamFeed | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-audioAiStreamFeed-failure | audioAiStreamFeed | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-audioAiStreamStop-schema | audioAiStreamStop | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-audioAiStreamStop-failure | audioAiStreamStop | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-agentSend-schema | agentSend | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-agentSend-failure | agentSend | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-agentCancel-schema | agentCancel | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-agentCancel-failure | agentCancel | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-agentApprovalRespond-schema | agentApprovalRespond | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-agentApprovalRespond-failure | agentApprovalRespond | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-agentSessionsList-schema | agentSessionsList | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-agentSessionsList-failure | agentSessionsList | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-agentSessionLoad-schema | agentSessionLoad | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-agentSessionLoad-failure | agentSessionLoad | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-agentSessionRename-schema | agentSessionRename | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-agentSessionRename-failure | agentSessionRename | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-agentSessionDelete-schema | agentSessionDelete | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-agentSessionDelete-failure | agentSessionDelete | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-agentPickWorkspace-schema | agentPickWorkspace | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-agentPickWorkspace-failure | agentPickWorkspace | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-agentEvent-schema | agentEvent | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-agentEvent-failure | agentEvent | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-ttsEngineStatus-schema | ttsEngineStatus | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-ttsEngineStatus-failure | ttsEngineStatus | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-ttsModelDownload-schema | ttsModelDownload | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-ttsModelDownload-failure | ttsModelDownload | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-ttsModelProgress-schema | ttsModelProgress | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-ttsModelProgress-failure | ttsModelProgress | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-ttsSynthesize-schema | ttsSynthesize | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-ttsSynthesize-failure | ttsSynthesize | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-ttsExport-schema | ttsExport | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-ttsExport-failure | ttsExport | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-ttsVoiceDownload-schema | ttsVoiceDownload | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-ttsVoiceDownload-failure | ttsVoiceDownload | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-voiceLexiconExport-schema | voiceLexiconExport | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-voiceLexiconExport-failure | voiceLexiconExport | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-voiceLexiconImport-schema | voiceLexiconImport | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-voiceLexiconImport-failure | voiceLexiconImport | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-lanState-schema | lanState | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-lanState-failure | lanState | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-lanHost-schema | lanHost | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-lanHost-failure | lanHost | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-lanJoin-schema | lanJoin | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-lanJoin-failure | lanJoin | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-lanLeave-schema | lanLeave | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-lanLeave-failure | lanLeave | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-lanDiscover-schema | lanDiscover | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-lanDiscover-failure | lanDiscover | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-lanCmd-schema | lanCmd | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-lanCmd-failure | lanCmd | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-lanSnapshot-schema | lanSnapshot | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-lanSnapshot-failure | lanSnapshot | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-lanSpectate-schema | lanSpectate | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-lanSpectate-failure | lanSpectate | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-avatarGet-schema | avatarGet | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-avatarGet-failure | avatarGet | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-avatarSet-schema | avatarSet | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-avatarSet-failure | avatarSet | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-avatarClear-schema | avatarClear | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-avatarClear-failure | avatarClear | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |
| F6-lanEvent-schema | lanEvent | schema | 载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门） |
| F6-lanEvent-failure | lanEvent | failure | invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁 |

## F7 landmark 注入健壮性（21 点×5 形变）

**价值**：引擎对每一点的每类畸形输入零崩溃零污染——03/V-17 的系统化收口  
**执行者**：auto｜**优先级**：P1｜**worktree**：`wt/f7-<r-n>`（族内实例共享分支，逐行勾选）

| task | 点位 | 形变 | 验收 |
|---|---|---|---|
| F7-lm0-nan | #0 | nan | 该点注入 nan（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm0-negative | #0 | negative | 该点注入 negative（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm0-oversized | #0 | oversized | 该点注入 oversized（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm0-frozen | #0 | frozen | 该点注入 frozen（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm0-dropped | #0 | dropped | 该点注入 dropped（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm1-nan | #1 | nan | 该点注入 nan（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm1-negative | #1 | negative | 该点注入 negative（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm1-oversized | #1 | oversized | 该点注入 oversized（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm1-frozen | #1 | frozen | 该点注入 frozen（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm1-dropped | #1 | dropped | 该点注入 dropped（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm2-nan | #2 | nan | 该点注入 nan（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm2-negative | #2 | negative | 该点注入 negative（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm2-oversized | #2 | oversized | 该点注入 oversized（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm2-frozen | #2 | frozen | 该点注入 frozen（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm2-dropped | #2 | dropped | 该点注入 dropped（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm3-nan | #3 | nan | 该点注入 nan（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm3-negative | #3 | negative | 该点注入 negative（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm3-oversized | #3 | oversized | 该点注入 oversized（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm3-frozen | #3 | frozen | 该点注入 frozen（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm3-dropped | #3 | dropped | 该点注入 dropped（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm4-nan | #4 | nan | 该点注入 nan（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm4-negative | #4 | negative | 该点注入 negative（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm4-oversized | #4 | oversized | 该点注入 oversized（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm4-frozen | #4 | frozen | 该点注入 frozen（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm4-dropped | #4 | dropped | 该点注入 dropped（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm5-nan | #5 | nan | 该点注入 nan（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm5-negative | #5 | negative | 该点注入 negative（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm5-oversized | #5 | oversized | 该点注入 oversized（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm5-frozen | #5 | frozen | 该点注入 frozen（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm5-dropped | #5 | dropped | 该点注入 dropped（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm6-nan | #6 | nan | 该点注入 nan（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm6-negative | #6 | negative | 该点注入 negative（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm6-oversized | #6 | oversized | 该点注入 oversized（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm6-frozen | #6 | frozen | 该点注入 frozen（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm6-dropped | #6 | dropped | 该点注入 dropped（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm7-nan | #7 | nan | 该点注入 nan（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm7-negative | #7 | negative | 该点注入 negative（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm7-oversized | #7 | oversized | 该点注入 oversized（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm7-frozen | #7 | frozen | 该点注入 frozen（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm7-dropped | #7 | dropped | 该点注入 dropped（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm8-nan | #8 | nan | 该点注入 nan（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm8-negative | #8 | negative | 该点注入 negative（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm8-oversized | #8 | oversized | 该点注入 oversized（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm8-frozen | #8 | frozen | 该点注入 frozen（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm8-dropped | #8 | dropped | 该点注入 dropped（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm9-nan | #9 | nan | 该点注入 nan（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm9-negative | #9 | negative | 该点注入 negative（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm9-oversized | #9 | oversized | 该点注入 oversized（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm9-frozen | #9 | frozen | 该点注入 frozen（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm9-dropped | #9 | dropped | 该点注入 dropped（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm10-nan | #10 | nan | 该点注入 nan（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm10-negative | #10 | negative | 该点注入 negative（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm10-oversized | #10 | oversized | 该点注入 oversized（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm10-frozen | #10 | frozen | 该点注入 frozen（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm10-dropped | #10 | dropped | 该点注入 dropped（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm11-nan | #11 | nan | 该点注入 nan（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm11-negative | #11 | negative | 该点注入 negative（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm11-oversized | #11 | oversized | 该点注入 oversized（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm11-frozen | #11 | frozen | 该点注入 frozen（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm11-dropped | #11 | dropped | 该点注入 dropped（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm12-nan | #12 | nan | 该点注入 nan（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm12-negative | #12 | negative | 该点注入 negative（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm12-oversized | #12 | oversized | 该点注入 oversized（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm12-frozen | #12 | frozen | 该点注入 frozen（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm12-dropped | #12 | dropped | 该点注入 dropped（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm13-nan | #13 | nan | 该点注入 nan（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm13-negative | #13 | negative | 该点注入 negative（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm13-oversized | #13 | oversized | 该点注入 oversized（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm13-frozen | #13 | frozen | 该点注入 frozen（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm13-dropped | #13 | dropped | 该点注入 dropped（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm14-nan | #14 | nan | 该点注入 nan（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm14-negative | #14 | negative | 该点注入 negative（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm14-oversized | #14 | oversized | 该点注入 oversized（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm14-frozen | #14 | frozen | 该点注入 frozen（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm14-dropped | #14 | dropped | 该点注入 dropped（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm15-nan | #15 | nan | 该点注入 nan（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm15-negative | #15 | negative | 该点注入 negative（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm15-oversized | #15 | oversized | 该点注入 oversized（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm15-frozen | #15 | frozen | 该点注入 frozen（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm15-dropped | #15 | dropped | 该点注入 dropped（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm16-nan | #16 | nan | 该点注入 nan（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm16-negative | #16 | negative | 该点注入 negative（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm16-oversized | #16 | oversized | 该点注入 oversized（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm16-frozen | #16 | frozen | 该点注入 frozen（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm16-dropped | #16 | dropped | 该点注入 dropped（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm17-nan | #17 | nan | 该点注入 nan（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm17-negative | #17 | negative | 该点注入 negative（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm17-oversized | #17 | oversized | 该点注入 oversized（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm17-frozen | #17 | frozen | 该点注入 frozen（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm17-dropped | #17 | dropped | 该点注入 dropped（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm18-nan | #18 | nan | 该点注入 nan（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm18-negative | #18 | negative | 该点注入 negative（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm18-oversized | #18 | oversized | 该点注入 oversized（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm18-frozen | #18 | frozen | 该点注入 frozen（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm18-dropped | #18 | dropped | 该点注入 dropped（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm19-nan | #19 | nan | 该点注入 nan（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm19-negative | #19 | negative | 该点注入 negative（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm19-oversized | #19 | oversized | 该点注入 oversized（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm19-frozen | #19 | frozen | 该点注入 frozen（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm19-dropped | #19 | dropped | 该点注入 dropped（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm20-nan | #20 | nan | 该点注入 nan（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm20-negative | #20 | negative | 该点注入 negative（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm20-oversized | #20 | oversized | 该点注入 oversized（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm20-frozen | #20 | frozen | 该点注入 frozen（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |
| F7-lm20-dropped | #20 | dropped | 该点注入 dropped（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数 |

## F8 协议消息 fuzz（22 消息×3 畸形类）

**价值**：每消息喂 畸形载荷/未知字段/超长值——宿主不崩不断流，错误可上报  
**执行者**：auto｜**优先级**：P2｜**worktree**：`wt/f8-<r-n>`（族内实例共享分支，逐行勾选）

| task | 消息 | 畸形类 | 验收 |
|---|---|---|---|
| F8-init-malformed-payload | init | malformed-payload | hostMessenger.handle 注入该畸形 → 不抛（守卫路径）+ error/忽略行为符合契约表 |
| F8-init-unknown-fields | init | unknown-fields | hostMessenger.handle 注入该畸形 → 不抛（守卫路径）+ error/忽略行为符合契约表 |
| F8-init-oversized-values | init | oversized-values | hostMessenger.handle 注入该畸形 → 不抛（守卫路径）+ error/忽略行为符合契约表 |
| F8-acquire-malformed-payload | acquire | malformed-payload | hostMessenger.handle 注入该畸形 → 不抛（守卫路径）+ error/忽略行为符合契约表 |
| F8-acquire-unknown-fields | acquire | unknown-fields | hostMessenger.handle 注入该畸形 → 不抛（守卫路径）+ error/忽略行为符合契约表 |
| F8-acquire-oversized-values | acquire | oversized-values | hostMessenger.handle 注入该畸形 → 不抛（守卫路径）+ error/忽略行为符合契约表 |
| F8-release-malformed-payload | release | malformed-payload | hostMessenger.handle 注入该畸形 → 不抛（守卫路径）+ error/忽略行为符合契约表 |
| F8-release-unknown-fields | release | unknown-fields | hostMessenger.handle 注入该畸形 → 不抛（守卫路径）+ error/忽略行为符合契约表 |
| F8-release-oversized-values | release | oversized-values | hostMessenger.handle 注入该畸形 → 不抛（守卫路径）+ error/忽略行为符合契约表 |
| F8-stop-malformed-payload | stop | malformed-payload | hostMessenger.handle 注入该畸形 → 不抛（守卫路径）+ error/忽略行为符合契约表 |
| F8-stop-unknown-fields | stop | unknown-fields | hostMessenger.handle 注入该畸形 → 不抛（守卫路径）+ error/忽略行为符合契约表 |
| F8-stop-oversized-values | stop | oversized-values | hostMessenger.handle 注入该畸形 → 不抛（守卫路径）+ error/忽略行为符合契约表 |
| F8-settings-malformed-payload | settings | malformed-payload | hostMessenger.handle 注入该畸形 → 不抛（守卫路径）+ error/忽略行为符合契约表 |
| F8-settings-unknown-fields | settings | unknown-fields | hostMessenger.handle 注入该畸形 → 不抛（守卫路径）+ error/忽略行为符合契约表 |
| F8-settings-oversized-values | settings | oversized-values | hostMessenger.handle 注入该畸形 → 不抛（守卫路径）+ error/忽略行为符合契约表 |
| F8-pause-malformed-payload | pause | malformed-payload | hostMessenger.handle 注入该畸形 → 不抛（守卫路径）+ error/忽略行为符合契约表 |
| F8-pause-unknown-fields | pause | unknown-fields | hostMessenger.handle 注入该畸形 → 不抛（守卫路径）+ error/忽略行为符合契约表 |
| F8-pause-oversized-values | pause | oversized-values | hostMessenger.handle 注入该畸形 → 不抛（守卫路径）+ error/忽略行为符合契约表 |
| F8-recalibrate-malformed-payload | recalibrate | malformed-payload | hostMessenger.handle 注入该畸形 → 不抛（守卫路径）+ error/忽略行为符合契约表 |
| F8-recalibrate-unknown-fields | recalibrate | unknown-fields | hostMessenger.handle 注入该畸形 → 不抛（守卫路径）+ error/忽略行为符合契约表 |
| F8-recalibrate-oversized-values | recalibrate | oversized-values | hostMessenger.handle 注入该畸形 → 不抛（守卫路径）+ error/忽略行为符合契约表 |
| F8-forceReady-malformed-payload | forceReady | malformed-payload | hostMessenger.handle 注入该畸形 → 不抛（守卫路径）+ error/忽略行为符合契约表 |
| F8-forceReady-unknown-fields | forceReady | unknown-fields | hostMessenger.handle 注入该畸形 → 不抛（守卫路径）+ error/忽略行为符合契约表 |
| F8-forceReady-oversized-values | forceReady | oversized-values | hostMessenger.handle 注入该畸形 → 不抛（守卫路径）+ error/忽略行为符合契约表 |
| F8-mirror-malformed-payload | mirror | malformed-payload | hostMessenger.handle 注入该畸形 → 不抛（守卫路径）+ error/忽略行为符合契约表 |
| F8-mirror-unknown-fields | mirror | unknown-fields | hostMessenger.handle 注入该畸形 → 不抛（守卫路径）+ error/忽略行为符合契约表 |
| F8-mirror-oversized-values | mirror | oversized-values | hostMessenger.handle 注入该畸形 → 不抛（守卫路径）+ error/忽略行为符合契约表 |
| F8-primaryHand-malformed-payload | primaryHand | malformed-payload | hostMessenger.handle 注入该畸形 → 不抛（守卫路径）+ error/忽略行为符合契约表 |
| F8-primaryHand-unknown-fields | primaryHand | unknown-fields | hostMessenger.handle 注入该畸形 → 不抛（守卫路径）+ error/忽略行为符合契约表 |
| F8-primaryHand-oversized-values | primaryHand | oversized-values | hostMessenger.handle 注入该畸形 → 不抛（守卫路径）+ error/忽略行为符合契约表 |
| F8-textmode-malformed-payload | textmode | malformed-payload | hostMessenger.handle 注入该畸形 → 不抛（守卫路径）+ error/忽略行为符合契约表 |
| F8-textmode-unknown-fields | textmode | unknown-fields | hostMessenger.handle 注入该畸形 → 不抛（守卫路径）+ error/忽略行为符合契约表 |
| F8-textmode-oversized-values | textmode | oversized-values | hostMessenger.handle 注入该畸形 → 不抛（守卫路径）+ error/忽略行为符合契约表 |
| F8-backspace-malformed-payload | backspace | malformed-payload | hostMessenger.handle 注入该畸形 → 不抛（守卫路径）+ error/忽略行为符合契约表 |
| F8-backspace-unknown-fields | backspace | unknown-fields | hostMessenger.handle 注入该畸形 → 不抛（守卫路径）+ error/忽略行为符合契约表 |
| F8-backspace-oversized-values | backspace | oversized-values | hostMessenger.handle 注入该畸形 → 不抛（守卫路径）+ error/忽略行为符合契约表 |
| F8-capture-malformed-payload | capture | malformed-payload | hostMessenger.handle 注入该畸形 → 不抛（守卫路径）+ error/忽略行为符合契约表 |
| F8-capture-unknown-fields | capture | unknown-fields | hostMessenger.handle 注入该畸形 → 不抛（守卫路径）+ error/忽略行为符合契约表 |
| F8-capture-oversized-values | capture | oversized-values | hostMessenger.handle 注入该畸形 → 不抛（守卫路径）+ error/忽略行为符合契约表 |
| F8-ready-malformed-payload | ready | malformed-payload | hostMessenger.handle 注入该畸形 → 不抛（守卫路径）+ error/忽略行为符合契约表 |
| F8-ready-unknown-fields | ready | unknown-fields | hostMessenger.handle 注入该畸形 → 不抛（守卫路径）+ error/忽略行为符合契约表 |
| F8-ready-oversized-values | ready | oversized-values | hostMessenger.handle 注入该畸形 → 不抛（守卫路径）+ error/忽略行为符合契约表 |
| F8-events-malformed-payload | events | malformed-payload | hostMessenger.handle 注入该畸形 → 不抛（守卫路径）+ error/忽略行为符合契约表 |
| F8-events-unknown-fields | events | unknown-fields | hostMessenger.handle 注入该畸形 → 不抛（守卫路径）+ error/忽略行为符合契约表 |
| F8-events-oversized-values | events | oversized-values | hostMessenger.handle 注入该畸形 → 不抛（守卫路径）+ error/忽略行为符合契约表 |
| F8-snapshot-malformed-payload | snapshot | malformed-payload | hostMessenger.handle 注入该畸形 → 不抛（守卫路径）+ error/忽略行为符合契约表 |
| F8-snapshot-unknown-fields | snapshot | unknown-fields | hostMessenger.handle 注入该畸形 → 不抛（守卫路径）+ error/忽略行为符合契约表 |
| F8-snapshot-oversized-values | snapshot | oversized-values | hostMessenger.handle 注入该畸形 → 不抛（守卫路径）+ error/忽略行为符合契约表 |
| F8-status-malformed-payload | status | malformed-payload | hostMessenger.handle 注入该畸形 → 不抛（守卫路径）+ error/忽略行为符合契约表 |
| F8-status-unknown-fields | status | unknown-fields | hostMessenger.handle 注入该畸形 → 不抛（守卫路径）+ error/忽略行为符合契约表 |
| F8-status-oversized-values | status | oversized-values | hostMessenger.handle 注入该畸形 → 不抛（守卫路径）+ error/忽略行为符合契约表 |
| F8-profile-save-malformed-payload | profile-save | malformed-payload | hostMessenger.handle 注入该畸形 → 不抛（守卫路径）+ error/忽略行为符合契约表 |
| F8-profile-save-unknown-fields | profile-save | unknown-fields | hostMessenger.handle 注入该畸形 → 不抛（守卫路径）+ error/忽略行为符合契约表 |
| F8-profile-save-oversized-values | profile-save | oversized-values | hostMessenger.handle 注入该畸形 → 不抛（守卫路径）+ error/忽略行为符合契约表 |
| F8-error-malformed-payload | error | malformed-payload | hostMessenger.handle 注入该畸形 → 不抛（守卫路径）+ error/忽略行为符合契约表 |
| F8-error-unknown-fields | error | unknown-fields | hostMessenger.handle 注入该畸形 → 不抛（守卫路径）+ error/忽略行为符合契约表 |
| F8-error-oversized-values | error | oversized-values | hostMessenger.handle 注入该畸形 → 不抛（守卫路径）+ error/忽略行为符合契约表 |
| F8-heartbeat-malformed-payload | heartbeat | malformed-payload | hostMessenger.handle 注入该畸形 → 不抛（守卫路径）+ error/忽略行为符合契约表 |
| F8-heartbeat-unknown-fields | heartbeat | unknown-fields | hostMessenger.handle 注入该畸形 → 不抛（守卫路径）+ error/忽略行为符合契约表 |
| F8-heartbeat-oversized-values | heartbeat | oversized-values | hostMessenger.handle 注入该畸形 → 不抛（守卫路径）+ error/忽略行为符合契约表 |
| F8-host-hello-malformed-payload | host-hello | malformed-payload | hostMessenger.handle 注入该畸形 → 不抛（守卫路径）+ error/忽略行为符合契约表 |
| F8-host-hello-unknown-fields | host-hello | unknown-fields | hostMessenger.handle 注入该畸形 → 不抛（守卫路径）+ error/忽略行为符合契约表 |
| F8-host-hello-oversized-values | host-hello | oversized-values | hostMessenger.handle 注入该畸形 → 不抛（守卫路径）+ error/忽略行为符合契约表 |
| F8-host-gone-malformed-payload | host-gone | malformed-payload | hostMessenger.handle 注入该畸形 → 不抛（守卫路径）+ error/忽略行为符合契约表 |
| F8-host-gone-unknown-fields | host-gone | unknown-fields | hostMessenger.handle 注入该畸形 → 不抛（守卫路径）+ error/忽略行为符合契约表 |
| F8-host-gone-oversized-values | host-gone | oversized-values | hostMessenger.handle 注入该畸形 → 不抛（守卫路径）+ error/忽略行为符合契约表 |

## F9 五游戏体感接入审计

**价值**：每游戏 4 关：输入映射/暂停收敛/撤销路径/帧率守护——体感游戏商业面  
**执行者**：auto｜**优先级**：P1｜**worktree**：`wt/f9-<r-n>`（族内实例共享分支，逐行勾选）

| task | 游戏 | 检查 | 验收 |
|---|---|---|---|
| F9-hub-vision-mapping | hub | vision-mapping | 八向/捏合映射表核对 + 文档化 |
| F9-hub-pause-convergence | hub | pause-convergence | 暂停/Esc/最小化三路径摄像头与输入全收敛（走查） |
| F9-hub-undo-path | hub | undo-path | 误触发可撤销（硬降/确认窗） |
| F9-hub-fps-guard | hub | fps-guard | 体感开启时游戏帧率降幅 <10%（对照录屏） |
| F9-td-vision-mapping | td | vision-mapping | 八向/捏合映射表核对 + 文档化 |
| F9-td-pause-convergence | td | pause-convergence | 暂停/Esc/最小化三路径摄像头与输入全收敛（走查） |
| F9-td-undo-path | td | undo-path | 误触发可撤销（硬降/确认窗） |
| F9-td-fps-guard | td | fps-guard | 体感开启时游戏帧率降幅 <10%（对照录屏） |
| F9-swarm-vision-mapping | swarm | vision-mapping | 八向/捏合映射表核对 + 文档化 |
| F9-swarm-pause-convergence | swarm | pause-convergence | 暂停/Esc/最小化三路径摄像头与输入全收敛（走查） |
| F9-swarm-undo-path | swarm | undo-path | 误触发可撤销（硬降/确认窗） |
| F9-swarm-fps-guard | swarm | fps-guard | 体感开启时游戏帧率降幅 <10%（对照录屏） |
| F9-tetris-vision-mapping | tetris | vision-mapping | 八向/捏合映射表核对 + 文档化 |
| F9-tetris-pause-convergence | tetris | pause-convergence | 暂停/Esc/最小化三路径摄像头与输入全收敛（走查） |
| F9-tetris-undo-path | tetris | undo-path | 误触发可撤销（硬降/确认窗） |
| F9-tetris-fps-guard | tetris | fps-guard | 体感开启时游戏帧率降幅 <10%（对照录屏） |
| F9-slash-vision-mapping | slash | vision-mapping | 八向/捏合映射表核对 + 文档化 |
| F9-slash-pause-convergence | slash | pause-convergence | 暂停/Esc/最小化三路径摄像头与输入全收敛（走查） |
| F9-slash-undo-path | slash | undo-path | 误触发可撤销（硬降/确认窗） |
| F9-slash-fps-guard | slash | fps-guard | 体感开启时游戏帧率降幅 <10%（对照录屏） |

## F10 吞错点清理（43 处实证）

**价值**：每处 `.catch(()=>undefined)`/空 catch 换成：分类日志或用户可见状态——黑箱终结  
**执行者**：auto｜**优先级**：P0｜**worktree**：`wt/f10-<r-n>`（族内实例共享分支，逐行勾选）

| task | 站点 | 验收 |
|---|---|---|
| F10-site-1 | grep 第 1 处 | 替换为分类日志或 setError；负向断言：全仓空 catch 数下降且可 grep 报告 |
| F10-site-2 | grep 第 2 处 | 替换为分类日志或 setError；负向断言：全仓空 catch 数下降且可 grep 报告 |
| F10-site-3 | grep 第 3 处 | 替换为分类日志或 setError；负向断言：全仓空 catch 数下降且可 grep 报告 |
| F10-site-4 | grep 第 4 处 | 替换为分类日志或 setError；负向断言：全仓空 catch 数下降且可 grep 报告 |
| F10-site-5 | grep 第 5 处 | 替换为分类日志或 setError；负向断言：全仓空 catch 数下降且可 grep 报告 |
| F10-site-6 | grep 第 6 处 | 替换为分类日志或 setError；负向断言：全仓空 catch 数下降且可 grep 报告 |
| F10-site-7 | grep 第 7 处 | 替换为分类日志或 setError；负向断言：全仓空 catch 数下降且可 grep 报告 |
| F10-site-8 | grep 第 8 处 | 替换为分类日志或 setError；负向断言：全仓空 catch 数下降且可 grep 报告 |
| F10-site-9 | grep 第 9 处 | 替换为分类日志或 setError；负向断言：全仓空 catch 数下降且可 grep 报告 |
| F10-site-10 | grep 第 10 处 | 替换为分类日志或 setError；负向断言：全仓空 catch 数下降且可 grep 报告 |
| F10-site-11 | grep 第 11 处 | 替换为分类日志或 setError；负向断言：全仓空 catch 数下降且可 grep 报告 |
| F10-site-12 | grep 第 12 处 | 替换为分类日志或 setError；负向断言：全仓空 catch 数下降且可 grep 报告 |
| F10-site-13 | grep 第 13 处 | 替换为分类日志或 setError；负向断言：全仓空 catch 数下降且可 grep 报告 |
| F10-site-14 | grep 第 14 处 | 替换为分类日志或 setError；负向断言：全仓空 catch 数下降且可 grep 报告 |
| F10-site-15 | grep 第 15 处 | 替换为分类日志或 setError；负向断言：全仓空 catch 数下降且可 grep 报告 |
| F10-site-16 | grep 第 16 处 | 替换为分类日志或 setError；负向断言：全仓空 catch 数下降且可 grep 报告 |
| F10-site-17 | grep 第 17 处 | 替换为分类日志或 setError；负向断言：全仓空 catch 数下降且可 grep 报告 |
| F10-site-18 | grep 第 18 处 | 替换为分类日志或 setError；负向断言：全仓空 catch 数下降且可 grep 报告 |
| F10-site-19 | grep 第 19 处 | 替换为分类日志或 setError；负向断言：全仓空 catch 数下降且可 grep 报告 |
| F10-site-20 | grep 第 20 处 | 替换为分类日志或 setError；负向断言：全仓空 catch 数下降且可 grep 报告 |
| F10-site-21 | grep 第 21 处 | 替换为分类日志或 setError；负向断言：全仓空 catch 数下降且可 grep 报告 |
| F10-site-22 | grep 第 22 处 | 替换为分类日志或 setError；负向断言：全仓空 catch 数下降且可 grep 报告 |
| F10-site-23 | grep 第 23 处 | 替换为分类日志或 setError；负向断言：全仓空 catch 数下降且可 grep 报告 |
| F10-site-24 | grep 第 24 处 | 替换为分类日志或 setError；负向断言：全仓空 catch 数下降且可 grep 报告 |
| F10-site-25 | grep 第 25 处 | 替换为分类日志或 setError；负向断言：全仓空 catch 数下降且可 grep 报告 |
| F10-site-26 | grep 第 26 处 | 替换为分类日志或 setError；负向断言：全仓空 catch 数下降且可 grep 报告 |
| F10-site-27 | grep 第 27 处 | 替换为分类日志或 setError；负向断言：全仓空 catch 数下降且可 grep 报告 |
| F10-site-28 | grep 第 28 处 | 替换为分类日志或 setError；负向断言：全仓空 catch 数下降且可 grep 报告 |
| F10-site-29 | grep 第 29 处 | 替换为分类日志或 setError；负向断言：全仓空 catch 数下降且可 grep 报告 |
| F10-site-30 | grep 第 30 处 | 替换为分类日志或 setError；负向断言：全仓空 catch 数下降且可 grep 报告 |
| F10-site-31 | grep 第 31 处 | 替换为分类日志或 setError；负向断言：全仓空 catch 数下降且可 grep 报告 |
| F10-site-32 | grep 第 32 处 | 替换为分类日志或 setError；负向断言：全仓空 catch 数下降且可 grep 报告 |
| F10-site-33 | grep 第 33 处 | 替换为分类日志或 setError；负向断言：全仓空 catch 数下降且可 grep 报告 |
| F10-site-34 | grep 第 34 处 | 替换为分类日志或 setError；负向断言：全仓空 catch 数下降且可 grep 报告 |
| F10-site-35 | grep 第 35 处 | 替换为分类日志或 setError；负向断言：全仓空 catch 数下降且可 grep 报告 |
| F10-site-36 | grep 第 36 处 | 替换为分类日志或 setError；负向断言：全仓空 catch 数下降且可 grep 报告 |
| F10-site-37 | grep 第 37 处 | 替换为分类日志或 setError；负向断言：全仓空 catch 数下降且可 grep 报告 |
| F10-site-38 | grep 第 38 处 | 替换为分类日志或 setError；负向断言：全仓空 catch 数下降且可 grep 报告 |
| F10-site-39 | grep 第 39 处 | 替换为分类日志或 setError；负向断言：全仓空 catch 数下降且可 grep 报告 |
| F10-site-40 | grep 第 40 处 | 替换为分类日志或 setError；负向断言：全仓空 catch 数下降且可 grep 报告 |
| F10-site-41 | grep 第 41 处 | 替换为分类日志或 setError；负向断言：全仓空 catch 数下降且可 grep 报告 |
| F10-site-42 | grep 第 42 处 | 替换为分类日志或 setError；负向断言：全仓空 catch 数下降且可 grep 报告 |
| F10-site-43 | grep 第 43 处 | 替换为分类日志或 setError；负向断言：全仓空 catch 数下降且可 grep 报告 |

## F11 用户旅程 E2E（30 条）

**价值**：每条端到端剧本=一个商业用户故事的可执行证明  
**执行者**：auto｜**优先级**：P1｜**worktree**：`wt/f11-<r-n>`（族内实例共享分支，逐行勾选）

| task | 旅程 | 验收 |
|---|---|---|
| F11-boot-to-first-light | boot-to-first-light | playwright 脚本（隔离 userData）全绿入库 scripts/e2e-journeys/；纳管 smoke 或夜档 |
| F11-gesture-switch-lights | gesture-switch-lights | playwright 脚本（隔离 userData）全绿入库 scripts/e2e-journeys/；纳管 smoke 或夜档 |
| F11-gesture-brightness | gesture-brightness | playwright 脚本（隔离 userData）全绿入库 scripts/e2e-journeys/；纳管 smoke 或夜档 |
| F11-calibrate-skip-flow | calibrate-skip-flow | playwright 脚本（隔离 userData）全绿入库 scripts/e2e-journeys/；纳管 smoke 或夜档 |
| F11-game-with-vision | game-with-vision | playwright 脚本（隔离 userData）全绿入库 scripts/e2e-journeys/；纳管 smoke 或夜档 |
| F11-game-pause-resume | game-pause-resume | playwright 脚本（隔离 userData）全绿入库 scripts/e2e-journeys/；纳管 smoke 或夜档 |
| F11-audio-record-play | audio-record-play | playwright 脚本（隔离 userData）全绿入库 scripts/e2e-journeys/；纳管 smoke 或夜档 |
| F11-video-capture-annotate | video-capture-annotate | playwright 脚本（隔离 userData）全绿入库 scripts/e2e-journeys/；纳管 smoke 或夜档 |
| F11-ai-chat-roundtrip | ai-chat-roundtrip | playwright 脚本（隔离 userData）全绿入库 scripts/e2e-journeys/；纳管 smoke 或夜档 |
| F11-profile-save-load | profile-save-load | playwright 脚本（隔离 userData）全绿入库 scripts/e2e-journeys/；纳管 smoke 或夜档 |
| F11-overlay-open-close | overlay-open-close | playwright 脚本（隔离 userData）全绿入库 scripts/e2e-journeys/；纳管 smoke 或夜档 |
| F11-multi-monitor-map | multi-monitor-map | playwright 脚本（隔离 userData）全绿入库 scripts/e2e-journeys/；纳管 smoke 或夜档 |
| F11-theme-switch-live | theme-switch-live | playwright 脚本（隔离 userData）全绿入库 scripts/e2e-journeys/；纳管 smoke 或夜档 |
| F11-lang-switch-live | lang-switch-live | playwright 脚本（隔离 userData）全绿入库 scripts/e2e-journeys/；纳管 smoke 或夜档 |
| F11-settings-roundtrip | settings-roundtrip | playwright 脚本（隔离 userData）全绿入库 scripts/e2e-journeys/；纳管 smoke 或夜档 |
| F11-effects-funnel-curate | effects-funnel-curate | playwright 脚本（隔离 userData）全绿入库 scripts/e2e-journeys/；纳管 smoke 或夜档 |
| F11-effects-apply-undo | effects-apply-undo | playwright 脚本（隔离 userData）全绿入库 scripts/e2e-journeys/；纳管 smoke 或夜档 |
| F11-shutdown-timer | shutdown-timer | playwright 脚本（隔离 userData）全绿入库 scripts/e2e-journeys/；纳管 smoke 或夜档 |
| F11-screensaver-cycle | screensaver-cycle | playwright 脚本（隔离 userData）全绿入库 scripts/e2e-journeys/；纳管 smoke 或夜档 |
| F11-diagnose-export | diagnose-export | playwright 脚本（隔离 userData）全绿入库 scripts/e2e-journeys/；纳管 smoke 或夜档 |
| F11-ai8-login-flow | ai8-login-flow | playwright 脚本（隔离 userData）全绿入库 scripts/e2e-journeys/；纳管 smoke 或夜档 |
| F11-snip-hotkey-flow | snip-hotkey-flow | playwright 脚本（隔离 userData）全绿入库 scripts/e2e-journeys/；纳管 smoke 或夜档 |
| F11-model-download-3d | model-download-3d | playwright 脚本（隔离 userData）全绿入库 scripts/e2e-journeys/；纳管 smoke 或夜档 |
| F11-audioviz-project | audioviz-project | playwright 脚本（隔离 userData）全绿入库 scripts/e2e-journeys/；纳管 smoke 或夜档 |
| F11-vision-onboarding | vision-onboarding | playwright 脚本（隔离 userData）全绿入库 scripts/e2e-journeys/；纳管 smoke 或夜档 |
| F11-deep-bench-report | deep-bench-report | playwright 脚本（隔离 userData）全绿入库 scripts/e2e-journeys/；纳管 smoke 或夜档 |
| F11-macro-rebind | macro-rebind | playwright 脚本（隔离 userData）全绿入库 scripts/e2e-journeys/；纳管 smoke 或夜档 |
| F11-radial-navigate-all | radial-navigate-all | playwright 脚本（隔离 userData）全绿入库 scripts/e2e-journeys/；纳管 smoke 或夜档 |
| F11-light-ring-v2 | light-ring-v2 | playwright 脚本（隔离 userData）全绿入库 scripts/e2e-journeys/；纳管 smoke 或夜档 |
| F11-corpus-record-extract | corpus-record-extract | playwright 脚本（隔离 userData）全绿入库 scripts/e2e-journeys/；纳管 smoke 或夜档 |

## F12 模块文档化（12 模块）

**价值**：architecture.md 逐模块对代码核对重写——文档漂移（评审 #1 可信度杀手）系统收口  
**执行者**：auto｜**优先级**：P2｜**worktree**：`wt/f12-<r-n>`（族内实例共享分支，逐行勾选）

| task | 模块 | 验收 |
|---|---|---|
| F12-main-process | main-process | 该模块章节：图（结构/数据流）+表（职责/文件/测试）+ 与代码 ≥5 处引用核对（file:line） |
| F12-preload-bridge | preload-bridge | 该模块章节：图（结构/数据流）+表（职责/文件/测试）+ 与代码 ≥5 处引用核对（file:line） |
| F12-shared-types | shared-types | 该模块章节：图（结构/数据流）+表（职责/文件/测试）+ 与代码 ≥5 处引用核对（file:line） |
| F12-engine-cpu | engine-cpu | 该模块章节：图（结构/数据流）+表（职责/文件/测试）+ 与代码 ≥5 处引用核对（file:line） |
| F12-renderer-shell | renderer-shell | 该模块章节：图（结构/数据流）+表（职责/文件/测试）+ 与代码 ≥5 处引用核对（file:line） |
| F12-vision-host | vision-host | 该模块章节：图（结构/数据流）+表（职责/文件/测试）+ 与代码 ≥5 处引用核对（file:line） |
| F12-vision-engine | vision-engine | 该模块章节：图（结构/数据流）+表（职责/文件/测试）+ 与代码 ≥5 处引用核对（file:line） |
| F12-components-views | components-views | 该模块章节：图（结构/数据流）+表（职责/文件/测试）+ 与代码 ≥5 处引用核对（file:line） |
| F12-gl-3d | gl-3d | 该模块章节：图（结构/数据流）+表（职责/文件/测试）+ 与代码 ≥5 处引用核对（file:line） |
| F12-hooks-domains | hooks-domains | 该模块章节：图（结构/数据流）+表（职责/文件/测试）+ 与代码 ≥5 处引用核对（file:line） |
| F12-i18n-layer | i18n-layer | 该模块章节：图（结构/数据流）+表（职责/文件/测试）+ 与代码 ≥5 处引用核对（file:line） |
| F12-build-release | build-release | 该模块章节：图（结构/数据流）+表（职责/文件/测试）+ 与代码 ≥5 处引用核对（file:line） |

## F13 双主题快照基线矩阵

**价值**：亮色主题目前无基线——12 视图×2 主题=24 份基线，双主题像素回归全覆盖  
**执行者**：auto｜**优先级**：P1｜**worktree**：`wt/f13-<r-n>`（族内实例共享分支，逐行勾选）

| task | 视图 | 主题 | 验收 |
|---|---|---|---|
| F13-dashboard-dark | dashboard | dark | ui-snapshot 增该组合捕获+基线立档；三连跑 0 漂移 |
| F13-dashboard-light | dashboard | light | ui-snapshot 增该组合捕获+基线立档；三连跑 0 漂移 |
| F13-workspace-dark | workspace | dark | ui-snapshot 增该组合捕获+基线立档；三连跑 0 漂移 |
| F13-workspace-light | workspace | light | ui-snapshot 增该组合捕获+基线立档；三连跑 0 漂移 |
| F13-effects-dark | effects | dark | ui-snapshot 增该组合捕获+基线立档；三连跑 0 漂移 |
| F13-effects-light | effects | light | ui-snapshot 增该组合捕获+基线立档；三连跑 0 漂移 |
| F13-video-dark | video | dark | ui-snapshot 增该组合捕获+基线立档；三连跑 0 漂移 |
| F13-video-light | video | light | ui-snapshot 增该组合捕获+基线立档；三连跑 0 漂移 |
| F13-audio-dark | audio | dark | ui-snapshot 增该组合捕获+基线立档；三连跑 0 漂移 |
| F13-audio-light | audio | light | ui-snapshot 增该组合捕获+基线立档；三连跑 0 漂移 |
| F13-games-dark | games | dark | ui-snapshot 增该组合捕获+基线立档；三连跑 0 漂移 |
| F13-games-light | games | light | ui-snapshot 增该组合捕获+基线立档；三连跑 0 漂移 |
| F13-diagnostics-dark | diagnostics | dark | ui-snapshot 增该组合捕获+基线立档；三连跑 0 漂移 |
| F13-diagnostics-light | diagnostics | light | ui-snapshot 增该组合捕获+基线立档；三连跑 0 漂移 |
| F13-architecture-dark | architecture | dark | ui-snapshot 增该组合捕获+基线立档；三连跑 0 漂移 |
| F13-architecture-light | architecture | light | ui-snapshot 增该组合捕获+基线立档；三连跑 0 漂移 |
| F13-ai-dark | ai | dark | ui-snapshot 增该组合捕获+基线立档；三连跑 0 漂移 |
| F13-ai-light | ai | light | ui-snapshot 增该组合捕获+基线立档；三连跑 0 漂移 |
| F13-profiles-dark | profiles | dark | ui-snapshot 增该组合捕获+基线立档；三连跑 0 漂移 |
| F13-profiles-light | profiles | light | ui-snapshot 增该组合捕获+基线立档；三连跑 0 漂移 |
| F13-model3d-dark | model3d | dark | ui-snapshot 增该组合捕获+基线立档；三连跑 0 漂移 |
| F13-model3d-light | model3d | light | ui-snapshot 增该组合捕获+基线立档；三连跑 0 漂移 |
| F13-settings-dark | settings | dark | ui-snapshot 增该组合捕获+基线立档；三连跑 0 漂移 |
| F13-settings-light | settings | light | ui-snapshot 增该组合捕获+基线立档；三连跑 0 漂移 |

## F14 手势×场景映射决策（6×8）

**价值**：每格决策：该手势在此场景是否消费/映射什么/防误触等级——产品语义矩阵（宏系统前修）  
**执行者**：auto+user｜**优先级**：P2｜**worktree**：`wt/f14-<r-n>`（族内实例共享分支，逐行勾选）

| task | 手势 | 场景 | 验收 |
|---|---|---|---|
| F14-dir8-workspace | dir8 | workspace | 决策记录（消费/禁用/映射动作+冷却）入 gestureActions 注册表或显式禁用表；冲突校验绿 |
| F14-dir8-games | dir8 | games | 决策记录（消费/禁用/映射动作+冷却）入 gestureActions 注册表或显式禁用表；冲突校验绿 |
| F14-dir8-effects | dir8 | effects | 决策记录（消费/禁用/映射动作+冷却）入 gestureActions 注册表或显式禁用表；冲突校验绿 |
| F14-dir8-audio | dir8 | audio | 决策记录（消费/禁用/映射动作+冷却）入 gestureActions 注册表或显式禁用表；冲突校验绿 |
| F14-dir8-video | dir8 | video | 决策记录（消费/禁用/映射动作+冷却）入 gestureActions 注册表或显式禁用表；冲突校验绿 |
| F14-dir8-ai | dir8 | ai | 决策记录（消费/禁用/映射动作+冷却）入 gestureActions 注册表或显式禁用表；冲突校验绿 |
| F14-dir8-settings | dir8 | settings | 决策记录（消费/禁用/映射动作+冷却）入 gestureActions 注册表或显式禁用表；冲突校验绿 |
| F14-dir8-overlay | dir8 | overlay | 决策记录（消费/禁用/映射动作+冷却）入 gestureActions 注册表或显式禁用表；冲突校验绿 |
| F14-pinch-workspace | pinch | workspace | 决策记录（消费/禁用/映射动作+冷却）入 gestureActions 注册表或显式禁用表；冲突校验绿 |
| F14-pinch-games | pinch | games | 决策记录（消费/禁用/映射动作+冷却）入 gestureActions 注册表或显式禁用表；冲突校验绿 |
| F14-pinch-effects | pinch | effects | 决策记录（消费/禁用/映射动作+冷却）入 gestureActions 注册表或显式禁用表；冲突校验绿 |
| F14-pinch-audio | pinch | audio | 决策记录（消费/禁用/映射动作+冷却）入 gestureActions 注册表或显式禁用表；冲突校验绿 |
| F14-pinch-video | pinch | video | 决策记录（消费/禁用/映射动作+冷却）入 gestureActions 注册表或显式禁用表；冲突校验绿 |
| F14-pinch-ai | pinch | ai | 决策记录（消费/禁用/映射动作+冷却）入 gestureActions 注册表或显式禁用表；冲突校验绿 |
| F14-pinch-settings | pinch | settings | 决策记录（消费/禁用/映射动作+冷却）入 gestureActions 注册表或显式禁用表；冲突校验绿 |
| F14-pinch-overlay | pinch | overlay | 决策记录（消费/禁用/映射动作+冷却）入 gestureActions 注册表或显式禁用表；冲突校验绿 |
| F14-palm-workspace | palm | workspace | 决策记录（消费/禁用/映射动作+冷却）入 gestureActions 注册表或显式禁用表；冲突校验绿 |
| F14-palm-games | palm | games | 决策记录（消费/禁用/映射动作+冷却）入 gestureActions 注册表或显式禁用表；冲突校验绿 |
| F14-palm-effects | palm | effects | 决策记录（消费/禁用/映射动作+冷却）入 gestureActions 注册表或显式禁用表；冲突校验绿 |
| F14-palm-audio | palm | audio | 决策记录（消费/禁用/映射动作+冷却）入 gestureActions 注册表或显式禁用表；冲突校验绿 |
| F14-palm-video | palm | video | 决策记录（消费/禁用/映射动作+冷却）入 gestureActions 注册表或显式禁用表；冲突校验绿 |
| F14-palm-ai | palm | ai | 决策记录（消费/禁用/映射动作+冷却）入 gestureActions 注册表或显式禁用表；冲突校验绿 |
| F14-palm-settings | palm | settings | 决策记录（消费/禁用/映射动作+冷却）入 gestureActions 注册表或显式禁用表；冲突校验绿 |
| F14-palm-overlay | palm | overlay | 决策记录（消费/禁用/映射动作+冷却）入 gestureActions 注册表或显式禁用表；冲突校验绿 |
| F14-chord-menu-workspace | chord-menu | workspace | 决策记录（消费/禁用/映射动作+冷却）入 gestureActions 注册表或显式禁用表；冲突校验绿 |
| F14-chord-menu-games | chord-menu | games | 决策记录（消费/禁用/映射动作+冷却）入 gestureActions 注册表或显式禁用表；冲突校验绿 |
| F14-chord-menu-effects | chord-menu | effects | 决策记录（消费/禁用/映射动作+冷却）入 gestureActions 注册表或显式禁用表；冲突校验绿 |
| F14-chord-menu-audio | chord-menu | audio | 决策记录（消费/禁用/映射动作+冷却）入 gestureActions 注册表或显式禁用表；冲突校验绿 |
| F14-chord-menu-video | chord-menu | video | 决策记录（消费/禁用/映射动作+冷却）入 gestureActions 注册表或显式禁用表；冲突校验绿 |
| F14-chord-menu-ai | chord-menu | ai | 决策记录（消费/禁用/映射动作+冷却）入 gestureActions 注册表或显式禁用表；冲突校验绿 |
| F14-chord-menu-settings | chord-menu | settings | 决策记录（消费/禁用/映射动作+冷却）入 gestureActions 注册表或显式禁用表；冲突校验绿 |
| F14-chord-menu-overlay | chord-menu | overlay | 决策记录（消费/禁用/映射动作+冷却）入 gestureActions 注册表或显式禁用表；冲突校验绿 |
| F14-chord-light-workspace | chord-light | workspace | 决策记录（消费/禁用/映射动作+冷却）入 gestureActions 注册表或显式禁用表；冲突校验绿 |
| F14-chord-light-games | chord-light | games | 决策记录（消费/禁用/映射动作+冷却）入 gestureActions 注册表或显式禁用表；冲突校验绿 |
| F14-chord-light-effects | chord-light | effects | 决策记录（消费/禁用/映射动作+冷却）入 gestureActions 注册表或显式禁用表；冲突校验绿 |
| F14-chord-light-audio | chord-light | audio | 决策记录（消费/禁用/映射动作+冷却）入 gestureActions 注册表或显式禁用表；冲突校验绿 |
| F14-chord-light-video | chord-light | video | 决策记录（消费/禁用/映射动作+冷却）入 gestureActions 注册表或显式禁用表；冲突校验绿 |
| F14-chord-light-ai | chord-light | ai | 决策记录（消费/禁用/映射动作+冷却）入 gestureActions 注册表或显式禁用表；冲突校验绿 |
| F14-chord-light-settings | chord-light | settings | 决策记录（消费/禁用/映射动作+冷却）入 gestureActions 注册表或显式禁用表；冲突校验绿 |
| F14-chord-light-overlay | chord-light | overlay | 决策记录（消费/禁用/映射动作+冷却）入 gestureActions 注册表或显式禁用表；冲突校验绿 |
| F14-double-pinch-workspace | double-pinch | workspace | 决策记录（消费/禁用/映射动作+冷却）入 gestureActions 注册表或显式禁用表；冲突校验绿 |
| F14-double-pinch-games | double-pinch | games | 决策记录（消费/禁用/映射动作+冷却）入 gestureActions 注册表或显式禁用表；冲突校验绿 |
| F14-double-pinch-effects | double-pinch | effects | 决策记录（消费/禁用/映射动作+冷却）入 gestureActions 注册表或显式禁用表；冲突校验绿 |
| F14-double-pinch-audio | double-pinch | audio | 决策记录（消费/禁用/映射动作+冷却）入 gestureActions 注册表或显式禁用表；冲突校验绿 |
| F14-double-pinch-video | double-pinch | video | 决策记录（消费/禁用/映射动作+冷却）入 gestureActions 注册表或显式禁用表；冲突校验绿 |
| F14-double-pinch-ai | double-pinch | ai | 决策记录（消费/禁用/映射动作+冷却）入 gestureActions 注册表或显式禁用表；冲突校验绿 |
| F14-double-pinch-settings | double-pinch | settings | 决策记录（消费/禁用/映射动作+冷却）入 gestureActions 注册表或显式禁用表；冲突校验绿 |
| F14-double-pinch-overlay | double-pinch | overlay | 决策记录（消费/禁用/映射动作+冷却）入 gestureActions 注册表或显式禁用表；冲突校验绿 |

## F15 性能预算格（12 视图×3 指标）

**价值**：每视图量：空闲 fps/30min 内存/关键动作延迟——商业性能承诺的数字底座  
**执行者**：auto｜**优先级**：P2｜**worktree**：`wt/f15-<r-n>`（族内实例共享分支，逐行勾选）

| task | 视图 | 指标 | 验收 |
|---|---|---|---|
| F15-dashboard-fps-idle | dashboard | fps-idle | 空闲 60s 平均 ≥55fps（CDP metrics）；数字入性能台账 docs/PERF-LEDGER.md |
| F15-dashboard-mem-30min | dashboard | mem-30min | 30min heap 增长 <20MB；数字入性能台账 docs/PERF-LEDGER.md |
| F15-dashboard-action-latency | dashboard | action-latency | 主操作（切换/应用/打开）p95 <150ms；数字入性能台账 docs/PERF-LEDGER.md |
| F15-workspace-fps-idle | workspace | fps-idle | 空闲 60s 平均 ≥55fps（CDP metrics）；数字入性能台账 docs/PERF-LEDGER.md |
| F15-workspace-mem-30min | workspace | mem-30min | 30min heap 增长 <20MB；数字入性能台账 docs/PERF-LEDGER.md |
| F15-workspace-action-latency | workspace | action-latency | 主操作（切换/应用/打开）p95 <150ms；数字入性能台账 docs/PERF-LEDGER.md |
| F15-effects-fps-idle | effects | fps-idle | 空闲 60s 平均 ≥55fps（CDP metrics）；数字入性能台账 docs/PERF-LEDGER.md |
| F15-effects-mem-30min | effects | mem-30min | 30min heap 增长 <20MB；数字入性能台账 docs/PERF-LEDGER.md |
| F15-effects-action-latency | effects | action-latency | 主操作（切换/应用/打开）p95 <150ms；数字入性能台账 docs/PERF-LEDGER.md |
| F15-video-fps-idle | video | fps-idle | 空闲 60s 平均 ≥55fps（CDP metrics）；数字入性能台账 docs/PERF-LEDGER.md |
| F15-video-mem-30min | video | mem-30min | 30min heap 增长 <20MB；数字入性能台账 docs/PERF-LEDGER.md |
| F15-video-action-latency | video | action-latency | 主操作（切换/应用/打开）p95 <150ms；数字入性能台账 docs/PERF-LEDGER.md |
| F15-audio-fps-idle | audio | fps-idle | 空闲 60s 平均 ≥55fps（CDP metrics）；数字入性能台账 docs/PERF-LEDGER.md |
| F15-audio-mem-30min | audio | mem-30min | 30min heap 增长 <20MB；数字入性能台账 docs/PERF-LEDGER.md |
| F15-audio-action-latency | audio | action-latency | 主操作（切换/应用/打开）p95 <150ms；数字入性能台账 docs/PERF-LEDGER.md |
| F15-games-fps-idle | games | fps-idle | 空闲 60s 平均 ≥55fps（CDP metrics）；数字入性能台账 docs/PERF-LEDGER.md |
| F15-games-mem-30min | games | mem-30min | 30min heap 增长 <20MB；数字入性能台账 docs/PERF-LEDGER.md |
| F15-games-action-latency | games | action-latency | 主操作（切换/应用/打开）p95 <150ms；数字入性能台账 docs/PERF-LEDGER.md |
| F15-diagnostics-fps-idle | diagnostics | fps-idle | 空闲 60s 平均 ≥55fps（CDP metrics）；数字入性能台账 docs/PERF-LEDGER.md |
| F15-diagnostics-mem-30min | diagnostics | mem-30min | 30min heap 增长 <20MB；数字入性能台账 docs/PERF-LEDGER.md |
| F15-diagnostics-action-latency | diagnostics | action-latency | 主操作（切换/应用/打开）p95 <150ms；数字入性能台账 docs/PERF-LEDGER.md |
| F15-architecture-fps-idle | architecture | fps-idle | 空闲 60s 平均 ≥55fps（CDP metrics）；数字入性能台账 docs/PERF-LEDGER.md |
| F15-architecture-mem-30min | architecture | mem-30min | 30min heap 增长 <20MB；数字入性能台账 docs/PERF-LEDGER.md |
| F15-architecture-action-latency | architecture | action-latency | 主操作（切换/应用/打开）p95 <150ms；数字入性能台账 docs/PERF-LEDGER.md |
| F15-ai-fps-idle | ai | fps-idle | 空闲 60s 平均 ≥55fps（CDP metrics）；数字入性能台账 docs/PERF-LEDGER.md |
| F15-ai-mem-30min | ai | mem-30min | 30min heap 增长 <20MB；数字入性能台账 docs/PERF-LEDGER.md |
| F15-ai-action-latency | ai | action-latency | 主操作（切换/应用/打开）p95 <150ms；数字入性能台账 docs/PERF-LEDGER.md |
| F15-profiles-fps-idle | profiles | fps-idle | 空闲 60s 平均 ≥55fps（CDP metrics）；数字入性能台账 docs/PERF-LEDGER.md |
| F15-profiles-mem-30min | profiles | mem-30min | 30min heap 增长 <20MB；数字入性能台账 docs/PERF-LEDGER.md |
| F15-profiles-action-latency | profiles | action-latency | 主操作（切换/应用/打开）p95 <150ms；数字入性能台账 docs/PERF-LEDGER.md |
| F15-model3d-fps-idle | model3d | fps-idle | 空闲 60s 平均 ≥55fps（CDP metrics）；数字入性能台账 docs/PERF-LEDGER.md |
| F15-model3d-mem-30min | model3d | mem-30min | 30min heap 增长 <20MB；数字入性能台账 docs/PERF-LEDGER.md |
| F15-model3d-action-latency | model3d | action-latency | 主操作（切换/应用/打开）p95 <150ms；数字入性能台账 docs/PERF-LEDGER.md |
| F15-settings-fps-idle | settings | fps-idle | 空闲 60s 平均 ≥55fps（CDP metrics）；数字入性能台账 docs/PERF-LEDGER.md |
| F15-settings-mem-30min | settings | mem-30min | 30min heap 增长 <20MB；数字入性能台账 docs/PERF-LEDGER.md |
| F15-settings-action-latency | settings | action-latency | 主操作（切换/应用/打开）p95 <150ms；数字入性能台账 docs/PERF-LEDGER.md |

