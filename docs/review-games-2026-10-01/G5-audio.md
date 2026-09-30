# G5 游戏音频专项评审（WebAudio in Electron）

- 日期：2026-10-01；方法：纯静态代码审查（未启动应用、未实听）。所有结论标注置信度：**高**＝代码直读可证；**中**＝机制确定但幅度未量化；**Speculative**＝听感类，需活体复测。
- 核心文件：`C:\tjf\github\RGBBox\src\renderer\src\games\sfx.ts`（276 行，全读）；调用面：`games/survival.ts`、`games/td.ts`、`games/tetris.ts`、`components/MiniGamesView.tsx`；生命周期：`src/main/index.ts`、`hooks/useAudioAnalyzer.ts`。
- PRD 依据：R99.5（SFX 合成）、R108（BGM 琶音）、R141-A（tick/confirm 手势音）、R205+R215（四作 preset + tension 二期，状态 ✅ 且注明「真机听感待用户」——本报告即该缺口的静态部分）。

## 摘要

音频层是**克制、保守、零素材**的正确小实现：纯 oscillator+指数包络、每 cue 全局限流、电平峰值 −23 dBFS、SFX 比 BGM 旋律高 8–13 dB、hit-stop 冻结期音频尾巴不硬停——架构上没有爆音/削波级别的 P0。真正的可听缺陷集中在三处：**tetris 高光消行的 playSfx 双发叠加**（tetris.ts:352-353）、**BGM 张力变奏在 bgm off→on 后卡死**（MiniGamesView.tsx:1272-1274）、以及 **canvas effect 依赖（选塔/倍速/全屏）导致 BGM 从头重启**。设计层面最大的两个欠账：高频 cue（shoot/hit/xp）**零变调零轮转**导致 TD 中期成为 11 Hz 单调 buzz；**boss 无专属音乐层/出场 sting**，tension 只有 0|1 二值整包替换且切换有约一步静默 gap。无总线、无 master gain、无音量滑杆（只有开关）。

---

## 1. sfx.ts 实现审计

### 1.1 合成方式（sfx.ts:73-85，置信度高）

- 每个声部 = 1×OscillatorNode → 1×GainNode → `ctx.destination` **直连**。无 noise buffer、无 BiquadFilter、无 stereo/pan、无总线节点。
- 包络：**瞬时起音**（`gain.setValueAtTime(volume, at)`，:79）＋指数衰减 `exponentialRampToValueAtTime(0.0001, at+duration)`（:80）；`osc.stop(at+duration+0.02)`（:84）——收尾时增益已到 −80 dB，**无 stop 爆音**（对）。
- 起音无 attack ramp：oscillator 在 start 时刻波形值非零（square 尤其），输出 0→peak 阶跃瞬态存在；音量小（≤0.07 linear），听感影响 Speculative（见未验证清单 8）。
- 音高：`setValueAtTime(from)` + `exponentialRampToValueAtTime(max(20,to))`（:77-78）。
- 多声部 cue 按 `at += duration * 0.7` 琶音化错开（:101），声部间 30% 重叠。

### 1.2 cue 参数表（sfx.ts:41-71 逐行读出；dB=20·log10(volume)，峰值≈gain）

