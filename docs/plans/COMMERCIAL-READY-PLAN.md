# 体感/手势商业就绪 — 真实价值任务计划（worktree 并行执行版）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development（每任务一个子代理，按 Wave 用 worktree 并行）。步骤用 `- [ ]` 跟踪。
>
> **执行层扩展（100×）**：本计划的 22 个旗舰任务是脊柱；`docs/plans/TASK-UNIVERSE.md`（生成器 `scripts/generate-task-universe.mjs`）以 15 个任务族 × 代码库真实维度（55 效果/12 视图/1706 i18n 键/137 IPC 通道/6 手势/21 landmark/22 协议消息/43 吞错点）系统枚举出 **2401 个实例**，每实例带参数化验收+优先级。族=worktree+R-N（R254-R268 预分配），实例=族分支内独立验收的勾选行。执行顺序：22 旗舰按 Wave → 族按 P0(F1/F2/F10)→P1→P2。

**Goal:** 22 个真实价值任务，5 个并行 Wave，把体感/手势从「引擎可用」推到「商业就绪」。每个任务 = 独立 R-N + 独立 worktree 分支 + 文件所有权互斥 + 独立验收。

**Architecture:** 既有架构演进（R227-R231 已完成止血/引用计数/灯效环 v1/失败路径/词汇收敛）。Wave 内任务文件互斥可并行；Wave 间按依赖串行合并。

## Global Constraints

- R-N 工作流：每任务独立 R-N（R232-R253 预分配），PRD 先条款后实施，提交 `[PRD-0002] <type>: <subject>`
- **Worktree 纪律**：每任务分支 `wt/<r-id>-<slug>`；任务表「文件所有权」列互斥（同 Wave 内零交集）；合并序按 Wave；合并前跑全量+快照
- 纯视觉手势 / 不做 OS 注入 / USER_VOCAB ≤6 词（hostProtocol.js 权威表）
- 每任务 TDD（失败测试先行）；测试走 yarn scripts；UI 改动真机截图 + AI 目视复核；测试基线 162 files/1533 递增不回归
- 已完成不重复：R227-R231（止血包/引用计数/灯效环 v1/error 可见/acquire 透传/死键清理）

---

## 任务总表（22 任务 × 5 Wave）

