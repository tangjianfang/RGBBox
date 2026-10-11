# I18N-AUDIT — 全量审计报告（R240 / F5 族）

> 生成：2026-10-10T19:07:26.516Z（node scripts/i18n-audit.mjs）
> 语料：zh 1782 键 / en 1782 键

| 检查 | 发现 | 处置 |
|---|---|---|
| en 缺键 | 0 | 必修（F5 实例） |
| zh 缺键 | 0 | 必修 |
| 空值 | 0 | 必修 |
| 占位符不一致 | 0 | 必修 |
| zh=en 同文（非中文） | 15 | 人工复核 |
| en 超长（>3×zh） | 131 | 人工复核（溢出候选） |
| 重复键 | 0 | 必修 |

## zh=en 同文（复核：或为刻意的品牌/术语）（15）

- app.name
- ai.lab.tab.agent
- ai.lab.aws.accessKeyId
- ai.lab.aws.secretAccessKey
- arch.module.typescript
- arch.module.nodejs
- arch.module.ipc.item1
- arch.module.ipc.item2
- games.swarm.label.player
- games.swarm.label.boss
- games.rouletteStatResult
- diag.processCpu.cpu

- video.annotate.engineRapid
- video.annotate.engineWinrt
- ai.apiKey

## en 超长（复核：布局溢出候选）（131）

- ai.lab.keyUnreadable (46→161)
- ai.voice.lexiconEmpty (25→92)
- ai.voice.mixedHint (38→149)
- ai.voice.err.piper-missing (19→59)
- ai.voice.err.speech-unavailable (12→55)
- ai.voice.err.synthesis (13→44)
- ai.voice.err.network (25→80)
- ai.voice.err.model-not-ready (17→56)
- ai.agent.step1 (14→48)
- ai.agent.step3 (18→57)
- ai.agent.ai8Experimental (38→116)
- ai.agent.deleteConfirm (14→43)

- ai.agent.empty (19→65)
- ai.agent.err.approval-pending (12→46)
- ai.lab.vision.hint (54→199)
- ai.ai8.drawTakeover (22→68)
- ai.ai8.contextHint (18→55)
- ai.lab.audio.desc.vad (22→72)
- ai.lab.audio.errStream (14→44)
- ai.lab.audio.vad.hint (21→76)
- ai.lab.audio.ast.hint (26→88)
- settings.games.clearHint (20→67)
- settings.games.clearConfirm (17→52)
- settings.vision.replayHint (17→67)

- shutdown.hint (18→66)
- shutdown.err.spawn-failed (24→77)
- effects.preset.static.desc (21→76)
- effects.preset.breathing.desc (13→43)
- effects.preset.rainbow.desc (10→48)
- effects.preset.wave.desc (12→45)
- effects.preset.fire.desc (26→106)
- effects.preset.starlight.desc (12→50)
- effects.preset.ripple.desc (12→43)
- effects.preset.spectrum.desc (25→99)
- effects.preset.comet.desc (15→56)
- effects.preset.lightning.desc (11→50)

- effects.preset.aurora.desc (10→53)
- effects.preset.explode.desc (13→54)
- effects.preset.audio-beat.desc (23→71)
- effects.preset.random-color.desc (23→73)
- effects.preset.custom-paint.desc (32→107)
- effects.preset.image-paint.desc (27→87)
- effects.preset.vortex.desc (30→91)
- effects.preset.tunnel.desc (30→104)
- effects.preset.crystal.desc (38→117)
- effects.preset.glitch.desc (33→109)
- effects.preset.matrix-rain.desc (25→94)
- effects.preset.neon-pulse.desc (20→85)

