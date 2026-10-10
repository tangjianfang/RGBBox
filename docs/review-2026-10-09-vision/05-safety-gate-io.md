# RGBBox 安全与稳健性评审 05 —— (B) 摄像头隐私与注入边界门禁 / (C) 配置与外部 IO

- 评审人角色:系统安全与稳健性工程师(只读审计,未改任何仓库文件)
- 日期:2026-10-09;基线分支 `review/vision-gesture-commercial`(HEAD 539115a)
- 范围:视觉体感全链路(getUserMedia → MediaPipe → BroadcastChannel → 游戏消费)+ 配置/模型/日志/上架面
- 方法:逐文件精读 + 全仓 grep 取证 + 单测试文件实跑(`yarn test tests/renderer/hooks/useVisionInput.test.tsx` → **12/12 绿**)+ 用户 userData 结构核验(仅字段名,密钥值未读取)
- 所有行号基于当前工作区文件

---

## 0. 摘要 —— Top 风险(处置优先级序)

| # | 风险 | 一句话 | 等级 |
|---|------|--------|------|
| 1 | **T-B1** 摄像头启动失败后重试永久失效 + 错误近乎静默 | 摄像头被占用/被拒 → 再点开关无任何反应,且隐藏宿主窗泄漏 | **P0** |
| 2 | **T-B2** 无摄像头拔出/被抢占看门狗 → 状态冻结 + **按键卡死** | 拔摄像头后 session 永远 active、heldRef 不释放,游戏内幽灵输入 | **P0** |
| 3 | **T-B3** 宿主窗无引用计数:并发订阅者 enable() 永久挂起;先离开者杀死后者会话 | 助手开着 → AI 实验室体检「开始」按钮永久 busy | **P0** |
| 4 | **T-B4/T-B5** 权限面过宽:default session 摄像头无 origin 门禁 + ai8 远程登录窗口所在 partition 完全无权限处理器 | 远程页面理论上可静默开摄像头/麦克风 | **P1** |
| 5 | **T-C5** 商业上架硬缺口:构建未签名 + 无摄像头隐私声明文案 | SmartScreen「未知发布者」+ 商店/合规门槛不过 | **P1** |
| 6 | T-B6/T-C2 加固项:visionHost 无 CSP、模型无哈希钉死 | 纵深防御缺口 | P2 |

核心结论:**视觉数据面本身干净**(帧/landmark 全程内存态、零网络、零落盘、零日志——见 §3 证实表与 §5 已验证无问题表);**真正的商业级差距在"失败路径"与"权限边界"**:摄像头一切顺利时体验良好,但失败(占用/拔出/并发)后的状态一致性、可恢复性、用户反馈均不达标,这在摄像头应用的商业发布里是硬伤。注入边界(不碰 OS 键鼠)**证实成立**。

---

## 1. (B) 摄像头隐私与注入边界 —— 发现清单

### T-B1 【P0】摄像头 init 失败 → 重试永久失效 + 宿主窗泄漏 + 错误基本静默

- **位置**:
  - `src/renderer/src/hooks/useVisionInput.ts:213-219` —— `onmessage` 收到 `{type:'error'}` 只 `reject(...)`,`return`;**不**清 `channelRef.current`、**不**置 `hostOpenRef=false`、**不**调 `visionHostClose()`。
  - `src/renderer/src/hooks/useVisionInput.ts:165` —— `start()` 开头 `if (channelRef.current) return`:失败后 channel 残留 → 后续 `enable()` **同步早退,什么都不做**。
  - `src/renderer/src/visionHostMain.js:131` —— 宿主侧 `if (pipeline) return`:init 失败时 `pipeline`(visionHostMain.js:133)已赋值且不重置 → 同窗口重 init 也被忽略。
  - 消费方全部吞错:`src/renderer/src/components/MiniGamesView.tsx:2351` `vision.enable().catch(() => undefined)`;`src/renderer/src/components/AiLabVisionTab.tsx:394` `catch { /* camera denied — the state chip tells the story */ }`(注释与实际不符,芯片显示的是「未启动」);`src/renderer/src/components/vision/VisionAssistant.tsx:66` 同样 `.catch(() => undefined)`。
