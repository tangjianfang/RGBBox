# T3 — IPC / 主进程契约覆盖审计（自动化测试专项）

日期：2026-10-01 · 分支：feat/app-review-fixes（工作区含 R221 未提交改动）
方法声明：全部计数来自可复现脚本 `C:\Users\tjf\AppData\Local\Temp\rgbbox-qareview-20261001\{count-channels,matrix,unreg2,bridge-count2}.mjs`（node v23.11.1，只读扫描 `src/shared/ipc.ts`、`src/main/**`、`src/preload/**`、`tests/**` 共 155 个 `*.test.*` 文件）。未运行 yarn test（只读约束）。

---

## 1. 摘要（精确计数）

| 指标 | 数值 | 来源 |
|---|---|---|
| ipcChannels 成员总数 | **137**（键/值均无重复；2–227 行逐行核验为 member/注释/空白） | count-channels.mjs |
| 主审计「171」口径 | **错误**——把含冒号的注释行计入；实数 137 | count-channels.mjs 逐行核验 |
| 06 评审「46」口径 | = `tests/preload/index.test.ts` 引用的通道数（46），非全集 | bridge-count2.mjs |
| 集成测试手写映射表覆盖 | **51/137（37%）**，止于 getDisplays（R73 之后新增通道全缺） | ipcChannels.test.ts:52-121 |
| main 侧 ipcMain.handle/on 注册 | **124**（index.ts 105 + lanService 8 + avatarStore 3 + denoiseService 3 + perfSelfTest 5，多行注册需 multiline 正则） | unreg2.mjs |
| 纯 push 通道（无 handler，仅 webContents.send） | **13**，全部有发射点、全部有 preload 订阅方法 | unreg2.mjs |
| 测试树中引用通道字符串的通道 | **60** / 零引用 **77** | matrix.mjs |
| 60 个被引用通道中：仅桥层/常量断言 | **56**（bridge-only 50 + snipManager 仅常量存在性断言 6） | bridge-count2.mjs |
| 60 个被引用通道中：通道级行为断言 | **4**（avatarGet/Set/Clear + overlayFrame push） | avatarStore.test.ts:139-165、overlayManager.test.ts:308 |
| 77 个零引用中：委托模块有行为测试 | **19 个通道**（captures 5、crashLog 2、audioAi 6、aiCleanup 2、ai8Credentials 3、ocr 1） | 各服务测试 it() 清单 |
| 77 个零引用中：服务级部分覆盖 | **约 21 个通道**（shutdown 3 纯函数、screensaver 2 窗口逻辑、ai CRUD 4 store 纯函数、aiChat/aiTestConnection 2 payload 级、tts 3、agent 6、modelDownload 1） | 见 §3 |
| **纯零覆盖（任何测试都不触达）** | **37 个通道** | matrix.mjs + 人工归类 |
| preload 暴露方法数 | **128**（api 对象字面量成员；AudioInput interface 5 个另计） | grep `^  [a-zA-Z]+:` =133−5 |
| 订阅类方法（on*/snipOnFrame） | **13**；有注册/退订断言 5；**有 payload 往返断言 1**（onOverlayFrame） | preload index.test.ts:229-279 |

三态分类（通道字符串级，任务书口径）：
- **A. handler 有测试（行为级）**：通道级 4 个 + 服务级 19 个（另 ~21 个部分）。
- **B. 仅 mock/桥层断言**：56 个（断言 `typeof fn === 'function'` / `mockInvoke` 收到通道名，无行为）。注意 preload index.test.ts:51-212 的 invoke 断言是「方法→通道名→参数形状」的接线测试，质量尚可但无错误路径/副作用。
- **C. 零覆盖**：77 个（其中 37 个纯零）。

---

## 2. 通道×覆盖矩阵（方法可复现）