- effects.preset.nebula.desc (28→90)
- effects.preset.fluid-flow.desc (27→97)
- effects.preset.mirror-symmetry.desc (22→84)
- effects.preset.dna-helix.desc (27→113)
- effects.preset.black-hole.desc (32→124)
- effects.preset.solar-system.desc (29→102)
- effects.preset.spiral-galaxy.desc (28→114)
- effects.preset.orion-nebula.desc (33→117)
- effects.preset.pulsar-beacon.desc (26→110)
- effects.preset.hurricane-eye.desc (29→118)
- effects.preset.lightning-leader.desc (23→104)
- effects.preset.icosahedral-virus.desc (28→105)

- effects.preset.protein-folding.desc (26→91)
- effects.preset.mitosis-spindle.desc (29→101)
- effects.preset.synapse-pulse.desc (25→102)
- effects.preset.quantum-collapse.desc (17→88)
- effects.preset.microvilli-field.desc (27→99)
- effects.preset.eclipse-alignment.desc (21→83)
- effects.preset.comet-tail.desc (25→91)
- effects.preset.magnetosphere-aurora.desc (27→94)
- effects.preset.wave-diffraction.desc (23→97)
- effects.preset.vortex-flame.desc (25→96)
- effects.preset.tokamak-plasma.desc (29→102)
- effects.preset.sphere-pulse.desc (39→139)

- effects.preset.warp-portal.desc (30→116)
- effects.preset.neon-galaxy.desc (33→120)
- effects.preset.lava-sphere.desc (37→139)
- effects.preset.laser-show.desc (39→138)
- effects.preset.hologram.desc (41→149)
- games.help (25→87)
- games.ruleEarn (16→55)
- games.tileSlashSummary (24→73)
- games.slashRule2 (21→66)
- games.vision.err.detached (13→41)
- games.vision.err.enumerate (15→56)
- games.vision.hint.center (17→52)

- games.vision.chordPosture (31→99)
- games.vision.ob.envRaise (24→87)
- games.vision.ob.envMirrorQ (12→52)
- games.vision.ob.gesture.pinch.how (9→44)
- games.vision.ob.gesture.menu.how (14→46)
- games.vision.ob.doneHint (18→61)
- games.vision.env.dim-light (18→56)
- games.vision.env.low-fps (18→60)
- games.vision.engine.state.searching (14→44)
- games.vision.engine.cal.hint.center (17→61)
- games.vision.engine.cal.hint.pinch (18→59)
- games.vision.engine.cal.center.hand-seen.retry (19→62)

- games.vision.engine.cal.center.no-hand.extend (20→61)
- games.vision.engine.cal.reach.range.retry (23→77)
- games.vision.engine.cal.pinch.samples.retry (21→68)
- games.swarmControls (21→66)
- games.swarmRule3 (16→50)
- games.up.barrage.desc (16→49)
- games.coach.td.coinsIdle (13→41)
- games.coach.td.earlyStart (17→64)
- games.coach.td.finalWaves (13→43)
- games.coach.sw.spinReady (13→41)
- games.lan.guestWait (13→42)
- games.lan.peerLeft (12→44)

- games.lan.cmdHint (19→58)
- games.recap.firstRun (18→55)
- videowall.singleScreenHint (17→54)
- games.onboard.tetris.3 (12→41)
- games.onboard.slash.1 (10→55)
- games.tetrisControls (13→47)
- games.tetrisRule3 (9→42)
- games.codex.char.bulwark.lore (17→53)
- games.codex.enemy.sprinter.lore (11→42)
- games.codex.enemy.swarm.lore (19→59)
- games.codex.enemy.shooter.lore (18→61)
- games.codex.enemy.splitter.lore (16→55)

- scene.linkedDisplays.hint (18→60)
- videowall.hint (25→79)
- audio.emptyPlaylist (13→42)
- audio.export.desc (26→100)
- audio.viz.projectUnsupportedWaveform (10→41)
- video.capture.fail (16→54)
- video.editor.error (15→52)
- video.annotate.ocrRegion (16→49)
- snip.hotkeyHint (25→94)
- media.error.decode (22→68)
- media.error.network (28→86)

