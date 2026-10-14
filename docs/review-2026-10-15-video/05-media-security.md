# RGBBox 视频工作站 · 媒体 IO 边界安全审查（05-media-security）

- 审查对象：`C:\tjf\github\RGBBox` @ main（1643532），Electron 41.4.0 / Chromium，win32
- 范围：media:// 自定义协议、网络流播放、captureStore/导入、恶意媒体文件、下载落盘、截图内容
- 方法：静态审读 src/main + src/renderer 相关文件；用 esbuild 将 `mediaProtocol.ts`/`mediaAllowlist.ts` 原样编译到临时目录后以 Node 实测路径判定函数（仓库零改动、未启动应用、未联网）；`%APPDATA%\rgbbox` 只读核验实际数据形态
- 威胁模型前提（务实）：本地单用户桌面应用，无远程暴露面。主要风险面 = ①越权读本地文件（需以"renderer 被攻破/脚本注入"为前置，当前 renderer 仅加载本地打包代码，网络流只进 `<video>` 不进脚本上下文，故此类问题按纵深防御定级）；②恶意媒体文件打崩进程；③用户可感知性/隐私。

---

## Top 风险（按实际可利用性排序）

1. **T-1（中）**：`media://app` 资产路由存在 `%2F` 编码穿越，`resolveAppAssetPath` 的 `..` 检查可被绕过，能把 renderer 安装目录外的任意文件以 `ACAO:*` 200/206 响应读出（含按扩展名以 `text/javascript` 提供 .js）。这是对代码注释里明确承诺的 "rejects traversal / keeps the mapping inside the root" 边界的实际击穿；利用前置是 renderer 脚本执行权，当前无已知注入面，故为纵深防御级而非可直接利用。
2. **T-2（低-中）**：播放列表 JSON 的任意绝对路径即 media://local 白名单条目（精确匹配），且 `videoSavePaths`/`audioSavePaths` IPC 对 path 字符串零校验——被篡改的列表文件等价于白名单旁路（同样以 renderer 攻破/本地篡改为前置）。
3. 其余（低/信息级）：http 明文流、read() 无大小上限、Roaming 明文截图清单等，见清单。

---

## 发现清单

### T-1 `media://app` 的 `%2F` 编码路径穿越（root 逃逸）
- **位置**：`src/main/mediaProtocol.ts:49-57`（`resolveAppAssetPath`），调用点 `src/main/index.ts:1689`
- **复现输入**（实测，真实编译产物）：
  ```text
  resolveAppAssetPath('C:\\app\\resources\\out\\renderer',
      '/..%2F..%2F..%2F..%2FUsers%2Ftjf%2FDocuments%2Ftax.pdf')
  → 'C:\\app\\resources\\out\\renderer/../../../../Users/tjf/Documents/tax.pdf'   （应为 null）
  ```
  根因：先 `split('/')` 再逐段 `decodeURIComponent`，段内 `%2F` 解码出的 `/` 与 `..` 拼接后不再复查。URL 层不救：实测 `new URL('media://app/..%2F..%2Fx').pathname === '/..%2F..%2Fx'`（WHATWG 解析保留 %2F，不做段归一化；Electron standard scheme 同族算法）。对照组：字面 `/a/../../secret.txt`、`%5C` 反斜杠、`C:` 盘符段均正确返回 null。
- **后果**：packaged 构建中（仅 file:// 时走该分支，见 `src/renderer/src/hooks/visionAssetBase.ts:6-8`）handler 对返回路径直接 `stat` + `createReadStream`（index.ts:1723/1734），可读取安装盘上 renderer 根之外的任意文件；响应带 `Access-Control-Allow-Origin:*` + Range 分段（mediaProtocol.ts:131-138），且 `.js` 扩展名映射 `text/javascript`（mediaProtocol.ts:30）——一次 renderer 注入即可将其变成"全盘任意文件读取 + 脚本供给"原语。逃逸路径含 `..` 分段时超出 asar 根即落回普通 fs，asar shim 不拦截。
- **修复**：解码后增加 `segment.includes('/')` 拒绝（与现有 `\\` 检查对称）；或对最终路径做 `path.resolve` 后以 `path.relative(rendererRoot, p)` 前缀判定（不以 `..` 开头才放行），并对解析结果做一次 `fs.realpath` 包含检查。
- **置信度**：代码级缺陷 **高**（实测复现）；运行期可利用性 **中**（未在打包应用内做端到端 PoC——审查约束禁启动应用；URL/解码/fs 三环节均已单独实证）。

