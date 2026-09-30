# 待完成任务清单（跨机交接版）

> 基点：`feat/games-upgrade` @ `473ffa7`（已推送；151 文件 / 1334 用例绿，快照 9/9）
> 生成：2026-09-30。全部任务均有 PRD R-N 条款（`docs/prd/PRD-0002-rgbbox-project-catalog.md`），完成后须回写状态 ✅ + 证据。
> 流程铁律见 `CLAUDE.md`：提交标题 `[PRD-0002] <type>: <subject>`；改码前 R-N 必须在册；验证链 `yarn typecheck` → `yarn test` → `yarn build` → `yarn ui:snapshot`（有意 UI 变更后 `--update-baseline` 重立基线）。
> worktree 并行惯例：按**文件域互不相交**切分任务 → 每 agent 一个 worktree（开工先 `git log` 校验基点含最新主干提交，不含则 `git reset --hard <主干tip>`）→ 主干逐分支 merge + 统一 UI 接线 + 集成测试 + PRD 统一回写（PRD 只在主干改，避免合并冲突）。

---

## A. 开发任务（按建议顺序）

### A1. R213 二期：P2-P4 手柄摇杆轴控（小，~0.5h）

- **R-N**：R213（条款已标注「P2-P4 手柄轴控记二期」）
- **现状**：`MiniGamesView.tsx` 的 `pollGamepad()` 只读 `navigator.getGamepads()` 第一只，axis 写 `survivalRef.current.axis`（仅 P1）。TB 交付的 `domain/inputConfig.ts` 已有 `assignGamepads(connected, configs)`（显式绑定优先+余柄补位）与每玩家 `gamepad` 字段，**绑定 UI 就绪，缺轴控路由**。
- **做法**：`pollGamepad` 改为遍历全部已连接手柄 → `assignGamepads` 得到 玩家→手柄 映射 → P1 沿用 `axis` 字段；P2-P4 把摇杆向量转成对应键池的瞬时 add/delete（如 x>0.5 → `inputs[N-1].add('p2right')`，回中 delete），或给引擎加 `axes: Array<{x,y}>` 数组（推荐，改 `survival.ts` 移动段读 `axes[i]`，与 P1 axis 同语义）。
- **测试**：`tests/renderer/games/survival.test.ts` 追加 axes 驱动 P2/P3 移动用例。

### A2. R209 三期：LAN Tetris 对战（FR-LN05，中）

- **R-N**：R209（条款标注「FR-LN05 …为后续」）
- **现状**：LAN 会话层完整（lanService/lanProtocol，TCP 指令+15Hz 快照+seq 对账+重连+观战）；本地双板对战引擎已就绪（R208：`tetrisBRef` 双实例、`garbageFor`/`applyGarbage`、双板并排绘制）。
- **做法**：LAN 客端 Tetris 模式 = 事件同步而非快照：双方各跑本地引擎，**消行事件**（`{k:'garbage', lines}` 新 LanCommand）发给对方 → 对方 `applyGarbage`；开局同步种子（用 `daily.ts` 的 `mulberry32` 或时间戳种子经 welcome 消息下发，双方 bag 序列一致）；结算比分经 `{k:'result', score}` 上报互显。
- **文件域**：`src/shared/lanProtocol.ts`（加命令）、`src/main/lanService.ts`（透传即可，cmd 已通用）、`MiniGamesView.tsx`（LanPanel 加 tetris 房间类型 + guest 侧 Tetris 循环）。
- **测试**：lanProtocol 新命令编解码；E2E 本机双实例（参考 `C:\Users\tjf\AppData\Local\Temp\rgbbox-p1\e2e-lan.mjs` 的双 `--user-data-dir` 驱动法——临时脚本，需重写）。

### A3. R209 三期：客端插值渲染（小）

- **现状**：guest 收 15Hz 快照直接整帧覆盖 `tdStateRef`，气球位置两帧间跳变。
- **做法**：guest 侧保留上一帧气球/塔弹坐标 + 时间戳，绘制时按 `now - snapAt` 对 balloons 的 `progress` 线性外推（TD 气球有恒速 progress，天然可外推；复杂实体不做）。落点：MiniGamesView 的 snap 事件处理与 drawGame 之间。

### A4. R93 AI 画质增强（中大，启动前先对齐档位）

- **R-N**：R93（调研结论已写入条款，2026-09-14）
- **档位**：①动画实时超分（RealESRGAN-AnimeVideo-v3 xs ~0.3-2MB）②真人降档实时（540p/720p→1080p，x4plus int8 ~32MB）③暂停单帧精修（大模型，与 R75-78 截图标注打通）+ RIFE 插帧 30→60fps。
- **技术路线**：WebGPU 首选（onnxruntime-web webgpu backend），WebGL 后备。落点：视频工作站播放链路（VideoStudioView / 播放器 canvas）。
- **注意**：≤100MB 硬预算；实施前与用户重新确认档位优先级。

### A5. R177 精细化打磨清单（视条目）

- 条款在 PRD（v0.3.83 后 B 阶段 flash 轮+收尾清单，待排期）。执行前读条款全文逐项核对是否仍适用。

---

## B. 发版里程碑

1. **feat/games-upgrade 合并回 main**：前置=用户真机验收（见 C）。合并后跑全量验证链 + `yarn dist:dir` 冷启动冒烟。
2. **v0.3.84 发版**（R192.3 流程）：用户复验 → `dist:dir` 冷启动验证 → `dist:win` 出包 → 体积核查（R176.3 口径）。

---

## C. 用户侧验收清单（发版 gate）

- [ ] 游戏真机体验：M1 教练/遥测/recap、M2（TD 无尽+词缀+陨石、Swarm 进化+弹幕、Slash 三心+假动作、难度/暂停、BGM 五档+张力）、M3 每日挑战、短局矩阵四作、M4 本地双人四作、LAN 双机、R213 五项（4P：P3=TFGH、P4=小键盘；六场景切+融合轮换；头像上传；升级自动预选 best；按键配置改键+手柄绑定）
- [ ] 中文 TTS 对比试听：桌面 `r212-产品内-Piper中文.wav`（新，端到端韵律）vs `kokoro-中文试听-v2.wav`（旧桥）。声文页引擎=Kokoro、中文音色=Piper 中文（推荐）
- [ ] LAN 真双机验收：beacon 自动发现（本机双实例 UDP 未命中属已知限制，手输直连已验）
- [ ] 定时关机复验（R214 已修错误码透传；此前「仅支持 Windows」提示系误导文案）
- [ ] GLM 档 Agent 实机流式观感（R175 收尾项）

---

## D. 已知限制/遗留备忘

| 项 | 说明 | 条款 |
|---|---|---|
| Edge 云端 TTS | 2026 起微软收紧（官方 edge-tts 7.2.1 同报 403），探针三变体全拒，未集成 | R212 |
| beacon 本机双实例 | UDP 广播发现需真双机验证；手输 IP 直连兜底可用 | R209 |
| P2-P4 手柄轴控 | 绑定 UI 就绪，轴控路由未接（=A1） | R213 |
| fs 态 Slash 对决面板 | duel-panel 在 fs 下隐藏（画布 HUD 未承载对决回合提示，回合格式建议非 fs 进行） | R208 |
| Piper 混合导出 | 中英混排走逐句路由+22k→24k 插值；CDP 隔离实例曾报 kokoro 状态误判（环境噪音，真机正常） | R212 |