统计方法（任何人可重跑）：
1. `count-channels.mjs`：解析 ipc.ts 成员 → 137。
2. `matrix.mjs`：对每个通道，在 `tests/**/*.ts(x)` 内匹配「字面量通道值 OR `ipcChannels.<key>`」，输出每通道命中文件:行 → 60/77。
3. `unreg2.mjs`：multiline 正则 `ipcMain\.(handle|on)\(\s*ipcChannels\.` 扫 `src/main/*.ts` → 124 注册 + 13 push。
4. `bridge-count2.mjs`：命中文件是否全为 `integration/ipcChannels.test.ts` / `preload/index.test.ts` → bridge-only 50。

### 2.1 纯零覆盖 37 通道清单（C 类核心）

| 簇 | 通道 | main 注册点 | 破坏面 |
|---|---|---|---|
| LAN（9） | lanState/lanHost/lanJoin/lanLeave/lanDiscover/lanCmd/lanSnapshot/lanSpectate/lanEvent | lanService.ts:384-393（lanEvent 发射 :79） | 对局状态全网广播 |
| denoise（4） | denoiseStart/Frames/Stop/FramesOut | denoiseService.ts:83/107/112（out 发射 :94） | utility 进程崩溃 |
| clipboard（4） | clipboardWriteImage/WriteText/WriteRich/ReadText | index.ts:309/983/990/995 | 剪贴板覆写 |
| audioViz（3） | open/close/getAudioVizWindowIds | index.ts:1084/1088/1092 | 窗口泄漏 |
| visionHost（2） | visionHostOpen/Close | index.ts:1101/1121 | 隐藏窗口泄漏 |
| ai8 文件写（4） | ai8SaveArtifact/ShowItemInFolder/PickMdFolder/SaveImageToFolder | index.ts:744/767/598/622 | 用户目录写盘 |
| ai 设置（2） | aiGetSettings/aiSetSettings | index.ts:462/472 | system.json 覆写（systemSettingsStore **零专测**） |
| tts 接线（5） | ttsEngineStatus/Export、voiceLexiconExport/Import、ttsModelProgress | index.ts:839/865/901/913（progress 发射 :848/:895） | 导出/词典覆写 |
| agent 接线（2） | agentPickWorkspace、agentEvent | index.ts:831（event 发射 :785） | 工作区对话框 / 事件流 |
| 其它（2） | uiSetLocale、ai8OpenLogin | index.ts:364 / index.ts:646 | tray 重建 / 登录窗口 |

### 2.2 零引用但服务级已测（19 通道，C 字符串级/A 功能级）

captures 5（captureStore.test.ts:13-77，含坏 index.json→空表、FIFO、扩展名白名单）· crashLog 2（crashLog.test.ts:32-87，含轮转 20 条、跳过坏记录、导出取消→null）· audioAi 6（audio/audioAiService.test.ts:33-162，含时长越界拒绝、session 缓存语义）· aiCleanupText/aiTranslateText 2（aiCleanupService.test.ts:24-70）· ai8SaveCredentials/ClearCredentials/AutoLogin 3（ai8Credentials.test.ts:31-77）· ocrRecognize 1（ocrService.test.ts:5-67，含非 win32 短路）。

抽查断言强度：抽了 captureStore、crashLog、audioAi、ai8Credentials、aiProfileStore 五个文件的 it() 清单——均有输入形状+错误路径+副作用断言，非 smoke。**但全部绕过 IPC handler 壳**（index.ts 内联的参数守卫如 capturesAdd 的 typeof 检查 index.ts:318-321 仍未测）。

### 2.3 桥层断言强度抽查

- `tests/preload/index.test.ts`（30 it）：invoke 通道名+参数形状断言（如 saveProfile 带对象 :74-79），**无错误路径、无副作用**；46 通道。
- `tests/integration/ipcChannels.test.ts`（11 it）：手写映射表 51 通道断言 `typeof === 'function'`；计数断言 `toBeGreaterThanOrEqual(39)`（:170-176）**永真**，新增通道不会失败——这就是 46/137 口径差且无防线的原因。
- `snipManager.test.ts:34-41,56-57`：仅断言通道常量值与已删除旧通道，非 handler 行为。

