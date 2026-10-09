# RGBBox 发布签名评估（Windows / macOS）

> 状态：**评估文档**（PRD-0002 R236.4）。本文只做方案与成本评估，**不包含任何实施**；实际采购与流水线接入时另行追加 R-N 立项。

## 为什么要签名

- **未签名 exe**：Windows SmartScreen 对未签名下载直接弹「Windows 已保护你的电脑」，蓝色全屏劝退页，转化率损失显著；部分杀软默认拦截。
- **签名（OV）**：确认发行者身份 + 文件完整性（篡改即失效），SmartScreen 仍可能弹窗直到证书积累信誉。
- **签名（EV）**：身份核验更严（组织实体、电话回访等），行业普遍观察到**初始即获得 SmartScreen 信誉**（新证书首次分发即不弹窗）。微软官方口径是"信誉与证书绑定"，未书面承诺 EV 一定免弹窗，但多年实践如此。

## Windows 方案对比

| 维度 | OV 代码签名证书 | EV 代码签名证书 |
|---|---|---|
| 个人可购 | 可（个人/Open Source 档，如 Certum OSS 档） | 基本不可（要求注册企业实体） |
| 年成本区间（2026 市价） | ≈ **$100–400/年**（Certum/Sectigo 低价档 $70–200；DigiCert/GlobalSign $300–500） | ≈ **$250–700/年**（SSL.com/DigiCert/Sectigo，含云签名服务费的常见 $350–600） |
| 私钥载体 | USB token 或云 HSM（CA/B Forum 2023-06 起强制硬件保护，不再发裸 PFX） | 同左；主流是云签名（DigiCert KeyLocker / SSL.com eSigner / Azure Key Vault） |
| SmartScreen | 需**信誉积累期**：新证书首发通常仍弹窗，随下载量增长数天~数周消失 | 通常**首发即无弹窗** |
| 签名方式 | signtool（token PIN）或云 API | 云 API 或 token |
| 适合阶段 | 预算有限、可忍受初期弹窗 | 商业首发、要转化率 |

补充：微软 **Azure Trusted Signing**（原 ESA）按月订阅（≈$9.99/月起 + 量），仅限通过实体审核的组织，证书由微软托管、免 token，是近年成本下限方案，但个人/小微审核门槛高。

## electron-builder 集成点（现状盘点，未实施）

当前 `electron-builder.yml`（或 package.json `build` 段）的 `win` 配置**未启用签名**，`yarn dist:win` 产出未签名 zip。接入点：

1. **配置直签**：`win.certificateSubjectName`（或 `certificateFile`+`certificatePassword`，PFX 时代遗留）+ `win.signingHashAlgorithms: ['sha256']` + `win.rfc3161TimeStampServer`（默认 `http://timestamp.digicert.com`，**必须保留时间戳**，否则证书过期后签名连带失效）。
2. **afterSign 钩子**：token/云签名（KeyLocker、eSigner、Azure Trusted Signing）走 `afterSign: scripts/afterSign.js` 自定义 hook（mac 公证同用此钩子，模式一致：`context.appOutDir` → 逐 exe/dll `signtool sign /tr /td sha256 /fd sha256`）。
3. **额外资产**：安装器（nsis）与 `uninstaller` 也会被 electron-builder 自动纳入签名；`.splat` 等模型资产已由 `files` 排除，不涉及。
4. **CI**：token 方案需要 Windows runner 挂 USB（自托管才行）；云签名方案天然适配 GitHub Actions（ secrets 存云签名 API 凭据）。

## SmartScreen 信誉积累期（若选 OV）

- 新 OV 证书从首次分发起，一般 **数天到数周**（视下载量）内弹窗逐步消失；期间可在官网提供「仍要运行」引导文案。
- 信誉绑定**证书 + 文件哈希**：大改版本初期可能重新轻微弹窗，属正常现象。

## macOS 公证（notarization）概述

- 前提：Apple Developer Program（**$99/年**）+ **Developer ID Application** 证书（分发在 App Store 之外必须）。
- 流程：`electron-builder` `mac.notarize: true`（或 afterSign 钩子调 `@electron/notarize`）→ 打包的 app 打 zip 上传 Apple 公证 → 公证通过后 `stapler` 附着票据 → Gatekeeper 首次打开不再联网验证、不弹「无法验证开发者」。
- 凭据：`APPLE_ID` + `APPLE_APP_SPECIFIC_PASSWORD` + `APPLE_TEAM_ID`（或 App Store Connect API Key）。
- macOS 不签名/不公证的后果比 Windows 更硬：Gatekeeper 默认**直接拒开**（右键打开可绕，商业分发不可接受）。

## 结论（另立项）

1. **Windows**：商业发布建议 **EV 或 Azure Trusted Signing**（跳过信誉积累期）；预算优先则 OV + 官网引导文案。年成本预算区间 **$100–700**。
2. **macOS**：Developer ID + notarization 是硬门槛，年成本 **$99（ADP）+ 证书无额外费**。
3. 本文档**仅评估**。实施（采购证书、`afterSign` 脚本、CI secrets、dist 脚本改造）在确定预算后**另行追加 R-N 立项**，不在 R236 范围内。
