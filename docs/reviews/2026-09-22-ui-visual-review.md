# UI 视觉 Review — 9 view 内部截图逐 view 复核(R148 S3 batch-2 前置)

**日期**:2026-09-22　**基线**:main @ `9be134b`(代码 = `c01095c` + 纯文档)　**性质**:只读 review,零代码改动
**方法**:内置 CDP 内部截图(`scripts/ui-snapshot.mjs` 流程的 temp 驱动复刻,`page.screenshot`,不受置顶窗口遮挡),1440×900,9 view 全量
**产物**:截图在 `%TEMP%\pw-rgbbox\shots\*.png`(未入库);`yarn build` 已重跑,**out/ 现为最新**(见 §3 事故记录)
**限制**:静态单视口;未覆盖 hover/按压态、键盘走查、reduced-motion、overlay 浮窗本体、亮色主题(S5 未做)

---

## 1. TL;DR

| 级 | 数量 | 要点 |
|---|---|---|
| **P1 硬伤** | 2 | 均在 workspace(S3 batch-2 目标 view):视频墙节内容被截断;网格密度值「320 × 180」竖排三行 |
| **P2** | 6 | Circular/Wave Ring 硬编码英文(zh 译文已存在)、效果库「45 种」stale 计数、PiP 遮挡手势助手、AI「未测试」裸状态、audio 滑杆 status-info 色偏离、snapshot 脚本路径硬编码(工具链) |
| **P3** | 9 | 孤儿卡 ×2、AI 表单平衡、诊断右列空旷、video eyebrow 重复等 |
| **P4** | 3 | architecture 标签重叠、AI 空槽椭圆、语言混排观感 |

正面:S0–S3 体系层肉眼可见生效——rail 激活 accent pill、按钮边框/层次、字阶(display/title/body/caption)、`VIRTUAL-PREVIEW`/`WINDOWS` 类 badge 容器、空态容器(「空闲——无消费方」「等待中」「更多游戏构思中」)质量都在线。

---

## 2. 逐 view 发现

### 2.1 workspace(P1 ×2 —— 本 view 即 S3 batch-2 首目标)

| # | 级 | 发现 | 证据/定位 |
|---|---|---|---|
| W1 | **P1** | 右列「视频墙」节在默认 1440×900 视口下**内容被截断**:仅见标题(`videowall.title`,i18n:2082)+「开启墙模式」按钮,下方夹一条被水平裁切的文字残线,紧贴全宽「采样设置」面板上边缘——疑似右列面板高度/overflow 与采样设置面板层叠冲突 | 挂载点 `WorkspaceView.tsx:830`(`VideoWallEditor`);需查右列面板容器 `max-height`/`overflow` 与采样设置面板的 z/stacking |
| W2 | **P1** | 采样面板「网格密度」滑杆值渲染为 **「320 / × / 180」三行竖排**——值容器过窄导致换行;顶栏同数据「网格 320×180」单行正常,可对照 | WorkspaceView 采样面板分辨率 tab;期望单行 `320 × 180` |
| W3 | P2 | 预览区右下「~4 fps — ⚠ 复杂效果可能低于目标」为**裸琥珀文本**,未入 `--status-warn` 容器(违背 S3「警示入容器」) | 建议接 `.status-pill.warn` |
| W4 | 观察 | 预览为像素网格风(renderStyle=pixel),旧构建为平滑风——profile 持久化值,非缺陷,勿"修" | — |

### 2.2 audio

| # | 级 | 发现 | 证据/定位 |
|---|---|---|---|
| A1 | **P2** | 可视化 tab 显示硬编码英文 **「Circular」「Wave Ring」**,而 zh 表已有「圆形频谱」「波形环」 | `AudioStudioView.tsx:2298` 三元硬编码;译文在 `i18n:2233-2234`;一行修复 |
| A2 | P2 | 音量/声道平衡滑杆为**蓝色**(`accent-color: var(--status-info)`,app.css:4146/4154,R72 有意)——与「accent 只表交互语义、status 色不作控件色」的 R148 哲学冲突;同一屏 transport 进度条是 mint,同页双色 | S3 batch 建议统一 `--accent` 或新增 `--control-track` token |
| A3 | P2 | 视频 PiP 浮窗默认停右下角,**压住「手势助手」pill**(左下角露出一条边) | 全局问题,见 G1 |

