# 视频工作站深度评审（2026-10-15）

**范围**：VideoStudioView.tsx（2229 行/152 hooks/57 useState）+ video/ 域 9 文件（~2500 行）+ main 侧 snipManager/captureStore/windowSnip/mediaProtocol（~900 行）。用户触发词：「对视频工作站进行深度的 review」。

## 0 一页结论

**五维评分**：稳定性 5/10 ｜ 流畅度 6/10 ｜ 交互 6.5/10 ｜ 工程质量 5.5/10 ｜ 安全与边界 7/10。

**因果链**：视频站功能面广（采集/录制/播放/截图/标注/超分/降噪）但主组件是 R147 拆分规范之前的「活化石」——单函数 1997 行、28 处 `mode ===` 交织、57 个 state 纠缠，导致：①异步资源（流/录制/导出）无统一生命周期守卫（泄漏与挂起）；②错误路径大量不可见（HLS fatal 黑屏/录制失败只在空态浮层）；③与 AudioStudioView 结构级复制（R70.3 注释逐字双份）。R290/R295 两轮快速修补进一步暴露了无护栏下小改引入回归的速度（R295 把录制状态复位挂进了异步后处理）。

**最该先做的 10 件事**（P0 修复批 R296 即做前 9 项）：
1. R295 回归：`setRecording(false)`/计时器复位移回同步路径（停止录制后 REC 走表/按钮僵死）
2. 播放器快捷键豁免补 TEXTAREA（标注器打字被空格劫持）
3. media://app 段内 `%2F` 解码逃逸（先 split 后 decode 的顺序 bug，一行修）
4. trim 导出 `seeked` 无超时无 catch（换片即永久挂起锁死播放）
5. attachStream 代际守卫（切视图后流落地=摄像头灯常亮）
6. HLS fatal → `usingHls` 翻转+错误可见+实例 destroy（黑屏静默）
7. captureStore index.json 原子写（复用 R267 atomicJson——崩溃丢全库索引）
8. 胶片条空态恢复导入入口（`return null` 连入口一起消失）
9. 录制完成/失败 toast（现在静默下载无回执）
10.（P1）录制控制包：码率/暂停续录/系统声——录制是骨架级功能

## 1 证据与方法

| 路 | 报告 | 一句话 |
|---|---|---|
| 02 UI 性能 | `02-ui-latency.md` | 超分 JS 转换 45-108ms/帧、4Hz 整树重渲染（0 memo）、胶片条 740MB 假设被实测推翻（真实 12MB） |
| 03 媒体管线 | `03-media-pipeline.md` | 14 项发现：流竞态/R295 后处理阻塞/HLS fatal 不可见/索引非原子 |
| 04 UI 稳定性 | `04-ui-robustness.md` | 14 项：TEXTAREA 劫持/trim 挂起/MediaElementSource 静音陷阱；资源配对表 16 类 |
| 05 媒体安全 | `05-media-security.md` | media://local 白名单实测全拒（穿越/UNC/短名均挡）；media://app 一处顺序逃逸 |
| 06 架构 | `06-architecture.md` | 5.5/10；R147 式蓝图：3 domain+8 hooks+4 视图→主文件 ~300 行 |
| 07 UX | `07-ux.md` | 15 项：录制反馈链断裂为首；i18n 197 键全对齐 |
| 08 产品 | `08-features.md` | 现状盘点：截图-标注-OCR 链成熟/播放器可用/录制骨架；mkv 宣称 vs Chromium 实拒 |

**裁剪声明**：跳过 01 崩溃取证（无新崩溃转储）。

### 主审独立复核表（7/7 报告，20 条 Top 结论，0 幻报）