- **复现输入**:摄像头被另一独占应用占用(或 Windows 隐私设置禁用、或 `models/*.task` 缺失)→ 游戏页点「👁 Vision」→ `getUserMedia` 抛 `NotReadableError`/`NotAllowedError`(visionHostMain.js:84→152-155 post error)→ hook reject → 被吞。再次点击开关:`start()` 在 useVisionInput.ts:165 早退,**无任何 UI 反馈**;隐藏宿主窗(含出错 pipeline)留在后台。MiniGamesView.tsx:2125 的 `games.vision.error` 分支只在 `vision.label` 恰好残留上一条 status(如 "models ready")时显示,且文案错位(「体感启动失败: models ready」);纯 getUserMedia 失败时 label 为空 → **什么都不显示**。
- **测试缺口佐证**:`tests/renderer/hooks/useVisionInput.test.tsx:175-193` 标题写 "cleans up",但只断言 reject + `enabled===false`,**未断言**重试可用/窗口关闭 → 该 bug 不被现有测试捕获。
- **后果**:商业场景最常见的摄像头故障(占用/权限)表现为「点了没反应」——用户判定为死机级缺陷;隐藏窗口泄漏(每次失败多一个待回收 BrowserWindow?否——单例指针,但窗口本体存活直到任一成功 enable→disable 或 app 退出)。
- **修复草案**:
  1. `start()` 的 error 分支(`reject` 前/后):`channel.close(); channelRef.current = null; hostOpenRef.current = false; void window.rgbbox.visionHostClose()`;
  2. 错误分类:宿主把 `err.name`(NotAllowedError/NotReadableError/NotFoundError)+ message 一起 post;hook 存入新 `error` state,UI 显示 i18n 化原因(Windows 隐私设置指引 / 被占用指引);
  3. 回归测试:FakeHost 首次回 error、第二次回 ready → 断言第二次 `enable()` 成功且 `visionHostOpen` 被再次调用。
- **置信度**:High(代码路径直读;基线测试 12/12 实跑通过确认无既有覆盖)。

### T-B2 【P0】无摄像头拔出/被抢占看门狗 → session 冻结在 active + heldRef 卡键

- **位置**:`src/renderer/src/visionHostMain.js:75-116`(`startCamera` 全程**无** `track.onended` 监听;rVFC 停止回调即整条链静默停摆);`src/renderer/src/hooks/useVisionInput.ts:138-162`(`onSnapshot` 只在消息到达时跑,**无**快照新鲜度超时);`src/renderer/src/components/MiniGamesView.tsx:790-974`(`pollVision` 每帧读 `heldRef`,无陈旧检测)。
- **复现输入**(代码推演,Likely):体感 active 且正按方向(手向左)→ 拔掉 USB 摄像头 → rVFC 不再回调 → `pipeline.processFrame` 停 → `session._activeFrame` 停 → **`handLostReleaseFrames` 释放逻辑永不触发**(它只在有帧时计数,session.js:499-507)→ 无 keyup 事件 → `heldRef` 残留 `arrowleft` → 游戏内飞船持续左移直到用户手动关体感或碰键盘。同时 UI 冻结:「已激活 + 已见手」(handSeen 因 R138 滞回也停在 true——它只在收到快照时计数)。
- **后果**:SK-0 不变式(停用/离开/最小化全键释放,tests/vision 已锁)**只保护显式 disable 路径**,不保护"摄像头静默死亡"。这是商业级摄像头应用的标志性鲁棒性缺陷(拔线/被系统抢占/驱动重置都会走这条路)。
- **修复草案**:
  1. 宿主侧:`stream.getVideoTracks().forEach(t => t.addEventListener('ended', onEnded))`;`onEnded` → `pipeline.stop()`(其 `_releaseAll` 会发出全量 keyup 事件)→ `teardown()` → `post({type:'status', s:'camera-lost'})` + `post({type:'error', ...})`;
  2. hook 侧:握手后启动看门狗——`performance.now() - lastSnapshotMs > 2000` 且 enabled → 置 error state、`heldRef.clear()`、提示重插后自动重开(可调 `disable()`+`enable()` 一次自动恢复);
  3. 测试:visionHostMain 抽出 `startCamera` 可注入 fake stream(FakeHost 已有先例);hook 用假时钟驱动「2s 无快照」断言清键 + error 文案。
