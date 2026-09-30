# 待完成任务清单（跨机交接版）

> 基点：`feat/games-upgrade` @ `84630fb`（含 R213 五项扩展；151 文件 / 1334 用例绿，快照 9/9）
> 生成：2026-09-30（v2：对照 PRD 全量 ⏳/🔄 条款逐条复核扩充，补 R148 收尾 / Q-5 / 规划拍板 / 历史验收积压四类）。
> 全部任务均有 PRD R-N 条款（`docs/prd/PRD-0002-rgbbox-project-catalog.md`），完成后须回写状态 ✅ + 证据。
> 流程铁律见 `CLAUDE.md`：提交标题 `[PRD-0002] <type>: <subject>`；改码前 R-N 必须在册；验证链 `yarn typecheck` → `yarn test` → `yarn build` → `yarn ui:snapshot`（有意 UI 变更后 `--update-baseline` 重立基线）。
> worktree 并行惯例：按**文件域互不相交**切分任务 → 每 agent 一个 worktree（开工先 `git log` 校验基点含最新主干提交，不含则 `git reset --hard <主干tip>`）→ 主干逐分支 merge + 统一 UI 接线 + 集成测试 + PRD 统一回写（PRD 只在主干改，避免合并冲突）。

---

## A. 开发任务（按建议顺序）

### A1. R213 二期：P2-P4 手柄摇杆轴控（小，~0.5h）

- **R-N**：R213（状态已 ✅，条款标注「P2-P4 手柄轴控记二期」）
- **现状**：`MiniGamesView.tsx` 的 `pollGamepad()` 只读 `navigator.getGamepads()` 第一只，axis 写 `survivalRef.current.axis`（仅 P1）。TB 交付的 `domain/inputConfig.ts` 已有 `assignGamepads(connected, configs)`（显式绑定优先+余柄补位）与每玩家 `gamepad` 字段，**绑定 UI 就绪，缺轴控路由**。
- **做法**：`pollGamepad` 改为遍历全部已连接手柄 → `assignGamepads` 得到 玩家→手柄 映射 → P1 沿用 `axis` 字段；P2-P4 给引擎加 `axes: Array<{x,y}>` 数组（推荐，改 `survival.ts` 移动段读 `axes[i]`，与 P1 axis 同语义），或摇杆向量转键池瞬时 add/delete。
- **测试**：`tests/renderer/games/survival.test.ts` 追加 axes 驱动 P2/P3 移动用例。

### A2. R209 三期：LAN Tetris 对战（FR-LN05，中）

- **R-N**：R209（条款标注「FR-LN05 …为后续」）
- **现状**：LAN 会话层完整（lanService/lanProtocol，TCP 指令+15Hz 快照+seq 对账+重连+观战）；本地双板对战引擎已就绪（R208：`tetrisBRef` 双实例、`garbageFor`/`applyGarbage`、双板并排绘制）。
- **做法**：LAN Tetris = 事件同步而非快照：双方各跑本地引擎，**消行事件**（`{k:'garbage', lines}` 新 LanCommand）发给对方 → 对方 `applyGarbage`；开局同步种子（`daily.ts` 的 `mulberry32` 或时间戳种子经 welcome 消息下发）；结算比分经 `{k:'result', score}` 上报互显。
- **文件域**：`src/shared/lanProtocol.ts`（加命令）、`src/main/lanService.ts`（透传即可，cmd 已通用）、`MiniGamesView.tsx`（LanPanel 加 tetris 房间类型 + guest 侧 Tetris 循环）。
- **测试**：lanProtocol 新命令编解码；E2E 本机双实例（双 `--user-data-dir` 驱动法，参考临时脚本需重写）。

### A3. R209 三期：客端插值渲染（小）

- **现状**：guest 收 15Hz 快照直接整帧覆盖 `tdStateRef`，气球位置两帧间跳变。
- **做法**：guest 侧保留上一帧气球/塔弹坐标 + 时间戳，绘制时按 `now - snapAt` 对 balloons 的 `progress` 线性外推（TD 气球恒速 progress 天然可外推；复杂实体不做）。落点：MiniGamesView 的 snap 事件处理与 drawGame 之间。

### A4. R148 UI 美化收尾：S3 逐 view 批次 + S5（中大）

