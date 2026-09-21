# UI 深度研究笔记——顶级商业软件设计体系解构（2026-09-21）

> 用途：UI 美化大方案（专项分支）的外部研究输入。与 [`2026-09-21-ui-baseline-facts.md`](./2026-09-21-ui-baseline-facts.md)（RGBBox 现状测量）配套。

## 1. 标杆解构

### 1.1 Linear（连续多年「设计最佳」的桌面级工具）
- **无障碍基座用 Radix Primitives**：焦点管理/键盘导航/ARIA 由原语层保证，团队专注视觉与体验——Linear 官方案例自述因 Radix 显著提升 a11y 合规（radix-ui.com 案例页）
- **边框语言**：超薄半透明白色边框（约 8% 不透明度白）——「像月光下的线框」，用结构而非线条制造层级，降噪不降密度
- **2024 重设计方向**：侧栏/tabs/headers/panels 全面**减少视觉噪音、维持视觉对齐、提高层级与密度**——方向是「更安静」，不是「更花哨」
- 可借鉴：语义化薄边框 token（--border-* 不用实色而用带透明度的层叠白）

### 1.2 Raycast（99% 文本构成的 UI 却被评为顶级视觉）
- **分层中性面**：Void Black `#040506` / Ink `#07080a`——多层「近黑」面而非单一黑，靠 1-2% 明度差分层（对照 RGBBox 现状 `#0d1318`~`#131d23` 已有类似思想但跨度不统一）
- **排印双轨**：Inter（UI）+ GeistMono（数字/代码/路径）——等宽字体用于一切数值显示（RGBBox 的 fps/ms/网格数/坐标都是等宽场景）
- **自动亮/暗主题**：语义 token 双指向（一套命名、两套值）
- **渐变 accent 用在关键 CTA 与图标**（克制的高饱和点睛），主体保持中性
- 可借鉴：数值等宽字体轨、accent 的「点睛纪律」

### 1.3 Windows 11 Fluent（RGBBox 的宿主平台）
- **Mica 材质**：不透明但被桌面壁纸微妙着色的窗口底——长生命周期窗口的「根植感」；Electron 无法直接用 Mica，但可用 `backgroundMaterial` 类 API / 或以低饱和壁纸采样色近似（调研项）
- **排印**：Segoe UI Variable + 系统渲染链；RGBBox 的 Inter 栈未打包字体文件时实际回落 Segoe UI——**要么打包 Inter（+ license/子集化），要么主动拥抱 Segoe UI Variable**
- 可借鉴：窗口层与内容的层次（titlebar/rail/content 三层明度差已有雏形）

## 2. 暗色 UI 法则（多篇最佳实践交叉验证）
1. **避免纯黑底 + 纯白字**：人眼对高/低两端对比更敏感；RGBBox `#0f1418` 底 + `#e6edf0` 字方向正确
2. **对比度分级审视**：正文 ≥ 4.5:1、辅助文字 ≥ 3:1、禁用态明确降级——需系统性过一遍 1293 个类的文本色
3. **暗色下饱和度感知增强**：同色值在暗底显得更艳——accent 需按暗底重新调（RGBBox 双绿问题 #42e8a9 vs #46c6a8 正是缺纪律的症状）
4. **阴影在暗色 UI 近乎失效**：层级靠「面明度差 + 边框」，不靠 box-shadow

## 3. Token 架构（行业基线）
- **W3C Design Tokens 规范 2025.10 已达首个稳定版**（designtokens.org）：格式=多工具交换标准；语义 token「命名意图而非值」（action-color → blue-500，主题只是重新指向）
- **强度刻度模式**（NYS 等）：每色相 7 步（faint → stronger），组件按语义取档——替代 magic number
- **Radix Colors**：12 步色阶 + 自动对比度安全组合（Step 1-2 永远做底、9-10 做 accent、A 系透明度阶）——暗色主题即换刻度映射
- 对 RGBBox：现有 17 个 token → 目标 **三层 token 架构**（primitive 色阶 → 语义层 → 组件层），8336 行 CSS 的 1293 类硬编码色逐步收编

## 4. 初步机会清单（方案骨架素材，按影响排序）
1. **Token 三层化 + 双绿统一**：primitive 12 步色阶（薄荷绿 + 冷蓝灰中性）→ 语义（surface/text/border/accent × 3 明度面）→ 组件；89 处 #46c6a8 与 --accent 统一
2. **排印系统**：UI 轨（Inter 打包子集 或 Segoe UI Variable）+ 数值等宽轨（GeistMono/JetBrains Mono）+ 4 级字阶（display/title/body/caption）+ 行高与字重规范
3. **间距/圆角/动效 token**：4px 基网格（8 阶）、3 档圆角、统一 150/250ms 缓动（16 个散装 keyframes 收编）
4. **交互态体系**：统一 hover/pressed/focus-visible/disabled 四态 + 键盘焦点环（现在 focus 态散落）
5. **亮色主题**（语义 token 双指向的收益兑现）或至少「暖色夜间」变体
6. **a11y 基线**：对比度全量校验、focus-visible、reduced-motion 尊重
7. **桌面原生质感**：窗口层材质近似、titlebar/拖拽区、系统 accent 联动（可选高阶）
8. **效果预览区的舞台感**：RGB 产品的高饱和内容 vs 中性 UI 框架的对比设计（灯效是主角，chrome 要退后）——这是 RGBBox 区别于 Linear/Raycast 的独有设计命题

## 5. 98/100 的含义（方案需自定义评分体系）
「顶级商业软件标准」可量化为 8 维度评分（方案文档中定义权重）：视觉一致性 / 排印 / 色彩系统 / 交互反馈 / 动效 / 可访问性 / 密度与层级 / 平台原生感。基线测量后逐维打分，方案给出每维提升路径与目标分。
