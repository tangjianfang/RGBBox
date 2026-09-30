# 05 安全与稳健性审查 —— media:// 协议 / 危险命令与凭据 / 配置与外部 IO

- 审查对象：`C:\tjf\github\RGBBox` @ HEAD `93d365f`（未发布；0.3.84 zip=03477e1946a114c1 已发布，本文全部结论基于 HEAD 工作区代码，未逐文件核对 0.3.84 差异——局限①）。
- 方法：全代码通读（main 进程 36 文件中 18 个逐行，其余定向 grep）+ 真机用户数据只读核对 + 2 个对抗 driver（共 74 个对抗输入，见 §4）。用户密文（enc:v1:）未做任何解密尝试。
- 实验目录：`C:\Users\tjf\AppData\Local\Temp\rgbbox-review-20261001\exp\`（driverA_media_shutdown_agent.mjs、driverB_shutdown_agent_config.mjs、argvprobe.mjs；纯函数从仓库 `cp` 逐字节副本 + Node 23.11 `--experimental-strip-types` 执行）。

---

## 1. 摘要（Top 风险按处置优先级）

| # | 发现 | 一句话 | 置信度 |
|---|---|---|---|
| 1 | T-C1 | system.json/profile.json 非原子直写；坏 JSON 时静默返回 `{}`，下一次任意 save 把 AI 密文 profiles/热键/屏保**整份清空**（实测 6 样本中 5 个触发）；并发 save 丢更新（实测）。这是用户数据丢失类最高频风险 | 高（实验复现） |
| 2 | T-B1 | AI agent 的「always allow」按**首词前缀**放行后续命令：批一次 `npm install` 后 `npm install; shutdown /s /t 0` **不再询问**（实测）；bash denylist 可 trivially 绕过（实测 3 形态）；`trust` 档跳过全部审批 | 高（实验复现） |
| 3 | T-A2 | `media://app` 路径守卫可被**段内编码斜杠**穿透：`media://app/%2e%2e%2f…` 实测逃出 `out/renderer` 根，读取任意路径文件（与 T-A1 同信任边界） | 高（实验复现） |
| 4 | T-A1 | `media://local?p=` 对**任意本地路径零校验** + 响应 `Access-Control-Allow-Origin: *` + scheme 特权含 `corsEnabled/supportFetchAPI`。当前外部站不可达（handler 仅注册在 default session，AI8 外部站窗在 `persist:ai8`），但主窗口渲染层一旦有 XSS 即可读任意本地文件 | 高（代码+实验；XSS 入口未发现） |
| 5 | T-A3 | AI8 登录窗加载外部站 `https://ai8.rcouyi.com/`：该 `persist:ai8` session **没有任何 permission handler**（Electron 默认全批）且窗口无 `setWindowOpenHandler` → 站点可无提示 getUserMedia（摄像头/麦克风）、任意 window.open | 高（代码）/ 默认放行为 Electron 文档行为，未真机 |
| 6 | T-B3 | `aiGetSettings` 把 **DPAPI 解密后的明文 apiKey** 返回渲染层（React 状态持有）；safeStorage 不可用时密钥**无标记明文落盘** | 高 |
| 7 | T-B4 | 模型下载完整性不对称：splat/音频 onnx 仅字节数 ±10%（.splat 连这个都没有，下载完成时零校验），而 RapidOCR/TTS 全 sha256 固定——信任链只靠 HTTPS | 高 |
| 8 | T-A4 | 主窗 `setWindowOpenHandler` 直接 `shell.openExternal(url)` **无 scheme 白名单**；AI markdown 链接可被 OCR 文本/媒体文件名 prompt-injection 后经系统协议处理器打开 | 中高 |

shutdown 本体（用户日志 ×4 失败的 R214 域）：实现干净，注入面排除，失败处理仅缺 stderr 细节——见 T-B2。

---

## 2. 发现清单

### A 块：media:// 协议与文件服务面 + vision host