- **R-N**：R148.8 状态 🔄——S0/S1/S2/S3+S4 **体系层**已 ✅，**S3 逐 view 精修批次**（R152.9 续批入口，按 review §6 顺序）与 **S5 亮色主题 + 桌面原生质感**（Mica 近似/系统 accent 联动）待续。
- **门禁**：每批必跑 `yarn ui:snapshot`（R152 已接线 pixelmatch 硬门禁）；每批独立 R-N、证据追加至 R148.7。
- **备注**：R86 P2/P3（Synapse UI 重排两期）事实上已被本方案吸收覆盖（R86.7 仍挂 🔄），建议用户确认后在 PRD 归档注明。

### A5. R189 Q-5 设计系统统一轮（中，1-1.5 会话）

- **R-N**：R189.1 排期表末位（Q-1 R190 ✅ / Q-2 ✅ / Q-3 发版流程=R192 🔄 / Q-4=R194 ✅ 实机观感待用户 / **Q-5 未启动**）。
- **内容**（方向已拍板：中性化+单强调色）：先出 token 方案一页（中性阶/单一强调色/字号 3-4 档/圆角 2 档/间距阶）→ 实施：模块卡中性化+图标保辨识、≥3 绿收敛单 token、dashboard 状态卡右缘对齐、顶栏与 H1 去重。验收：全视图走查复核；基线**一次**重立。
- **后续**：Q-5 后另议 D3/D8/D10（悬浮胶囊/「关」语义/toast 生命周期）；再往后 v0.3.85。

### A6. R93 AI 画质增强（中大，启动前先对齐档位）

- **R-N**：R93 ⏳（调研结论已写入条款，2026-09-14；用户确认排 R91 之后启动，R91 已完）
- **档位**：①动画实时超分（RealESRGAN-AnimeVideo-v3 xs ~0.3-2MB）②真人降档实时（540p/720p→1080p，x4plus int8 ~32MB）③暂停单帧精修（大模型，与 R75-78 截图标注打通）+ RIFE 插帧 30→60fps。
- **技术路线**：WebGPU 首选（onnxruntime-web webgpu backend），WebGL 后备。落点：视频工作站播放链路（VideoStudioView / 播放器 canvas）。
- **注意**：≤100MB 硬预算；实施前与用户重新确认档位优先级。

### A7. R177 精细化打磨剩余项（flash 轮，视条目）

- **R-N**：R177（v0.3.83 后 B 阶段 flash 轮+收尾清单）。执行前读条款全文逐项核对。
- **剩余**：P-2 Agent 工具卡折叠（>N 行默认折叠/diff 配色统一/done 后移除流式光标——R175.5 亦标注遗留）；P-4 提示词工程（KERNEL/REACT 系统提示词迭代）。P-3 Agent 流式增强已由 **R194 承接并 ✅**（实机观感待用户）；P-1 视觉目检轮并入发版验收走查。

---

## B. 发版里程碑

1. **feat/games-upgrade 合并回 main**：前置=用户真机验收（见 C）。合并后跑全量验证链 + `yarn dist:dir` 冷启动冒烟。
2. **v0.3.84 发版**（R192.3 流程，R192.11 🔄）：用户复验（P-4 Agent 冒烟 / P-5 流式合成观感）→ `dist:dir` 冷启动验证 → `dist:win` 出包 → 体积核查（R176.3 口径：kokoro-js+transformers 入包为声文必要成本）。

---

## C. 用户侧验收清单（发版 gate）

**本分支（games-upgrade）**：
- [ ] 游戏真机体验：M1 教练/遥测/recap、M2（TD 无尽+词缀+陨石、Swarm 进化+弹幕、Slash 三心+假动作、难度/暂停、BGM 五档+张力）、M3 每日挑战、短局矩阵四作、M4 本地双人四作、LAN 双机、R213 五项（4P：P3=TFGH、P4=小键盘；六场景切+融合轮换；头像上传；升级自动预选 best；按键配置改键+手柄绑定）
- [ ] LAN 真双机验收：beacon 自动发现（本机双实例 UDP 未命中属已知限制，手输直连已验）

**发版复验（R192.3）**：
- [ ] P-4 Agent 冒烟重跑（R192.9 bash 工具修复后：同一命令应走 Git Bash 出 UTF-8 正常输出）
- [ ] P-5 流式合成观感（R194 GLM 档首 token <2s / R175 Claude 式流式光标；实机跑一次任务确认）

