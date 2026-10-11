# 灯效美学专项评审报告（2026-10-11）

**用户主诉**：「灯光效果要有灵感，生动，灯效视觉效果能触发心灵，有些效果太平淡。如果无法实现这种效果可以列出来考虑删除它。」

## 0. 一页结论

**55 效果 = 10 个动人标杆 + 14 个平淡可救 + 9 个删除候选 + 22 个健康**。最大病根不是数量而是**三类系统性缺陷**：①暗谷无地板（9 效果相位低谷 lit 3-8%，观感=灯坏了）；②准静态（6 效果默认参数下肉眼不动——black-hole 是数学饱和 bug、aurora 一轮 50 秒）；③雷同（8 组视觉重复）。**先救后删**：一批 ≤2 行的救活 + 全局暗谷地板能救回一半平淡项；删除名单留给用户裁决（其中 4 个有强双线证据）。

### 最该先做的 6 件事
1. **P1 black-hole 去饱和**（温度公式 `(0.88-r)×(1.6+density)` 内侧全饱和成均匀白热，1s 差分 0%——bug 不是特色）
2. **P1 audio-beat idle 楼层**（空闲亮度上限 32/255 低于可见线=黑屏感）
3. **全局暗谷地板**（相位低谷 lit≥12%——一次修救活约 7 个平淡项）
4. **准静态提速批**（aurora 50s→15s / neon-galaxy 52s→15s / microvilli / magnetosphere 补运动项）
5. **删除裁决**（见 §3 名单——4 个强证据 + 5 个物理不可实现类）
6. **hologram 提亮提速**（机制最全观感最弱，双默认引用不宜删）

## 1. 证据与方法

| 路 | 产出 | 覆盖 |
|---|---|---|
| 美学目视（R283-aesthetics.md） | 9 拼图初筛+三联帧细看+md5 冻结检测 | 40/55 有效样本（15 个 tab 未截到/冻结） |
| 代码审计（R283-code-audit.md） | **重跑干净捕获 55 卡**+49 case 逐读+0.5/1/3/8s 差分扫 | 100%（engine-motion-sweep.csv） |
| GPU 3D（R283-gpu3d.md） | 6 shader 代码+实拍交叉 | 6/6 |

**主审独立复核**：laser-show 伪 3D（shader 全程 vec2/atan，零 march ✓）；hologram 双引用（QUICK_EFFECT_KINDS+DEFAULT_FAVORITE ✓）；black-hole 饱和公式（✓）；蚀相合暗谷（指标 lit=3.3%+代码日冕细环 ✓）；rainbow≈spectrum（数学不同、视觉雷同——合并语义成立）。
**数据更正**：首轮 81 卡 metrics 判污染（curated 重复入镜/懒激活冻结帧），已存档 metrics-legacy81.csv；结论以干净 55 卡 kind-map.csv 为准。
**被推翻假设**：「black-hole 冻结=WebGL 上下文丢失」（实为数学饱和）、「fx41≡fx08=重复效果」（实为懒激活残留）、「指标同值即同类」（md5 甄别推翻）。

## 2. 灵感标杆（10——对标基准）

微绒毛场（活力第一，名字配不上它）｜星云（唯一想盯着发呆的）｜涡旋火焰（火+旋转双本能）｜霓虹脉冲（最强签名图形，暗谷待修）｜DNA 双螺旋（科学叙事一眼懂）｜球体脉动 3D（motion 42% 全场最高）｜极光（救活后）｜熔岩球 3D｜彗星｜托卡马克等离子体。

## 3. 删除候选（9——**全部待用户裁决**）

### 强证据组（双线交叉）
| 候选 | 证据 | 建议 |
|---|---|---|
| lightning-leader 闪电先导 | 与 lightning 视觉雷同+两采样浑浊暗痕（l7.7-9.4） | 删 leader 留 lightning（更成熟） |
| spectrum 频谱 | 与 rainbow 视觉雷同（rainbow 有感知均匀亮度增强更强） | 删 |
| orion-nebula 猎户星云 | 与 nebula 雷同（nebula 是灵感标杆） | 删 |
| laser-show 激光秀 3D | 伪 3D（纯 2D 角度高斯零 raymarch，CPU 可替代） | 删 |

### 物理不可实现组（LED 网格分辨率天花板——美学单线+代码印证）
| 候选 | 证据 |
|---|---|
| wave-diffraction 波动衍射 | 条纹宽度低于 LED 物理间距——物理对但视觉无效（l5.6） |
| icosahedral-virus 二十面体病毒 | 20 面几何在 24×14 网格不可辨认 |
| comet-tail 彗尾物理 | 与彗星 90% 重叠且更弱——并入彗星做参数 |
| eclipse-alignment 蚀相合 | 近全黑不可读（lit3.3%）——若暗谷地板救不活则删 |
| ripple vs neon-pulse | 代码建议二选一；**主审反对删 ripple**（有点击涟漪交互功能）——改为差异化（neon-pulse 做签名图形,ripple 主打开交互） |

## 4. 平淡名单（14——救活方向已附）
暗谷类 9（全局地板一次修）｜准静态类 4（提速/补 t）｜色彩单一类 1。
低成本救活 9 项见 R283-code-audit.md（各 ≤2 行,含 P1×2）。

## 5. 路线图
- **P0（今天）**：R284 救活批——black-hole 去饱和+audio-beat 楼层+全局暗谷地板+提速 4 项（全部不需要删除决策,纯改善）
- **P1（本周）**：R285 删除批（本报告 §3 用户裁决后执行——含 i18n/paramMeta/预设/quick-dimensions 联动清理）
- **P2**：hologram/lava-sphere 提亮提速；warp-portal 补拍验证+音频驱动；GPU 3D 组音频联动（「触发心灵」最大杠杆——5/6 shader 仅 2 参数）
- **P3**：卡片缩略图 80×44 太糊（raymarch 细节全失,第一印象先天受限）——提升预览分辨率

## 6. 待用户确认 / 局限
- 删除名单 9 项**均未执行**——等你点名
- 15 效果首轮无有效目视样本（3D/音频 tab），其中 3D 已由 GPU 线代码评审补位;音频效果 idle 态评审不完整（需播放音频后复评）
- warp-portal/neon-galaxy/laser-show 五维分为代码推演（GPU 线自述局限）

### 附录
- `docs/review/R283-aesthetics.md` ｜ `docs/review/R283-code-audit.md` ｜ `docs/review/R283-gpu3d.md`
- 数据：`docs/ui-review/r-effect-audit/`（kind-map.csv 55 卡干净捕获 + engine-motion-sweep.csv 引擎差分基线 + metrics-legacy81.csv 存档）