**T-A1 `media://local` 任意本地文件服务（设计如此，但零约束 + 宽 CORS）**
- 位置：`src/main/index.ts:1602-1616`（handler：`filePath = mediaUrl.searchParams.get('p') ?? ''`，无任何白名单）；`src/main/index.ts:67-70`（特权注册 `secure/standard/supportFetchAPI/corsEnabled/stream`）；`src/main/mediaProtocol.ts:131-135`（`Access-Control-Allow-Origin: '*'`）。
- 复现：`media://local?p=C%3A%5CUsers%5Ctjf%5CAppData%5CRoaming%5Crgbbox%5Cconfig%5Csystem.json` 即返回该文件（driver A `localP` 组，路径原样取回，无校验）。`.js/.mjs/.wasm` 都在 MIME 表内（`mediaProtocol.ts:30`）。
- 信任边界（重要修正）：全局 `protocol.handle` 只作用于 **default session**；AI8 外部站窗口用 `partition:'persist:ai8'`（index.ts:649）不经此 handler；渲染层全部 window.open 均带 `^https?://` 门（AiLabAi8Tab.tsx:1244,1266）且主窗 openHandler 转系统浏览器——**未发现外部内容落入 default session 的路径**。因此当前不可远程直达，属「渲染层一旦失守即全盘文件可读」的纵深缺失。
- 后果：主窗口/overlay（default session）任何脚本执行 → 任意本地文件读取（浏览器 profile、SSH 配置、system.json 密文），且可经用户配置的 AI baseUrl 或 fetch 外带。
- 修复：①`p=` 路径限制为用户经对话框选过的会话清单（audio/video playlist 已有持久化可复用）；②MIME 只放行音视频/图片；③ACAO 收敛为同源（`media:` 自身）而非 `*`。
- 置信度：代码行为=高；「无 XSS 入口」=当前结论（markdown 经 escapeHtml、无 dangerouslySetInnerHTML、无 iframe/外部导航——已验证）。

**T-A2 `resolveAppAssetPath` 段内编码斜杠穿越（实验证实）**
- 位置：`src/main/mediaProtocol.ts:49-57`。split('/') → `decodeURIComponent` → 只拒绝「整段===`..`／含`\`／盘符」。
- 复现（driver A）：`media://app/%2e%2e%2f%2e%2e%2f%2e%2e%2fWindows%2fwin.ini` → ACCEPT `…out/renderer/../../../Windows/win.ini` → 规范化 `C:\app\Windows\win.ini`，**逃出根**；`media://app/a%2f..%2f..%2f..%2fsecret` 同样逃逸。根因：WHATWG URL 解析器只把整段恰好为 `..`/`%2e%2e` 的段当 dot-segment（所以 literal `..` 反而被规范化、不逃逸——见 §5），段内 `%2f` 解码发生在检查之后。
- 后果：与 T-A1 同界（default session 渲染层），多绕一层无意义但说明守卫不自洽；若未来该路由被更敏感地使用（如仅 app 资产可执行 wasm）即成漏洞。
- 修复：decode 后按 `/` 与 `\` **重切**再检查；或最终 `path.resolve` 后 `startsWith(resolve(root) + sep)` 终检（后者一劳永逸，建议同时兜 T-A1 的 app 路由）。
- 置信度：高（两个输入实验逃逸）。

**T-A3 AI8 外部站窗口：无 permission handler + 无 window-open 拦截**
- 位置：`src/main/index.ts:637-651`（窗口创建，`partition:'persist:ai8'`，无 `setWindowOpenHandler`）；`index.ts:1561-1566`（permission handler **只挂 `session.defaultSession`**）。
- 后果：外部站（及其加载的第三方脚本）在 `persist:ai8` 内请求 `media`（getUserMedia 摄像头/麦克风）、`notifications`、`geolocation` 等——该 session 无 handler，Electron 默认**批准**且无浏览器权限气泡；`window.open`/`target=_blank` 会继续在应用内开新 Electron 窗口（继承分区）。
- 修复：`session.fromPartition('persist:ai8').setPermissionRequestHandler(全部拒绝)`（或仅 notifications）；该窗口加 `setWindowOpenHandler(() => ({action:'deny'}))`（登录流程不需要开新窗）。
- 置信度：代码事实=高；「默认放行」为 Electron 文档行为，未真机验证（标注）。

**T-A4 `shell.openExternal` 无 scheme 白名单（prompt-injection 可达）**
- 位置：`src/main/index.ts:208-211`；触点 `src/renderer/src/ai8/markdown.tsx:183`（AI 输出 `<a target=_blank>`）。
- 复现：AI 回复含 `[领取奖励](search-ms:query=…)` 或 `file://`/`smb:` 链接 → 点击 → openExternal 把 scheme 交给 OS 注册处理器。AI 输入侧有 OCR 文本、媒体文件名、AI8 站内内容等不可信源（prompt injection 载体）。
- 修复：openHandler 内 `new URL(url)` 校验 `protocol === 'https:' || 'http:'`，否则拒绝；markdown 渲染层同步过滤链接 scheme。
- 置信度：链路代码=高；实际危害取决于目标机 scheme 注册表（Win11 对多数危险 scheme 有确认弹窗）。

