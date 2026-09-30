# 待完成任务清单（跨机交接版）

> **状态：R216 批量实施轮已收官（2026-09-30）**——A 类全部任务 + E 段积压已完成并 merge main（ad657a9），v0.3.84 已出包。本清单自 v3 起转为**遗留备忘录**：仅 D 段规划拍板项与 F 段已知限制待处理。
> 执行总控条款：PRD **R216**（worktree 五分支 g/u/ai/v/u2 并行 + AI 审核闭环，全程证据见 PRD 与 `docs/ui-review/r216/`）。

---

## A. 开发任务 —— ✅ 全部完成（R216）

| # | 任务 | 状态 | 证据 |
|---|---|---|---|
| A1 | R213 二期：P2-P4 手柄轴控 | ✅ | survival axes 数组化 + pollGamepad 全柄映射；+4 用例（worktree-agent-g，PRD R213 回写） |
| A2 | R209 三期：LAN Tetris 对战 | ✅ | 事件同步（garbage/result/seed）+ lanService host 下行补全；+5 用例（PRD R209 回写） |
| A3 | R209 三期：客端插值渲染 | ✅ | extrapolateBalloons 纯函数外推；+4 用例 |
| A4 | R148 S3 逐 view 精修 + S5 亮色主题 | ✅ | S3 五批（hex 工具修复/ARCH-1 销案/字阶/圆角/间距 census）+ S5 三档主题双 0 违例（worktree-agent-u2，PRD R148.8 回写） |
| A5 | R189 Q-5 设计系统统一轮 | ✅ | token 方案一页 + 四项实施 + 快照 9/9（worktree-agent-u，PRD R189.1 回写） |
| A6 | R93 AI 画质增强（档位①） | ✅ | vendor wasm 零 npm 依赖 + webgpu→webgl→cpu + 15 用例；真机 GPU 5 项如实保留（worktree-agent-v，PRD R93 回写） |
| A7 | R177 P-2 工具卡折叠 + P-4 提示词 | ✅ | 双阈值折叠 + 孤 tool-result 修复 + KERNEL/REACT 二轮（worktree-agent-ai，PRD R177 批次收口记录） |

最终验证链（merge 后主干）：typecheck 双绿 / **153 files 1387 passed 0 失败** / build / ui-snapshot **9/9 GATE PASS 0.0000%** / hex audit 0 违例 / 双主题 contrast 0/0。

## B. 发版里程碑 —— ✅ 完成

1. **feat/games-upgrade 合并回 main** ✅（ad657a9，tree 零差异；本地 merge，未 push origin）。
2. **v0.3.84 发版** ✅：dist:dir 冷启动冒烟（捕获栈预热+窗口池重建日志在案）→ dist:win 出包 `release/RGBBox-0.3.84-win.zip`（version 0.3.84 原位未 bump——该版本号此前从未发布过）→ 体积核查见 PRD R216 回写。
   - 打包环境坑（已记 memory）：electron zip 缓存残缺致 unpack-electron 产物缺 electron.exe，绕过=`-c.electronDist=node_modules/electron/dist`。

## C. 用户侧验收清单 —— AI 审核已替代（R216.2），仅余真机项

**已由 AI 审核/程序化证据闭环**：9 view CDP 截图视觉复核 0 功能性回归、games-lan/video-player/ai-agent 三交互态探针、R214 定时关机（shutdownScheduler 单测）、TTS 客观指标（R212 实测 22050Hz/328KB WAV 记录在案）、R130 预热链（打包产物日志：capture stack warmed + pool rebuilt）。

**仍需真机（环境不可达，如实保留）**：
- [ ] R130 截图提速 ≤500ms 5 轮取证：`node scripts/verify-r130-snip-fast.mjs`（SendKeys 键盘注入在无人值守会话不可达；预热机制已验证）
- [ ] R91.3b 降噪听感（主观听感，roundtrip 程序化证据已有）
- [ ] R93 真机 WebGPU 推理画质/降级 fps/28MB wasm 首载（5 项清单见 PRD R93）
- [ ] R145 Bedrock 真机（AK/SK 在用户手中）
- [ ] LAN 真双机 UDP beacon（本机双实例已知限制）
- [ ] P-4/P-5 冒烟：GLM 档 Agent 流式观感 + 中文 TTS 对比试听（桌面 wav 在另一台机器）

## D. 规划/搁置条款（待用户拍板，未动）

| 条款 | 内容 | 下一步 |
|---|---|---|
| R160.6 🔄 | 工作区灯效「三层漏斗」（注：ui/r164-effects-funnel 分支已有 S1-S4 实施，待核对合流） | 用户拍板 |
| R13.8 ⏳ | 开源推广就绪度（LICENSE ✅；CI/社区文件/徽章未做） | 用户定 |
| R14.8 ⏳ | 功能竞争力（⚠️ 阶段 1-2 与「不做真实硬件集成」裁决冲突） | 用户处置 |
| R15.8 ⏳ | 视觉竞争力（R148 体系已覆盖大部分） | 建议归档 |
| R16.12 ⏳ | 影响力扩展（arm64+Web Demo/插件 SDK/GIF 导出） | 用户选 |
| R90 P2/P3/P4 | 音频 AI 灯效联动/语音指令/EdgeTAM | 无限期搁置 |
| R177 P-5/P-6/P-7 | 声文增强/测试补齐/遗留清理 | 待排期（P-7 需产品决策） |
| R148 S5 桌面原生质感 | Mica（Win Server API 面缺失已裁剪）+ 系统 accent 联动（需新 IPC，PR-1 立 R-N） | 待立项 |
| 间距子节奏档 | q5 census 修正项：10px×51+6px×89 为事实 2px 子节奏（docs/design/q5-design-tokens.md） | 主干拍板 |

## E. 历史待验收积压 —— ✅ 已闭环

42 条 2026-06~07 🔄 条款 + R52 标题批量 ✅（commit f4f810f；证据链=发版使用史+干净全量基线+9 view AI 视觉复核，`docs/ui-review/r216/review.md`）。

## F. 已知限制/遗留备忘

| 项 | 说明 | 条款 |
|---|---|---|
| Edge 云端 TTS | 2026 起微软收紧（官方库同报 403），未集成 | R212 |
| beacon 本机双实例 | UDP 广播发现需真双机；手输 IP 直连兜底 | R209 |
| fs 态 Slash 对决面板 | duel-panel 在 fs 下隐藏（回合格式建议非 fs 进行） | R208 |
| Piper 混合导出 | 中英混排逐句路由+22k→24k 插值 | R212 |
| Agent denylist 边界 | Windows 盘根路径写法枚举不可穷尽，审批层为主防线 | R176 |
| pi 引擎动态验证 | scripts/pi-spike.mjs 待 API key 实跑 | R172 |
| electron zip 缓存 | 本机缓存残缺致打包 ENOENT，用 electronDist 绕过（已记 memory） | 环境 |
| LAN Tetris 开局时刻 | 双方独立按 Start（种子保证序列一致），非严格同时开局 | R209 |
| sendKeys 无人值守 | 键盘注入类 verify 脚本需真机交互会话跑 | R130 |
