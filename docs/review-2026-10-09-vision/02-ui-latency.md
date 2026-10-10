# RGBBox 体感/手势管线延迟与 UI 卡顿审查报告（2026-10-09）

审查人角色：UI 性能工程师。范围：`src/renderer/src/vision/`、`src/renderer/src/components/vision/`、`src/renderer/src/hooks/useVisionInput.ts`、`src/renderer/src/visionHostMain.js`、`src/main/index.ts`（宿主窗）、`AiLabVisionTab.tsx`、`MiniGamesView.tsx` 接线，及 PRD R131/R132/R133/R134/R135/R136/R137/R138/R141/R142/R143/R144/R149/R153 条款核对。仓库只读；量化实验在 `%TEMP%\rgbbox-review-20261009\`（bench.mjs / bench2.mjs / bench3.mjs / debug-chord.mjs，node v23.11.1 直接 import 仓库纯逻辑模块）。

---

## 一、摘要：离商业级延迟还差多少、差在哪

**结论：连续量（光标/模拟量轴）已接近商业体感线（~50-90ms，有真实预测渲染兜底）；离散指令（方向键/捏合/和弦）在默认档位下端到端约 195-300ms，是商业目标（挥手操作 ≤80-100ms）的 2-3 倍；且全管线没有任何一条真实遥测能告诉用户/开发者"慢在哪"（采集遥测在宿主架构里断链成死数据）。**

Top 延迟根因排名：

1. **[Confirmed] 离散手势的算法性确认延迟是第一大项**：默认灵敏度 standard=confirmMs 90ms 叠加 OneEuro 从静止起步 67ms 滤波滞后，实测方向指令算法延迟 167ms@30Hz（见实测 B 节）——还没算摄像头采集 33ms + 推理 10-45ms。默认档位在物理上不可能达到 100ms。sport 档（confirmMs=0）@60Hz 可到 50ms 算法延迟，是唯一达标路径，但**不是默认值**，且档位按钮藏在游戏顶栏。
2. **[Confirmed] 遥测断链——「看得见的低延迟」名不副实**：`pipeline.stats()` 不含 `acquire`/`cam`（`pipeline.js:207-217`），而 VisionPad/VisionBanner/AiLabVisionTab 全在读这两个字段（`VisionPad.tsx:140-145`、`VisionBanner.tsx:31-37`、`AiLabVisionTab.tsx:420-421`）。宿主里算好的 `pipeline.acquireStats`（`visionHostMain.js:103-109`）没有任何消费方；宿主 `startCamera` 也从不回读 `track.getSettings()`。后果：方向盘第三行「采集 p95 · WxH@fps」永远空白、R141-B 环境教练（暗光/低帧率/距离建议）永远不触发（`envCoach.ts:28` 的 samples<45 门恒真）、**「要 60 给 30」的摄像头永远无法被发现**——这直接威胁 R142-E1「60fps 采集」的兑现可信度。
3. **[Confirmed] 30fps 摄像头下整条链的采样底座就是 33ms**：init 请求 640×480@60（`useVisionInput.ts:200`），但协商结果不可见；大多数笔记本摄像头 640×480 在 YUY2 下 30fps 封顶（MJPG 才有 60）。60fps 宣称 = 「请求了」，不是「拿到了」。
4. **[Confirmed] 助手场景白白拖脸模型**：hook 无条件传 `faceModel` + `faceEveryN:3`（`useVisionInput.ts:195,207`），每 3 帧一次 face detectForVideo（R135 实测 GPU ~34.6ms@640）把宿主单帧耗时从 ~10-15ms 抬到 ~45-60ms，拉低有效推理帧率；而助手/径向菜单/和弦文本**不消费任何表情事件**。游戏侧表情键（e/shift/enter）透传就绪但无技能映射（PRD R135 自述）。
5. **[Confirmed] 方向释放同样吃 confirmMs**：手回中→按键抬起实测 133ms@30Hz（candidate→null 也要过确认窗），「松方向」手感拖泥带水，这是"不跟手"体感的另一半。
6. **[Likely] CPU delegate 回退后体验崩塌但无告警**：CPU 路径单帧 60-120ms（R132 实测 20-40ms×3 次推理的历史数据），有效推理率掉到 ~10-16Hz；`lowFps` 判定阈值 18fps 只在死掉的 vision_input.js 里存在（`vision_input.js:282`），宿主管线没有等价告警。

---

## 二、方法与证据来源

- 逐文件通读上述全部源码（版本 = 当前分支 `review/vision-gesture-commercial` HEAD 539115a）。
- 微基准：node 直接 import `vision/` 纯逻辑模块 + `synthetic.js` 合成帧，测单调用成本与阶跃响应（30/60Hz 两种采样率、90/45/0 三档 confirmMs）。脚本与输出在 `%TEMP%\rgbbox-review-20261009\`。
- PRD 条款核对：R131-R153 原文（尤其 R136「看得见的低延迟」承诺、R142 五杠杆与验收声明、R143 预测插值）。
- 未启动 electron（约束），真机摄像头链路的绝对毫秒数以代码结构 + PRD 内嵌历史实测（R132/R134/R135）推导，均标"估计"。

---

## 三、发现清单（U-1…）

### U-1 [Confirmed] 采集遥测断链：acquire/cam 生产者已死，三个消费者全在读空
- 位置：生产侧缺失 `src/renderer/src/vision/pipeline.js:207-217`（`stats()` 只含 infer/hand/face/inferFps/delegate，`fps:0`）；计算后被丢弃 `src/renderer/src/visionHostMain.js:103-109`（`pipeline.acquireStats` 赋值后无人读）；协商值回读在宿主路径根本不存在（`visionHostMain.js:84-91` 无 `getSettings`）。消费侧：`VisionPad.tsx:140-145`（pad 第三行）、`VisionBanner.tsx:31-37` + `envCoach.ts:27-33`（环境教练恒 null）、`AiLabVisionTab.tsx:420-421`（体检台统计行）。
- 触发条件：任何真机摄像头会话（合成源无 rVFC meta 也一样空）。
- 后果：①「60fps 采集」无法自证；②暗光（曝光拉长）与「被别的应用占了摄像头只有 15fps」用户完全看不到原因，只能感知"卡"；③R141-B/R144 的环境教练功能实际未上线。
- 修复草案：宿主 `startCamera` 回读 `track.getSettings()` 存 `pipeline.camSettings`；`emit()` 时 `pipeline.stats({ acquire: this.acquireStats, cam: this.camSettings })`（stats(extra) 已支持透传，`pipeline.js:215`）。工作量 **S**（~15 行）。
- 预期收益：低帧率/暗光场景从「玄学卡」变成可诊断；R142-E1 宣称可被用户亲手验证。

### U-2 [Confirmed] 离散手势默认档延迟超标：算法层实测 167ms@30Hz（standard）
- 位置：`gesture_engine.js:88`（confirmMs 默认 90）、`gesture_engine.js:104`（OneEuro minCutoff 2.5/beta 0.5——从静止起步 50% 要 67ms、90% 要 167ms，实测 C 节）、档位默认 `useVisionInput.ts:30-37`（readSensitivity 回落 'standard'）。
- 实测（B 节）：方向阶跃→首个方向键 @30Hz：standard 167ms / fast 133ms / sport 67ms；@60Hz：133/83/50ms。释放→抬键 @30Hz standard 133ms。
- 后果：默认体验端到端 ≈ 195-230ms（+采集 33 + 推理 10-45 + 传输 ~2 + rAF 0-16）。对比商业目标 80-100ms 差 2 倍+。用户"延迟严重"的历史否定（R136）在默认档位下**并没有被结构性解决**，只是被 sport 档给了个出路。
- 修复草案：①默认档改 fast（45ms）或在首次校准完成后按实测推理 p95 自动推荐档位；②release 路径（want→null）免 confirm 或用半窗（快松快抬是体感底线，工业手柄 D-pad 无释放去抖）；③OneEuro beta 从 0.5 提到 ≥1.0（快速起步段截止频率翻倍，静止段不变）。工作量 **S-M**。
- 预期收益：standard 等效降到 ~90-110ms@30Hz、~70ms@60Hz；释放跟手。

### U-3 [Confirmed] 助手/AI 实验室路径白付 face 推理成本
- 位置：`useVisionInput.ts:195`（faceModel URL 恒发）、`:207`（faceEveryN:3 恒发）；`visionHostMain.js:46-52,61`（照单加载+推理）。助手消费面只有 chord/pinch/direction（`VisionAssistant.tsx:77-109`），表情零消费。
- 频率/成本：每 3 帧一次 face detectForVideo，GPU ~34.6ms（PRD R135 实测@640），摊薄 ≈ +11.5ms/帧均值、p95 帧 +35-50ms。60Hz 预算 16.7ms 被打穿 → 有效推理率被拉低到 ~25-40Hz。
- 修复草案：init cfg 增 `faceEnabled`（assistant/AiLab 默认 false；games 保留 true——表情键透传链路在），或 faceEveryN 提到 6+ 并把 adaptFaceRate 上限从 3 放开。工作量 **S**。
- 预期收益：p95 单帧推理 -30-45ms，有效推理率回到 50-60Hz（GPU）。

### U-4 [Confirmed] 每帧 5 次 LatencyMeter.stats()（每次对 300 样本全量排序）
- 位置：`pipeline.js:159`（adaptFaceRate 内 `this.inferMeter.stats().n>60 ? this.inferMeter.stats().p95 : 0`——一行两次）；`visionHostMain.js:70`（emit 每 processed frame 调 `pipeline.stats()` → 内部 3 次 stats）。实测 stats()=91.2us/次 → 每帧 ~0.46ms 纯排序，占宿主除 detectForVideo 外每帧 CPU 的 ~70%（processFrame 全量 187us 中 ~180us 也是这来源，见实测 A 节）。`vision_input.js:239` 同款（死路径）。
- 后果：60Hz 下 ~2.7% 单核纯浪费；绝对值小但属于白送的优化。
- 修复草案：LatencyMeter 增量维护（push 时插入排序数组）或 stats() 结果 250ms 缓存。工作量 **S**。

### U-5 [Confirmed] 助手/体检台在主窗口隐藏到托盘后摄像头不关
- 位置：games 路径有守卫（`MiniGamesView.tsx:1029-1030` `if (!visible) vision.disable()`）；助手是 App 级挂载且无可见性入参（`App.tsx:816`、`VisionAssistant.tsx:24-28`）；AiLabVisionTab 只在 unmount 时 disable（R144.2 语义）。主窗口 close→hide 到托盘（`main/index.ts:207-218`），app 常驻。
- 后果：用户开着助手→点 X 到托盘→**摄像头灯常亮 + 宿主进程 60Hz 推理持续烧 CPU/GPU**，用户毫无感知。商业产品不可接受（隐私+耗电双重投诉源）。
- 修复草案：hook 内订阅 `onMainWindowVisibilityChanged`（preload 已有该通道，games 已在用），visible=false 且非 games 场景时 `setPaused(true)`（保留会话，回前台恢复）或 disable。工作量 **S**。

### U-6 [Likely] GPU delegate 在永不可见窗口里运行 + CPU 回退无用户可见告警
- 位置：宿主窗 `show:false`（`main/index.ts:1113`）；GPU 失败回退 CPU 只发一条 status 文本（`visionHostMain.js:59`）刷进 label（4Hz 节流、短暂可见）。CPU 路径历史实测单帧 20-40ms×多模型（PRD R132 根因段），有效推理 ~10-16Hz，体感必崩。
- 修复草案：delegate==='CPU' 或 inferFps<20 时 pad/横幅常驻警示（i18n 键已有 `lowFps` 语义可复用）。工作量 **S**。

### U-7 [Confirmed] VisionCursor 每显示帧 `document.elementFromPoint` + `getBoundingClientRect`
- 位置：`VisionCursor.tsx:60`（rect）、`:79`（elementFromPoint）、每个 rAF（60Hz）无条件执行。
- 成本估计：布局干净时各 ~0.05-0.2ms；React 提交后的脏布局帧可到 1-3ms——叠加游戏 rAF 重绘 + VisionPad rAF 全量重绘（三个 rAF 并存：`MiniGamesView.tsx:2841-2845`），是"开体感后游戏掉帧"的残余风险点（推理已迁宿主，主线程只剩这些）。
- 修复草案：光标位移 < 1px 时跳过 hit-test；hit-test 降到 30Hz。工作量 **S**。

### U-8 [Confirmed] 和弦文本速度宣称依赖未兑现的 60Hz
- 位置：`fingerChords.js:87`（stableFrames=4 + 每指 Median3）；实测：预览成形 167ms@30Hz / 83ms@60Hz，放松提交再 +33-66ms → 最小单字符 ~233ms@30Hz（≈4.3 wpm 上限）vs R143.3 宣称 ~130ms（隐含 60Hz+）。合成源 E2E 也是 30Hz（`visionHostMain.js:144-147` setInterval 33ms）——**测试环境比宣称更慢，速度结论从未在 60Hz 下验证**。
- 修复草案：stableFrames 3 + 提交路径的 Median3 缩窗；或文档诚实标注 30Hz 摄像头下的实际 wpm。工作量 **S**。

### U-9 [Confirmed] 摄像档位三套口径互相矛盾
- `useVisionInput.ts:200` init=640×480@60；`useVisionInput.ts:316` setCapturePrecision=640×360/960×540；`visionHostMain.js:27` 默认 640×360。R134 研究（640×360 GPU -51%）与 R142-E1（640×480@60 MJPG）两个最优解并存，运行时没人统辖；切档还会整流重启（`visionHostMain.js:168-173` teardown+startCamera，摄像头黑屏 ~0.5-1s）。
- 修复草案：档位常量收敛到 shared 一处；切档改 `track.applyConstraints` 避免整流重建。工作量 **M**。

### U-10 [Confirmed] enable() 握手无超时 + 双订阅者关宿主竞态
- 位置：`useVisionInput.ts:179-237`（Promise 仅由 ready/error resolve；宿主窗在 open 与 hello 间被销毁则永远挂起）；assistant 与 AiLab 同时订阅时，任一 disable → `visionHostClose()` 直接杀窗，另一订阅者快照流无声冻结（BroadcastChannel 无对端关闭通知），UI 停在最后一帧无任何提示。
- 修复草案：init 3s 超时+可重试；宿主窗引用计数（enable/disable 配对）而非最后离开者关窗。工作量 **M**。

### U-11 [Likely] `snapshot.stats` 每帧全量克隆 + 60Hz 快照风暴（可接受但接近阈值）
- 实测：单快照 JSON 2.2KB（无表情）/ 2.9KB（52 键 faceBlend 恒挂载——`session.js:565` `_faceBlend` 持续携带），structuredClone 60us；60Hz ≈ 130-175KB/s + 主窗口每秒 60 次 onmessage（每次 frameRef 赋值 + 少量比较）。当前量级无害；若未来快照加字段（如双手骨架已含 allHands 双份 21 点）会线性涨。修复草案：表情帧才带 faceBlend；allHands 仅校准/体检场景需要，可按 init cfg 裁剪。工作量 **S**。

### 已验证无问题（不构成发现）
- **无队列堆积**：rVFC 回调在处理完才重新注册（`visionHostMain.js:113`），推理慢时后续帧自然丢弃，延迟不累积。Confirmed。
- **React 热路径纪律良好**：onSnapshot 仅在 state/handSeen/stepId 变化时 setState（handSeen 丢失有 5 帧滞回，`useVisionInput.ts:145-156`），label 4Hz 节流（`:157-161`）；pad/cursor/banner 走自有 rAF 读 frameRef，符合 useEngineLoop 的 ref 约定。R131.2「≥4Hz」与现状一致。
- **预测渲染真实存在且覆盖全部连续消费者**：`pipeline.js:169-192`（速度 EMA×50ms 前瞻 → geomPredicted）→ pad 点（`VisionCursor.tsx:46`/`VisionPad.tsx:232`/`MiniGamesView.tsx:865` 三处 `geomPredicted ?? geom`）；光标另有 netcode 式显示帧积分（`cursor.ts:112-123`）。R143 宣称兑现。

---

## 四、逐段延迟表（段 × 估计耗时 × 证据）

链路：摄像头 → 宿主渲染进程（隐藏窗）→ BroadcastChannel → 主窗口 rAF 消费。推理在宿主渲染进程主线程（**不是 Worker**；R136.1 记录了 Worker 三连败的迁移史）。

| # | 段 | 估计耗时 | 证据 |
|---|---|---|---|
| 1 | 传感器曝光→rVFC 回调（帧龄） | 15-40ms（30fps 相机半帧+曝光；暗光更长） | `visionHostMain.js:103`（有测量无消费）；上游 v2 研究口径 |
| 2 | rVFC 回调→detectForVideo 进入 | ~0-1ms | 同帧同步调用 `visionHostMain.js:110` |
| 3a | hand detectForVideo（GPU@640×480） | 8-15ms | PRD R134（640×360 GPU 比 720p −51% 的研究基线） |
| 3b | face detectForVideo（每 3 帧） | +30-45ms（GPU） | PRD R135 实测 34.6ms@640 |
| 4 | session+和弦+预测+stats（宿主每帧 CPU） | ~0.65ms（实测 187us processFrame + ~0.46ms stats） | 实测 A 节；`pipeline.js:122-199` |
| 5 | postMessage 结构化克隆 | ~0.06ms + 任务调度 0.5-2ms | 实测 A 节 |
| 6 | 主窗口 onmessage→frameRef | 即时；消费者下一 rAF 拾取 0-16.6ms | `useVisionInput.ts:139`、`MiniGamesView.tsx:862` |
| 7a | 连续量渲染（pad 点/轴/光标） | pad 平滑 0.35/帧、轴平滑 0.45/帧（+2-3 帧收敛）；光标积分器掩盖管线延迟；geomPredicted 前瞻 −50ms | `VisionPad.tsx:248`、`MiniGamesView.tsx:889`、`cursor.ts:112` |
| 7b | 离散方向键 | +OneEuro 静止起步 67ms@30Hz + confirmMs（90/45/0）→ 实测 167/133/67ms@30Hz | 实测 B 节；`gesture_engine.js:104,167-178` |
| 7c | 捏合 | Median3 2 帧 + confirm 60ms + cooldown 门 → 实测 133ms@30Hz / 100ms@60Hz | 实测 B 节；`gesture_engine.js:195-247` |
| 7d | 和弦命令（commit-on-release） | 成形 167ms@30Hz（Median 填充+4 帧稳定）+ 放松确认 33-66ms ≈ 233ms@30Hz | 实测 B 节/debug-chord 追踪 |
| 7e | 表情键 | faceEveryN 3×帧间隔 + confirmMs 80 + cooldown 200 | `face_engine.js:33-38` |

---

## 五、实测数据（node 微基准，仓库 HEAD）

```
==== A. 单调用成本 ====
handGeometry(21 lm)            0.40 us
OneEuroVec2.filter             0.52 us
Median3.push                   0.60 us
fingerStates(21 lm)            0.51 us
ChordEngine.update             4.83 us
session.onFrame(active,1 手)    3.31 us
session.onFrame(active,2 手+脸) 6.12 us
pipeline.processFrame(synthetic) 185 us   ← 内含 2 次 stats() 排序（adaptFaceRate）
pipeline.stats()               195 us/帧   ← emit 每 processed frame 再调（3 次排序）
LatencyMeter.stats()(300 样本)  91.2 us
structuredClone(snapshot)       60 us；JSON 2182B（+52 键 faceBlend → 2921B）
  → 60Hz ≈ 128-175 KB/s 广播流量