**T-A5 visionHost BroadcastChannel init 无鉴权（低）**
- 位置：`src/renderer/src/visionHostMain.js:39`（`await import(cfg.bundleUrl)`——URL 来自频道消息）；`src/renderer/src/hooks/useVisionInput.ts:185-209`（init 发送方）；`visionAssetBase.ts:6-8`（正常来源固定 `media://app/`，非用户可控）。
- 后果：与 visionHost 同源的页面可伪造 init 注入任意 JS URL。当前同源页只有本应用各窗口（dev localhost / prod file:）；AI8 站为 https 不同源不可达。
- 修复：host 内置 bundle 基址，init 只接受模式类参数；或校验 `cfg.bundleUrl.startsWith('media://app/')`。
- 置信度：高（代码），实际可达性=低。

**A 块其余（核对，无重大问题）**：
- LAN：`shared/lanProtocol.ts` 帧 256KB/beacon 4KB 上限、版本握手、坏 JSON 在 `lanService.ts:225-232,166-174` try/catch 断连——解析健壮（验证）；UDP 53891 全网卡绑定+广播、TCP 0.0.0.0、无鉴权（by design，局域网游戏，风险接受——房主接受任意同版本 peer 的 cmd，消费面仅游戏指令）。
- 捕获存储 `captureStore.ts`：文件名内部生成（`cap-<kind>-<ts>-<rand>.png`）、索引只存 basename 且加载时 `basename()` 收敛（:88-90）——无穿越；FIFO 200、30MB 上限。索引直写非原子（归 T-C1 家族）。
- snip/浮窗未发现额外文件服务面。

### B 块：危险命令与凭据

**T-B1 AI agent bash 门禁三缺口（实验复现）**
- 位置：`src/main/agentTools.ts:80-98`（denylist）、`174-209`（toolBash：bash 缺席时 `spawn(command,{shell:true})` 走 cmd.exe）；`src/main/agentService.ts:181-185`（`trust` 模式免批）、`231-241`（always-allow 前缀）。
- 实测（driver B）：
  1. denylist 绕过：`r""m -rf /`（bash 引号拼接）、`echo cm0gLXJmIC8K|base64 -d|bash`、`powershell Stop-Computer -Force` 全部 **PASS**（`cmd /c shutdown /s` 因 `shutdown` 子串恰被拒）；
  2. always-allow：批准 `npm install`（always）后，`npm install; shutdown /s /t 0`、`npm install && r""m -rf ~` **AUTO-APPROVED 不再询问**（首词前缀匹配 `cmd.startsWith('npm ')`）；
  3. `trust` 档（agentService.ts:182）一切工具免批。