正面:「暂无播放」空态标签(OCR 已核实,非错别字)、播放列表分组、EQ/生成器按钮层次均正常。

### 2.3 ai(AI 实验室 · 配置 tab)

| # | 级 | 发现 | 证据/定位 |
|---|---|---|---|
| I1 | P2 | 「未测试」连接状态为**裸文本** + 刷新 icon,未接 S3 `.status-pill`(R149 已给 vision tab 接过按钮体系,config tab 状态容器未接) | S3 batch-2 范畴内 |
| I2 | P3 | 表单仅占左半(~55%),右半全空;宽屏失衡 | 建议双列或 max-width 居中 |
| I3 | P3 | 「保存」「设为当前」双 secondary,无 primary 层次(R149 在 vision tab 已确立「唯一 primary」模式) | 保存 → primary 填充 |
| I4 | P4 | 档位空槽是一个无内容小椭圆,语义不清 | 槽位加「空」态占位/文案 |

正面:体感 tab 正常(6 tab 齐,见 §3 事故——首轮截图缺 tab 是旧构建伪影,非代码 bug);表单边框可见;密钥说明文案清晰。

### 2.4 effects(效果库)

| # | 级 | 发现 | 证据/定位 |
|---|---|---|---|
| E1 | **P2** | 副标题硬编码「**45 种**内置效果」,而分区 tab 合计 **55**(7+2+14+20+4+6+2)——数字 stale | `i18n:1641` `effects.eyebrow`;建议由数据推导或改文案去掉数字 |
| E2 | P3 | 「经典」tab 7 张卡 6 列网格 → Random Color **孤儿卡**独行,与 dashboard 同款问题(见 G2) | — |
| E3 | P3 | 卡片描述 zh UI 下全英文(zh 表为逐 key 穷举,即译文**未翻译**而非缺 key;~55 条) | ⚠ R148.5 边界「i18n 文案零变化」——此项超 R148 范围,需独立 R-N |
| E4 | P4 | Random Color 卡描述 3 行,与首行卡高不一致 | `line-clamp` 或 min-height 统一 |

### 2.5 video(视频工作站)

| # | 级 | 发现 | 证据/定位 |
|---|---|---|---|
| V1 | P3 | 页首 eyebrow 与主标题**完全重复**:caption「视频工作站」+ display「视频工作站」(对比 audio:eyebrow「专业音频」/标题「音频工作站」,是正确范式) | 改 eyebrow 文案(如「视频采样 · 剪辑」)或删 eyebrow |
| V2 | P3 | 同页两种 primary:「继续播放」accent 描边 vs 底部「打开文件」accent 填充——primary 语义不唯一 | 与 R149「唯一 primary」模式对齐 |

正面:resume 容器(上次看到 1:01 + 双按钮)、播放器/摄像头/屏幕分段、右侧面板组、filmstrip 结构都干净。

### 2.6 games(迷你游戏)

| # | 级 | 发现 | 证据/定位 |
|---|---|---|---|
| G3 | P3 | 四张卡的 ▷ 播放按钮**随游戏各自着色**(蓝/绿/紫/黄描边)——内容色上了交互控件,稀释 accent 语义(R148 哲学:交互态只有 accent) | 建议按钮统一 secondary/ghost,游戏色只留在图标 |
| G4 | P4 | 命名语言混排:三款英文名 + 「光刃斩击」中文名;eyebrow「桌面陪机」/标题「单机小游戏」/rail「迷你游戏」三处三名 | 文案统一,超 R148 范围另立 |

正面:空态卡「更多游戏构思中」虚线容器是范本;卡内 icon/名称/描述/🏆 分数布局整齐。

### 2.7 diagnostics(诊断)