---

## 3. 高危零覆盖 Top15（数据破坏力×零覆盖）+ 最小契约测试草案

1. **lanCmd**（lanService.ts:390，sendCmd :336-344）——`unknown` 载荷直接 `socket.write` 广播给全部 peer，零校验零测试。草案：mock socket 收集 write 帧；断言 ① guest 角色 → 仅上行 ② host 角色 → 广播 N peer ③ role=idle → 不抛不写 ④ 载荷含非序列化成员（如循环引用）时 close 兜底路径不崩。
2. **lanSnapshot**（lanService.ts:391）——全量快照+hash 推送。草案：① host 下发含 seq 递增 ② 非快照源调用被拒 ③ 巨大载荷分帧正确。
3. **systemSettingsStore.saveSystemSettings / loadSystemSettings**（systemSettingsStore.ts:47-66，**整个模块零专测**）——system.json 承载 AI 密文/热键/屏保/关机 deadline。草案：① 好文件 load 原样 ② 坏文件 load → `{}` ③ 坏文件 + save → 以传入值覆盖（不合并）、原内容保 `.bad` ④ 好文件 + save → 浅合并且嵌套对象整体替换 ⑤ `shutdownDeadline: undefined` 经 JSON.stringify 后键消失的语义锁定。
4. **saveProfileAs 覆盖链**（profileStore.ts:68-73）——与 saveProfile:31 不对称：覆盖同名/坏 named 文件**无 preserveBadFile**。草案：① 预置坏 `profiles/x.json` → saveProfileAs 后新内容完整、坏内容是否留 `.bad`（当前断言应为「否」——先决策再锁）② 覆盖合法旧版本 → `_savedAt` 更新 ③ 覆盖后 listProfiles 仍按新 savedAt 排序。
5. **aiSaveProfile**（index.ts:501-527，内联归一化未测）——草案：① p=null/数组/缺 id → mintProfileId/autoProfileName 兜底形状 ② apiKey 非串 → '' ③ 已存在 id → 原位替换不追加 ④ persist 失败时 runAiStoreOp 错误路径（reload 后 store 完整）。
6. **shutdownArm/Cancel/Status**（index.ts:297-299 → shutdownScheduler.ts:60-111；现测仅纯函数 buildShutdownArgs/validateArmSeconds，shutdownScheduler.test.ts:13-41）——草案：mock `execFile`：① 非 win32 → {ok:false,error:'unsupported'} ② 非法秒数 → invalid-seconds 不 spawn ③ spawn 失败 → spawn-failed 且不写 deadline ④ 成功 → saveSystemSettings 收到 deadlineMs ⑤ status：过期 deadline 懒清理（:109+）后返回 armed:false。
7. **modelDownload**（index.ts:1479-1510）——草案：① manifest 外名字 → rejects `MODEL_UNKNOWN:`（preload 契约是 `Promise<string>`，错误形状未声明）② 已缓存 → 直接返回不下载 ③ 下载失败 → unlink 半成品 + progress 事件带 error + done ④ progress 只发给未销毁 mainWindow。
8. **ai8SaveImageToFolder**（index.ts:622）——写入本 session 选过的文件夹。草案：① 未 pick 过的 folder → 拒绝 ② fileName 含路径分隔符 → 拒绝 ③ 成功 → 落盘路径返回值与内容断言。
9. **denoiseFrames**（denoiseService.ts:107，ipcMain.on）——草案：① 未 start 先 send → 丢弃不崩 ② blocks 含非 Float32Array → 不致 utility 崩溃 ③ stop 后在途帧被弃。
10. **lanHost**（lanService.ts:385-386）——草案：① name 非串/null → 'Room'；超 32 截断 ② game 非 'tetris' → 强转 'td' ③ seed 非数 → undefined ④ 端口占用错误路径。
11. **ttsModelDownload 接线**（index.ts:840）——pool 层已测（ttsDownloadPool.test.ts:34-126 含失败核算/200 全量覆盖 Range）。草案：handler 级 ① paths/opts 透传形状 ② progress 转发到 ttsModelProgress 通道 ③ required 失败 → {ok:false,error} 而非 reject。
12. **visionHostOpen/Close**（index.ts:1101/1121）——草案：① 重复 open 幂等（不重复建窗）② close 幂等 ③ open 后 BroadcastChannel 宿主 URL 参数正确。
13. **clipboardWriteRich**（index.ts:990）——草案：① text+html 双格式落剪贴板 ② 空/超长入参行为 ③ 返回 boolean。
14. **uiSetLocale**（index.ts:364-367）——草案：① 'zh'/'en' → uiLocale 更新 + rebuildTrayMenu 被调 ② 垃圾值 → asUiLocale 兜底不崩。
15. **lanEvent / agentEvent / ttsModelProgress push 载荷契约**（发射点 lanService.ts:79、index.ts:785、:848/:895）——渲染层订阅回调的 shape（如 lanEvent 的 `{kind, detail}`）无 schema 锁。草案：发射侧 snapshot 固化事件种类集合 + 每种 kind 的 detail 形状（zod-lite 手写守卫或 TS 类型 + 运行时样例断言）。