- 缓解（已验证存在）：read/write/edit/list/glob 钳制 workspace（clampToWorkspace 实现正确：resolve+relative+绝对路径拒）；write/edit 落地前 .bak + 临时文件 rename 原子写；审批 UI 三档 + `logs/agent-audit.jsonl` 审计；120s 超时 + 64K 输出截断；workspace 来自原生目录对话框（`agentPickWorkspace` index.ts:813-816）。
- 次要：超时 `child.kill()` 在 Windows 只杀 bash.exe 不杀子进程树（长跑孙进程存活）；`MAX` 16MB 缓冲按 chunk 越界一拍（无害）。
- 修复：①always 键改为「命令全等」或「首词 && 命令无 `;|&&\n` 连接符」；②kill 用 `taskkill /PID <pid> /T /F`；③denylist 注释明示是启发式防线非安全边界；④`trust` 档 UI 明示「无任何门禁」。
- 置信度：高。定性：本地单人工具的 AI agent 固有风险面，门禁设计合理但实现有上述绕行空间。

**T-B2 R73/R214 定时关机：注入面排除，实现干净（核对你的 ×4 日志）**
- 位置：`src/main/shutdownScheduler.ts:37-58`。`execFile('shutdown', ['/s','/f','/t',N,'/c',comment])` **无 shell**。
- 实测（driver B，用 node.exe 当目标进程，未触碰 shutdown.exe）：5 个恶意注释（`x" & calc.exe & "y`、`a && whoami`、换行+`/t 0`、中文+`%PATH%`）全部作为**单个 argv 元素原样传递**，零元字符解释——命令注入不可行；且 comment 是硬编码常量，跨 IPC 的只有 seconds（`validateArmSeconds` 1..86400，8 个边界样本全对：0.5/-5/NaN/1e9/86401 拒，1800/7200/86400 放行）。
- 失败处理：`runShutdown` 失败 → log ERROR + 返回 `spawn-failed` 码，UI 按码显示（R214 已修「误标仅支持 Windows」）。无重试（OS 命令幂等，可接受）。你日志里的 ×4 `Command failed: shutdown /s /f /t 7200…` 即此路径；`err.message` 不含 shutdown.exe 的 stderr 输出（如「系统关闭正在进行」具体原因），排障信息不足——建议 log 附 stderr。
- 取消路径 `shutdown /a` 同构。deadline 持久化 informational、OS 计时器独立于应用（规格明确）。一键武装无二次确认为 PRD R73 规格（PRD:583-584 只要求 HUD+按钮，无确认弹窗承诺）；`/f` 强杀未保存应用值得在 UI hint 里明示。
- 置信度：高。

**T-B3 AI 凭据存储与流转**
- 落盘：`system.json` 的 profiles 内 `enc:v1:` + base64(DPAPI)（`aiSecretCodec.ts:11-16`；codec 注入 `safeStorage`，index.ts:370-385）。**明文回落**：`encodeApiKey` 在 `safeStorage` 不可用时**原样返回明文且无标记**（:14），`decodeApiKey` 无前缀即当明文回（:19，legacy 迁移路径）——Windows 默认 DPAPI 可用（你的文件即 enc:v1:），Linux 无 keyring 时密钥明文落盘；`ai8-credentials.json` 同策略（ai8Credentials.ts:33-38，注释自认）。117 字节与 account+enc 密文吻合。
- **明文跨 IPC**：`aiGetSettings`（index.ts:447-453）经 `loadAiStore`（:399-409，`decodeProfileSecrets`）把**解密后明文 apiKey** 返回渲染层并进 React 状态。请求本体（aiChat/agent/cleanup）都在 main 发起（:761-762, agentService callModel）——只有这一个是例外。
- 日志/遥测：grep 全仓未发现 apiKey/password 入日志或 agent-audit（audit 只记 args 与决定，bash 的 args 是命令字符串；write 的 content 不入 audit——agentService.ts:205,254）。
- 修复：aiGetSettings 返回 `{hasKey:key!==''}` 而非明文；渲染层编辑态保留「留空=不改」；明文回落时在文件内加 `plain:v0:` 标记以便日后迁移识别。
- 置信度：高。〔假设待证伪〕crash dump 泄露：见 T-C3。