SyntheticSource.sample         3.1 us

==== B. 阶跃响应（算法层，含全部去抖/滤波） ====
方向 静止→挥入扇区→首个方向键事件：
  @30Hz  confirmMs 90/45/0 → 167 / 133 / 67 ms
  @60Hz  confirmMs 90/45/0 → 133 /  83 / 50 ms
方向 手回中→按键抬起（standard）：@30Hz 133ms / @60Hz 100ms
捏合 捏下→Space down：@30Hz 133ms / @60Hz 100ms
和弦 成形→预览 armed：@30Hz 167ms / @60Hz 83ms；放松→提交再 +1-2 帧（Median3 填充）
和弦 最小提交时延：@30Hz ≈ 233ms / @60Hz ≈ 116ms
OneEuro(2.5/0.5) 0.28 阶跃 @30Hz：50% 需要 67ms、90% 需要 167ms
```

**端到端估计**（段 1+3+4+5+6 ≈ 30-60ms@30fps GPU，再叠 B 节算法延迟）：

| 操作 | 现状估计（30fps 相机/GPU/默认档） | 商业目标 | 差距 | 责任代码 |
|---|---|---|---|---|
| 挥手方向指令（离散键） | ~195-230ms（sport ~95-130ms） | ≤80-100ms | 2-2.5× | confirmMs 默认 + OneEuro（U-2） |
| 方向释放 | ~130-160ms | ≤50ms | 2.5× | release 也过 confirm（U-2） |
| 捏合确认 | ~165-195ms | ≤80ms | 2× | Median3+confirm60（U-2/U-8） |
| 光标移动（视觉） | 管线 45-80ms，预测+60Hz 积分掩盖后体感 ~30-60ms | ≤50ms 体感 | 基本达标 | — |
| 模拟量轴（Survival） | ~80-130ms 到 90% 幅值（0.45 平滑） | ≤80ms | 边缘 | `MiniGamesView.tsx:889` |
| 和弦命令 | ~265-295ms | ≤150ms | 1.8× | stableFrames+Median（U-8） |
| 和弦文本单字符 | ≥233ms@30Hz → ~4.3 wpm 上限（宣称 12 wpm 按 60Hz） | ≥8-10 wpm | 2× | U-8 + 摄像头帧率不可见（U-1） |
| 开启→首帧可用 | 1.5-4s（两模型 ~11.5MB 经 media:// + getUserMedia + 握手；未实测） | ≤1-1.5s | 2× | 无模型缓存/进度遥测 |
| 校准三步 | 固定 7.7s（1500+2600+3600）+失败加倍最高 ~15s；有存档 profile 秒回（R133） | ≤5s 或可跳过 | 已有跳过按钮，勉强 | `session.js:17` |

---

## 六、可观测性方案（商业级最低要求）

现状：infer p50/p95、inferFps、delegate 活着；acquire/cam 死（U-1）；端到端延迟无任何测量（R142-E1 自认跨进程 performance.now 原点不同不可测，用「节拍一致性」替代——PRD 2956 行原文）。建议：

1. **修 U-1（S）**：acquire p50/p95 + 协商 WxH@fps 上屏（三处 UI 已在等这数据）。
2. **端到端打点改为同源时钟**：宿主在 snapshot 里带 `meta.presentationTime`（同一 performance.now 域内与 rVFC now 相减已有），主窗口在**消费帧的 rAF** 里记 `consumeMs`；再由宿主广播一个 `hostEpoch`（宿主 performance.now 与 Date.now 差），主窗口换算——跨窗原点差是常量，握手期测一次即可把整条链拉到同一时间轴。端到端 = 消费时刻 − 帧呈现时刻。
3. **延迟 HUD**：pad/banner 常显 `e2e p95 / infer p95 / acquire p95 / inferFps / delegate` 五元组（i18n 已有类似行结构）；CPU 回退常驻警示（U-6）。
4. **体检台加"延迟自检"卡**：AiLabVisionTab 已有 120ms ticker，加合成阶跃注入→事件返回的分箱统计即可自动化回归（synthetic 链路已具备）。

---

## 七、修复顺序（收益/成本）

| 序 | 项 | 工作量 | 收益 |
|---|---|---|---|
| 1 | U-1 遥测断链修复 | S | 一切优化的前提；环境教练复活 |
| 2 | U-2 默认档 confirmMs + release 免确认 + beta 调参 | S-M | 离散指令 -60~100ms，直面商业目标 |
| 3 | U-3 助手关 face 推理 | S | p95 -30-45ms、推理率回 50-60Hz |
| 4 | U-5 托盘隐藏关摄像头 | S | 隐私/耗电硬伤 |
| 5 | U-4 stats 缓存 | S | 宿主每帧 -0.4ms（顺带） |
| 6 | U-6 CPU/低帧率告警 | S | 回退场景可诊断 |
| 7 | U-7 cursor hit-test 降频 | S | 主线程余量 |
| 8 | U-8 和弦窗口调参 + 60Hz 验证 | S | 文本输入速度诚实化 |
| 9 | U-10 握手超时/宿主引用计数 | M | 稳定性 |
| 10 | U-9 档位收敛 + applyConstraints 切档 | M | 体验一致性 |

---

## 八、被推翻的怀疑 / 已验证无问题

1. **「60fps/预测渲染可能只在部分路径生效」**——预测渲染：**不成立**。geomPredicted 被 pad 点、Survival 轴、光标三个连续消费者全部消费，光标另有显示帧积分器（代码见第四节 7a）。60fps：**部分成立**——仅是「请求值」，协商不可见（U-1），且合成源 E2E 实际 30Hz（`visionHostMain.js:144-147`），60Hz 从未被任何测试覆盖。
2. **「推理排队堆积」**——不成立。rVFC 处理完才重注册，慢帧自然丢弃，无界延迟不可能。
3. **「onFrame 4Hz 节流导致状态滞后」**——不成立。label 4Hz、state/handSeen/stepId 即时发布且带 5 帧丢手滞回；banner 进度走 rAF。
4. **「主线程有全帧 drawImage/canvas.toDataURL 传输」**——不成立。跨窗只传 landmark 数字（~2-3KB），视频帧从不离开宿主。
5. **「R142-E1 端到端 <95ms 已实测」**——PRD 自己承认未测（跨窗时钟原点问题），本报告的段表给出当前结构下 30fps 相机 + sport 档 ≈ 95-130ms 的诚实区间。
6. 死代码确认：`vision_input.js` 运行时类（含 cameraLowRes/getSettings 回读/lowFps）在 R136 架构后已无运行时调用方（仅 d.ts 类型引用）——它的遥测完整性反衬宿主路径的缺口。

## 九、未验证/局限

- 未启动 electron/真机摄像头：detectForVideo 绝对毫秒（GPU/CPU）、协商帧率、隐藏窗 GPU 上下文行为、BroadcastChannel 实际调度抖动、开启→首帧真实耗时，均为代码结构+PRD 历史实测推导，标"估计"。微基准在 node 23 / 本机单核，绝对值与 Chromium 内有偏差（结构化结论不受影响）。
- 两台在跑 electron.exe 属用户会话，未触碰；未读取其运行态。
- 用户真实数据 `C:\Users\tjf\AppData\Roaming\RGBBox` 仅读：system.json 无视觉字段（会话级开关默认关）、日志无 Vision 错误——与"功能少用"一致，无真机性能痕迹可考。
- 用户日志中无推理 p95 记录（pad 是唯一出口且为屏幕直读，不落盘）——商业级建议把会话级 p50/p95 落入共享 logger（本次未验证 logger 是否有通道，属新增建议）。
