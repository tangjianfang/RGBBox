# UI 基线事实清单（2026-09-21，R147 分支侧测量）

> 用途：UI 美化大方案（专项）的现状输入。全部为代码级测量事实，非评价。

## 规模
- `src/renderer/src/styles.css`：**8336 行**，~1293 个类选择器，16 个 @keyframes/@media
- 组件 27 个 view/面板组件 + workspace 面板（R147 P3 后）
- i18n：zh + en 双语完整覆盖

## 设计体系现状
- **token 体系已起步**（R86 P1「Synapse 三层明度 → RGBBox 冷蓝灰」）：`--bg-rail/toolbar/content/card`、`--text-primary/secondary/muted/faint`、`--accent: #42e8a9`（薄荷绿）、`--accent-dim/contrast`、`--border-*`、`--gap-grid/block`
- 字体：`Inter, ui-sans-serif, system-ui, ...`（**未打包 Inter 字体文件**，实际渲染取决于系统是否有 Inter，否则回落 system-ui/Segoe UI）
- 单一暗色主题，**无亮色/主题切换机制**

## 债务信号（美化方案需处理）
1. **token 覆盖率低 / 双轨色值**：硬编码色大量存在——`#46c6a8` ×89 处（与 `--accent #42e8a9` 是**两个不同的绿**）、`#8aa2ad` ×28（= --text-muted 的硬编码重复）、`#c5f0e4`/`#55707c`/`#9fb7c1` 等衍生色散落
2. 8336 行单文件，无分层（design tokens / 组件 / 视图 / 动效混排）
3. 交互态（hover/active/focus/disabled）散布各处，无统一 focus-visible 体系
4. 间距/圆角/阴影无 token（仅 gap 两个），大量 magic number
5. 无动效规范（16 个 keyframes 各自为政）
6. 可访问性：focus 环、对比度、键盘导航未系统化

## 视觉资产
- 桌面应用窗体（Electron，frameless + 自绘 titlebar drag 区）
- 主色：冷蓝灰暗底 + 薄荷绿 accent；霓虹/RGB 产品属性（效果预览本身高饱和）
- GitHub Pages 展示页 docs/index.html（双语，CSS-only 效果预览）