- **置信度**:代码层 High;「rVFC 停回调」的运行时行为为 Chromium 既定语义(未上真机验证,见 §6)。

### T-B3 【P0】宿主窗无引用计数:第二订阅者 enable() 永久挂起;先离开者杀死后者的会话

- **位置**:`src/main/index.ts:1110-1134`(`visionHostOpen` 单例返回 true;`visionHostClose` **无条件 close**——无引用计数);`src/renderer/src/visionHostMain.js:130-131`(重复 init 被静默忽略,不重播 ready);`src/renderer/src/hooks/useVisionInput.ts:179-237`(init 握手**无超时**,ready 永不到来则 Promise 永挂)。
- **复现输入**(两个入口):
  1. **挂起**:开启 VisionAssistant(localStorage `rgbbox:visionAssistant='1'` 持久化,重启自动恢复)→ 切到 AI 实验室「体感」tab → 点「开始体检」→ `visionHostOpen` 返回已开 → 新 channel 发 init → 宿主 `if (pipeline) return` 忽略 → **ready 永不到来** → AiLabVisionTab.tsx:394 `busy` 永久 true → 开始按钮永久 disabled。R144.2 声称的「双订阅共听」对被动监听成立(广播人人可收),对第二个 `enable()` 不成立。
  2. **误杀**:AI Lab tab 会话进行中 → 离开 tab(unmount → `disable()`)→ `visionHostClose()` 关窗 → 若助手仍在订阅,其 `frameRef` 停更、`enabled` 仍 true → 徽标常亮但功能死亡;且助手 enable-effect(useVisionInput.ts 之外,VisionAssistant.tsx:64-67)因 `vision.enabled===true` 不重触发 → 不自愈,需手动开关 pill。反向(游戏页离开关宿主)同样成立。
- **后果**:PRD R144.2 明文承诺「最后离开者关宿主」——**代码未实现**(main 无 refcount,hook 各自为政)。
- **修复草案**(择一或组合,推荐 a+c):
  a. main 侧引用计数:`visionHostOpen` 计数 +1、`visionHostClose` -1、归零才 close(需要 renderer 侧 disable 顺序保证,或用 sender webContents id 做去重);
  b. 宿主幂等:收到重复 init 时重播 `{type:'ready', delegate}`(一行修,但治标);
  c. hook 握手超时 5s → reject 并走 T-B1 的清理路径,UI 显示「宿主忙/已被占用」。
- **置信度**:High(三处代码直读;无需运行即可判定的消息协议死锁)。

### T-B4 【P1】权限面:default session 摄像头无 origin 门禁 + 助手跨启动自动开摄像头