**T-B4 模型下载完整性不对称**
- 位置：`src/shared/modelsManifest.ts`（github releases ×5 splat + hf-mirror ×5 onnx，URL 硬编码固定、不可配置——SSRF 面不存在）；下载器 `index.ts:1280-1334`（重定向≤10、断点续传、4 次退避重试——对应你日志 ×9 ECONNRESET/ETIMEDOUT 的自愈路径）；完成时**零校验**（modelDownload :1483 直接返回 file URL）。缓存校验仅 `audioModelBytes` ±10%（:1236-1262），**且只覆盖 onnx 音频模型，.splat 无任何检查**；catch 里 `unlink(destPath)`（:1486）与「保留断点续传」注释相悖（最终失败清掉断点）。
- 对照：RapidOCR（rapidOcrService.ts:97-126）与 Kokoro/Piper TTS（ttsService.ts:65-94,206-210）全部 sha256 固定+临时文件校验——同一仓库两套标准。
- 修复：manifest 补 sha256，下载完成与缓存命中统一走哈希校验；断点文件按 R90 意图保留。
- 置信度：高。

### C 块：配置与外部 IO

**T-C1 配置持久化：非原子 + 坏文件静默全量清空 + 并发丢更新（全部实验复现）**
- 位置：`src/main/systemSettingsStore.ts:42-58`、`src/main/profileStore.ts:13-31`（同一写法：直接 `writeFile`，无 tmp+rename；load catch-all → 默认值）。
- 实测（driver B cfgParse 组，等价逻辑+临时目录）：
  - BOM+JSON / 截断 / 根为数组 / `null` 字面量 / 空字符串 → load 得 `{}`（或 **null**——`JSON.parse('null')` 不抛错，直穿 catch，真实 store 会把 null 外漏给调用方）→ **下一次任意 save**（哪怕只是写 shutdownDeadline）把文件覆盖为只剩新键：AI profiles（含密文 key）、snip 热键、屏保配置**全部丢失且无备份**。6 样本中 5 个触发。
  - 字段级类型错误（布尔写字符串）不丢数据（spread 保留）——只有解析级损坏触发清空。
  - 并发 read-modify-write 丢更新实测（`{a,b}` 丢 `c`）：aiStore 域有 `runAiStoreOp` promise 队列（index.ts:390-395，好评），但 `armShutdown→saveSystemSettings`（shutdownScheduler.ts:75）与电源/屏保等写入**不排队**。
- 后果：断电/崩溃瞬间的半截 JSON，或任何一次外部损坏，都在下次启动+首次保存后放大为整份配置蒸发。这是本报告处置优先级第一的稳健性问题。
- 修复：①`writeFile(tmp)` + `renameSync`；②load 失败时把坏文件改名为 `system.json.corrupt-<ts>` 并返回 `{}`；③`parsed && typeof parsed==='object' && !Array.isArray` 校验（同时堵 null 漏洞）；④所有 saveSystemSettings 调用统一过队列。
- 置信度：高（实验）。

**T-C2 日志隐私与量**
- 位置：`index.ts:53`（`minLevel:'debug'`）+ `index.ts:1621,1628`（每请求 `filePath`/streaming 两条 debug）→ 即你日志 ×967 条 `[MediaProtocol] filePath` 的根因，含 Downloads 中文媒体全路径。shared/logger.ts 5MB×5 轮转（量可控）。
- 修复：发布版 minLevel 收敛为 info，或 filePath 记 basename。
- 置信度：高（代码+用户日志双重确认）。