| # | 级 | 发现 | 证据/定位 |
|---|---|---|---|
| D1 | P3 | 右列除「各进程 CPU 占用」面板外**整列空旷**(PiP 悬在其上),与左列长表格失衡 | 可考虑纳入 `getCaptureProviderStatus` / overlay timing 面板(功能变更需 R-N,仅排版则并卡) |
| D2 | P4 | 遥测数值(0.0 ms / 320×180 / 100%)疑似未接 S2 `.tnum` 轨(截图分辨率难辨) | 实施时顺手核对 `.metric strong` 等载体选择器是否覆盖诊断行 |

正面:帧延迟空态「空闲——无消费方(不在工作台且无浮窗)」是全应用最好的空态文案;行式遥测布局整齐。

### 2.8 dashboard(首页)

| # | 级 | 发现 | 证据/定位 |
|---|---|---|---|
| G2 | P3 | 「模块」8 卡 7 列网格 → **AI 实验室孤儿卡**独行(与 E2 同款) | 8 卡改 4 列×2 行,或 `grid-auto-flow: dense` |
| D3 | P4 | 「实时帧率 —」引擎运行中但帧率为「—」:语义上「空闲无消费方」与「运行中」并存的解释成本高 | 建议空值显示「待机」或「0」 |

正面:状态五卡、模块卡 icon 圆片、折叠分区箭头一致;整页无裁切。

### 2.9 architecture(3D 可视化)

| # | 级 | 发现 | 证据/定位 |
|---|---|---|---|
| R1 | P4 | 默认机位下「React Components」「Electron Main」两个标签 chip **互相重叠** | 3D 标签避让或默认机位微调 |

---

## 3. 工具链 / 流程发现(review 过程中实锤)

| # | 级 | 发现 | 影响 | 建议 |
|---|---|---|---|---|
| T1 | **P1(流程)** | **陈旧 out/ 事故**:`out/main` 为 09-21 23:57,`out/renderer/assets` 停留在 **09-20 02:40**(缺 `.tnum-mono`(S2)、「主手」(R149)、`ai.lab.tab.vision`(R144))——某次 23:57 的 build 只落了 main,renderer 未更新。本轮首轮 9 张截图全部基于两天前 UI,已作废重拍 | 在此产物上跑任何 review / E2E / 快照对比**结论全部无效**;正是 PRD S2 教训「CSS 改动后必须 rebuild 再跑 E2E」的复发,且更隐蔽(main/renderer mtime 不一致) | ① 快照/E2E 脚本启动前校验 `out/renderer/assets/*.css` mtime ≥ 最后 commit 时间,不一致即 fail;② `yarn build` 失败时显式非零退出且不留半新产物 |
| T2 | **P2(工具链)** | `scripts/ui-snapshot.mjs:10` playwright-core import 写死 `C:/Users/admin/AppData/Local/Temp/pw-cdp/...`(他人机器路径),本机直接 `ERR_MODULE_NOT_FOUND` | S0 三件工具之一在任何其他机器不可用;pixelmatch 硬门禁接线(S3 批次任务)会被它挡住 | 改为仓库 devDependency 或 `createRequire` 探测;本 review 用 temp 驱动(`%TEMP%\pw-rgbbox\snap.mjs`)绕过,仓库零改动 |
| T3 | P4 | 快照产物路径 `docs/ui-baseline/` 与已提交 S0 基线同目录,重跑即覆盖基线(本次用 temp 输出规避) | 基线无保护 | 输出目录按「current / baseline」分离,或快照前 git 状态检查 |

**截图复现方法**(实施会话验收用):修复 T2 后 `yarn build && node scripts/ui-snapshot.mjs`;或临时用 `%TEMP%\pw-rgbbox\snap.mjs`(playwright-core 已装在 `%TEMP%\pw-rgbbox`)。

---

## 4. 全局发现(跨 view)