| cue | 波形 | from→to (Hz) | 时值 (s) | 音量 (linear/dB) | 限流 (ms) | 语义/调用点 |
|---|---|---|---|---|---|---|
| shoot | square | 760→320 | 0.06 | 0.022 / −33.2 | 90 | survival P1 开火；TD 每塔每次开火 |
| hit | triangle | 220→90 | 0.07 | 0.05 / −26.0 | 70 | survival 子弹命中；tetris **每次落地不消行**；LAN garbage 入场 |
| pop | sine | 520→900 | 0.08 | 0.06 / −24.4 | 60 | TD 气球爆；slash 命中；tetris 1-2 消 |
| xp | sine | 980→1400 | 0.07 | 0.035 / −29.1 | 60 | survival 拾珠；**tetris 每次成功旋转** |
| levelup | triangle×4 | 440/554/659/880（同频持续） | .09/.09/.12/.18 | 0.06 / −24.4（叠2声≈−21.4） | **无** | 升级/boss 击杀/复活/成就/TD 胜利/陨石 |
| hurt | sawtooth | 200→55 | 0.22 | 0.07 / −23.1 | **无** | 受击（survival 接触+弹幕、TD 漏球、slash 错切） |
| wave | square×2 | 196/294 | .1/.14 | 0.045 / −26.9 | **无** | 开局/换岛/TD 开波/tetris 开局/slash 炸弹/分钟存活 |
| build | triangle | 300→620 | 0.1 | 0.05 / −26.0 | **无** | TD 建塔/升级 |
| coin | sine | 1200→1600 | 0.06 | 0.04 / −28.0 | **无** | TD 出售/sfx 开启确认 |
| gameover | sawtooth×2 | 330→220 / 220→110 | .16/.3 | 0.06 / −24.4 | **无** | 各作败北 |
| tick (R141-A) | sine | 1500 恒 | 0.03 | 0.018 / −34.9 | 60 | 视觉手势识别即时反馈 |
| confirm (R141-A) | sine×2 | 880/1320 | .05/.08 | 0.03 / −30.5 | **无** | 手势完成动作/UI 确认（MiniGamesView 10 处） |

### 1.3 voice 管理与限流（sfx.ts:8-9, 87-94，置信度高）

- **无并发上限、无 voice pool、无 age-stealing**；唯一防线是 per-kind 全局限流表（`performance.now()` 时基）：shoot 90 / hit 70 / xp 60 / pop 60 / tick 60 ms。**levelup、hurt、wave、build、coin、gameover、confirm 完全无限流**。
- survival「10+ 敌同帧连中」：hit 被压到 ≤14.3 次/s——**防爆音有效，代价是丢音**（部分命中无声），属可接受取舍（丢音比 buzz 好），但无"合并增益"（连中不打个更响的补偿音）。
- **多玩家 hurt 叠加**：hurt 无限流；4P 局同帧多名玩家被弹幕命中 → 4×sawtooth(200→55Hz, 0.07) 同刻叠加 ≈0.28 峰（−11 dBFS）＋锯齿互拍。概率低但真实存在（survival.ts:1222 弹幕段、:1496 接触段各自触发）。置信度高（逻辑），听感 Speculative。
- **shoot 限流 vs 火力上限**：`stats.fireRate = 2×(1+0.22×taken≤5)×(1+0.15×perm)×(1+bonus)×charMod`（survival.ts:596；max=5 见 swarmMeta.ts:16，volt 1.15）。常规 build ≈6/s（164ms）>90ms 无损；极限堆叠（taken5+perm+轮盘+volt）可 ≈20/s（48ms）→ **超过限流，约半数射击静音**（枪口闪光有、声音无）。TD 更明显：dart 塔 cd 0.62s→满级≈0.33s（td.ts:443），10+ 塔聚合事件率 20-45/s → shoot 恒定 11.1 Hz 同参数连发。置信度高（数学），听感 Speculative。
- AudioContext：`new AudioContext()` 无 options（:96）→ latencyHint 默认 **interactive**（对 blips 正确）；懒创建模块单例；每次调用 `if (suspended) void resume()`（:97）——resume 异步，**suspended 恢复瞬间的首个 cue 可能丢失**（防御路径，Electron 下罕见，见 §6）；try/catch 置 null 下次重建；**永不 close/suspend**（首 cue 后整个会话持有音频线程，开销可忽略）。置信度高。

---

## 2. 混音与响度