**T-C3 Crashpad**
- 代码：`crashLog.ts:26` `crashReporter.start({uploadToServer:false})`——零上传（确认无网络出网点）；rotated JSON 崩溃记录 KEEP=20。
- 实况（只读核对 `userData/Crashpad/`）：`attachments/`（空）、`reports/`（0 个 dump）、`settings.dat`/`metadata`——本机尚无 dump 积累；注释声称 dumps 在 `userData/logs` 下（crashLog.ts:4-5）与实际 `userData/Crashpad` 不符（文档性偏差）。
- 〔假设，待证伪〕若主进程真崩溃，minidump 含内存快照，可能带解密后的 AI key/TTS 文本——本地磁盘同账户可读，属可接受但应在隐私说明中声明；Crashpad 无应用侧轮转上限（长期积累风险，当前未发生）。
- 置信度：代码=高；dump 内容敏感度=推断未验证。

**T-C4 agent-sessions 与审计（隐私旁注）**
- `userData/agent-sessions/*.jsonl`（实测 376KB）+ `logs/agent-audit.jsonl`：完整会话事件流，**含 tool args 与 results**（read 读到的文件内容≤4000 字、bash 输出、edit 前后 diff）明文落盘；无保留上限/清理策略（sessionsList 只展示 30 条）。同机其他账户不可读（用户目录 ACL），但同步/备份链路会带走。
- 修复：设置项「会话留存天数」；audit 与 session 同策略。
- 置信度：高（代码+实况）。

**T-C5 杂项稳健性**
- F2 DevTools 双注册：`index.ts:214-222` 与 `:225-229` 两个 `before-input-event` 监听器都对 F2 toggle——开/关互消，F2 可能失灵（顺带 `openDevTools` 在生产也可用，诊断设计如此）。
- localStorage：普查 60+ 键全部 `rgbbox:` 前缀（i18n/域 hook/games/view/theme/voice…），命名空间干净无冲突面；清缓存丢游戏难度/引导态/收藏/自动化/overlay 拓扑/语言档（profile 不受影响）——可在设置里提供「导出本地偏好」。
- media:// Range：`parseRangeHeader` 15 个对抗样本（0-99 越界、suffix -0、多区间、巨大数、空文件）全部安全判定（416/null/收窄 end），`mediaStreamPlan` Content-Length 恒正确（driver A）。
- persist:ai8 分区留存外部站 cookies/localStorage（含站点 token，LevelDB 明文）——站点自身行为，随 `clearStorageData`（fresh=true）可清。

---

## 3. 对抗实验统计

driver A（media:// 路径解析 28 + Range 16 + MIME 6 = 50 输入）、driver B（shutdown 秒数 8 + argv 注入 5 + denylist 7 + always 前缀 3 + 配置坏样本 6 + 并发 1 = 30 输入），合计 80 输入（T-A/T-B/T-C 交叉）。关键行：

| 输入 | 当前判定 | 应判 |
|---|---|---|
| `media://app/%2e%2e%2f…win.ini` | ACCEPT，规范化后逃出 renderer 根 | 拒绝（T-A2） |
| `media://app/a%2f..%2f..%2fsecret` | ACCEPT，逃逸 | 拒绝 |
| `media://app/../secret`、`/../../../…` | ACCEPT 但 URL parser 已规范化→根内 | 可接受（URL 前置挡住） |
| `media://app/%2e%2e%5c`、`C:%5c…`、`%5c%5cserver`（UNC）、`%00` | 拒绝/404 | 正确 |
| `media://local?p=<任意路径>` | 零校验服务 | 设计如此→建议白名单 |
| Range `bytes=100-`/`-0`/`5-2`/巨大数/多区间 | 416 或 null(200 全量) | 正确 |
| 秒数 0.5/-5/NaN/1e9/86401 | validate 拒绝 | 正确 |
| 注释 `x" & calc.exe & "y` 等 5 条 | 单 argv 元素原样（无 shell） | 正确（注入不可行） |
| `r""m -rf /` / `base64\|bash` / `Stop-Computer` | denylist PASS | 应视为危险（denylist 不完备） |
| `npm install; shutdown /s /t 0`（已 always 批 npm） | AUTO-APPROVED | 应仍询问 |
| system.json：BOM/截断/数组/null/空 | load→{}，下次 save 全量清空 | 应备份坏文件+保留可救字段 |
| 并发两次 save | 丢更新 | 应排队/合并 |