| # | 级 | 发现 |
|---|---|---|
| G1 | **P2** | 视频 PiP 浮窗默认右下角,在 audio/games/diagnostics/architecture/ai 各页**均遮挡「手势助手」pill**(pill 左缘从 PiP 下露出)——两个右下角常驻元素坐标冲突。建议 PiP 默认锚点上移,或 pill 让位;PiP 可拖拽则给默认位避让 |
| G2 | P3 | 孤儿卡模式 ×2(dashboard 模块 8 卡 7 列、effects 经典 7 卡 6 列)——网格列数与内容数不匹配,统一规约(4 列 / dense / 末卡跨列) |
| G5 | P3 | eyebrow 体系不一致:workspace「本地 RGB 控制器」/audio「专业音频」/diagnostics「运行时」/games「桌面陪机」正常,video 与标题重复,effects/architecture/dashboard 无 eyebrow——建议定规约(有 eyebrow 必不与标题重复,同类 view 对齐) |

---

## 5. 九维观察分(静态快照口径,非官方审计;R148 目标见方案 §2)

| 维度 | 观察分 | 依据 |
|---|---|---|
| 色彩 | 9.0 | token 化彻底,双绿无踪;扣:audio status-info 滑杆(A2)、games 语义色按钮(G3) |
| 排印 | 8.5 | 四级字阶清晰生效;扣:diagnostics 数值轨待确认(D2)、45 种 stale 文案(E1) |
| 组件态 | 8.0 | 按钮/边框/分段/badge 体系成型;扣:未测试裸状态(I1)、~4fps 裸警示(W3)、video 双 primary(V2) |
| 间距布局 | 7.0 | **workspace 两处 P1 硬伤直接压分**;孤儿卡 ×2、AI 右半空、诊断右列空 |
| 交互反馈 | 8.5(静态推断) | 焦点环/禁用态已体系化;动态项本轮未测 |
| 可访问性 | 8.5(静态推断) | 状态容器化覆盖面提升中;PiP 遮挡交互入口(G1)记此处 |
| 动效 | n/a | 静态截图不可评;token 已在 S4 落地 |
| 平台原生感 | n/a | S5 未开工 |
| 治理一致性 | 7.0 | stale 构建事故(T1)+ snapshot 工具不可移植(T2)+ stale 文案(E1) |

**结论**:S0–S4 体系层兑现度肉眼可证,但「95 高置信」的剩余缺口集中在 **workspace 硬伤(2×P1)+ 状态容器收尾 + 本轮工具链两雷**。S3 batch-2 按 §6 顺序执行后,布局维度可回到 9 分档。

---

## 6. 给实施会话(opus / glm-5.3)的行动清单(建议顺序)

| 序 | 项 | 对应发现 | 验收 |
|---|---|---|---|
| 1 | **workspace 视频墙截断修复** | W1 | 1440×900 默认视口完整可见视频墙面板内容;9 快照重拍 diff 仅此一处 |
| 2 | **网格密度值单行化** | W2 | 「320 × 180」单行;320–1925 全量程拖动不换行 |
| 3 | Circular/Wave Ring 接 i18n | A1 | zh UI 显示「圆形频谱」「波形环」;en 不回归 |
| 4 | 「45 种」stale 修复 | E1 | 文案与实际效果数一致(或去掉数字) |
| 5 | AI 配置 tab:S3 收尾 | I1/I2/I3 | 未测试→status-pill;表单布局;保存 primary |
| 6 | PiP 默认位避让手势助手 | G1 | 两 pill 同屏不重叠 |
| 7 | audio 滑杆 token 收敛 | A2 | accent-color 全量 `--accent`(或新 token),全屏一色 |
| 8 | ~4fps 警示入容器 | W3 | `.status-pill.warn` |
| 9 | 孤儿卡网格规约 | G2/E2 | dashboard 8 卡、effects 7 卡无孤行 |
| 10 | video eyebrow 去重 + primary 统一 | V1/V2 | 一屏唯一 accent 填充按钮 |
| 11 | snapshot 工具可移植 + 陈旧 out/ 校验 | T1/T2 | 换机可跑;构建不新鲜时脚本 fail-fast |
| 12 | diagnostics:tnum 核对 + 右列填充 | D2/D1 | 数值轨生效;布局平衡方案另议(功能变更走 R-N) |