**欠账验收（代码已完，待用户实机）**：
- [ ] R130 截图提速实机取证：`yarn dist:dir && node scripts/verify-r130-snip-fast.mjs`（热键→冻结 ≤500ms，5 轮取 max；未过回滚 ⏳）
- [ ] R91.3b AI 降噪听感（含噪音素材开/关对比）
- [ ] R145 AWS Bedrock 真机（填 AK/SK+region → 测试连接 → chat/OCR/翻译走 Bedrock）
- [ ] 中文 TTS 对比试听：桌面 `r212-产品内-Piper中文.wav`（新）vs `kokoro-中文试听-v2.wav`（旧桥）。声文页引擎=Kokoro、中文音色=Piper 中文（推荐）
- [ ] 定时关机复验（R214 已修错误码透传；此前「仅支持 Windows」提示系误导文案）

---

## D. 规划/搁置条款（待用户拍板，勿自行启动）

| 条款 | 内容 | 状态 | 下一步 |
|---|---|---|---|
| R160.6 🔄 | 工作区灯效「三层漏斗」重构（S1 信息架构→S4 场景卡 live 缩略图） | 方案文档已产出 | 用户审阅拍板后 S1-S4 逐批另立 R-N |
| R13.8 ⏳ | 开源推广就绪度（CI/社区文件/README 徽章/og meta） | 部分落地（LICENSE 已有；ci.yml/ISSUE_TEMPLATE/徽章未做） | 用户定是否推进 |
| R14.8 ⏳ | 功能竞争力五阶段（WLED/OpenRGB/图层时间线/预设市场/AI 生成） | ⚠️ 阶段 1-2（WLED/OpenRGB）与用户方向裁决「**不做真实硬件集成**」冲突 | 需用户处置：废弃阶段 1-2 或改写条款；阶段 3-5 待选 |
| R15.8 ⏳ | 视觉竞争力（token 化/light-dark/Logo/原子组件） | 大部分已被 R148 体系覆盖 | 建议与 R148 合并归档，残余项入 R148 批次 |
| R16.12 ⏳ | 影响力扩展（arm64+Web Demo/插件 SDK/AI 生成灯效/GIF 导出） | 未启动 | 三杠杆待用户选 |
| R90 P2/P3/P4 | 音频 AI 灯效联动/语音指令/EdgeTAM | **无限期搁置**（2026-09-14 用户决定） | 非用户主动要求不得启动 |
| R173-B | 声文离线引擎二期（ASR spike 等） | 需核对：Kokoro 下载/合成已由 R175.7+R212 交付 | 用户确认残余范围后再立项 |

---

## E. 历史待验收积压（状态未闭环，非阻塞）

PRD 中约 45 条 2026-06~07 时期的 🔄 条款为「代码已实施，等待用户实机视觉验收」（R25.7 任务栏图标 dist:win 验证、R28.8~R47.7 CPU/投影系列、R53.7~R67.6 音频/overlay 系列、R86.7 P2/P3）。这些代码均已随 v0.3.17~v0.3.83 多轮发版上线使用，验收大概率事实完成，仅状态行未回写。

**处置建议**：用户对关键路径（投影一致性/音频工作站/CPU 占用）做一次抽查 → 确认无回归后批量改 ✅ 并注明「历史积压批量闭环（2026-09-30 抽查）」；或明确放弃逐条验收直接归档。另 R52 标题仍挂 ⏳ 但表格 12 子项全 ✅，可顺手闭环。

---

## F. 已知限制/遗留备忘

| 项 | 说明 | 条款 |
|---|---|---|
| Edge 云端 TTS | 2026 起微软收紧（官方 edge-tts 7.2.1 同报 403），探针三变体全拒，未集成 | R212 |
| beacon 本机双实例 | UDP 广播发现需真双机验证；手输 IP 直连兜底可用 | R209 |
| P2-P4 手柄轴控 | 绑定 UI 就绪，轴控路由未接（=A1） | R213 |
| fs 态 Slash 对决面板 | duel-panel 在 fs 下隐藏（画布 HUD 未承载对决回合提示，回合格式建议非 fs 进行） | R208 |
| Piper 混合导出 | 中英混排走逐句路由+22k→24k 插值；CDP 隔离实例曾报 kokoro 状态误判（环境噪音，真机正常） | R212 |
| Agent denylist 边界 | Windows 盘根路径写法枚举不可穷尽（R176.2 已补三态），审批层为主防线 | R176 |
| pi 引擎动态验证 | `scripts/pi-spike.mjs` 待用户以 API key 实跑（kernel 内核为现行方案，pi 为可替换插槽） | R172 |