- **位置 A(权限)**:`src/main/index.ts:1587-1593` —— `setPermissionRequestHandler((_wc, permission, callback) => callback(ALLOWED_PERMISSIONS.has(permission)))`:**不看请求方 origin/webContents**,default session 内任何页面请求 `media/videoCapture` 一律放行。当前 default session 只承载本应用 file:// 页面,风险=未来任何窗口(或主窗口被 XSS 后)可零提示开摄像头。修复:按 `requestingUrl`/`webContents` 白名单(仅应用自身 origin),其余拒绝。
- **位置 B(自动恢复)**:`src/renderer/src/components/vision/VisionAssistant.tsx:32-34, 64-67` —— `assistantOn` 初值读 localStorage,为 '1' 时 mount effect 直接 `vision.enable()` → **应用启动瞬间开摄像头,无本次会话的新鲜用户手势**。有可见性补偿:顶栏 `.vision-assistant-badge`(VisionAssistant.tsx:158)+ Windows 系统摄像头指示灯,但商业隐私惯例(与 GDPR 透明原则一致)建议:摄像头类功能不跨会话自动激活,或至少启动时弹一次性告知「手势助手将启用摄像头(可在 X 关闭)」。
- **复现输入**:开启助手 → 退出应用 → 重新启动 → 摄像头灯亮(无点击)。
- **后果**:上架审核(尤其 MS Store 摄像头类目)与隐私合规审查的常见扣分点;对用户是「我没开它怎么自己开了」。
- **修复草案**:Assistant 首启改为「会话内手动开,持久化只记偏好不自动 enable」;或启动横幅显式告知 + 一键停。权限处理器加 origin 白名单。
- **置信度**:High(代码);政策部分为建议(标注:推断+惯例)。

### T-B5 【P1】ai8 登录窗口(persist:ai8 partition)无任何权限处理器 → 远程页面默认获权

- **位置**:`src/main/index.ts:655-740`(窗口创建,`partition: 'persist:ai8'`,加载 `https://ai8.rcouyi.com/`);全仓仅 `session.defaultSession` 注册了权限处理器(index.ts:1588-1593)。Electron 对**未设 handler 的 session 默认放行权限请求**(本仓库自己在 index.ts:1585-1586 的注释也承认 "tighter than Electron's permissive default")。
- **复现输入**:该站点(或其被入侵/掺入的第三方脚本)调用 `getUserMedia` → 无任何提示即获摄像头/麦克风(仍受 Windows 系统级开关约束)。
- **后果**:供应链/远程内容风险面——nodeIntegration 关、contextIsolation 开是好的,但权限面敞开使这些隔离部分失效(可静默采集)。
- **修复草案**:`app.whenReady` 内对 `session.fromPartition('persist:ai8')` 注册 deny-all 的 request+check handler(登录流程不需要任何设备权限)。
- **置信度**:Medium-High(handler 缺失是代码事实;Electron 默认放行是文档化行为,未在本机实测)。

### T-B6 【P2】visionHost 无 CSP;模型/wasm 无完整性钉死

- **位置**:三份 HTML(`index.html`/`visionHost.html`/`snip.html`)均无 CSP meta;主进程无 `onHeadersReceived` 注入(grep 全仓 `Content-Security-Policy` 零命中)。`vision_bundle.js` 经 `media://app` 以 `text/javascript` 提供(mediaProtocol.ts:30)并作为 module 动态执行(visionHostMain.js:39);`.task`/wasm 无 sha256 清单。
- **后果**:当前仅本地内容,直接可利用性低;但模型文件被篡改(安装包损坏/恶意替换)= 视觉宿主进程内任意 JS。签名(T-C5)是根治,CSP(`default-src 'none'; script-src media: 'self'; connect-src 'none'` 级别)与模型哈希清单是纵深。
- **置信度**:High(存在性);可利用性 Low。

### T-B7 【证实】注入边界承诺成立(对抗审查结论,非缺陷)

见 §2 证实表。补充一点边界描述:助手光标 `VisionCursor.tsx:87` 以 `(interactive as HTMLElement).click()` 在**应用 DOM 内**合成点击——权限等同鼠标点击应用内任意按钮(含危险按钮,如删除类操作),用户全程可见,无 OS 级越权;径向菜单仅导航 8 个白名单视图(VisionAssistant.tsx:19-22 `MENU_SLOTS` 全为 View union 成员);和弦词表(fingerChords.js:35-43)7 命令 + 文本 15 字符,全部为 UI 语义伪键(`chord:*`),不进入任何 IPC 写路径。

---

## 2. 注入边界证实表(grep 证据)