> 超 R148 边界、需独立 R-N 再做:effects 卡描述翻译(E3)、games 命名统一(G4)、诊断右列功能增强(D1)。
> 每项独立小批提交;批后必跑 `yarn build`(确认 renderer 资产 mtime 已更新)+ 全量 `yarn test` + 9 快照重拍。

---

## 7. Review 覆盖度声明

- 已覆盖:9 view × 静态 1440×900 全量截图逐张目检 + OCR 精读(audio/ai 小字)+ 只读代码定位(i18n / AudioStudioView / WorkspaceView / app.css / 构建产物)。
- 未覆盖:overlay/snip/screensaver 等浮窗本体、hover·按压·焦点动态态、键盘走查、reduced-motion、亮度/对比度程序化审计(S0 脚本口径)、非默认分辨率、games 对局内画面、ai 非 config tab。
- 本文档零代码改动;`yarn build` 重跑仅更新 `out/`(现与 HEAD 一致);`docs/ui-baseline/` 基线未被触碰。

---

## 8. 补充轮:音频 / 视频工作站深度状态 review(2026-09-22 第二批,11 张子状态截图)

方法:temp CDP 驱动逐个点开子状态内部截图——视频:屏幕/窗口源模式、滤镜展开、音频处理 popover;音频:10 段 EQ 抽屉、生成器抽屉、6 个可视化 tab。本节部分覆盖 §7 所列未覆盖项;仍未覆盖的见 §8.3。

### 8.1 视频工作站(补充发现)

| # | 级 | 发现 | 定位/建议 |
|---|---|---|---|
| VS1 | P3 | 「屏幕 / 窗口」源的**采集源面板**:卡片网格右缘裁切——第二列卡片仅露 ~30px 残条(疑似横向滚动 peek),但无滚动条/渐隐提示,读感即「截断」 | 加滚动 affordance(渐隐边/滚动条)或改单列 |
| VS2 | P3 | **常驻「手势助手」pill 压住滤镜面板末行**(褪色滑杆)——G1 的第二实例:不止 PiP,常驻 pill 同样遮内容 | G1 修复方案需同时覆盖 pill 定位策略 |
| VS3 | P4 | 音频处理 popover(关闭/影院/对白增强/夜间模式 + 增益 0.0dB + AI 降噪 DTLN):说明文案第二行贴底边偏挤;popover 盖住 transport 右端(可接受) | 底部 padding +4~8px |
| VS4 | P4 | 滤镜滑杆目测位置与默认值预期不符:`DEFAULT_FILTERS = 100/100/100, hue 0`(`VideoStudioView.tsx:94`,纯 useState 不持久化),亮度/对比度/饱和度应在中点 50%,目测 ~35-38%/25%。低置信(截图目测误差大),实施时以 DOM value 核对 | DOM 核对,不盲改 |
| VS5 | ✅ 排除 | 「影屏」误读——i18n:2367 `video.audio.movie = 影院`,文案正确 | — |

正面:「预览未开启」空态(图标+caption)、采集源过滤 chips(全部/显示器/窗口)、模式 chip 容器、DTLN 说明文案、滤镜 mint 滑杆一致性——规范。

### 8.2 音频工作站(补充发现)