---

## 4. 通道形状漂移防线：穷举契约测试方案（R1 反向穷举落地评估）

**已实锤的漂移实例**：`overlayManager.ts:209、217` 用字面量 `'overlay:frame'` 发送而非 `ipcChannels.overlayFrame`（置信度高，grep 全 main 仅此 2 处字面量、0 处 `'rgbbox:'` 字面量）。常量改名 → 这两处静默断裂，现有任何测试都不会失败。这恰是三处手写同步（137 常量 / 128 preload 方法 / 124+13 main）缺机器防线的证明。

**方案 A：preload 正向穷举（消灭 51/137 手写映射表）** ≈0.5-1 天
- 在现有 `tests/integration/ipcChannels.test.ts` 模式上改造：mock electron 后拿到 `__rgbboxApi`。
- 对 api 的每个方法做「指纹调用」：按参数类型喂 dummy（number→1、string→'x'、object→{}、数组→[]、Float32Array→new Float32Array(1)、可选→undefined，aiChat 已自带校验短路），从 mock invoke/send/on 收集「方法→通道+收发类别」映射。
- 断言：① `Object.values(ipcChannels)` 每个通道至少被 1 个方法使用 ② 无方法触达映射外通道（检测硬编码/复制粘贴错通道）③ invoke/send/on 三类不串（如 on* 方法只能走 ipcRenderer.on）④ on* 一律返回反注册函数。
- 风险：dummy 参数触发预加载校验（aiChat 的 validateChatMessages 已兼容）；个别方法有副作用门槛（denoiseSendFrames 是 send，无门槛）。失败模式可控：某方法 dummy 调用抛错即列白名单显式测。

**方案 B：main 反向穷举（注册完备性，不重构 index.ts）** ≈0.5 天
- 测试内读 `src/main/**/*.ts` 源码，用 multiline 正则提取 `ipcMain.handle|on(ipcChannels.X`（本次 unreg2.mjs 已验证可行，含跨行注册）。
- 断言：① 除 13 个白名单 push 通道外，其余 124 通道全部有 handle/on 注册 ② push 白名单通道**禁止**被注册且必须有 `.send(ipcChannels.X` 发射点 ③ main 源码禁止出现字面量通道字符串（`'rgbbox:…'` 与 `'overlay:frame'`）——**现存 2 处违规需先修复**（overlayManager.ts:209/217 改用常量，属行为不变的一行修，建议随本 R-N 走）。
- 新通道进来 → 快照/集合断言失败 → 强制三处同步。vitest 运行在 node 环境读源码无障碍。

