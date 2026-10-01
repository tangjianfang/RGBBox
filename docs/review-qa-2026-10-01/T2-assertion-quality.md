# T2 — 断言质量审计（155 个测试文件 / ~1417 it() / ~4027 expect()）

> 范围：tests/** 全量 grep + 抽样精读；仓库只读；辅助脚本与本文均在 Temp 目录。
> 置信度三档：**高**＝已读原文＋（如可行）实际运行验证；**中**＝已读原文、推论；**低**＝静态推断未运行。

---

## 1. 摘要（质量总评）

- **总盘**：155 文件、~1417 个 it()、~4027 个 expect()。引擎域（games/*、engine/*、main/atomicJson、shared/logger）断言密度与规格对表化程度**高**，是本项目测试的主力质量；renderer 组件域存在一代「冒烟时代」遗留测试，与新一代 spec 对表测试并存，**断言强度两极分化明显**。
- **硬伤（高置信）**：3 个**零断言的行为用例**（名字承诺 invokes onChange/onClose，体内连断言都没有，实测全绿）；1 个**双分支皆过的等价永真**（App.test.tsx import-shape）；4 个 worker 用例只断言 `postedMessages[0]).toBeDefined()`；1 个 `void pattern0` 显式丢弃已捕获的断言素材；1 处 `toHaveBeenCalledWith('tick')` 次数不敏感——正是 tetris 双 playSfx 逃逸的同类洞。
- **中硬伤**：约 20+ 个组件用例仅有 `container).toBeTruthy()` / `length>0` 级冒烟断言；19 个 `it.skip` 占位携带具体行为名，测试索引虚标覆盖率；10/30 组件测试文件零 mock 回调断言。
- **数字速览**：`toBeDefined()` 37、`toBeTruthy()` 109、`not.toThrow` 11、`length>0` 17、`toBe(true)` 259（其中绝大多数作用于 `.every()/.some()` 谓词，**属合格断言**，不计弱）；零断言活动用例 3；弱断言-only 用例（窄口径，人工复核后）约 25。

---

## 2. 弱断言统计与案例

### 2.1 统计口径

- 全量 grep：`toBeDefined` 37 / `toBeTruthy` 109 / `toBeFalsy` 1 / `not.toThrow` 11 / `…length>0` 17 / `toMatchSnapshot` 0 / `expect(1).toBe(1)` 0。
- 区块级扫描（narrow weak set = toBeTruthy/toBeDefined/not.toThrow/length>0/textContent.length>0）：596–1440 区块中 **43 个弱-only、29 个零 expect**；人工复核剔除误报（`toBeNull()` 用于「文档化返回 null」的函数是合格负向断言；it.skip 占位单列）后：**真零断言活动用例 3 个，真弱-only 约 25 个**。

### 2.2 最弱案例（Top 证据，均贴原文）

**W1｜零断言行为用例 ×3（高置信，已运行 `yarn vitest run tests/renderer/components/CustomPaintEditor.test.tsx` → 4 passed，证明无需任何正确性即可通过）**

- `tests/renderer/components/CustomPaintEditor.test.tsx:37`
  ```ts
  it('invokes onChange when a cell is clicked', () => {
    const onChange = vi.fn()
    ...
    const cells = container.querySelectorAll('button, [data-cell], [role="button"]')
    if (cells.length > 0) fireEvent.click(cells[0])
  })
  ```
  `if` 守卫使点击本身都可跳过；组件永不回调该测试也绿。
- `tests/renderer/components/ImagePaintEditor.test.tsx:36` 同型：
  ```ts
  const addBtn = buttons.find((b) => /add|upload|\+/i.test(b.textContent ?? ''))
  if (addBtn) addBtn.click()
  ```
- `tests/renderer/components/ProfileManager.test.tsx:78`（invokes onClose when close is clicked）同型：`if (closeBtn) closeBtn.click()`，无断言。

**W2｜等价永真：任何结果都通过（高置信）**

- `tests/renderer/App.test.tsx:8-25`（App module type-shape）：
  ```ts
  try { const mod = await import(...); App = mod.App }
  catch (err) { App = null }        // 模块加载失败被吞
  if (App !== null) { expect(typeof App).toBe('function') }
  else { expect(App).toBeNull() }   // 失败状态被当作 pass 分支断言
  ```
  模块整体加载失败时测试反而**绿灯通过**——「永真」不必是 `expect(true).toBe(true)`，双分支互兜即等价永真。
- 同族：`tests/renderer/components/OverlayCanvas.test.tsx:17`（module exports the component symbol 实际断言的是 `window.rgbbox.onOverlayFrame).toBeDefined()`——断言对象是被 mock 的 setup 表面，恒真，中置信）。

**W3｜defined-only 的 worker 用例 ×4（高置信）**

- `tests/renderer/workers/previewEngineWorker.test.ts:168`
  ```ts
  it('patches ripple layer parameters when rippleBurst is provided', () => {
    ...
    fireOnMessage({ profile, rippleBurst: { cx: 0.3, cy: 0.7, burstAge: 0.5 } })
    expect(postedMessages[0]).toBeDefined()
  })
  ```
  「patches ripple parameters」零验证（未查 patched 参数、未对比无 burst 基线）。:187（does not patch…omitted）、:205（passes audioInput）、:212（passes screenSample）同型——至少后两者名字带 "(no crash)"，诚实一些。另 :118 `preserves previous frame for smoothing across messages` 只断言两个 `instanceof Uint8ClampedArray`，复用行为零验证（名字-断言不符）。

**W4｜显式丢弃断言素材（高置信）**

- `tests/renderer/games/swarmEvolve.test.ts:91-104`
  ```ts
  it('living boss emits bullets on the 1.2s cadence; three patterns cycle', () => {
    ...
    const pattern0 = s.eBullets.length   // 捕获了基线
    s.eBullets = []; s.bossBulletTimer = 0
    for (let i = 0; i < 12; i += 1) tickSurvival(s, 0.1)
    expect(s.eBullets.length).toBeGreaterThan(0)
    void pattern0                        // ← 然后丢弃，"three patterns cycle" 未验证
  })
  ```

**W5｜次数不敏感的 mock 断言（高置信——tetris 双 playSfx 逃逸的机制）**

- `tests/renderer/components/MiniGamesView.test.tsx:418`
  ```ts
  expect(sfx.playSfx).toHaveBeenCalledWith('tick')
  ```
  全仓库对 playSfx 的断言**仅此一处**；`toHaveBeenCalledWith` 对调用次数不设限——连发两次同样通过。引擎级 games/*.test.ts 完全不触 sfx（sfx 在组件侧被 `vi.mock` 整体替换，见 §4）。

**W6｜冒烟-only 组件用例（行为名 vs 空心断言，高置信）**

- `tests/renderer/components/EffectsView.test.tsx:34/40/47`：
  ```ts
  it('marks the selected preset', () => { ... expect(cards.length).toBeGreaterThan(0) })
  it('invokes onChange when a preset is clicked', () => { ... expect(buttons.length).toBeGreaterThan(0) })  // 从未 click
  it('highlights favorited kinds', () => { ... expect(container).toBeTruthy() })
  ```
- `tests/renderer/components/DisplayMap.test.tsx:45`：点了按钮但从不断言回调：
  ```ts
  const buttons = container.querySelectorAll('button')
  expect(buttons.length).toBeGreaterThan(0)
  fireEvent.click(buttons[0])    // onToggleOverlay 是否被调？未知
  ```
- 同级：CustomPaintEditor:13/24/50、ImagePaintEditor:13/24、VideoStudioView:13/17/22/28、DisplayMap:33、ProfileManager:20、EffectsView:24/28 等约 15 处 `toBeTruthy()`/`textContent.length>0`/`length>0` 单断言。

**W7｜not.toThrow-only（多数有正当性，2 处偏弱）**

- `tests/engine/textRenderer.test.ts:139` `expect(() => getTextMask('A', 1, 1, .5, .5, 1)).not.toThrow()`——极小画布的语义（返回什么 mask？）未锁（中置信偏弱）。
- `tests/main/displayTopology.test.ts:197` `expect(() => new Date(topology.detectedAt).toISOString()).not.toThrow()`——建议直接断言 ISO 形状。
- 其余（logger 幂等初始化、crashLog、avatarStore 幂等清理、gl dispose、drawScene 渐变退防）属合法「不炸」防御性用例。

**W8｜it.skip 占位携带具体行为名（中置信，索引虚标）**

- `tests/renderer/App.test.tsx:27-30`、`3d/LEDMapper.test.tsx:19-22`、`3d/SplatViewer.test.tsx:8-11`、`components/Preview3D.test.tsx:8-10`、`components/ArchitectureView.test.tsx:10-12`、`AudioStudioView.test.tsx:9-12`、`OverlayCanvas.test.tsx:84-88` 共 **19 个** `it.skip('invokes onChange when…', () => {})` 式占位——grep 测试名会误以为有覆盖。

### 2.3 无问题、容易被误判的形态（澄清）

- `expect(arr.every(pred)).toBe(true)` / `.some(...)` 共 259 处 `toBe(true)` 绝大多数属此类——**合格谓词断言**。
- 各 parse/validate 测试的成串 `toBeNull()`（mediaProtocol:70、aiChatValidation:7、lanProtocol:36、overlayDistribution:25 等）是**合格负向断言**。
- `quickDimensions.test.ts:86` 的 key 列表是**手写独立清单**（非从 PARAM_META 自举），非同义反复。

---

## 3. 负向用例缺口（每作 3 个「应有但缺失」）

引擎域负向覆盖总体不错（td 外推已有 dt=0/负值用例；effects 有全量 NaN 扫描；color 有坏 hex 回退）。缺口集中在「输入契约的极端值」：

**survival（src/renderer/src/games/survival.ts）**
1. `tickSurvival(state, NaN/负 dt)`：源码 `clamp(player.x + …*dt, 16, …)`（:1362）对 NaN 不设防——NaN 一帧注入即永久污染坐标且 clamp 拦不住；现无任何用例锁「NaN dt 不产生 NaN 坐标」。
2. `deployPlayers(0/5/非整数)`：axes 槽伸缩测试只走 1→4→1 合法路径（:416）。
3. 复活珠守卫：非目标玩家拾取、目标已复活后二次拾取、`revivesUsed` 耗尽后的行为（:385 只测正常路径）。

**td（src/renderer/src/games/td.ts）**
1. 升级边界：`coins === towerUpgradeCost`（恰等）与 `coins === cost-1`；现只有 `poor.coins = 0`（:111-114）一档。
2. `meteor` 空场/冷却中重复施放的返回语义（:48 只测正常+冷却拦截一次）。
3. `extrapolateBalloons` 坏快照：缺 `balloons` 字段、`progress` 越界（>1/负）——td.ts:889 靠 `Math.min(0.9999,…)` 兜底但注释自认「caller clamps to ~0.3s」是**约定而非强制**（:881），无测试锁。

**tetris（src/renderer/src/games/tetris.ts）**
1. **hitStop dt===0 分支行为锁**：tetris.ts:512-518
   ```ts
   if (dt === 0) {
     // 特效仍以真实时间衰减,但不推进命令/重力
     for (const particle of state.particles) {
       particle.x += particle.vx * 0   // ← 死代码：乘 0
       particle.life -= 0              // ← 死代码：减 0，与注释矛盾
     }
     return
   }
   ```
   一个「冻结期间粒子仍衰减」的行为测试即可揭穿注释与实现的矛盾（当前无测试覆盖该分支语义；survival 侧 hitStop 有测试，tetris 侧没有）。
2. `hold` 非法态：无 current piece / 非 running 相位时 hold（:118 只测 running 内的二次 hold 拒绝）。
3. `applyGarbage` 极端量：rows 使堆叠溢出顶部与 `hole` 列越界（:305/:324 测了固定洞列与冲突上推，未测溢出上界）。

**slash（src/renderer/src/games/slash.ts）**
1. 非 running 相位 `tickSlash`（time 冻结？）与 `slashCut`（:16 只测 running）。
2. 边界几何：切线角度恰在方向容差边、块中心与判定圆心重合。
3. bomb 冷却中再捏合（不重置计数/不误清场）——:79 只测一次冷却正路径。

**previewEngine / effects（src/engine/）**
1. `sampling.fps ≤ 0 / NaN`、`columns/rows` 为 0 已测（zero-size clamp）但负数/NaN 未见。
2. 坏色端到端：`hexToRgb('#12G')` 在 color.test.ts 有单测，但 previewEngine 集成层（layer.parameters.color 坏值 → 帧仍有限）未见。
3. `screenSample` 尺寸不匹配 fallback：previousFrame mismatch 有测试（:185），screenSample mismatch 分支未见对应用例（previewEngine.test.ts:213 `uses screen sample when dimensions match` 只测匹配侧）。

---

## 4. Mock 保真度

**4.1 canvas Proxy noop 的「绘制零验证」面（中-高置信）**
- `MiniGamesView.test.tsx` 内 11 处：
  ```ts
  const noopCtx = new Proxy({}, {
    get: (_t, prop) => {
      if (prop === 'canvas') return undefined
      if (prop === 'measureText') return () => ({ width: 10 })
      return () => undefined      // ← 一切属性皆函数
    },
    set: () => true,
  })
  ```
  后果一：**绘制调用零验证**——四款游戏的全部 2D 渲染在组件测试中只是「不炸」检查（drawScene/drawTetris 有独立 `.not.toThrow()` 防御用例，如 scene.test.ts:85、tetris.test.ts:596，但无任何「画了什么」断言）。后果二：**数值属性读取也返回函数**（如读 `ctx.lineWidth` 得到 function），被组件吞掉才没炸。
- 更具体的盲区：`src/renderer/src/games/hud.ts:73-84` 的 `healthGradCache`（R220.4 性能优化）在 noop ctx 下 `createLinearGradient` 返回 `() => undefined` → `if (!g) return null` 退防 → **缓存永不填充、永不命中——整条 R220.4 优化路径在测试下是死代码**。且缓存键 `${w}|${bucket}` 不含 ctx（:75），跨 canvas 复用旧 gradient 在真机上是潜在隐患，测试双重失明（中置信）。

**4.2 sfx 全局 mock（高置信，已贴原文）**
- `MiniGamesView.test.tsx:18-21`：`vi.mock('.../games/sfx', … { …actual, playSfx: vi.fn() })`。
- 该 mock 使**任何**音效回归（漏播、双播、错音）在组件测试中不可见；全仓唯一断言在 :418 且次数不敏感（§2.2 W5）。R221.7 类问题的教训已经付过一次学费。
- 引擎层（tests/renderer/games/*.test.ts）从不 import sfx——音效契约处于「组件 mock 吞掉 + 引擎不管」的真空。

**4.3 setupRendererMocks 白名单（结论：未越界 mock 被测物，但默认全成功造成 happy 偏置）**
- `tests/renderer/_helpers.tsx` 只 mock `window.rgbbox` IPC 表面（+ setup.ts 的 i18n/lucide/GL 类），**没有** mock 任何被测组件/域模块——边界选得对。
- 但除 `ttsSynthesize/ttsExport/voiceLexiconImport` 等少数默认 `ok:false` 外，绝大多数 IPC mock 默认 resolve 成功值（`aiChat → {ok:true}`、`openOverlay → true`…）。组件对 `ok:false`/reject/超时的分支基本只靠个别用例手工覆写，**没有系统性的失败注入开关**（中置信：逐文件核对过 AiLab/Video/Settings 等主要消费方，失败分支用例占比很低）。
- `MockBroadcastChannel`（setup.ts:13-31）静态 `channels` Map 在 beforeEach 清空——范式正确。

---

## 5. 测试独立性与时基风险

**5.1 顺序依赖 / 模块态**
- `tests/renderer/games/sfx.test.ts`：**无任何 beforeEach 清理**。用例以「自设起点」串联：`bgm toggle persists` 末尾 `setBgmEnabled(true)` 脏退出、`non-default preset` 末尾停留在 `preset='td'`、后续 `default preset` 用例靠自身 set 复位。当前顺序下全绿，但重排/并发即脆弱（中-高置信：已读全文）。happy-dom 的 localStorage 按文件隔离，跨文件无泄漏。
- `src/engine/color.ts:13 hexCache`（4096 上限）：纯函数缓存，无行为差异 → 无顺序风险（设计上即不可测，「未验证」其上限分支）。R221.3 的修复动机无法由测试表达。
- `hud.ts healthGradCache`：见 §4.1——模块态 + noop ctx 双重不可见。
- 对照良好范式：setup.ts 的 `MockEffectGl.instances = []` beforeEach 重置；tests/main 全线 `mkdtempSync` 每用例独立目录；`App.smoke.test.tsx:34` 用 `removeItem('rgbbox:view')` 显式定起点。

**5.2 时基健康（grep setTimeout/rAF 全量分类）**
- **确定性屏障（好）**：MiniGamesView `frames(ms, minTicks)` rAF 量子双屏障 + 3s 饥饿兜底（:507-523、656、748、862、943，注释明确记载「固定 ms 等待在全量并发负载下会 rAF 饥饿(同轮已两次复现)」）；logger `waitForContent` 条件轮询 4s 兜底（logger.test.ts:37-48，注释记载原 20ms 固定睡眠 flaky 史）。
- **仍为固定墙钟（标 flaky 风险）**：
  - `MiniGamesView.test.tsx:332/338`（`setTimeout(r, 40)` ×2，手势类断言）、`:383`、`:468`（`setTimeout(r, 60)`，vision 轮询等待）——与已翻车修复的同族用例**同模式但未换 frames()**（高置信：同文件内新旧两种模式并存）。
  - `SnipView.test.tsx:112`：固定 20ms 睡眠后做**否定断言**（`toBeNull()`）——「等了一会还没发生」类断言对慢环境天然脆弱（中置信，逻辑上该事件是同步判定，实际风险低但属反模式）。
  - `useAudioAnalyzer.test.ts:54` `settle(ms)` act 包裹睡眠（低风险，量小）。
- `vi.useFakeTimers` 全仓仅 2 处（MiniGamesView R141-B、AiLabVisionTab）——绝大多数时间行为靠真实时钟，是上述 flaky 面的根因。

---

## 6. 断言强化清单（Top 15：原文 → 建议）

| # | 位置 | 原文（摘录） | 建议断言 |
|---|------|--------------|----------|
| 1 | CustomPaintEditor.test.tsx:37 | `if (cells.length > 0) fireEvent.click(cells[0])` | 无条件 click 后 `expect(onChange).toHaveBeenCalledWith(expect.any(Array))`；cells 为 0 应 fail（`expect(cells.length).toBeGreaterThan(0)` 前置） |
| 2 | ImagePaintEditor.test.tsx:36 | `if (addBtn) addBtn.click()` | 同上：断言 `onChange` 带新图列表被调 |
| 3 | ProfileManager.test.tsx:78 | `if (closeBtn) closeBtn.click()` | `await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))` |
| 4 | EffectsView.test.tsx:40 | `expect(buttons.length).toBeGreaterThan(0)`（未 click） | click 某卡片后 `expect(onSelectEffect).toHaveBeenCalledWith('aurora')` |
| 5 | EffectsView.test.tsx:34 | `expect(cards.length).toBeGreaterThan(0)` | 断言选中卡片有 `aria-pressed="true"` / `data-selected` 类名差异（先给组件加可测钩子亦可） |
| 6 | DisplayMap.test.tsx:45 | `fireEvent.click(buttons[0])`（无断言） | `expect(onToggleOverlay).toHaveBeenCalledWith(1)` |
| 7 | previewEngineWorker.test.ts:168 | `expect(postedMessages[0]).toBeDefined()` | mock `renderPreviewFrame` 断言 ripple layer 入参被改写（或对比有/无 burstBurst 两帧像素差） |
| 8 | previewEngineWorker.test.ts:118 | 仅 `instanceof Uint8ClampedArray` ×2 | `smoothing=0.5` 连发两帧不同颜色，断言输出介于两色之间（真正锁 previousFrame 复用） |
| 9 | previewEngineWorker.test.ts:205/212 | `expect(postedMessages[0]).toBeDefined()` | `vi.mock` engine 模块，`expect(renderPreviewFrame).toHaveBeenCalledWith(expect.objectContaining({ audioInput: … }))` |
| 10 | App.test.tsx:8 | catch 后 `expect(App).toBeNull()` | 移除 catch 兜底：import 失败即测试失败；或至少 `expect(App).not.toBeNull()` 无 else |
| 11 | swarmEvolve.test.ts:104 | `void pattern0` | 记录三轮齐射的弹幕角度签名，断言 `pattern[i] !== pattern[i+1]` 且 `pattern[3]≈pattern[0]`（兑现 three patterns cycle） |
| 12 | MiniGamesView.test.tsx:418 | `expect(sfx.playSfx).toHaveBeenCalledWith('tick')` | `expect(sfx.playSfx).toHaveBeenCalledTimes(1); expect(sfx.playSfx).toHaveBeenNthCalledWith(1, 'tick')` |
| 13 | textRenderer.test.ts:139 | `expect(() => getTextMask('A',1,1,.5,.5,1)).not.toThrow()` | 断言返回 `cols*rows` 全 false 布尔数组（形状+语义） |
| 14 | displayTopology.test.ts:197 | `expect(() => new Date(...).toISOString()).not.toThrow()` | `expect(topology.detectedAt).toMatch(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/)` |
| 15 | VideoStudioView.test.tsx:22/28 等 | `expect(container).toBeTruthy()` | 冒烟至少锚定一条稳定 DOM 契约（`textContent` 含 `video.*` i18n key、`querySelector('.video-*')` 非空），或名改 `[smoke] renders` |

---

## 7. 反模式规约（新增测试遵循，10 条）

1. **禁守卫式触发**：`if (el) el.click()` 之后必须跟断言；触发必须无条件（选择器命中数先断言）。
2. **用例名即契约**：名字出现 invokes / patches / persists / cycle / highlights，体内必须有同名 mock/DOM 断言；做不到就改名 `[smoke]`。
3. **回调断言带参带次**：`toHaveBeenCalledWith(args)` 为底线；事件/音效类加 `toHaveBeenCalledTimes(n)` 防双发（playSfx 教训）。
4. **冒烟与行为分层标注**：`toBeTruthy()` / `length>0` 只允许出现在 `[smoke]` 前缀用例中，且每个组件文件行为用例须 ≥ 冒烟用例。
5. **禁双分支互兜**：try/catch 吞错后把失败态当 pass 断言＝永真；失败要么 throw 要么 `it.skip` + 原因注释。
6. **it.skip 占位不得携带具体行为名**：改 `it.todo('needs WebGL: invokes onChange')`，避免测试索引虚标。
7. **跨帧等待统一 rAF 量子双屏障**：用 `frames(ms, minTicks)` 或条件轮询（`waitFor`/`waitForContent`）；禁止裸 `setTimeout` 固定睡眠，尤其禁止「固定睡眠 + 否定断言」组合。
8. **模块态必清**：触及 localStorage / 模块级 Map 缓存 / 静态 instances 的文件，beforeEach 统一清理（`MockEffectGl.instances` 模式），用例不得依赖前一用例的脏终态（sfx.test.ts 反例）。
9. **noop ctx 只证逻辑不证绘制**：凡断言涉及绘制输出/缓存命中的路径，用「录制型 ctx」（收集 calls 的对象或 Map proxy）断言调用序列与参数，不用全函数化 Proxy。
10. **负向与正向成对**：每个行为 describe 至少配一条坏输入/边界（NaN、0、负、空集合、恰等边界）；`0≤r≤255` 型 range-only 断言仅在存在 visual-floor/NaN-sweep 兜底时才可作为独立用例。

---

## 8. 质量良好范式（值得推广）

1. **tests/engine/effects-visual-floor.test.ts**：分层门禁（ambient/feature/strobe/tool 各自亮度/覆盖下限）+ 全效果 NaN 扫描 + 固定虚拟时间采样点——把「看得见」做成常设门槛，注释还记载了动机（avgLum 0.013 事故、starlight NaN）。
2. **MiniGamesView `frames(ms, minTicks)`**：rAF 量子 + 墙钟 + 3s 饥饿兜底双屏障，注释写明「同轮已两次复现」的 flaky 史——时基修复的模板。
3. **logger.test.ts `waitForContent`**：按内容条件轮询替代固定睡眠，注释保留事故记录。
4. **tests/main/atomicJson.test.ts**：评审事故回归锁——readJsonSafe 区分 missing/bad（坏根数组/null/标量全测）、坏文件 `.bad` 抢救——负向矩阵 + reason 判别是持久化层的标杆。
5. **vision/*.test.mjs**：`node:assert/strict` + `makeHand` 合成器 + 时钟注入（`clockMs` 手动 tick）——零真实等待的确定性时间测试。
6. **games 引擎 spec 对表断言**：如 survival.test.ts:494「0.625/0.7/0.85/1.0 严格递增」、td.test.ts:156 四档参数矩阵——把 spec 数值直接编进断言，回归即数值漂移报警。
7. **setup.ts `MockEffectGl.instances` + beforeEach 重置**：mock 可查询且无跨用例泄漏。
8. **previewEngine.test.ts 负向三件**：unknown zone pass-through、mismatched previousFrame 忽略、zero-size clamp 到 1×1——引擎防御分支的正确写法。

---

## 9. 未验证 / 局限

- **未跑全量套件**（只读约束 + 时长）；仅单文件运行了 CustomPaintEditor（4 passed）佐证零断言用例可通过。flaky「两次翻车」依据代码注释与线索块记载，未复现。
- 区块解析脚本（weak_scan*.py，存于本目录）对模板字符串/装饰器边界可能有 ±5% 误差；所有「零断言/弱-only」结论均经人工 Read 复核，但未对 43+29 全量逐条重读（抽样 ~30 条复核）。
- `tests/renderer/gl/**`（headless-gl）与 `tests/renderer/3d/**` 未深审——GPU 依赖路径，超出断言语义审计范围。
- hud.ts healthGradCache「跨 canvas 复用 gradient」的真机风险为静态推断（中置信），未运行验证。
- tetris.ts:512-518 死代码（`vx * 0` / `life -= 0`）是审计副产品，属实现问题而非测试问题，建议另开 R-N 处理。