### T-2 播放列表 JSON 即隐式白名单；save IPC 零校验
- **位置**：`src/main/index.ts:1701-1711`（每次 media 请求 `loadPlaylist` 后把 `item.path` 逐一 `resolve` 加入白名单）、`src/main/mediaAllowlist.ts:39`（`playlistPaths.includes` 精确放行）、`src/main/index.ts:1431/1469`（`audioSavePaths`/`videoSavePaths` 直收任意 `path` 字符串）、`src/main/playlistStore.ts:21-24`（load 不做条目形状/类型校验）
- **复现输入**：实测 `isMediaPathAllowed('E:\\media\\library\\clip.mkv', ['E:\\media\\library\\clip.mkv'], roots) → true`（任意盘符/目录）；把 `video-playlist.json` 某条 `path` 改为 `C:\Users\tjf\Documents\tax.pdf` 后，`media://local?p=C%3A%5CUsers%5Ctjf%5CDocuments%5Ctax.pdf` 即 200（扩展名不限，MIME 回落 octet-stream）。实际数据核验：`%APPDATA%\rgbbox\config\video-playlist.json` 确为绝对路径数组。
- **后果**：设计上这是"用户自选目录播放"的正当放行（R268），但等价于"谁能写这两个 JSON，谁就能把任意文件变成 renderer 可读资源"。写入口有二：renderer IPC（=renderer 攻破，与 T-1 同门）与本地篡改（已有本机写权限，超出威胁模型）。注意 IPC 侧不校验扩展名，`tax.pdf` 也能存进去并被放行。
- **修复**：save 时校验 `path` 扩展名 ∈ 播放列表媒体集合 + `existsSync`；或把白名单登记与持久化解耦，登记时要求路径来自 file dialog 结果。顺带：每次 media 请求同步读两个 JSON（index.ts:1701-1704）属每请求 fs I/O，可缓存 + 失效刷新（性能项，非性质问题）。
- **置信度**：**高**（实测判定函数 + 实机数据核验）。

### T-3 media://local 白名单本体：实测通过（已验证无问题，附两条 fail-closed 备注）
- **位置**：`src/main/mediaAllowlist.ts:23-40`、`src/main/index.ts:1693-1715`
- **实测矩阵**（编译产物直跑，见下文"实测"节全表）：`..` 归一化逃逸、UNC（`\\attacker\share`）、设备路径（`\\.\pipe\`）、8.3 短名（`DOWNLO~1`）、前缀伪装（`Downloads-evil\`）、邻居文件（同目录未登记）——全部拒绝；captures/models/ai8-artifacts/Downloads/Music/Videos 及精确播放列表条目——放行。`p=` 缺省时 `resolve('')`=cwd，cwd 不在白名单 → 403，无绕过。
- **备注 a（fail-closed 的功能代价，非漏洞）**：前缀比较大小写敏感且分隔符敏感（`underRoot` 为字符串 `startsWith`），`c:\users\...` 小写盘符或 `/` 正斜杠路径会被误拒（用户侧表现为播不了，不是放行）。OneDrive"文件夹备份"重定向 Downloads 后 `home\Downloads` 与实际已知目录可能不一致，同样表现为误拒。
- **备注 b（残余，本地写前置）**：判定基于 `path.resolve` 字符串而非 `realpath`——允许根内 symlink/junction 指向任意处会被跟随。放置 junction 需本机写权限，超出威胁模型，记录备查。
- **置信度**：**高**。

### T-4 网络流：URL 无 scheme 校验、http 明文、SSRF 面务实评估
- **位置**：`src/main/../renderer` 侧 `src/renderer/src/components/VideoStudioView.tsx:784-807`（`loadStreamUrl`：文本框输入 → `.m3u8` 判定 → hls.js 或 `<video src>` 直链）、`:295-297`（remote http(s) 保持 No-CORS，不设 crossOrigin）
- **评估**：
  - 输入为用户手输 URL，无 scheme 白名单。`file:///C:/...mp4` 直链在 packaged（file:// origin）下可播——但用户本就有 playlist/`onPlayerFile` 任意本地播放能力，且 file→file 帧污染 canvas（无像素读取原语），不构成越权；dev（http://localhost origin）下被同源策略拦。
  - http 明文：MITM 可换流内容 → 后果限于解码层（Chromium 媒体管线）与 hls.js JS 解析器（fatal error 有 UI 反馈 ：796-798），无脚本执行面；`crossOrigin` 缺省使远端帧进不了 canvas（:291-293 注释确认是有意为之），导出路径有 SecurityError 捕获（:680-687）。证书错误未做任何放行（全仓无 `certificate-error` handler、无 `webSecurity:false`/`allowRunningInsecureContent`）——默认拒绝，正确。
  - SSRF：桌面本机视角下，renderer 本就能对任意 http(s) 发 No-CORS 请求；hls.js 重定向仅限 http(s)（无法升到 file://）。无凭据附带、跨域响应体不可读，探测内网服务的增量价值≈浏览器开个标签页。定信息级。
  - `setWindowOpenHandler` 一律 `shell.openExternal` + deny（index.ts:232-235），网络内容不会进入应用窗口执行。