- **无总线结构**：SFX 与 BGM 全部直连 `destination`（sfx.ts:82/215）。无 master gain → **无任何音量滑杆**（UI 只有 SFX/BGM 双开关，MiniGamesView:1467-1478）；无 DynamicsCompressor/limiter；无大事件 BGM ducking。置信度高。
- **SFX vs BGM 响度差**：BGM arp 0.011–0.022（−37.2～−34.0 dB）＋bass ×1.4；SFX 峰 −23.1（hurt）～−34.9（tick）。即 SFX 比 BGM 旋律高 **8–13 dB**——cue 穿透层次事实上成立（参数巧合而非设计），代价是音乐整体偏背景（tetris 旋律 −38.4 dB）。Speculative（需听感确认比例是否合适）。
- **削波风险**：现实并发叠加（shoot+hit+xp+pop+hurt+BGM arp+bass）≈0.28 linear ≈ **−10.9 dBFS**，离 0 dBFS 很远——**master limiter 缺失在当前电平下不构成实际削波**。唯一例外见下条。置信度高。
- **tetris 双发 levelup**（tetris.ts:352-353）：
  ```ts
  playSfx(cleared >= 3 || tspin ? 'levelup' : 'pop')
  playSfx(cleared >= 3 ? 'levelup' : 'pop')
  ```
  第二行是第一行的子集（疑 R199 T-spin 合并残留）。`levelup` **不在限流表** → 三消/Tetris/T-spin 时两实例同 `at`、同参数、同相位 → 相干叠加 +6 dB（8 个 triangle，峰值≈−18 dBFS）且同频拍频浑浊——**游戏最高光时刻的音色反而最糊最跳**。1-2 消时第二发 pop 被 60ms 限流吞掉（无症状，说明为何漏测）。置信度高。
- **疲劳度**：所有高频 cue **零变调、零轮转、零力度分层**——每次 shoot/hit/xp 波形参数逐比特相同。TD 中期 shoot 变 11 Hz 定长 buzz（§1.3）；tetris 把 xp（980→1400 上扬正弦）用在**每次旋转**（tetris.ts:398）、hit 用在**每次落地**（:370），键 repeat/IRS 下连转即连续 chirp。且 xp/hit 语义在 survival/tetris 间复用，cue 语义被稀释。置信度高（机制）/Speculative（烦厌程度）。

---

## 3. BGM 张力系统评估

### 3.1 preset 实际参数（sfx.ts:130-169 逐行读出）

| preset | 基线：arp（Hz）/stepMs/波形/bassDiv/vol | tension 变体 |
|---|---|---|
| default（R108 兜底） | Am [110…329.63] 8 步 / 280 / triangle / 2 / 0.018 | **无**（setBgmTension no-op） |
| td | Dm 下行 [146.83…110] / 340 / triangle / 2 / 0.02 | 八度上移 / 250 / **square** / 4 / 0.016 |
| swarm | Em 密集 [164.81…185] / 190 / **sawtooth** / 2 / 0.014 | 八度上移 / 150 / sawtooth / 4 / 0.011 |
| tetris | C 上行琶音 / 240 / square / 2 / 0.012 | 双八度冲刺 / 180 / square / 4 / 0.010 |
| slash | E 小重拍 [82.41…61.74] / 300 / triangle / **1** / 0.022 | 八度上移 / 215 / square / 2 / 0.018 |

音符时值：arp = stepMs×0.9（近连音），bass = 每 4 步、arp 频率 ÷ bassDiv、时值 ×1.6、音量 ×1.4（sfx.ts:265-266）。tension 变体的 bassDiv×2 恰把 bass 锚回原八度——设计有想法。

### 3.2 tension 映射与切换机制（sfx.ts:232-240）