| 检查项 | 命令 | 结果 | 结论 |
|--------|------|------|------|
| Win32 输入注入 API | `SendInput\|keybd_event\|mouse_event\|SetCursorPos\|PostMessage(win32)`(排除 BroadcastChannel.postMessage) | src/ 与 package.json **零命中** | 无 OS 键鼠注入 |
| 自动化库 | `robotjs\|nut.js\|@nut\|ffi-napi\|koffi\|node-mac-permissions` | 零命中 | 无原生 FFI 依赖 |
| `ioctl` 命中 | 同上 grep | 仅 `src/renderer/public/vendor/mediapipe/vision_wasm_{,nosimd_}internal.js`(Emscripten FS tty 垫片,~12 处) | vendored wasm 胶水,非 Win32 |
| OS 级钩子(捕获面,非注入) | `globalShortcut` | `src/main/snipManager.ts:244,418`(截图 Escape + 用户热键) | 仅注册拦截回调,无合成输入 |
| 手势按键词表 | 逐文件读 | gesture_engine.js:50-57(Arrow×4)、:202(Space)、:372(KeyF 副手);face_engine.js:8-13(KeyE/ShiftLeft/Enter);fingerChords.js:35-43/50-58(select/confirm/pause/menu/cancel/back/next + 字符) | 有界闭集,全部应用内消费 |
| 手势→IPC/文件写 | 事件消费点审读 | MiniGamesView pollVision(游戏 refs)/VisionAssistant(导航+焦点输入框插字符)/VisionCursor(DOM click) | 无文件操作/设置修改/IPC 直写 |
| OS 输入注入承诺(PRD R131 Non-Goals) | — | 与实现一致 | ✅ 成立 |

---

## 3. (C) 配置与外部 IO —— 发现清单

### T-C1 【P2】systemSettingsStore 语义扎实,测试覆盖缺三类边角

- **已核实(读码 + 用户实例结构)**:`src/main/systemSettingsStore.ts` + `src/main/atomicJson.ts` 实现了原子写(tmp+rename,同目录)、坏 JSON 哨兵(`BAD_JSON`,根非对象也算坏)、坏文件抢救(`.bad` 备份)、「坏文件不与 {} 合并」——`tests/main/systemSettingsStore.test.ts:20-50` 四用例(好文件浅合并/坏文件覆盖+抢救/缺文件直建/坏文件读回空)与实现一致。用户真实 `C:\Users\tjf\AppData\Roaming\RGBBox\config\system.json` 结构仅 4 字段:`powerSaveBlock` / `screensaver{enabled,idleMinutes}` / `ai{profiles[4]{id,name,baseUrl,apiKey,model},activeProfileId,baseUrl,apiKey,model}`,apiKey 呈 `enc:v1:` 加密前缀(值未读取);**无任何视觉字段**。
- **缺口**:
  1. 未知键往返:`loadSystemSettings` 原样返回 + `saveSystemSettings` spread 保留(行为正确)但**无测试钉死**(未来加字段清洗时易回归);
  2. 字段类型错误(如 `powerSaveBlock: "yes"`)无校验、原样往返——本地单写者场景可接受,列为已知边界;
  3. `atomicJson.ts:61-63` catch 内再次 `rename(tmp,path)`(会再失败且被吞)——无害死代码,建议删;
  4. 无并发写测试(临时文件名含 pid+时间戳,碰撞安全,风险低)。
- **视觉设置存放**:全部在主窗口 localStorage(`rgbbox:visionMirror` / `visionSensitivity` / `visionPrimaryHand` / `visionAssistant`,useVisionInput.ts:16-19、VisionAssistant.tsx:16;校准画像 `vgi-profile-v2` 经宿主 `profile-save` 消息回传后由主窗口写入,useVisionInput.ts:232-233)。**跨窗口一致性由构造保证**:宿主窗从不读 localStorage,一切配置经 init cfg 下发 + 运行时消息(patch/mirror/primaryHand/textmode),不存在双窗口各读一份的竞态。✅ 无问题。
- **置信度**:High。