## 4. 已验证无问题 / 被推翻的假设

| 项 | 结论 |
|---|---|
| literal `..` 穿越 media://app | **被推翻**——WHATWG URL 解析器把 dot-segment 规范化掉，反而不逃逸；真正缺口是段内编码斜杠（T-A2） |
| shutdown /c 注释命令注入 | 排除（execFile 无 shell，实测 5 样本原样单参数） |
| parseRangeHeader 越界/负数/巨大 | 16 样本全安全 |
| LAN UDP/TCP 恶意包 | 帧上限+JSON try/catch 断连，健壮；无鉴权=by design |
| captureStore 路径/清理 | 内部命名+basename 收敛，FIFO 200，无穿越 |
| OCR PowerShell 注入 | 单引号 `''` 转义正确，脚本走临时目录+BOM |
| AI 密文误擦 | mergePreservedKeys 保留不可解密密文，设计周到（aiProfileStore.ts:88-110） |
| markdown XSS | 仅剪贴板富文本且先 escapeHtml；无 dangerouslySetInnerHTML、无 iframe、渲染层无外部导航 |
| vision 资产 URL 可控 | 固定 `media://app/`（visionAssetBase.ts） |
| 模型下载 SSRF/URL 可配置 | URL 全部硬编码固定，无用户输入点 |
| RapidOCR/TTS 模型完整性 | sha256 固定齐全（与 T-B4 的 splat/onnx 路径对照） |
| 外部站直接 fetch media:// | 当前不可达（handler 仅 default session；AI8 窗在 persist:ai8）——此为 T-A1 定级依据 |
| AI 凭据进日志/遥测 | grep 未见 apiKey/password 入日志；零遥测（crashReporter submit:false） |

## 5. 加固建议与测试草案

1. mediaProtocol：`resolveAppAssetPath` 改为 decode→重切→检查 + resolve 终检；单测补 `%2e%2e%2f`、`a%2f..`、双编码、NUL（现有测试只覆盖 literal 形态）。
2. systemSettingsStore/profileStore：原子写（tmp+rename）+ `.corrupt-<ts>` 备份 + 非对象根拒绝；单测用本报告 6 个坏样本 + 100 次并发 save 不丢键。
3. agentService：always 键改全等或首词+无连接符；`taskkill /T` 树杀；单测：`npm install; x` 不被 `npm ` 前缀放行。
4. persist:ai8：permission handler 全拒 + windowOpenHandler deny；真机验证 Electron 默认放行行为（本报告唯一未真机的行为断言）。
5. index.ts:208 openExternal 加 https/http 白名单；markdown 链接渲染同步过滤。
6. aiGetSettings 改返回 hasKey；aiSecretCodec 明文回落加 `plain:v0:` 标记。
7. modelsManifest 补 sha256，下载完成统一校验。
8. shutdown 失败日志附 stderr；F2 监听去重；minLevel 收敛。

## 6. 修复顺序

P0（数据丢失/门禁实效）：T-C1 → T-B1（always 前缀）。
P1（边界收敛）：T-A2、T-A3、T-B3（明文跨 IPC）、T-A4。
P2（完整性/卫生）：T-B4、T-C2、T-B1 树杀、T-C5 F2、T-C4 留存策略、shutdown stderr。

## 7. 未验证 / 局限

- 未启动应用：T-A3 的「Electron 默认批准 persist:ai8 权限」、T-A1 的「外部站 fetch media:// 必失败」均为文档级行为推断（后者有 session 注册机制佐证）。
- Crashpad dump 内容敏感度未取证（本机 0 dump）。
- 0.3.84 发布包与 HEAD 的差异未逐文件核对（含 agent/媒体协议是否同版本）。
- TTS「Edge 云端」出网点：ttsService.ts 仅见 hf-mirror/huggingface 下载与本地推理，未发现 Edge 云端出网代码——该说法未在本仓证实（可能属历史描述）。