**方案 C（可选）**：eslint `no-restricted-syntax` 禁 preload api 对象外直接引用 ipcRenderer——防旁路。已有 R5.1 白名单桥 + contextIsolation，优先级低。

**结论：R1 提案落地成本合计 ≈1-1.5 天（S 级），性价比远高于继续手写映射表。**

---

## 5. preload 桥订阅往返缺口

- 订阅方法共 **13**（preload/index.ts: onPerfSelfTestToggleOverlay:42、onPerfSelfTestCollectTiming:52、onOverlayFrame:98、onOverlayClosed:104、onOverlayEffectChanged:116、onDisplayTopologyChanged:124、onMainWindowVisibilityChanged:133、snipOnFrame:187、onModelDownloadProgress:293、onDenoiseFrames:306、onAgentEvent:345、onTtsModelProgress:354、onLanEvent:382）。
- 有注册/退订断言：5（preload index.test.ts:229-279：onOverlayFrame/Closed/EffectChanged/DisplayTopologyChanged/ModelDownloadProgress）+ 集成测试 1（ipcChannels.test.ts:163-168，仅 onOverlayFrame）。
- **有 payload 往返断言（取注册 handler → 直接调用 → cb 收到载荷）：仅 1 条**（index.test.ts:238-247 onOverlayFrame）。
- 零测试订阅方法：8（onPerfSelfTestToggleOverlay、onPerfSelfTestCollectTiming、onMainWindowVisibilityChanged、snipOnFrame、onDenoiseFrames、onAgentEvent、onTtsModelProgress、onLanEvent）。
- 建议模板批量补：`it.each` 13 方法 ×（注册通道正确 / 退订 off 同通道同 handler / payload 往返含 event 参数剥离 / 双订阅退一个不影响另一个）≈ 半天。这直接防「handler 签名把 event 透传给业务 cb」这类回归（preload 手写 `(_event, payload) => callback(payload)` 恰是易错点）。

---

## 6. R221 增量面：atomicJson 已锁 vs store 层缺口

`tests/main/atomicJson.test.ts`（9 用例）质量高：missing/bad 二分、根类型错误、原子替换、自动建目录、`.bad` 抢救、防清空组合链。**但真正的消费者在上一层**：

| 位置 | 现状 | 缺口 |
|---|---|---|
| profileStore.loadProfile | 坏 JSON→default 有 1 例（profileStore.test.ts:61-66） | 无（够用） |
| profileStore.saveProfile | 快乐路径 2 例（:70-104） | **R221 新语义（readJsonSafe→preserveBadFile→writeJsonAtomic 接线）零回归锁**——原子层各自有测，组合调用链没有 |
| profileStore.listProfiles | 排序/空目录有测（:129-145） | **坏样本未测**：malformed named 文件应被 skip（profileStore.ts:49-51 catch 分支） |
| profileStore.loadProfileById | 存在/不存在有测（:147-158） | **坏样本未测**：坏 JSON→null（:63-65）；另「可解析但字段残缺」不经 default 合并直接返回（:59-66）——形状契约未声明也未锁 |
| profileStore.saveProfileAs | 快乐路径 1 例（:117-127） | 覆盖坏/旧文件**无 `.bad` 备份**（对比 saveProfile:31 不对称，见 §3-4） |
| **systemSettingsStore** | **整个模块零专测文件**（仅被 screensaverManager/shutdownScheduler 测试注释提及 mock） | R221.1 注释称「评审实测 6 坏样本触发 5」（systemSettingsStore.ts:12-15），但 bad→{}、save 覆盖不合并、`.bad` 备份、浅合并嵌套替换四条语义**全部未锁**。aiSetSettings/snip 热键/shutdownDeadline/screensaver 四条业务链全走它 |

**结论：该补，S 级。** atomicJson 的防线建在地板下，store 层（真正决定用户数据是否清空的一层）反而裸奔；profileStore 补 3-4 个坏样本用例 + systemSettingsStore 新建专测文件即可闭合。

---