| Wave | # | R-N | 任务 | 独立价值（砍掉会怎样） | 文件所有权（互斥键） | 规模 |
|---|---|---|---|---|---|---|
| **1** | T1 | R232 | 真实语料采集+入库（用户侧协议执行） | 准确率永远口说无凭，商业判定无数据底座 | `testdata/**`、`tests/vision/fixtures-replay/**`（只增数据） | 用户+半自动 |
| 1 | T2 | R233 | 快照门禁 workspace 活动区遮罩 | CI 唯一红着，挡全部视觉验收 | `scripts/ui-snapshot.mjs` | S |
| 1 | T3 | R234 | 宿主编排抽 hostMessenger+单测+覆盖率纳入 | 200 行胶水 0 测试，改必炸 | `visionHostMain.js`、新 `vision/hostMessenger.js`、`tests/vision/hostSession.test.mjs`、`vitest.config.ts` | S-M |
| 1 | T4 | R235 | 引擎 i18n 化（360 汉字出引擎） | en 用户横幅见中文=上架即差评 | `vision/session.js`、`vision/pipeline.js`、`i18n/index.tsx`、`useVisionInput.ts`(label 路径)、`MiniGamesView.tsx`(suffix 判定)、`VisionBanner.tsx` | M |
| 1 | T5 | R236 | 合规包（origin 门禁+ai8 partition 拒权+隐私声明+签名评估） | 商店上架硬门槛 | `main/index.ts`、`SettingsView.tsx`、`docs/PRIVACY.md`、新 `docs/RELEASE-SIGNING.md`、`README.md` | S-M |
| **2** | T6 | R237 | 摄像头故障全恢复（看门狗+设备变更+错误分类+恢复 CTA） | 拔线/被占=静默死，「变砖」体验 | `vision/hostMessenger.js`(S1 合并后)、`hooks/useVisionInput.ts`、新 `domain/visionErrors.ts`、`VisionBanner.tsx`(错误卡)、`MiniGamesView.tsx`(错误行) | M |
| 2 | T7 | R238 | 宿主崩溃/挂死自愈（render-process-gone+心跳 watchdog+一次自动重启） | 宿主崩=功能永久消失直到重启 app | `main/index.ts`(visionHost 区)、`vision/hostMessenger.js`(心跳)、`hostProtocol.js/.d.ts`(HOST_GONE)、`useVisionInput.ts`(重试) | M |
| 2 | T8 | R239 | 遥测闭环（camFps 复活+宽容校准反馈上屏） | envCoach/校准教练全空转，R134/R141 承诺死文案 | `visionHostMain.js`(startCamera getSettings)、`useVisionInput.ts`(status 透出)、`MiniGamesView.tsx`、`AiLabVisionTab.tsx`(chip) | S |
| 2 | T9 | R240 | 推理预算治理（pause 降频+face 推理跳过） | 暂停仍 60Hz 烧 CPU、每 3 帧白跑 face | `vision/hostMessenger.js`(cap)、`useVisionInput.ts`(init cfg faceModel:null) | S |
| **3** | T10 | R241 | 首用向导 funnel（环境自检→校准→三手势教学→灯效首任务，≤3 分钟） | 新用户第一次就用不明白=玩具判定的直接来源 | 新 `components/vision/VisionOnboarding.tsx`、`VisionAssistant.tsx`(挂载)、`SettingsView.tsx`(重看入口)、`i18n`、`styles/app.css` | M |
| 3 | T11 | R242 | 灯效环 v2（亮度连续调节+张掌定格+双捏撤销+防误触三闸） | v1 只能切不能调，控灯价值打折 | 新 `hooks/domains/useGestureLightingDomain.ts`、`VisionLightControl.tsx`、`App.tsx`(回调扩展) | M |
| 3 | T12 | R243 | 深度体检+混淆矩阵门禁（合成变体矩阵门禁+引导式真机报告+事件环形日志） | 准确率可度量可回归锁（真机证据机器） | 新 `domain/visionBench.ts`、`tests/vision/confusion.test.mjs`、`AiLabVisionTab.tsx`(深度模式)、新 `scripts/vision-soak` 骨架除外 | M |
| 3 | T13 | R244 | 径向菜单数据驱动+效果页签（12 视图修全+与灯效环共享数据源） | 硬编码过时、双菜单割裂 | `VisionAssistant.tsx`(MENU_SLOTS)、`components/shellModules.ts` | S |
| **4** | T14 | R245 | 会话管理器+手势原语进引擎（06-R3/R4 合一：订阅路由+doublePinch/palmHold/fistClutch 内建） | 第 4 个消费方接入仍要复制胶水；客户端 8 处复刻语义漂移 | 新 `hooks/vision/useVisionSession.ts`、`vision/pipeline.js`(原语)、`AiLabVisionTab.tsx`(CAPS match 改订阅)、`useVisionInput.ts`(适配层) | M |
| 4 | T15 | R246 | 30min soak 长跑门禁 | 稳定性无背书（内存泄漏/漂移/卡键不设防） | 新 `scripts/vision-soak.mjs`、`package.json`(scripts，R246 条款授权) | S |
| 4 | T16 | R247 | 视觉设置系统级迁移（6 键→system.json+设置页体感组） | 设置不可备份；快照污染源 | `shared/systemSettings` 区、`useVisionInput.ts`、`VisionAssistant.tsx`、`SettingsView.tsx` | S-M |
| **5** | T17 | R248 | 手势宏映射表（动作注册表+3 预设+自定义+冲突校验） | 平台化扩展面（演示翻页/音乐派对） | 新 `domain/gestureActions.ts`、`SettingsView.tsx`(映射表)、`VisionLightControl.tsx`(经注册表) | M |
| 5 | T18 | R249 | 词汇卡+没手四态+横幅降噪（用户可见反馈三合一） | 6 词学习面零教学；状态语义混乱 | 新 `components/vision/VisionVocabCard.tsx`、`VisionBanner.tsx`、`MiniGamesView.tsx`(hub 入口+四态)、`i18n` | S-M |
| 5 | T19 | R250 | 延迟达标批（抬键快路径+默认档定标——等 T1 数据） | 离散指令 2-3× 超商业线 | `vision/gesture_engine.js`、`useVisionInput.ts`(默认档) | S |
| 5 | T20 | R251 | 引擎 TS 化首批（one_euro/latency/synthetic 三文件） | 类型边界收敛（06-R9 启动） | `vision/one_euro.*`、`vision/latency.*`、`vision/synthetic.*` | S |
| 5 | T21 | R252 | 覆盖债机械批（hooks/domains+VisionPad+useEngineLoop 阈值上调） | 覆盖红线逐层失守 | `tests/renderer/hooks/**`、`tests/renderer/components/VisionPad.test.tsx` 等（纯测试新增） | M |
| 5 | T22 | R253 | 仓库卫生批（文档漂移 10 处核对+PRD 承诺抽验 5 条+走查脚本隔离化+README/产品页视觉条目） | 工程可信度（评审 Top5 差距⑤） | `docs/**`、`scripts/r224*.mjs`、`scripts/r225*.mjs`、`README.md`、`docs/index.html` | S |

**剔除记录（诚实账）**：A1-A12→并入 T1 清单；任务 7/8→并入 T2 步骤；S10-S14→并入 T6/T14 的审计步骤；L4/L5/L8 等微优化→**Backlog**（等 T15 soak 数据证明值得做）；X14-X17→并入 T18 视觉打磨或 Backlog；V11 无障碍评估→并入 T22 文档批；V6 README→T22。