### T-C2 【P2】模型/vendor IO:打包本地、路径守卫到位;缺损坏/缺失的专门降级与完整性钉死

- **已核实**:`hand_landmarker.task`(7.5MB)+`face_landmarker.task`(3.6MB)随包(`src/renderer/public/models/` → `out/renderer/models/**`,`package.json` build.asarUnpack 含之)——**无运行时下载**(grep `modelsManifest.ts`/`download-models.mjs` 无 `.task` 条目;视觉代码零 fetch)。预算 11.1MB ≪ 100MB 硬预算。加载路由:`visionAssetBase.ts`(file: → `media://app/`,否则 document.baseURI)→ `resolveAppAssetPath`(mediaProtocol.ts:49-57,拒绝 `..`/反斜杠/盘符,tests/main/mediaProtocol.test.ts 有专测);`media://local` 白名单 403(R221.5,index.ts:1647-1659)。
- **缺口**:模型缺失/损坏 → `loadLandmarkers` 抛错 → 走 T-B1 同一静默家族(无「模型文件损坏,请重装」类指引);`.task`/wasm 无 sha256 清单(与 T-B6 合并处置)。
- **置信度**:High。

### T-C3 【证实无问题】日志隐私与保留

- 视觉模块**零日志**:`grep console\.|log(|logger` 于 `src/renderer/src/vision/*.{js,ts}` + `visionHostMain.js` → **零命中**;帧、landmark 坐标、blendshape 分值从不进任何日志。主进程对视觉路径唯一日志是 MediaProtocol 调试行(文件路径,debug 级,index.ts:1665)。
- 保留策略:`src/shared/logger.ts:61-62` —— 5MB × 5 份轮转(R158.3);崩溃:`src/main/crashLog.ts` —— `crashReporter uploadToServer:false`(本地 Crashpad)+ JSON 记录 KEEP=20,轮转删旧。**全程本地,零遥测**——与 R157 local-first 一致。✅
- **置信度**:High(grep + 全文读)。

### T-C4 【盘点】视觉子系统外部 IO 全清单及失败反馈

| # | IO 点 | 位置 | 失败路径用户反馈 |
|---|-------|------|------------------|
| 1 | `getUserMedia`(仅 video,audio:false) | visionHostMain.js:84-91 | post error → **T-B1 静默家族**(唯一有部分反馈的:MiniGames 状态栏 label 残留时显示错位文案) |
| 2 | 动态 import vendor bundle + FilesetResolver + 模型 | visionHostMain.js:38-64 | 同上(无「模型缺失/损坏」区分) |
| 3 | BroadcastChannel `rgbbox-vision`(双向) | visionHostMain.js:20 / useVisionInput.ts:176 | 无失败模式(同源内存) |
| 4 | IPC `visionHostOpen/Close` | ipc.ts:123-124,preload:85-88 | open 失败 → start() promise reject → T-B1 家族 |
| 5 | localStorage 读写(仅主窗口) | useVisionInput.ts:21-37,232-233,294-321 | 全部 try/catch 吞(私有模式等,可接受) |
| 6 | 网络请求(fetch/XHR/WS/sendBeacon)、indexedDB | — | **不存在**(grep 零命中)✅ |

### T-C5 【P1】商业上架检查单视角(与代码相关项)