| # | 级 | 发现 | 定位/建议 |
|---|---|---|---|
| AS1 | P3 | **七个可视化 tab 空闲态全部为无特征黑块**(频谱/示波器/声谱图/VU 表/Circular/Wave Ring/波形图)——无零基线、无网格、无空态提示。「舞台」哲学下 viz 是主角,主角不在场时舞台也应画出「零线/网格」或居中 faint 空态;「暂无播放」提示只在 transport 左下,与画布无关联 | idle 基线 + 居中空态,7 模式共用一个 idle 层即可 |
| AS2 | P4 | viz 画布下方有一条**空面板条**(metrics 区空闲态),无标签无内容,读感像渲染残留 | 空闲时折叠或给占位文案 |
| AS3 | P4 | 生成器字段「频率(HZ)/采样率(HZ)」——单位应作「Hz」 | i18n 文案修正 |
| AS4 | P4 | EQ / 生成器抽屉打开时存在**全页透明 backdrop**:遮挡 viz tab 点击(本次自动化 6 连超时的根因);抽屉盖住 viz tab bar 右半(交互上可接受) | 若无故意阻断,可去掉 backdrop 或仅盖右侧 |
| AS5 | ✅ 正面 | **10 段 EQ 抽屉是两个工作站完成度最高的面板**:图形/参数双 tab、预设下拉 + 「平坦(重置 EQ)」、10 点对数轴响应曲线(20Hz–20kHz,±12dB 刻度)、「音频已关」状态 badge 容器化 | — |
| AS6 | ✅ 正面 | 生成器抽屉布局整齐:信号类型 8 chips(纯音/扫频/噪声/EQ 测试/环绕声/低频增强/空间音频/多声道)+ 频率/采样率/位深/声道/时长/音量。试听按钮未点(会外放) | — |
| AS7 | P2(并入 A2) | 生成器「音量」滑杆同为 status-info 蓝——A2 范围修订:audio 工作站**全部滑杆**(进度 mint;音量/声道平衡/生成器音量 blue)统一收敛为一套 token | 同 A2 行动项 |

### 8.3 未能捕获(自动化限制,留手测)

| # | 项 | 原因 | 手测路径 |
|---|---|---|---|
| AV-1 | 剪切 / 裁片(trim)模式 | 面板由 `mediaLoaded` 门控(`VideoStudioView.tsx:1949`),CDP 新会话无媒体不渲染;播放列表项非 `<button>`,text 定位 4 轮均超时(顺带:非语义化命中目标对 R144 类 CDP E2E 是摩擦点) | 播放列表点曲目加载 → 点面板标题右侧剪刀按钮(title=「切换剪切模式」) |
| AV-2 | 播放中实时波形 / EQ 生效对比 | 避免外放,未触发播放 | 静音后播放目检 |

### 8.4 对前文结论的修订

- **TL;DR 计数更新**:P3 由 9 → **12**(新增 VS1 / VS2 / AS1),P4 由 3 → **6**(新增 VS3 / VS4 / AS2/AS3 合并计);P1/P2 不变。
- **§6 行动清单追加**:第 13 项 = AS1 viz 空闲基线 + 空态(7 模式共用 idle 层);第 14 项 = VS1 采集源滚动 affordance;VS2 并入第 6 项(PiP/pill 避让)一并处理。
- **A2 范围修订**:见 AS7。
- **G1 证据补强**:常驻 pill 也压内容(VS2),修复需同时考虑 PiP 与常驻 pill 两个右下角元素。

---

## 9. 补充轮:其余主模块功能状态 review(2026-09-22 第三批,17 张功能态截图)

方法:temp CDP 驱动逐状态内部截图——workspace(画质/性能 tab、开启墙模式)、效果库 6 分区 tab、AI 实验室 5 tab、迷你游戏对局初始画面、3D 可视化键盘聚焦、系统设置整页。全程只读交互:未点效果卡 / 收藏星 / 快速自定义 / 开始叠加 / 拍照截图类按钮(避免改用户 profile 与画廊)。

### 9.1 workspace(功能态)

| # | 级 | 发现 | 定位/建议 |
|---|---|---|---|
| WQ1 | P3 | 画质 tab「灯效渲染风格」标签**硬折行**(「…风 / 格」断在词中)——标签列过窄 | 加宽 label 列或不换行 |
| WQ2 | 佐证 | 墙模式开启态下 W1(视频墙描述行被采样设置面板截断)**第三次复现**;行/列 stepper 与「关闭墙模式」toggle 本身正常 | 同 W1 修复 |

正面:画质 tab(平滑 0.35 / 亮度 100% / 饱和度 1.5x / 显示格线)与性能 tab(帧率 30 / 性能守卫)内容规整,数值右对齐;墙模式展开正常。

