# R90 P1 音频 AI 测试场实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans / subagent-driven-development. Steps use checkbox syntax.

**Goal:** AI 实验室新增「音频」Tab：Silero VAD（2MB）+ AST audioset int8（90.6MB）录音推理测试场，模型走现有按需下载管线，主进程 onnxruntime-node 推理。

**Spec:** PRD-0002 §R90（P1 范围）；分支 `feat/audio-ai-lab`。

## Global Constraints

- **模型硬预算 ≤100MB**（R90.2）：仅 silero_vad.onnx（~2.4MB）与 ast int8（90.6MB）。
- 已验证 URL（2026-09-13）：silero `https://github.com/snakers4/silero-vad/raw/master/src/silero_vad/data/silero_vad.onnx`；AST `https://hf-mirror.com/onnx-community/ast-finetuned-audioset-10-10-0.4593-ONNX/resolve/main/onnx/model_int8.onnx`；labels 源 `…/-ONNX/resolve/main/config.json` 的 id2label。
- AST mel 参数（preprocessor_config.json 实测）：16000 Hz / 128 mel bins / 1024 帧；归一化用 AST 官方默认 `mean=-4.2677393, std=4.5689974`。
- 复用：onnxruntime-node 1.29（零新依赖）、`MODELS_MANIFEST`+`modelDownload`+`modelDownloadProgress`、AI Lab 三 Tab 结构（加第 4 个）。
- 提交标题 `[PRD-0002] <type>: <subject>`；zh+en 同步；`yarn test/typecheck/build`。

## File Structure

```text
新增 src/renderer/src/assets/audioset-labels.json   （527 标签，Task1 从 config.json 生成入库）
     src/main/audio/melSpectrogram.ts               （mel 前处理纯函数）
     src/main/audioAiService.ts                     （VAD/AST 推理服务，session 可注入）
     src/renderer/src/tools/audioRecorder.ts        （16kHz 录音采集，测试可 mock）
     src/renderer/src/components/AiLabAudioTab.tsx  （音频 Tab 面板）
     tests/main/audio/{melSpectrogram.test.ts, audioAiService.test.ts}
     tests/renderer/components/AiLabAudioTab.test.tsx
修改 src/shared/modelsManifest.ts（+2 条目）
     src/shared/ipc.ts、src/preload/index.ts（+3 通道）
     src/main/index.ts（+3 handler，接线 audioAiService + getCachedModelUrl）
     src/renderer/src/global.d.ts（rgbbox 类型，若集中声明处需要）
     src/renderer/src/components/AiLabView.tsx（tabs + 'audio'）
     src/renderer/src/i18n/index.tsx、styles.css
     tests/renderer/{i18nShellKeys.test.ts,_helpers.tsx,components/AiLabView.test.tsx}
```

## Tasks

### T1 模型清单 + 标签资产
- `modelsManifest.ts` 追加：
  - `{ name:'silero_vad', file:'silero_vad.onnx', url:'https://github.com/snakers4/silero-vad/raw/master/src/silero_vad/data/silero_vad.onnx', description:'Silero VAD voice-activity ONNX (~2MB)' }`
  - `{ name:'ast_audioset', file:'ast_audioset_int8.onnx', url:'https://hf-mirror.com/onnx-community/ast-finetuned-audioset-10-10-0.4593-ONNX/resolve/main/onnx/model_int8.onnx', description:'AST audioset 527-class int8 ONNX (~91MB)' }`
- 生成标签：`curl -sL <hf-mirror>/resolve/main/config.json` → python 提取 id2label（按 id 排序数组）→ 写 `src/renderer/src/assets/audioset-labels.json`（`[{index,label},…]` 527 项）入库。
- 测试 `tests/shared/modelsManifest.test.ts`：新条目 name/file/url 非空、url https、labels JSON 长度 527 且 index 连续。
- Commit `feat: R90 P1 模型清单扩展 + audioset 标签资产`

### T2 mel 前处理纯函数（TDD）
- `melSpectrogram.ts`：`astMelSpectrogram(pcm: Float32Array, sampleRate = 16000): Float32Array /* 1024*128 */`
  - 实现要点：重采样交给调用方（保证 16k 输入）；分帧 n_fft=400（25ms）hop=160（10ms）；每帧 zero-pad 到 512 做 radix-2 FFT（实输入→复），取幅度谱前 201 bins；mel 滤波器组 128 三角带（0–8000Hz，按 **512 点频率刻度**构造 —— 与 librosa n_fft=400 刻度差异对分类无实质影响，计划声明此近似）；功率谱→`log(mel + 1e-10)`→`(x - (-4.2677393)) / 4.5689974`；帧数 pad/截断到 1024（pad 用 mean 值填充后归一化前处理——简化：pad 静音帧归一化后为 mean 常数）。
  - 导出 `buildMelFilterBank(numMel=128, nFft=512, sr=16000)` 供测试。
- 测试（node）：①输出长度 1024*128；②全零输入 → 归一化后值 ≈ (log(1e-10)-mean)/std（常数）；③440Hz 正弦能量峰落在低频 mel 带且显著高于高频带；④全部输出有限。运行 `yarn test tests/main/audio/melSpectrogram.test.ts` 红→绿。
- Commit `feat: R90 P1 AST mel 前处理纯函数`