- **修复建议（可选）**：输入侧限定 `http(s)` scheme 再加载；UI 提示 http 明文风险。
- **置信度**：**高**（行为均有 file:line 依据；"Chromium 拒绝 file→file canvas 读"为平台常识级，未运行验证）。

### T-5 captureStore：导入/索引健壮性总体良好；read() 无上限为残余项
- **位置**：`src/main/captureStore.ts:148-184`（importFiles）、`:31-44`（parseIndex）、`:87-96`（loadIndex）、`:136-147`（read）
- **已验证无问题**：importFiles 仅收 dialog 结果（index.ts:335-343），扩展名集合 + 存在性 + 30MB 上限（`MAX_PNG_BYTES`，captureStore.ts:27/156）；单文件失败跳过不阻断。**parseIndex 虽不校验 `file` 内容，但 loadIndex 用 `basename(e.file)` 强制收编回 captures 目录**（:92）——篡改 `file:"../../evil"` 或绝对路径都退化成目录内文件名，越权面不存在（此前主审担心的点已被此行闭合）。`nextCaptureFile` 含 4 字符随机段，写覆盖碰撞概率可忽略。
- **残余**：`read()` 对 captures 目录内文件无大小上限——目录内容全部由本 store 写入（add/addPng/import 各有 30MB 闸），故正常态有界；仅在"本地攻击者已能写 userData"时才可塞大文件 + 篡改索引触发主进程整读 + base64（1.33x 放大）过 IPC。超出威胁模型，记录为加固项（read 前按 stat 截断/拒绝）。
- **置信度**：**高**。

### T-6 恶意媒体文件：崩溃可恢复、canvas 有界
- **位置**：`src/main/index.ts:192-197`（主窗口 `render-process-gone` → 结构化日志 + 自动 reload）；`src/renderer/src/components/video/superres.ts:41,67-87`（`DEFAULT_MAX_INPUT_PX=1024*576`，`planSuperresPass` 超限比例收缩 + `MIN_INPUT_EDGE=32` 下限）
- **评估**：畸形 webm/mp4 最坏打崩 renderer 进程 → 自动重载恢复（用户感知为闪一下，非僵尸白屏）；GPU 进程崩溃由 Chromium 自恢复。超大分辨率图：超分管线输入被钳制在 ~58 万像素；`<img>` 解码受 Chromium 像素上限（约 16k 边长/总面积闸）保护，最坏 OOM 崩 renderer 亦走重载。hls.js 炸弹 playlist（超长 EXTINF 列表）消耗 renderer 内存，h2 可 destroy（:744），重载兜底。未发现可打崩**主进程**的媒体路径（媒体字节不进主进程解析；media handler 仅 stat+stream）。
- **置信度**：**中**（防线代码实证；解码器崩溃场景未实际构造运行）。

### T-7 下载落盘：默认走保存对话框，无静默覆盖（已验证无问题）
- **位置**：`src/renderer/src/components/VideoStudioView.tsx:726`（`rgbbox-recording-{Date.now()}.webm`）、`:433`（photo png）、`:1261`（clip webm）、`SnipView.tsx:124`、`AudioStudioView.tsx:2051` 等
- **评估**：全仓无 `will-download` handler / `setSavePath`。Electron 41 `electron.d.ts:8210-8219` 明示：未设保存路径时"original routine … usually prompts a save dialog"，且 Chromium 下载管理器对同名文件自动追加序号，不静默覆盖。`Date.now()` 命名进一步压低碰撞概率。用户可感知性达标。注意：此结论是文档级；若未来加 will-download 自动落盘，需保留重命名语义。
- **置信度**：**中-高**（未启动应用实测对话框行为）。

### T-8 截图内容：明文落 Roaming + 明文清单（如实评估：产品语义内，附隐私备注）
- **位置**：`src/main/captureStore.ts:4-9`（"只落原始 PNG 字节"铁律）、`%APPDATA%\rgbbox\captures\*.png` + `index.json`（实测：明文数组，含 id/file/name/ts/kind，FIFO 200 条）；写入源 = 拍照/snip/窗口截图（index.ts:327-330, 346；R290.2 addBuffer）
- **评估**：截图工具存原图是其功能本身，不算缺陷；无加密、无脱敏符合语义。两点值得在设置/文档提示：① `userData` 在 `%APPDATA%`（Roaming）——域环境 Roaming Profile 会把 captures 随配置文件漫游到域服务器，企业用户可能未预期；② index.json 是带时间戳的行为清单（何时截了 annotated/snip/photo）， forensic 价值高于文件本身。建议（信息级）：设置里提供"退出时清空拍摄缓存"开关或可配置保留份数，README/设置页注明存储位置。
- **置信度**：**高**（实机数据核验）。