| 结论 | 复核 |
|---|---|
| 单函数 1997 行/57 useState/mode===25 处 | ✅ awk/grep 实测 |
| video 域测试 ≥13 文件（推翻主审线索「仅 2 个」） | ✅ ls 实测——**更正：主审 Step 0 只数了 video/ 子目录** |
| R70.3 注释 AudioStudioView:1886 ↔ VideoStudioView:1162 双份 | ✅ |
| M-1 attachStream(:507) 无竞态守卫 | ✅ 代码形态 |
| M-2 setRecording 在异步 .then(:729) | ✅ **R295 引入的回归** |
| M-3 mediaLoaded=playerUrl‖usingHls(:287) fatal 后不可见 | ✅ |
| T-1 resolveAppAssetPath(:49) 先 split 后 decode，段内 /../ 通过守卫 | ✅ 守卫不含 includes('/') |
| T-2 videoSavePaths(:1469) 零校验 | ✅ |
| X-1 streamError 仅 :1585/:1764 空态渲染 | ✅ |
| X-2 胶片条 :62 return null | ✅（R290 时已亲证） |
| trim 硬编码英文 alert(:1197) | ✅ |
| R-1 :1043 豁免仅 INPUT/SELECT | ✅ |
| R-2 :1212-1215 seeked 无超时无拒绝路径 | ✅ |
| nchwToImageData(:342) 纯 JS 每帧转换+putImageData | ✅ 机制（耗时数为代理微基准） |
| accept 含 .mkv/.avi/.flv/.ts(:1871) 而 Chromium 必拒 | ✅ |
| 录制 audio:false 硬编码(:628/636)、全仓无 videoBitsPerSecond/pause | ✅ grep 空 |
| 胶片条实测 ~12MB（推翻 740MB 旧假设） | 采纳代理实测 |
| 其余中低危项（04/05/07 清单） | 结构复核一致 |

### 更正记录
- 主审 Step 0 线索「video/ 域仅 2 个专测文件」错误——实际 tests/renderer/components/ 下 13+ 文件（AnnotateOverlay/SnipView/annotationModel 等）。以代理计数为准。
- R290 评审遗留的「胶片条 740MB 内存」[I] 假设被 02 代理实测推翻（当前规模 ~12MB；但 200 条 4K 窗口截图最坏 ~3GB 仍为真实上界）。
- **R295 自我回归确认**：状态复位进异步链是主审本人在 R295 引入，管线代理抓出。

## 2..8 分维度要点

**性能（02）**：超分输出转换是最大 CPU 热点（1080p×2 每帧 108ms 主线程）——进 Worker/OffscreenCanvas 是正解（P1）；timeupdate/recElapsed 4Hz 顶层 state+全目录 0 memo=整树重渲染（P1，拆分批顺带解决）；toDataURL 同步编码 1080p 50-150ms（P2）。
**管线（03）**：P0 四项（竞态/回归/HLS/原子写）外——录制无码率/时长上限、track ended 无反馈、屏录无声（08 同）。
**稳定性（04）**：R-4 MediaElementSource 建 WebAudio 图后 no-CORS 远程流整段静音且无提示（P1：捕获 CORS 错误时提示或自动断开 enhance）；AudioContext 不 close（P2）。
**安全（05）**：media://local 白名单质量高（实测全拒）；T-1 一行修；明文流无 scheme 校验（信息级）。
**架构（06）**：拆分蓝图已给（3 domain+8 hook+4 view）；与 AudioStudioView 的复制批（removeGroup 等）随拆分一并收编（P1 大项）。
**UX（07）**：P0 修复批覆盖 8/15 项；其余键盘可达表已给（P1）。
**产品（08）**：**video-ambient 直连**（视频画面→灯墙同步）为差异化最高且复用 screen-ambient 消费端+engine screenSample 入口（P1 立项候选）；格式宣称收敛（accept 面收窄或软解提示）；逐帧步进（P2）。

## 9 路线图
- **P0（R296，立即）**：上表 1-9——九项小修+回归测试
- **P1**：R297 录制控制包（码率/暂停/系统声/时长护栏）；R298 视频站拆分批（R147 式，逐 commit）；video-ambient 直连（R299，需用户点头）
- **P2**：超分 off-main-thread；MediaElementSource 静音陷阱；键盘可达批；格式宣称收敛
- **P3**：与 AudioStudioView 共享域收编；toDataURL 异步化

## 10 待用户确认 / 局限
- video-ambient 直连（视频→灯墙）是否立项——产品代理评估差异化最高
- mkv 等格式：收敛 accept 还是引入软解（ffmpeg.wasm 已列入「不做」——体积与维护成本）
- 各报告「未验证项」小节共 ~20 条活体复现项（多为需真实设备/长时间运行的场景）

## 附录
`docs/review-2026-10-15-video/`：02-ui-latency｜03-media-pipeline｜04-ui-robustness｜05-media-security｜06-architecture｜07-ux｜08-features