### T3 audioAiService（TDD）
- `audioAiService.ts`：
  - `initAudioAi(opts: { modelsDir: string; findCached: (file: string) => Promise<string | null> })`（findCached 注入 main 的 getCachedModelUrl 逻辑，服务可测）
  - `isCached(file): Promise<boolean>`；`getSession(file): Promise<InferenceSession>`（lazy，`ort.InferenceSession.create(path,{executionProviders:['cpu']})`）
  - `runVad(pcm: Float32Array): Promise<{ prob: number; frames: number }>` —— silero v5 协议：1536 样本/chunk，输入 `x[1,1536]`、`state[2,1,128]`（跨 chunk 保持，结束清零）、`sr[1] int64=16000`；输出 `output[1]`；返回 max prob。
  - `runAst(pcm: Float32Array): Promise<{ top: Array<{ index: number; score: number }> }>` —— mel → `ort.Tensor('float32', data, [1,1024,128])` → logits[527] → softmax → top5。
- 测试：mock session 工厂（VAD 固定输出序列→max 正确、state shape 校验；AST logits [.., 527]→softmax top5 顺序/分值正确）；未 init 时调用抛出明确错误。
- Commit `feat: R90 P1 audioAiService（VAD/AST 推理）`

### T4 IPC + preload
- `ipc.ts`：`audioAiStatus: 'rgbbox:audio-ai:status'`、`audioAiRunVad: 'rgbbox:audio-ai:run-vad'`、`audioAiRunAst: 'rgbbox:audio-ai:run-ast'`
- main handlers：status → `{ sileroCached, astCached }`（isCached）；run → 未下载 `{ ok:false, hint:'not-downloaded' }`；pcm 参数校验（Float32Array、长度 16000–480000 即 1–30s）违规 → `{ ok:false, hint:'parse' }`；`initAudioAi({ modelsDir, findCached: getCachedModelUrl })` 在 handler 注册处接线。
- preload：+3 方法 + AiChatOutcome 风格的 `AudioAiVadResult/AudioAiAstResult` 类型放 `shared/types.ts`。
- `_helpers.tsx` mock +3（status 全 true、VAD prob 0.97、AST top5 固定）。
- Commit `feat: R90 P1 audio-ai IPC（status/run-vad/run-ast）`

### T5 渲染层：audioRecorder + 音频 Tab（TDD）
- `audioRecorder.ts`：`startAudioRecorder(): Promise<{ stop(): Promise<Float32Array> }>` —— `getUserMedia({audio})` + `new AudioContext({sampleRate:16000})` + `createScriptProcessor(4096)` 累积 mono Float32Array；stop 时关闭 track/context 返回拼接结果。**测试一律 vi.mock 此模块**（happy-dom 无媒体栈）。
- `AiLabAudioTab.tsx`（props 无，自取 i18n/rgbbox）：
  - 两张测试卡（VAD/AST）：状态行（未下载→[下载] 按钮（调 `modelDownload(name)`，进度走既有 `onModelDownloadProgress`… 若现有订阅 hook 不可复用则简单轮询 `audioAiStatus`）；就绪→[录音 3 秒]（自动停止）→运行→结果）。
  - VAD 结果：概率条（`prob` 百分比 + 阈值 0.5 文案「语音/静音」）；AST 结果：Top-5 列表（labels JSON[index] + 百分比）。
  - 卡片独立 busy 态防重入；组件卸载时停止录音。
- AiLabView：tabs 数组加 `'audio'`（`ai.lab.tab.audio`），面板挂 `AiLabAudioTab`。
- 组件测试：mock audioRecorder/rgbbox → ①Tab 出现且默认状态渲染两卡；②未下载→下载按钮调 `modelDownload('silero_vad')`；③就绪→录音→`audioAiRunVad` 收到 16000≤len≤480000 数组→概率条渲染 `97%`；④AST 卡→Top-5 列表渲染 mock 标签；⑤录音中按钮禁用。
- Commit `feat: R90 P1 AI 实验室音频 Tab（VAD/AST 测试场）`

### T6 i18n + 样式 + 收尾
- i18n（zh+en）：`ai.lab.tab.audio`、`ai.lab.audio.title.vad/ast`、`ai.lab.audio.download/progress/ready/record/recording`、`ai.lab.audio.vad.speech/quiet/prob`、`ai.lab.audio.ast.top`、`ai.lab.audio.needModel`；SHELL_KEYS 同步。
- styles.css：`.ai-audio-grid`、`.ai-audio-card`、`.ai-prob-bar`（含 fill 宽度内联样式）。
- 回归：`yarn typecheck && yarn test && yarn build` 全绿；死引用核查（无孤儿 key）。
- Commit `feat: R90 P1 i18n 与音频卡样式` / `chore: R90 P1 回归`

### T7 PRD 收尾 + code-review → 修复
- R90.7 → ✅ + 证据（测试数/typecheck/build/URL 验证记录）；后台 code-review（重点：onnx session 生命周期、pcm 校验边界、录音资源释放、下载进度态、≤100MB 合规）；修复 → 提交。

## Self-Review
- Spec 覆盖：R90.1→T2/T3；R90.2→T1（URL 已实测、90.6MB 合规）；R90.3→T5；R90.4→T4；R90.5→T5/T7；R90.6 全覆盖。
- 类型一致：`AudioAiVadResult/AudioAiAstResult`（T4 定义，T5 消费）；mel 输出形状（T2 定义、T3 消费）；findCached 注入（T3 定义、T4 接线）。