---

## 并行执行模型（worktree 多子代理）

```
Wave 1（4 自动任务并行 + T1 用户侧同步跑）
  T2(scripts/ui-snapshot) ∥ T3(hostMessenger) ∥ T4(引擎 i18n) ∥ T5(合规)
  —— 四组文件零交集；各自 worktree 分支 wt/r23x-*，各自全量绿后按序合并
Wave 2（T3/T4 合并后开波）：T6 ∥ T7 ∥ T8 ∥ T9（T6/T8 都碰 useVisionInput？
  → T6 先行合并，T8 基于其上（同文件顺序敏感）；实际并行度 T6∥T7 + T8∥T9 两组）
Wave 3：T10 ∥ T11 ∥ T12 ∥ T13（互斥：Onboarding/灯效域/AiLab 深检/Assistant 菜单）
Wave 4：T14 ∥ T15 ∥ T16
Wave 5：T17-T22 六任务中 T17∥T18∥T20∥T21 并行，T19 依赖 T1 数据
```

**每任务子代理执行模板**（统一授命）：
1. `git worktree` 建分支 → 2. PRD 追加 R-N 条款（⏳）→ 3. TDD 实现（失败测试先行）→ 4. 全量 `yarn test`+typecheck 绿 → 5. UI 项真机截图复核 → 6. PRD ✅ 附证据 → 7. commit → 8. 主会话审读 diff 后合并主干 → 9. 下一 Wave 基于新主干重建 worktree。

**冲突规则**：同 Wave 文件所有权表互斥；谁先合并谁赢，后合并者 rebase 解冲突重跑全量；`i18n/index.tsx` 与 `styles/app.css` 是热点——Wave 内最多一个任务碰（表中已错开）。

## 每任务验收（浓缩，实施时展开为步骤）

- **T1**: `yarn vision:corpus` 31/31 + 精选夹具入库 CI 绿
- **T2**: workspace 连续三跑 ≤0.1%、其余 8 视图 0.0000%
- **T3**: hostSession 单测（重复 init ready/最后离开者关/switch 异常不断流）+ coverage include vision 层 + 阈值定档
- **T4**: en 态全 UI 无中文直出（zh 值零变化的兼容锁）；22 处文案清单入 PRD
- **T5**: origin 白名单单测 + ai8 走查拒绝摄像头 + PRIVACY.md 入库
- **T6**: 六类错误分类单测 + 拔线/占用真机走查错误卡+CTA 可恢复
- **T7**: 崩溃注入（process.crash）自动重启一次 + 心跳超时单测
- **T8**: FakeHost 全链 stats.cam/status 到达 UI 断言 + envCoach low-fps 可触发
- **T9**: pause 帧率 ≤10fps 断言 + face.n=0 + 前后 CPU 对照记录
- **T10**: 合成 E2E 全流程 ≤180s + 四步截图 AI 复核 + 漏斗计数落盘
- **T11**: 域 hook 单测（600ms 长按/冷却/撤销）+ E2E 亮度连续变化断言
- **T12**: 变体矩阵门禁秒级绿（对角 ≥98%/正交 <1%）+ 深度体检报告合成驱动出片
- **T13**: 12 视图数据驱动断言（MODULE_VIEWS 长度=slots）+ 导航 E2E
- **T14**: 三入口零改动回归 + 引擎原语 4 组单测 + 客户端复刻删除 diff 计数
- **T15**: soak 夜档全断言绿（fps 降幅<10%/heap<20MB/无卡键/退出释放）
- **T16**: 坏样本往返单测 + 旧键迁移 shim 用例 + 快照重立
- **T17**: 映射往返+冲突校验单测 + E2E 改映射即生效
- **T18**: 词汇卡=USER_VOCAB.length 断言 + 四态纯函数 + 横幅 3s 折叠截图
- **T19**: 释放延迟 <50ms 阶跃基准 + 三档定标决策表（基于 T1 语料）入 PRD
- **T20**: 三文件迁移各一 commit，全量绿
- **T21**: 四层覆盖新阈值全绿（layerActions 60%/profileManager 50%/VisionPad 60%/useEngineLoop 40%）
- **T22**: 漂移清单 10 处修正 + 抽验记录 + 脚本隔离验证 + README/产品页段落

## Backlog（有证据才立项）

微优化（elementFromPoint 节流/stats 克隆节流/和弦冷却——等 T15 数据）；P2/P3 视觉打磨（图标/浮囊拖动/疲劳提示/和弦中文）；无障碍实施（评估后）；引擎 TS 化存量后半；手势宏预设模板扩展。

## Verification（终局）

`yarn verify:release` 全链绿 + corpus 31/31 + soak 夜档绿 + 商业化 9 维复评 ≥4.0/5（对照 REVIEW-VISION 原始 2.2/5，报告入库）。