### 9.2 效果库(分区 tab)

| # | 级 | 发现 | 定位/建议 |
|---|---|---|---|
| FX1 | P3 | **无输入效果卡的缩略图全黑**:自定义 & 图片(Custom Paint / Image Effect)与音频响应(Audio Beat / Equalizer)共 4 张纯黑——根因是缩略图按实时效果渲染,零输入 = 黑场,读感像坏了 | 为无输入类效果生成静态样本图(合成音频 / 示例画布)做占位 |
| FX2 | P4 | Fire 缩略图底边一条白色横线、Equalizer 缩略图顶部绿线——疑似缩略图渲染伪影(低置信) | 缩略图生成器边界采样核对 |

正面:进阶(14)/ 科学可视化(20)/ GPU 3D(6)/ 3D 视觉(4)缩略图质量高、网格整齐;**当前生效效果卡(Neon Pulse)带 accent 描边环**,选中语义清楚——好细节。

### 9.3 AI 实验室(5 tab)

| # | 级 | 发现 | 定位/建议 |
|---|---|---|---|
| AI5 | **P2** | 音频 tab 把**原始英文状态串直接上屏**:`model not downloaded: silero_vad.onnx`(accent 色 mono)——未本地化、未容器化 | 本地化为「模型未下载:…」+ `.status-pill` 容器,并与右侧「下载模型」按钮形成状态→动作关联 |
| AI6 | P3 | 对话 tab **无会话空态**:消息区为整片未定义空白;「当前配置:—」+ 空槽椭圆观感破碎(与 I4 同源) | 空态提示 / 示例 prompt;空槽占位规范 |
| AI7 | P3 | 体感 tab 标题行「未开启」**裸文本状态**(与 I1 同族);快调侧栏「捏合距离」双柄滑杆过细难辨识 | status-pill;双柄滑杆加轨道/柄尺寸 |
| AI8 | P4 | 音频 tab「测试音」radio 点选色疑似蓝(非 accent)——与 A2 同族,radial 控件 token 核对 | DOM 核对 |
| AI9 | P4 | AI8 会话列表时间戳显示 `2026/9/27 23:00:13`(未来日期)——UI 格式本身正常,属数据/时钟疑点,提示核查保存路径的时间源 | 排查 `_savedAt`/会话时间写入 |

正面:**体感清单是全应用信息设计最好的页面之一**(能力/触发/实时/消费处四列表格 + 分组行 + R149 主手快切 chip 已生效);AI8 工作台 markdown 表格、代码块(存为文件/复制)、思考过程折叠渲染完善;OCR tab 输入→动作→输出三段结构清晰。

### 9.4 迷你游戏(对局态)

| # | 级 | 发现 |
|---|---|---|
| GM1 | ✅ 正面 | **游戏内是全应用组件化最完整的状态层**:HUD 六芯片(准备/波次 0/12/♥20/金币 220/★0/🏆5980,数值 tabular)、塔商店五卡(选中 accent 描边 + 价格右对齐)、胜利条件 bullet 面板、开始/重新开始/全屏/体感开关控制排 |
| GM2 | P4 | 页头「Balloon TD Arena」vs 画布内「气球塔防竞技场」双语混排(G4 家族);画布中央标题遮挡路径起点区域(玩法层,不判缺陷) |

### 9.5 3D 可视化(交互态)

| # | 级 | 发现 |
|---|---|---|
| AR1 | P3 | 信息面板**内容全英文**(Vite Build System / Dev Server / HMR / Build Pipeline / Plugin System / CONNECTED MODULES / Module 3 of 7)——zh 未翻译(E3 家族,超 R148 边界) |
| R2 | ✅ 正面 | 键盘 `3` 聚焦模块 + 右侧信息面板滑入交互正常;面板排版(强调标题 + 折叠行 + 关联 chips)干净;R1(chip 重叠)维持 |

### 9.6 系统设置(整页,首轮未覆盖)