## 7. IPC 契约测试蓝图（优先级排序）

**S（1-2 天）**
1. 穷举契约测试 §4 方案 A+B（先修 overlayManager.ts:209/217 两处字面量）——一举把 137 通道接线漂移变成机器防线，替代 51/137 手写表。
2. `tests/main/systemSettingsStore.test.ts` 新建（§3-3 草案 5 条）。
3. profileStore R221 接线回归 + 3 个坏样本用例（§6）。
4. 订阅往返 `it.each` 13 方法（§5 模板）。

**M（3-5 天）**
5. lanService 契约测试（§3-1/2/10 草案）——纯零覆盖最大簇（9 通道），lanProtocol.test.ts 只锁了线上协议不锁 IPC 面。
6. shutdown 编排测试（mock execFile，§3-6）。
7. 高危内联守卫测试：aiSaveProfile 归一化、modelDownload 错误契约、ai8SaveImageToFolder、denoiseFrames（§3-5/7/8/9）。
8. saveProfileAs 覆盖语义决策（是否补 preserveBadFile）+ 对应测试——建议单独 R-N。

**L（1-2 周，随功能 R-N 走）**
9. index.ts 105 个注册渐进拆 `registerXxxIpc`（avatarStore/lanService 范式），每拆一块跟一块通道级测试；**不顺手重构**（CLAUDE.md 红线）。
10. agent/tts/ai8 剩余 wiring 契约（agentSend/Cancel/ApprovalRespond、ttsEngineStatus/Export、ai8 四文件通道）。
11. push 载荷 schema 快照（lanEvent/agentEvent/ttsModelProgress/denoiseFramesOut，§3-15）。

---

## 8. 已验证无问题

- 137 通道名无重复、格式合法、全部 `rgbbox:` 前缀（overlay:frame 唯一例外且被 ipcChannels.test.ts:141-149 锁定）。置信度高。
- 124 注册 + 13 push = 137，**无孤儿通道**；13 个 push 通道全部有 main 发射点 + preload 订阅方法。置信度高（unreg2.mjs）。
- preload 128 个方法全部经 `ipcChannels.*` 常量，**零字面量通道字符串**。置信度高。
- main 侧除 `'overlay:frame'` ×2 外零字面量通道字符串。置信度高。
- atomicJson.test.ts 9 用例覆盖组合链，质量高（含防清空端到端）。置信度高。
- avatarStore.test.ts:139-165 是仓库最强通道级契约范式（注册表 mock + 真实 handler 调用 + 副作用断言），可作为 §4/蓝图的参照实现。置信度高。
- profileStore 快乐路径 12 用例完整（含目录自建、排序、幂等删除）。置信度高。
- ipcChannels.test.ts:127-131 的唯一性断言有效（非永真）。置信度高。

## 9. 未验证 / 局限

- 未运行 `yarn test` / `yarn test:coverage`（任务只读约束）——全部计数是静态源码扫描口径，非运行时覆盖率；vitest 套件当前是否全绿未验证。
- 「服务级部分覆盖 ~21 通道」的边界按测试文件 it() 清单归类，粒度到 describe 级，未逐参数核对（如 agentSessionsList 是否真被断言过返回形状，未深挖 agentSessionBoundary/agentSse 全文）。
- index.ts 105 个注册的 handler 体内联逻辑只精读了高危段（280-380 / 460-640 / 742-830 / 940-1010 / 1165-1195 / 1479-1510），非逐个审计。
- renderer 侧 10 个组件测试 mock 了 `window.rgbbox`（App.smoke、ProfileManager、SnipView、MiniGamesView 等），它们对 IPC 契约的贡献是「消费方形状快照」，未计入通道覆盖矩阵（按任务口径只算 handler/invoke/mock 三态，其 mock 与通道字符串无关联）。
- 穷举契约测试方案 A 的 dummy-args 驱动未实测（未写测试验证 128 方法全可安全指纹调用），成本估算含 20% 余量。