| 项 | 现状 | 结论 |
|----|------|------|
| 代码签名 | `package.json` build.win:`signAndEditExecutable:false`、`forceCodeSigning:false`、无证书、zip 目标 | **缺失** —— SmartScreen「未知发布者」拦下载;MS Store 必须签名包。商业发布硬门槛 |
| 摄像头用途声明/隐私政策链接位 | UI 仅有 `ai.privacyNote`(API 密钥);**无任何摄像头隐私文案**(grep i18n:camera/隐私/本地处理 仅命中 AI 密钥条目) | **缺失** —— 需「视频仅在本机推理、不上传、不存储」的显式声明位(这恰好是本应用的真实优势,却没写出来) |
| 崩溃捕获 | crashLog.ts 本地 minidump+JSON,诊断页可导出 | 已有 ✅ |
| 权限最小化 | default session 全放行 + ai8 partition 无 handler(T-B4/T-B5) | 需收紧 |
| Windows 摄像头系统集成 | 不查询系统摄像头隐私状态;NotAllowedError 不翻译成「请在 Windows 设置开启」 | 缺引导(与 T-B1 修复合并) |
| 生产测试缝 | `window.__rgbboxVision`(MiniGamesView.tsx:574-611)无环境门控随包发布 | 无害(仅合成源+只读探针),商店审核卫生项:建议 `import.meta.env.DEV` 门控或文档声明 |
| 生物特征数据落地 | landmark/帧零落盘;仅 `vgi-profile-v2` 含 neutral 表情基线均值(脸型无关、不可识别个体,推断)与手部校准参数,明文 localStorage | 低敏感;建议在隐私声明中如实描述 |

**GDPR/CCPA 商业化最低要求清单(推断+待办)**:①摄像头用途与处理位置声明(本机、实时、不存储)✅需补;②首次开启时的知情提示(当前=开关按钮即同意,可接受但建议加 tooltip/首启横幅);③无遥测声明(已是事实,可作卖点);④摄像头指示(应用内徽标+横幅已有,建议托盘图标加摄像头角标——当前 trayMenu 无任何视觉状态);⑤数据主体权利(本地应用天然满足:卸载即清除,userData 目录即可说明)。

---

## 4. 对抗样本推演(代码推演,Likely 标注)

| 场景 | 推演结果 | 依据 |
|------|----------|------|
| 开体感 → 拔摄像头 → 再插回 | **不自愈**:rVFC 停 → 冻结 active + heldRef 卡键(T-B2);插回后需手动关/开开关(disable→enable 重开窗+重新 getUserMedia,可恢复)。Likely(rVFC 停回调为 Chromium 语义) | visionHostMain.js:98-115、session.js:499-507 |
| 开体感 → 摄像头被其他应用占用(启动时) | getUserMedia NotReadableError → T-B1:静默+重试死 | visionHostMain.js:84,152-155 |
| 运行中被抢占(独占型驱动) | track ended → 同拔线(T-B2) | 同上 |
| 运行中协商帧率骤降(共享型) | envCoach 有部分缓解:acquire p95>45ms/fps<25 → 横幅「检查占用摄像头/光线」提示(envCoach.ts:29-31,≥45 样本防误报)✅ 这条做得好 | envCoach.ts、R141 证据 |
| 快速开关 20 次 | 每轮关窗+重开+重载 11MB 模型(慢但可用);竞态:disable 落在 in-flight enable 的 `visionHostOpen()` 之前 → 摄像头在用户最后一次「关」之后才打开,UI 随后一致显示开,下一次点击可关——不卡死,自愈。Likely | useVisionInput.ts:164-238,244-262 |
| 助手开 + 进游戏页 | 助手 effect 自动 disable(VisionAssistant.tsx:70-72),游戏 hook 接管——此路径设计正确 ✅;但 AI Lab tab 路径死锁(T-B3) | VisionAssistant.tsx:64-72 |

---

## 5. 已验证无问题 / 被证伪的假设