- **张力是 0|1 二值**（不是连续 0-1）：level 1 = 基线∪变体**整包替换**（arp 全表八度上移+步进加密+square 化+音量微降），**无滤波器扫频、无音量 ramp、无声部叠加**（`effectiveBgmPreset` 就是对象合并，:176-179）。这是 R205 二期规格本身（PRD :3837），实现与规格一致。
- 切换实现 = `stopBgm(); startBgm()`（:236-239）。**注释与实现不符**：注释称「下一拍生效（不重排音频）」，实际是 clearInterval → 新 setInterval → **首个新音符要再等一个 stepMs（150–340ms 静默 gap）**且**从 step 0 重启**（不对拍）。已排程音符自然衰减不被切断（这点无 click，对）。置信度高。
- 无 linearRamp/setTargetAtTime 出现在任何切换路径——**音乐性过渡完全缺失**（断崖式换曲 + 一步空拍）。置信度高；听感 Speculative。
- **BOSS 无专属层**：survival 的 danger = `hp≤2 || boss 在场`（MiniGamesView.tsx:1263）→ boss 登场用的就是残血慌张同一变体，boss 90s 一刷（survival.ts:42 `BOSS_INTERVAL=90`）期间整段高张力、击杀瞬间跌回基线（两次断崖）；**TD boss 波（每 5 波，td.ts:383-386）完全不触发音乐变化**（danger 只看 lives≤8）；**boss 出场没有任何 sting**（spawnBoss 无 playSfx——survival.ts 全部 16 个 playSfx 调用点核对过）。用户在意的演出感这是最大空缺。置信度高。
- 驱动去抖正确：rAF 每帧算 danger、仅边沿变化才调 setBgmTension（MiniGamesView.tsx:1267-1271）。✅

### 3.3 两个真 bug

1. **张力卡死（bgm off→on）**：MiniGamesView.tsx:1272-1274 `else if (bgmTensionCur !== 0) { bgmTensionCur = 0 }` 只复位**本地变量**，从不调 `setBgmTension(0)`。时序：危险态中关 BGM（sfx 模块态 `bgmTension` 留 1）→ 脱险 → 重开 BGM → `startBgm()` 直接播**高张力变体**；此后 danger=false 时 `level(0)===bgmTensionCur(0)` 永不成立 → **音乐卡在急变奏直到下一次危险态翻转**。置信度高（纯逻辑推演，复现路径明确）。
2. **effect 依赖导致 BGM 频繁重头**：canvas effect（MiniGamesView.tsx:970-978 `startBgm()` / :1312-1316 cleanup `stopBgm()`）依赖数组含 `bgmOn, fullscreen, screen, selectedTowerId, tdSpeed`（:1317；publish*/pollGamepad 均 `useCallback([],…)` 已排除不稳定）。→ **TD 里每次选塔（1-5 键/点击/LAN select）、切倍速、进出全屏都会 stop+start，BGM 从 step 0 重播**。置信度高（React 语义直推）。

### 3.4 调度质量（sfx.ts:263-268）

- 步进音序器跑在 **setInterval**（非 audio-clock lookahead）：音符在回调内以 `currentTime` 即时排程 → **主线程任何长帧直接平移音符**（MiniGamesView:1025 的 dt clamp 0.05 暗示存在偶发长帧）；setInterval 无漂移补偿 → 实际 BPM 略慢于标称。机制置信度高，幅度 Speculative（60fps 下大概率为毫秒级，听感待验）。

---

## 4. 音画同步

- 所有 playSfx 在引擎 tick 的**事件发生点同步调用**（如 survival.ts:1346 开火同帧推子弹、:1466 命中同帧减 HP+粒子），`at = audioCtx.currentTime` 即时排程 → 额外延迟 ≈ AudioContext output/base latency（Windows Chromium 文献值 ~20–50ms，**推断未实测**）。游戏 blips 无感知问题。置信度高。
- **hit-stop 顿帧（juice.hitStop）**：`tickSurvival` 头部 `juiceFrozen → return`（survival.ts:1192-1194）——冻结帧内不产生任何游戏事件，也**没有任何 playSfx 被跳过**（冻结=无事件=无声音需求，不存在"画面打了声音没响"）；**已响的音频尾巴在冻结期间继续衰减**（不硬停）——这是正确做法（冻结音频反而像故障）。boss 击杀帧 `state.hitStop=heavy` 与 `playSfx('levelup')` 同帧触发（:1157/1162），声音即时、画面冻 60ms，感知可接受。置信度高。
- R200 旧路径 `state.hitStop`（:1236-1241）：冻结期间位于早退**之前**的弹幕段仍会发 hurt/gameover（:1222/1227）——极端 case 下"冻结中发声"，无害。置信度高。
- 暂停（fsPaused→dt=0）：引擎冻结、BGM 不受影响继续播（无 duck/lowpass）——暂停浮层下音乐照常，属设计取舍非缺陷。置信度高。