### T-9（信息）media:// 域的既定信任面
`registerSchemesAsPrivileged` 赋予 media:// `secure+standard+supportFetchAPI+corsEnabled+stream`（index.ts:72-74），permissionGate 对 `media:` origin 放行设备权限（permissionGate.ts:42）。media://app 分支 MIME 表含 `js/mjs → text/javascript`（mediaProtocol.ts:30）——若攻击者拿到安装目录写权限（per-user 安装时无需管理员）即可向 media:// 域供脚本。与 T-1 叠加后供脚本面扩大到 renderer 根外。单独看为既定设计（vision 模块需要），记录信任边界即可。**置信度高**。

---

## media:// 路径解析实测（probe 全记录）

脚本：`C:\Users\tjf\AppData\Local\Temp\rgbbox-review-video\probe\probe.js`（esbuild 编译自仓库 `src/main/mediaProtocol.ts` + `mediaAllowlist.ts`，零改动原逻辑）。输出摘要：

```text
=== media://app resolveAppAssetPath（rendererRoot=C:\app\resources\out\renderer）===
plain asset                       -> 正常映射
/a/../../secret.txt               -> null（拒）
/..%2F..%2F..%2F..%2FUsers\...    -> 根外路径（T-1，逃逸）
/a%5C..%5C..%5Csecret.txt         -> null（拒）
/C:/Windows/win.ini               -> null（拒）

=== media://local isMediaPathAllowed（典型 roots）===
captures/models 类文件             -> true
Downloads\Movie                    -> true
Documents\tax.pdf                  -> false
Downloads\..\..\Windows\win.ini    -> false（resolve 归一化后拒）
c:\ 小写盘符                       -> false（fail-closed 误拒）
C:/ 正斜杠                         -> false（fail-closed 误拒）
\\attacker\share\evil.mp4（UNC）   -> false
\\.\pipe\srvsvc（设备）            -> false
DOWNLO~1 短名                      -> false
Downloads-evil\ 前缀伪装           -> false
播放列表精确条目 E:\media\...      -> true
同目录邻居未登记                    -> false
```

URL 层补充：`new URL('media://app/..%2F..').pathname` 保留 `%2F`；字面 `..` 段会被 URL 归一化掉（`/a/../b.js → /b.js`），与 T-1 无关。

## 被推翻的假设 / 已验证无问题

1. ~~"media://local `p=` 可指任意路径"~~——R221.5/R268 白名单实测为 deny-by-default，穿越/UNC/设备/短名/前缀伪装全拒（T-3）。
2. ~~"index.json 的 file 字段可指向目录外"~~——`loadIndex` 的 `basename()` 收编使其失效（T-5）。
3. ~~"AI8 远程站点可借 media:// 读本地文件"~~——`protocol.handle('media')` 只注册在 default session；AI8 登录窗为 `persist:ai8` 独立分区（index.ts:690），该 session 无 handler，media:// 请求在网络层即失败；且该分区权限全拒（:701-704）。R221.5/R236 注释与实现一致。
4. ~~"录制 a.click() 静默覆盖下载目录同名文件"~~——无 will-download 定制，Electron 默认保存对话框 + Chromium 自动改名（T-7）。
5. ~~">2GiB Range 读崩主进程"~~——R70.15 已改流式（mediaProtocol.ts:110-118 注释 + `createReadStream`），handler 现为分段流。

## 未验证项

- 未启动应用：T-1 的 packaged 端到端读取、T-7 保存对话框实际形态、解码器崩溃恢复（T-6 的运行期行为）均止于代码/文档级证据。
- hls.js 具体版本行为（仓库 `package.json` 依赖未逐项审读其内部 xhr 安全策略；scheme 限制为库常识）。
- `renderer/src/visionHostMain.js` 仅确认走 media://app 加载本地资产，未逐行审。
- 顺带发现（非本报告范围，未深究）：index.ts:238-253 注册了两个 F2 before-input-event 处理器，open/toggle 语义可能互相抵消，建议另行核验 F2 是否实际可用。

## 修复优先级建议

1. T-1 一行式修复（解码后拒绝含 `/` 的段 + resolve 后包含性复核）——成本极低，闭合的是代码里已写明的安全承诺。
2. T-2 save 侧扩展名校验 + 播放列表加载缓存。
3. T-8 设置项提示（产品决策）。