| # | 项 | 证据 |
|---|-----|------|
| 1 | **被证伪**:「face_engine 存在 → 生物特征数据可能外发/落盘」 | 零网络(§3 T-C4#6)、零落盘、零日志;face blendshape 仅内存快照经同源 BroadcastChannel 到 UI;唯一持久化是校准画像中的 neutral 均值(主窗口 localStorage) |
| 2 | **证实**:视频帧只在本机 WASM 推理不外发 | vision 全链路无 fetch/XHR/WS/sendBeacon(grep 零命中);模型本地打包零下载 |
| 3 | **证实**:注入边界「手势只写应用内 refs」成立 | §2 表;键盘伪键闭集 + DOM click 合成 |
| 4 | visionHost 窗口加固 | contextIsolation:true、nodeIntegration:false、**无 preload**(index.ts:1115-1120)→ 默认沙箱生效、攻击面=纯 web;`backgroundThrottling:false` 仅性能语义 |
| 5 | 已知路径的 track.stop 确定性 | `disable()`/unmount/回 hub/窗口最小化 → host `teardown()` 逐 track stop(visionHostMain.js:118-126)+ 关窗双保险;SK-0 不变式有 tests/vision 套件锁定 |
| 6 | media:// 协议 | app 分支穿越守卫 + local 分支白名单 403(R221.5),均有单测 |
| 7 | system.json 凭据加密 | 用户实例 apiKey 为 `enc:v1:` 前缀(safeStorage),结构核验未读值;R145 的 encode/decode 对称性有专测 |
| 8 | 模型预算 | 视觉资产 11.1MB ≪ 100MB 硬预算 |
| 9 | 权限处理器存在性 | defaultSession 有 ALLOWED_PERMISSIONS 白名单(比 Electron 默认紧)——问题只在粒度与 partition 覆盖(T-B4/T-B5) |

## 6. 未验证 / 局限

- 未启动应用/真机摄像头测试(遵守约束:未触碰运行中的 electron.exe);T-B2 的 rVFC 停摆、T-B5 的 Electron 默认放行为文档/代码推演,标注 Likely/Medium。
- 只实跑了一个测试文件(useVisionInput 12/12)作为基线确认;未复跑全量(其余结论均静态取证)。
- ai8.rcouyi.com 站点内容本身未审计(仅审宿主窗口加固);screenCapture/音频 IO 不在本次范围。
- SmartScreen/商店结论为检查单级判断,未做真实提交演练。
- 未修改任何仓库文件;实验目录 exp/ 未产生需保留的产物(全部结论可由文中 file:line 复核)。

## 7. 加固建议与测试草案

**测试草案**(对应 PRD 追加 R-N 的验收点写法):
1. `useVisionInput.test.tsx` 增:「init 失败一次后再 enable → FakeHost 第二次回 ready → enabled=true 且 visionHostOpen 被调两次」(锁 T-B1 修复);
2. 同文件增:「ready 后 2s(假时钟)无 snapshot → error state + heldRef 清空」(锁 T-B2 hook 侧看门狗);
3. visionHostMain 相机层抽出可注入模块后增:「stream track `ended` → 收到 release 事件(全 keyup)+ status」(锁 T-B2 宿主侧);
4. 新 hook 用例:「宿主已初始化时第二个 channel 的 init 收到 ready 重播或 5s 超时 reject」(锁 T-B3);
5. main 单测:`persist:ai8` partition 的 PermissionRequestHandler 存在且拒绝 media(锁 T-B5);
6. E2E(复用 verify-r131-vision.mjs 模式,无摄像头环境即天然复现):打包产物点视觉开关 → 断言可见错误文案 + 重试成功。

**修复顺序**:
1. **T-B1 + T-B2**(失败清理/错误呈现/拔线看门狗/卡键释放)——摄像头应用商业化的第一硬门槛;
2. **T-B3**(宿主 refcount 或 ready 重播 + 握手超时)——多订阅者正确性;
3. **T-B4 + T-B5**(origin 白名单 + ai8 partition deny-all + 助手跨启动策略)——隐私边界;
4. **T-C5**(签名 + 摄像头本地处理声明文案 + 托盘摄像头角标)——上架材料;
5. T-B6/T-C2(CSP + 模型 sha256 清单);
6. T-C1(补三类配置测试边角)。

---

*报告完。取证文件均在 C:\tjf\github\RGBBox 仓库内(只读);行号对应当前工作区。*