---

## 5. 生命周期

- **卸载**：MiniGamesView unmount → cleanup `stopBgm()`（:1315）✅；切作 `setBgmPreset` 重启（:457，screen effect）。
- **startBgm 幂等** ✅（`bgmTimer !== null` 早退，sfx.ts:253）；**stopBgm 无淡出**但已排程尾音 ≤~0.56s 自然衰减（bass ×1.6 stepMs），不生硬。✅
- **最小化/失焦**：主窗口 `backgroundThrottling: false`（main/index.ts:160-167，注释明言防 overlay 遮挡降帧）→ 定时器/rAF 不被 Chromium 钳制 → **最小化后游戏与 BGM 继续跑、音乐不停**（App 的 R43 visibility IPC 只停灯效计算循环，不管游戏）。是否合意（游戏窗口最小化通常期望静音）待产品决策。行为置信度中（Windows 最小化与遮挡路径差异需活体验证，见清单 6）。
- **双 AudioContext 并存**：games sfx 单例 + `useAudioAnalyzer` 的 `new AudioContext()`（useAudioAnalyzer.ts:124，mic 分析用，:215 cleanup close）。两者是独立 OS 混音客户端，无相互路由、无冲突；sfx context **永不 close**（会话级持有，可忽略）。置信度高。
- **输出设备热插拔**：**无处理**。App.tsx:431 的 `devicechange` 只重枚举采集设备列表（UI 用）；无 setSinkId（Electron WebAudio 亦不暴露）。依赖 Chromium 默认设备跟随行为，未验证。置信度高（代码层面确实无处理）。
- `powerSaveBlocker.start('prevent-display-sleep')`（main/index.ts:261，用户 system.json powerSaveBlock=true 生效）保显示不熄，与音频无冲突。

---

## 6. Electron 特化（推断为主，均标注）

- **autoplay**：未设置 `autoplayPolicy`（grep 无命中）→ Electron 默认 **no-user-gesture-required**（Electron 5+ 的默认，**文献推断**）→ AudioContext 无手势也可 running，`resume()` 只是 OS 级 suspend 的防御网；首次手势解锁链**不需要**（桌面应用 + 首个 cue 本来就由点击触发）。若真遇 suspended，恢复瞬间首 cue 可能丢（§1.3）。
- **延迟预期**：latencyHint 默认 interactive；Chromium Windows 上 `outputLatency` 典型 ~20–50ms（音频服务跑独立进程/线程，render quantum 128 帧 ≈2.7ms@48k + OS 缓冲）。对 blip 类 SFX 足够；**文献值，未实测**。BGM 因 setInterval 调度，主线程抖动会叠加在音符时序上（§3.4）。
- 无 sampleRate/latencyHint 定制、无 AudioWorklet；进程模型下音频线程不受画布渲染反压（R219.8 的渲染减负对音频时序只有间接好处——降低主线程长帧=降低 BGM 抖动）。

---

## 7. 音频升级清单

### P0（可听缺陷，均为 S 工作量）

1. **[P0/S] tetris 消行 playSfx 双发**（tetris.ts:352-353）：删 :353（或两行合一）。三消/T-spin 高光 +6 dB 同相叠加与浑浊消除。
2. **[P0/S] BGM 张力卡死**（MiniGamesView.tsx:1272-1274）：else 分支补 `setBgmTension(0)`。

### P1（混音与 cue 设计）

3. **[P1/M] 总线化**：`masterGain → (可选)DynamicsCompressor → destination`；SFX/BGM 各一条子线；设置面板加音量滑杆（现在只有开关）。
4. **[P1/M] 高频 cue 变奏**：shoot/hit/xp 加 ±5–8% 随机 detune 或 3–4 档 pitch 轮转；TD 的 shoot 改"每塔限流/事件合并+响度补偿"避免 11 Hz 单调 buzz。
5. **[P1/S] tetris 语义去复用**：旋转/落地换独立轻 cue（不复用 xp/hit），并纳入限流表。
6. **[P1/S] BGM 热切去 gap**：setBgmTension/setBgmPreset 改为**保持 bgmStep、下一拍换包**（不 stop/start）；startBgm 首拍立即播（不等一个 stepMs）。
7. **[P1/S] canvas effect 依赖收窄**：`selectedTowerId/tdSpeed/fullscreen` 移出依赖（或 BGM 拆独立 effect `[screen]`），杜绝选塔/倍速/全屏触发 BGM 重头。

