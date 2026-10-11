# 06 · 效果库扩展面专项架构评审（为「三体主题灯效库」铺路）

- 评审对象：`C:\tjf\github\RGBBox` @ main 5b861c8（R285 删除批 / R288 收尾之后）
- 方法：静态走查 + `git show 54b86dc`（R285 全链路删除实录）+ 独立 tsc repro + 自写统计脚本（脚本存于本目录）。未跑 yarn test/build、未启动 electron。
- 置信度标注：Confirmed = 读码/脚本/git 双向核实；Likely = 读码推断未实测；Speculative = 估算。

---

## 1. 摘要 — 扩展面健康度：🟢→🟡（关键链路有编译护栏，四条软约定是雷）

现状 48 kind（43 CPU + 5 GPU 3D），`src/shared/types.ts:16-67`（脚本核对）。扩展面的结构性事实：

- **核心链路是编译期封闭的**：`EffectKind` 联合（types.ts:23）→ `SHADERS: Record<Effect3DKind, string>`（effect3dGl.ts:520）→ i18n label/desc 键经模板字面量类型 **`effects.preset.${EffectKind}.label` ⊆ keyof typeof EN`**（types.ts:347 + presetI18n.ts:20）→ zh/en 配对由映射类型 `TranslationTable`（i18n/index.tsx:1875）强制。新增 kind 漏掉这些点 **typecheck 直接红**（已用最小 repro 验证 TS2345，见 §3-6）。
- **霰弹但浅**：新增 1 个 CPU kind 必改 6 文件、可选 4 文件；GPU 3D kind 必改 8 文件。R285 删 7 kind 触碰 27 文件（+47/−625），是完整的「改动面清单」实证。
- **四条运行时字符串约定无编译保护**：① `CATEGORIES` 是裸 string 数组（EffectsView.tsx:312-320）；② `effect.<kind>` 名字键族经 `as` 强转绕过类型（WorkspaceView.tsx:479 等），**且 i18nKeyFamilies.test.ts 注释声称的反向校验实际未实现**；③ `EFFECT_3D_KINDS` Set 靠人工与 `Effect3DKind` 同步（types.ts:69 注释自认）；④ `renderEffectPixel` 的 default 分支会静默把漏写 case 的 kind 渲染成 screen-ambient 回退动画——**该错误能同时骗过 visual-floor / valid-RGB / 快照（canvas 全被遮罩）三道门禁**。
- 结论：直接加 6-10 个三体 kind **可行且护栏够用**，但建议先做一轮 ≤1 天的「机制加固」（§7 Phase 0）把 ②④ 两个无守卫雷变成红灯，再上内容批。方案选 **B（新增 kind + 新增「三体」分类 tab）**，不建议引入主题包抽象（§4）。

---

## 2. 走查结果：新增 1 个 kind 的全部改动点

### 2.1 新增 1 个 CPU kind（霰弹程度 🟡：必改 6 文件 / 可选 4 文件 / 测试 3-4 处）

| # | 改动点 file:line | 内容（预计行数） | 保护级别 | 漏改后果 | 置信度 |
|---|---|---|---|---|---|
| 1 | `src/shared/types.ts:23-67` | `EffectKind` 联合 +1 成员（1 行） | ✅ 编译（下游所有按 kind 类型化的点连锁红） | 不加则无处起步 | Confirmed |
| 2 | `src/engine/effects.ts:327` switch | 新 `case 'xxx'`（均值 31.8 行/个，fire 最长 121） | ⚠️ 无 switch 穷尽检查——有 `default:`（effects.ts:1667），TS 不强制 | **静默落 screen-ambient 回退动画**，三道测试门禁全绿，只有人眼/缩略图能发现（canvas 被快照遮罩） | Confirmed |
| 3 | `src/shared/defaultProfile.ts:3-317` | preset 条目（~7 行） | ✅ 半：selectEffect 按 kind find（App.tsx:203），无 preset 则**不可选中**；visual-floor `measure()` 抛 `no preset`（仅当已加入 tier） | EffectsView/overlay/加层菜单完全不出现该 kind（不可见而非报错） | Confirmed |
| 4 | `src/renderer/src/components/EffectsView.tsx:312-320` `CATEGORIES` | kind 字符串塞进某分类数组（1 行） | ⚠️ **裸 `string[]`，无 EffectKind 类型约束**；typo 编译过 | kind 不进任何 tab，仅搜索可达（搜索走全量 effectPresets，EffectsView.tsx:410-417）；typo 则该 tab 少卡/空格 | Confirmed |
| 5 | `src/renderer/src/i18n/index.tsx` EN 块 ~521 起 + ZH 块 ~2375 起 | `effects.preset.<kind>.label` + `.desc` × 2 语言（4 行） | ✅ 编译：presetI18n.ts:20 `t(preset.labelKey)` 要求模板字面量联合 ⊆ TranslationKey（tsc repro 验证 TS2345）；zh 缺键由 `TranslationTable` 映射类型（:1875）红 | 不可漏（编译红） | Confirmed（repro 验证） |
| 6 | 同文件 `effect.<kind>` 名字键 × 2 语言（2 行） | ⚠️ **运行时**：WorkspaceView.tsx:479/561/583/658/670 以 `` t((`effect.${kind}`) as Parameters<typeof t>[0]) `` 强转绕过检查；`t()` 缺键回退**显示键名原文**（i18n/index.tsx:3758） | 加层下拉/时间表显示 `effect.xxx` 原文；**无任何测试红灯**（见 §3-2） | Confirmed |
| 7 | `tests/engine/effects-visual-floor.test.ts:33-46` | 挑 tier 加入 AMBIENT/FEATURE/STROBE 数组（1 行） | ✅ 测试：:116-121「每个 CPU kind 必须有 tier」对 effectPresets 全量核对 | 红：`unassigned kinds: xxx` | Confirmed |
| 8 | `tests/effects.test.ts:155-166` | valid-RGB kind 列表 +1（可选，纯覆盖） | 软：漏加只是少覆盖，不红 | 无 | Confirmed |
| 9 | `docs/ui-baseline/effects.png` | tab 栏变化才需重立（见 §6.3 量化） | 门禁：scripts/ui-snapshot.mjs:34 默认 0.1% | 超 0.1% GATE FAIL | Likely（估算见 §6.3） |
| 可选 a | `src/renderer/src/domain/quickDimensions.ts:15` | `QUICK_EFFECT_KINDS`（`EffectKind[]`，✅ 类型化）；参数适配靠 `setNumberIfPresent` 通用名匹配 | 不加=该 kind 无快捷维度入口，功能正常 | Confirmed |
| 可选 b | `src/renderer/src/domain/primaryParams.ts:13-29` | `OVERRIDES`（`Partial<Record<EffectKind, string[]>>` ✅ 类型化） | 不加=回退 DEFAULT_PICKS（speed/intensity/hueShift 按层参数存在性过滤，primaryParams.ts:38-46） | Confirmed |
| 可选 c | `src/shared/types.ts:262` `PIXEL_STYLE_EFFECTS` | 仅当视觉依赖离散格子 | 不加=走全局 renderStyle（smooth），可能糊 | Confirmed |
| 可选 d | `src/renderer/src/domain/paramMeta.ts` | 仅当引入**新参数名**；复用 speed/intensity/density/hueShift 等既有名则零改动 | 新参数名无 meta → 滑杆标签显示参数名原文（WorkspaceView.tsx:242-243），range 回退 0..2/step 0.05（randomizer.ts:69-71） | Confirmed |
| 可选 e | `src/renderer/src/domain/ambientPresets.ts` / `curatedEffects.ts:13` / `schedule.ts:21` | 纯展示位，数据驱动 | 不加无功能损失 | Confirmed |

### 2.2 新增 1 个 GPU 3D kind（霰弹程度 🟡→🔴：必改 8 文件，含着色器创作成本）

CPU 表的 #1/#3/#4/#5/#6 同样适用（#1 改为 `Effect3DKind`，types.ts:16-22，经 :67 自动并入 `EffectKind`）。差异项：

| # | 改动点 file:line | 内容（预计行数） | 保护级别 | 漏改后果 | 置信度 |
|---|---|---|---|---|---|
| 1 | `src/renderer/src/gl/effect3dGl.ts:520-526` `SHADERS` | `Record<Effect3DKind, string>` +1 条目 + 着色器常量（现存 5 个 FS 每个 ~90-130 行） | ✅ **编译**（Record 键穷尽，缺成员 TS 红） | 不可漏 | Confirmed |
| 2 | `src/shared/types.ts:70-76` `EFFECT_3D_KINDS` | Set +1 成员 | ⚠️ **人工同步**（注释自认 "keep in sync"）；Set 类型是 `Set<EffectKind>` 不穷尽 | `is3DEffect()` false → 走 CPU worker → default 回退动画；Preview3D 不挂载（Preview3D.tsx:76 gate）、EffectsView 卡片降级 CPU 缩略图（EffectsView.tsx:386）——**错 visuals，静默**。兜底仅 types.test.ts:73 `size===5`（须同步改） | Confirmed |
| 3 | `tests/shared/types.test.ts:7-17, 73` | 3D 名单 + `size` 断言 5→N | ✅ 测试 | 红（若 #2 漏改则此处必改时暴露不一致） | Confirmed |
| 4 | `tests/engine/effects-visual-floor.test.ts:31` `GPU_3D_KINDS` | 硬编码 5-kind Set +1 | ✅ 测试：漏加则被当 CPU，coverage 检查要 tier、渲染却走 default 回退 | 红（unassigned 或错误 tier 表现） | Confirmed |
| 5 | `tests/renderer/gl/effect3dGl.test.ts:9` `KINDS` | 编译+draw+readback 用例 +1（plain array，软） | 软：漏加=少一个着色器真编译证明 | Confirmed |
| 6 | 参数通道（零改动确认） | Preview3D.tsx:107-124 → `u_params/u_detail/u_extra` 固定 12 槽（effect3dGl.ts:620-635），App/OverlayCanvas（:133-140）全 generic | — 新 kind 自动获得 speed/hueShift/intensity/density + detail/extra 12 个旋钮，**新参数名则要动 Preview3D 映射 + paramMeta** | Confirmed |

### 2.3 GPU 2D 直渲路径（可选增强，非必改）

`effectGl.ts` 是 CPU 数学的 GLSL 移植层（`GPU_DIRECT_EFFECTS` set :59-88、`EFFECT_FS: Record<string,string>` :204 裸键、`paramsFor` switch :988-1084 有 `default: {floats:[]}`）。新 CPU kind **不加入即自动走 CPU worker，完全合法**。若加入：漏 `EFFECT_FS` → `render()` 返回 false（:1146-1157）；漏 `paramsFor` → uniforms 全空、画面错。三处均为运行时约定（Record 键是 string）。R285 删了 GPU 2D 144 行 + 3D 75 行佐证此层随 kind 联动。**建议三体批全部走 CPU kind，不碰此层**（overlay 高分路径的收益对本批不关键，代价是双份维护）。

### 2.4 评级汇总

- CPU kind：🟡 **霰弹但浅**——6 必改点中 3 个编译红、1 个测试红、2 个运行时约定（CATEGORIES、effect.* 名键）。
- GPU 3D kind：🟡🔴 ——编译护栏更好（SHADERS Record），但 EFFECT_3D_KINDS 人工同步 + 着色器 100 行级创作 + 3 处测试硬编码。
- 与 R285 实录吻合：删 7 kind 触碰 types/effects/effectGl/effect3dGl/defaultProfile/EffectsView/quickDimensions/primaryParams/ambientPresets/i18n + 6 个测试 + 9 张快照（`git show --stat 54b86dc`）。

---

## 3. 雷区清单（按文件逐项）

### 3.1 `effects.ts` switch 无穷尽检查 — **最高危**
漏写 case → 走 `default:`（effects.ts:1667-1693）渲染 screen-ambient 回退动画。该动画是全画面鲜彩 wash：visual-floor 三档地板（ambient 0.09/45%、feature 0.04/20%、strobe 0.03/8%）**全部能骗过**，valid-RGB 测试过，快照 canvas 全遮罩也过。唯一自动捕捉：无。**处置：Phase 0 加守卫**（§7）。R285 无此问题（删除方向 default 回退无害）。（Confirmed）

### 3.2 i18n 双键族保护不对称
- `effects.preset.<kind>.label/.desc`：编译期强制（模板字面量类型，repro 已验证）；R285 删 7 kind × 4 键 = 28 键 zh=en 同步删。
- `effect.<kind>` 名键：**零守卫**。`i18nKeyFamilies.test.ts:1-6` 注释声称「反向:每个名键对应真实 EffectKind(死键→红)」，但代码（:11-31）只做 ①en↔zh 配对 ②`length >= 48` 下限——**反向校验未实现**，新 kind 双语都漏键依然全绿，WorkspaceView 加层下拉显示 `effect.xxx` 原文（t() 回退键名，i18n/index.tsx:3757-3759）。**处置：Phase 0 补真反向校验**（import effectPresets 断言每 kind 名键双侧存在）。（Confirmed）

### 3.3 `CATEGORIES` 裸 string 数组（EffectsView.tsx:312-320）
typo/漏加编译均过。漏加 → kind 无 tab 归属（默认 tab 是 CATEGORIES[0]=classic，:408），仅搜索可见。typo → tab 计数徽标（:485 `cat.kinds.length`）把幽灵 kind 计入。**处置：类型化 + 并集=全集测试**。（Confirmed）

### 3.4 `EFFECT_3D_KINDS` 人工同步（types.ts:69-76）
漏加 → is3DEffect false → CPU default 回退动画（同 3.1 叠加，双静默）。现有兜底 types.test.ts:73 `size===5` 是硬编码，加 kind 必改它，改时会想起 Set——间接护栏，依赖人的记忆。（Confirmed）

### 3.5 测试内硬编码数字
- `EffectsView.test.tsx:69` `expect(before).toBe(7)`——classic tab 卡数硬编码。**三体 kind 不得塞 classic**（塞了此测试红，且默认视图漂移）；新独立 tab 或入 science 均不触雷。
- `types.test.ts:73` `size===5`、`effect3dGl.test.ts:9` KINDS、`visual-floor:31` GPU_3D_KINDS、`effects.test.ts:155-166` 名单、`i18nKeyFamilies:21` `>=48` 下限（加 kind 不需动，R285 曾 55→48 改过下限）。（Confirmed）

### 3.6 preset ↔ kind 1:1 不变量（对方案 A 致命）
全库按 kind `find()` 取 preset：App.tsx:203（selectEffect）、EffectsView.tsx:400（curated）、randomizer.ts:34（parseStoredEffectKinds）、schedule.ts:31、useLayerActions.ts:86、OverlayCanvas.tsx:80。**同一 kind 多 preset 会因 find-first 使第二个不可达**。想给现有 kind 挂「三体参数皮肤」没有挂点。（Confirmed）

### 3.7 R285 对各雷区的处理实录（`git show 54b86dc`）
EffectKind −8 行；effects.ts −202 行（case+病毒几何缓存）；effectGl −144 / effect3dGl −75（shader 同步删）；defaultProfile −42；EffectsView CATEGORIES −6；quickDimensions −2 / primaryParams −3 / ambientPresets −2（party 的 spectrum→rainbow，证明 ambientPresets 直引 kind 需人工改）；i18n −42 行（28 键 zh=en）；6 测试文件同步；9 张快照全重立后 9/9 0.0000% GATE PASS。**没有任何一处是靠编译器提醒的**——全部靠 PRD 清单纪律 + 全量测试。方向性结论：删除批的护栏密度 = 新增批可复用的护栏密度，唯 3.1/3.2 两处新增方向无兜底。

---

## 4. 主题库机制三方案对比

| 维度 | A=纯 preset/场景组合 | **B=新增 kind +「三体」tab（推荐）** | C=主题包抽象 |
|---|---|---|---|
| 新视觉能力 | ❌ 无——48 个现有 kind 调参伪装；三体标志意象（双日凌空、乱纪元、智子、二向箔降维、水滴）无对应数学 | ✅ 每 kind 一个专属数学 | ✅（等价于 B，kind 仍是载体） |
| 结构障碍 | **1:1 不变量阻塞「多 preset/kind」**（§3.6）；只能落到 Scene/Profile 层（纯数据，零代码） | 无——照 §2 模板走 | 无硬障碍，但引入与 Profile/Scene/Layer/Preset **第四个平行概念** |
| 改动面 | ~0 代码（发几个 Scene JSON） | 8 kind ≈ +500-750 行 / 12-15 文件（§7 明细） | B 的全部 + 主题域文件 + 主题浏览 UI + 持久化 + 新 i18n 键族 ≈ 再 +400-600 行 |
| 与 quickDimensions | 天然兼容（参数名通用） | 同左（QUICK_EFFECT_KINDS 可选追加） | 需决定主题层是否透传快捷维度 |
| 与 randomizer | 兼容 | 兼容——randomizer 纯参数名驱动（PARAM_META），新 kind 零改动即被 🎲 覆盖（Confirmed） | 主题参数预设与随机化的叠加语义要新定义 |
| 与 ambientPresets | 兼容 | 兼容（可选加 1-2 三体氛围位） | 需新映射 |
| 长期维护 | 低代码但**每次想要新视觉都回到原点** | 每 kind 一次性全链路成本，护栏成熟 | 新抽象的测试/文档/i18n/快照成本常驻；违背 R147「域模块化、不加平行框架」精神 |
| 评级 | 🔴（达不成目标） | 🟢 | 🔴（为 6-10 个 kind 造第四层抽象，过度设计） |

**推荐：B**。「封面叙事」由 i18n label/desc 承载（每 kind 一句三体叙事，双语），场景级打包（如「乱纪元整夜」多图层组合）用现有 Scene/Profile 导出（useProfileManager 的 exportLayerPack，useProfileManager.ts:134）作为 B 的可选配套，不造新概念。

---

## 5. 引擎容量

- **规模**：effects.ts 1694 行、43 case、switch 体占 79%（1337 行）；均值 31.8 行/case，最大 fire 121、audio-equalizer 57、ripple 54（脚本实测）。
- **再加 10 case**：≈ +320-500 行 → 全文件 ~2100-2200 行，仍低于 R147 拆分阈值先例（App.tsx 拆前 ~3000）。V8 字符串 switch 是哈希/跳转分发，每像素一次分发成本 << 每像素数学本身；默认网格 24×14=336 px/帧可忽略，最大 317×178=56k px/帧下 R221.3 已把帧级预计算提出循环，分发不构成瓶颈（Speculative：未跑 bench，静态评审约束）。**建议本批不拆文件**；若第二批主题库再落地（>60 kind），按分类拆 `effects/*.ts` + kind→fn 注册表（沿用 R147 哲学）。
- **`renderEffectPixel(layer, context)` 表达力硬边界**（effects.ts:52-65, 326）：
  - ✅ 有：`now` 时间轴（秒）、归一坐标（normCoords）、音频五路注入（bass/mid/high/beat/freqBands）、屏幕采样 `_screenPixel`、文本掩码 `_textMask`（caller 预计算）、确定性 hash/fbm 噪声、**跨像素共享状态**的合法通道——模块级 `(layerId, t, 形状参数)` 缓存（fire 列包 :175-187、beat 包络、R266 TA2 几何缓存 :197-310，solar/protein/spindle/vesicle 四例可抄）。
  - ❌ 无：邻域像素读取（无卷积/模糊/Seed 成长）、前一帧合成结果（previousFrame 只用于引擎级平滑，previewEngine.ts:140-142，不进 EffectContext）、持久跨帧随机态（粒子须 hash-deterministic 轨道，如 getSynapseVesicles :294-305 的 `(t*(0.48+seed)+seed)%1` 模式）。
  - 对三体意象的覆盖判断：双日凌空/三日凌空（两个光源的各向同性 glow——纯 f(x,y,now) 可解）、乱纪元（慢变气候参数曲线——now 驱动）、智子展开（几何缓存+网格）、二向箔（扫过的平面波前）、水滴（强镜面高光近似）、宇宙闪烁（全幅 strobe）——**全部在现有边界内可表达**；唯「真粒子动力学积分态」与「图像空间模糊」不可（Likely）。

---

## 6. 测试基建

### 6.1 单测模板（现成例子）
- `tests/effects.test.ts:154-187`：`for (const kind of effectKinds)` 参数化 + `makeLayer(kind, {color:'#ff8800', speed:1, intensity:0.5})` + 全音频 ctx + RGB∈[0,255] 断言。新 kind 最低成本=名单 +1。
- 更有价值的是 `tests/engine/effects-visual-floor.test.ts:60-84` `measure()`：24×14 × 16 个虚拟时刻全格渲染，输出 avgLum / litPct（>8/255 为 lit）/ NaN 计数。**新 kind 的接入门 = 挑 tier + 数组加名**，然后调 preset defaults 直到过线——R167/R284 的 aurora speed 0.14→0.75 就是这个循环的产物。
- tier 语义与地板值（visual-floor:48-52）：ambient（全幅 wash：avgLum≥0.09 且 lit≥45%）/ feature（暗场结构：≥0.04 / ≥20%）/ strobe（占空比型：≥0.03 / ≥8%）。三体效果预计绝大多数归 **feature**（宇宙暗场+结构光），宇宙闪烁类归 strobe。

### 6.2 快照基线（R285 重立经验 + 量化）
门禁：scripts/ui-snapshot.mjs:34 默认 0.1% 像素差，视口 1440×900（:144）= 1,296,000 px，即 **1,296 px 预算**。
- **新增「三体」tab**：tab 栏多一枚 ~90×30 按钮 ≈ 2,700 px ≈ **0.21% > 0.1% → effects.png 必须重立**（`--update-baseline`，并按规约在 PRD 记录）。
- **塞进现有 science tab**：默认视图只显示 classic tab + curated 条，变化仅 tab 徽标数字 15→2x ≈ 200-400 px ≈ 0.02-0.03% → **大概率免重立**。
- R285 佐证：gpu3d 徽标 6→5 单字符变窄使后续 tab 位移 ≈0.19% 触发重立；重立后 9/9 全 0.0000%。curated 条只含 default profile 五层 + CLASSIC_FIVE + 收藏/最近（curatedEffects.ts:17-37），新 kind 默认不进 → 无漂移。
- 配套：`node scripts/i18n-audit.mjs`（**静态读 i18n/index.tsx，不启 electron**，已核实 :14-20）做 zh=en 对账；它同样有「双侧都缺则漏报」盲区，与 §3.2 同根。

### 6.3 新 kind 测试清单（每 kind 固定动作）
1. effects.test.ts 名单 +1（valid RGB）；2. visual-floor 挑 tier +1 并调 defaults 过线；3. （3D）effect3dGl.test KINDS +1（真编译+readback）、types.test 两处、visual-floor GPU_3D_KINDS +1；4. 手动视觉复核（memory 铁律：表现层零容忍，须真机截图）。

---

## 7. 实施蓝图（推荐方案 B，示例 8 kind = 7 CPU + 1 GPU 3D）

> 全程走 R-N 追加（CLAUDE.md 单 PRD 模型），提交标题 `[PRD-0002] feat: R-N ...`。

### Phase 0 — 机制加固（先行，独立 R-N，~0.5-1 天）
| 文件 | 改动 | 行数 |
|---|---|---|
| `src/renderer/src/components/EffectsView.tsx:312` | CATEGORIES 类型化为 `readonly EffectKind[]`（labelKey 保持字面量联合） | +3 |
| `tests/renderer/i18nKeyFamilies.test.ts` | 补真反向校验：import effectPresets，对每 kind 断言 `effect.<kind>` zh/en 双侧存在（修 §3.2） | +6 |
| `tests/engine/effects.test.ts` 或新小测试 | CPU kind 穷尽守卫：对 effectPresets 每个 CPU kind，断言其渲染不落入 default 回退（可用「与 screen-ambient 回退特征指纹比对」或 default 分支加 dev-only warn 兜底）（修 §3.1） | +10~20 |

验收：故意删一个 i18n 名键 / 删一个 CATEGORIES 成员 / 注释一个 case，三试皆红；恢复后 typecheck + 全测试绿。

### Phase 1 — 试点垂直切片（1 个 CPU kind，全链路模板，1 R-N）
types union(+1) → effects case(+30~60，需要共享几何则抄 R266 缓存模式) → defaultProfile preset(+7) → CATEGORIES 建三体 tab 或暂入 science(+1) → i18n 4+2 键 × zh/en → visual-floor tier(+1) → effects.test 名单(+1) → 手动视觉复核。
验收：typecheck 绿、`yarn test` 绿、i18n-audit 0 findings、（建 tab 则）effects.png 重立并 PRD 记录。

### Phase 2 — 批量 3-4 CPU kind（每 kind 一个 commit，共用 Phase 1 模板）
### Phase 3 — 剩余 CPU kind + GPU 3D kind（若有；SHADERS/effect3dGl.test/types.test 三处同步）
### Phase 4 — 收口
i18n-audit + 快照终态 + 可选增强（quickDimensions 追加三体 kind / primaryParams OVERRIDES / ambientPresets 三体位）+ PRD 状态 ✅ 附证据。

### 文件改动汇总（8 kind 量级）

| 文件 | 预计行数 | 性质 |
|---|---|---|
| `src/shared/types.ts` | +9 | union 7 + Effect3DKind 1 + EFFECT_3D_KINDS 1 |
| `src/engine/effects.ts` | +250~420 | 7 case（均值 32，带几何缓存 50-60/个） |
| `src/renderer/src/gl/effect3dGl.ts` | +80~140 | 1 个 FS + SHADERS 1 |
| `src/shared/defaultProfile.ts` | +62 | 7×7 + 1×5（GPU 3D preset 尾参多） |
| `src/renderer/src/i18n/index.tsx` | +68 | 8 kind × 4 键 × 2 lang + tab 标签 ×2 |
| `src/renderer/src/components/EffectsView.tsx` | +2~4 | 新 tab 一行（Phase 0 类型化另计） |
| `tests/engine/effects-visual-floor.test.ts` | +9 | tier 7 + GPU_3D_KINDS 1 |
| `tests/effects.test.ts` | +8 | 名单 |
| `tests/shared/types.test.ts` | +6 | 3D 名单 + size 5→6 |
| `tests/renderer/gl/effect3dGl.test.ts` | +1 | KINDS |
| `tests/renderer/i18nKeyFamilies.test.ts` | +6 | Phase 0 反向校验 |
| `docs/ui-baseline/effects.png` | 二进制 | 新 tab 则重立 |
| （可选）quickDimensions/primaryParams/ambientPresets | +8/+8/+2 | 增强位 |
| **合计** | **≈ +500~750 行 / 12-15 文件** | |

---

## 8. 未验证项

1. V8 switch 分发在 56k px/帧的实测耗时（Speculative：静态评审不跑 bench；判断依据是 R221.3 帧级预计算 + switch 哈希分发）。
2. effects.png 新增 tab 的实际漂移 %（估算 0.21%，由 1440×900 视口与典型 tab 尺寸推算；实拍需跑 ui-snapshot.mjs，本次禁跑）。
3. `EffectGl.render()` 返回 false（kind 误入 GPU_DIRECT_EFFECTS 但无 shader）后 PreviewGrid 的完整回退链（PreviewGrid.tsx:159 短路 overlay 广播之后的路径未逐行追）。
4. overlay 窗对 GPU 2D kind 的 re-render handler（EFFECT2D_CHANNEL 存在且 OverlayCanvas 有 3D 同构代码 :133-140，2D 消费端未逐行核）。
5. 新 kind 命名与既有 i18n 键/参数名的字符串冲突需实施时人工排查（无自动检查）。

## 9. 被推翻的假设 / 已验证无问题

- ❌「randomizer 按 kind 索引」→ 推翻：randomizer.ts 纯**参数名**驱动（PARAM_META + Object.entries），新 kind 零改动即被 🎲 支持（Confirmed）。
- ❌「paramMeta 按 kind 索引」→ 推翻：同为参数名键控（Confirmed）。
- ❌「新增 kind 必改 quickDimensions/primaryParams/curated/schedule/ambient」→ 推翻：全可选，各有优雅回退（DEFAULT_PICKS / CLASSIC_FIVE / DEFAULT_SCHEDULE_EFFECTS，Confirmed）。
- ❌「i18n 缺键只能运行时发现」→ 部分推翻：label/desc 族有编译期保护（tsc repro TS2345 实证）；仅 `effect.*` 名键族是运行时约定。
- ✅ 已验证无问题：schedule.parseStored（schedule.ts:31 validKinds 过滤）与 randomizer.parseStoredEffectKinds（randomizer.ts:34）对 effectPresets 校验，删除/新增 kind 不炸用户存量 localStorage。
- ✅ 已验证无问题：overlay 效果列表（OverlayCanvas.tsx:80）、curated 条、最近使用、加层（useLayerActions.ts:86 带 `?? effectPresets[0]` 兜底）全部数据驱动，新 kind 自动流通。
- ✅ 已验证无问题：presets 的 labelKey/descKey 自动派生（defaultProfile.ts:322-325），新 preset 无需手写键名，键名约定单点收敛。