| # | 级 | 发现 | 定位/建议 |
|---|---|---|---|
| ST1 | ~~P3~~ ✅ **误报更正(2026-09-22)** | OCR 逐字复核实为「开机自动启动」,i18n:1565 本就正确,无需修复 | — |
| ST2 | P3 | 开关控件是**裸白方块 checkbox**,与 S3 按钮体系脱节;同一张「运行」卡内三种控件形态并存(引擎=icon 按钮、阻止睡眠/开机启动=checkbox、快捷键=select) | S3 收尾:toggle switch 组件 + 控件形态统一 |
| ST3 | P3 | 整页仅 3 张小卡 + 大片空白(D1 家族);屏保/快捷键卡与运行卡高度失衡 | 并卡或补充设置分区(功能变更走 R-N) |

### 9.7 对前文结论的修订(TL;DR 以本节为准)

- **计数**:P2 6 → **7**(AI5);P3 12 → **20**(WQ1 / FX1 / AI6 / AI7 / AR1 / ST1 / ST2 / ST3);P4 → 9(FX2 / AI8 / AI9 / GM2)。P1 不变(2,均在 workspace)。
- **§6 行动清单追加**:
  - 第 5 项(AI tab 收尾)范围扩为:AI5 状态串本地化容器化 + AI6 会话空态 + AI7 体感「未开启」pill + AI8 radio token 核对;
  - 第 15 项 = FX1 无输入缩略图静态样本占位;
  - 第 16 项 = ST1 叠词修复(一行,可随手批次带上);
  - 第 17 项 = ST2 设置 toggle switch 化(S3 组件收尾的一部分);
  - 超边界另立 R-N:E3(效果卡描述)/ AR1(3D 面板)/ G4·GM2(命名双语)三类 i18n 内容翻译,建议合并成一条「i18n 内容补全」R-N。
- **模块完成度印象分(视觉口径,仅供参考)**:games > vision-bench ≈ EQ 抽屉 > effects 缩略图体系 > AI8 > workspace(被 2×P1 拖累)> video > audio > ai-config > settings > dashboard。

---

## 10. 修复批记录(R150,2026-09-22,PRD §R150)

本 review 由后续实施批落地修复(实施会话 ≠ 视觉复核会话,复核留 haiku):

| 修复项 | 对应发现 | 验证 |
|---|---|---|
| W1 视频墙截断(`grid-template-rows: max-content auto` + `min-height: max-content`) | W1 P1 | DOM 探针:sampling top 656→695,hint 完整在盒内 |
| W2 值列 38px→auto + nowrap(标签列 72→96px) | W2 P1 + WQ1 | 「320 × 180」lineBoxes 1 / width 73.1px |
| W3 fps 警示 pill 化 | W3 P2 | CSS |
| A1 viz tab 接 i18n | A1 P2 | AudioStudioView:2298 三元删除 |
| E1 45→55(双语) | E1 P2 | i18n:376/1641 |
| A2 音频滑杆 accent 收敛 ×2 | A2/AS7 P2 | app.css |
| I1 AI 连接状态 pill(三变体) | I1 P2 | app.css + AiLabView:316 |
| I3 保存唯一 primary | I3 P3 | data-action hook + 后代选择器 |
| V1 video eyebrow 去重(双语) | V1 P3 | i18n:1091/2350 |
| V2 resume 降级 secondary | V2 P3 | VideoStudioView:1451 |
| G2 仪表盘 4 列 + 窄屏 2 列 | G2 P3 | app.css |
| E2 效果网格 190→230px | E2 P3 | app.css |
| ST2-min 原生输入 accent-color | ST2/AI8 | app.css 全局规则 |
| ST1 **误报剔除** | ST1 | OCR 复核文案本正确 |

门禁:typecheck ✅ / yarn test 119 files 1083 passed ✅ / build ✅(renderer mtime 已更新)。未修项见 PRD R150.6(FX1/G1/I2/AI5/AI6/ST2-full/ST3/T1/T2/i18n 内容翻译)。