### P2（BGM 层次与 boss 演出）

8. **[P2/M] boss 演出层**：boss 出场 sting（新 cue，spawnBoss 处）＋在场期间叠加打击/低音层（与残血 tension 区分）；TD boss 波也接音乐反应。
9. **[P2/M] tension 连续化**：0–1 连续值 → 音量/滤波（lowpass 扫频）/声部数渐变（现二值整包替换）；切换用 setTargetAtTime 软过渡。
10. **[P2/M] BGM audio-clock lookahead 调度**（Chris Wilson 模式：25–50ms 提前排程+追赶）消 setInterval 抖动与漂移；音符 onset 加 3–5ms linearRamp attack。
11. **[P2/S] 长尾防御**：hurt/levelup 入限流表（多玩家同帧命中合并）；决策最小化时 BGM 行为（停/继续）；survival 极限火力 shoot 限流丢音改"限流时合并为更响单发"。

---

## 8. 已做对的事

- **零素材纯合成**（276 行）服务四作，体积/加载零成本，符合 NFR-05 约束。
- **per-kind 全局限流表**（sfx.ts:8）正面挡住高频连发叠 buzz——这是大多数业余 WebAudio 实现第一个翻车点。
- **收尾无爆音**：指数衰减到 0.0001 再 stop(+20ms)，无截断 click。
- **电平体系保守自洽**：峰值 −23 dBFS 起，SFX 高于 BGM 旋律 8–13 dB，现实叠加离削波 >10 dB 余量。
- **音画同步架构正确**：事件点同步调度；hit-stop 冻结期音频自然衰减而非硬停；已排程 BGM 音符不被顿帧/暂停打断。
- **tension 边沿去抖**（仅等级变化切换）、startBgm 幂等、unmount 清理干净；SFX/BGM 开关 localStorage 持久化且有 8 条单测（tests/renderer/games/sfx.test.ts，含变奏形态守护：八度上移/步进加密断言）。
- R141-A tick/confirm **刻意设计为比游戏音更轻**（−34.9/−30.5 dB），事件派发同帧播放（<50ms 由构造保证）——感知延迟削减思路专业。
- survival P2+ 开火不叠 sfx（survival.ts:1351-1353 注释明示"音频预算"）；tension 变体 bassDiv×2 把 bass 锚回原八度——细节有想法。

## 9. 未验证项 / 局限（活体听感复测清单）

1. tetris 打三消/T-spin：双 levelup 叠加的响度跳变与浑浊（对照修复后）。
2. TD 中期 10+ 塔：shoot 是否成单调 buzz；hit/coin/build 是否被掩蔽。
3. tension 切换瞬间：150–340ms 静默 gap + 从头重启的听感；boss 登场/击杀两次断崖的连续性。
4. 张力卡死复现：进危险态 → 关 BGM → 脱险 → 开 BGM → 应急变奏持续播放即坐实。
5. TD 内选塔（1-5）/切倍速/进出全屏：BGM 是否每次从头。
6. 最小化窗口（含 Win+D/任务栏最小化两种）：音乐是否继续、恢复后时序是否正常。
7. 拔插默认输出设备（USB 耳机↔扬声器）：游戏音是否跟随/中断/静默。
8. square/saw 预设（tetris/swarm）与 square SFX 的音符 onset 阶跃瞬态（click）听感是否可闻。
9. survival 火力满配（fireRate 堆到 ~20/s）静音射击比例与观感。
10. Electron autoplayPolicy 默认值与 outputLatency 实测（本报告为文献推断）。

> 全部结论出自静态阅读；除标注「高」外的听感幅度均未实证。PRD R205 自身注明「真机听感待用户」——本清单可直接作为该回验的执行项。
