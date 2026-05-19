// scripts/dump_scene_stills.js
// VrewCodingClean 컴포지션을 6 scene 모두에서 1 frame씩 PNG로 추출 → 효과가 실제로 그려졌는지 시각 검증용.
// 사용: node scripts/dump_scene_stills.js

const path = require('path');
const fs = require('fs');
const { bundle } = require('@remotion/bundler');
const { renderStill, selectComposition } = require('@remotion/renderer');

(async () => {
  const entry = path.join(__dirname, '..', 'src', 'index.ts');
  console.log('[stills] bundling...');
  const serveUrl = await bundle({ entryPoint: entry });
  console.log('[stills] bundle OK:', serveUrl);

  const inputProps = {
    durationSeconds: 12,
    scriptScenes: [
      { scene_id:'S1_hook',    section:'hook',     duration:2, caption:'쇼츠 3시간?',  narration:'쇼츠 3시간 쓰세요?', effect:'terminal-type', style:{ scale:1.3, speed:1.5 } },
      { scene_id:'S2_setup',   section:'setup',    duration:2, caption:'원래 두세 시간 깨짐',  narration:'원래 두세 시간', effect:'code-typing', style:{ scale:0.85, y:-200 } },
      { scene_id:'S3_reveal',  section:'reveal',   duration:2, caption:'GPT → ElevenLabs → Whisper → Remotion', narration:'…', effect:'workflow-nodes', nodes:['GPT','ElevenLabs','Whisper','Remotion'], style:{ speed:2 } },
      { scene_id:'S4_cause',   section:'cause',    duration:2, caption:'API로 연결', narration:'API로 연결', effect:'log-stream', style:{ opacity:0.6, y:120 } },
      { scene_id:'S5_solution',section:'solution', duration:2, caption:'딱 3단계', narration:'딱 3단계', effect:'checklist-run', checklist:['토픽 입력','워크플로 트리거','mp4 받기'], style:{ scale:1.2, x:60 } },
      { scene_id:'S6_cta',     section:'cta',      duration:2, caption:'n8n 깔고 따라하세요', narration:'…', effect:'cursor-blink', style:{ speed:2.5 } },
    ],
    sceneEffects: { hook:'terminal-type', setup:'code-typing', reveal:'workflow-nodes', cause:'log-stream', solution:'checklist-run', cta:'cursor-blink' },
    segmentStyles: { /* scriptScenes 내부 style 사용 */ },
    effectPreset: 'vrew-coding-clean',
  };

  const comp = await selectComposition({
    serveUrl, id: 'VrewCodingClean', inputProps,
  });
  const fps = comp.fps; // 30
  const total = comp.durationInFrames;
  console.log(`[stills] composition ready: fps=${fps} frames=${total}`);

  const outDir = path.join(__dirname, '..', 'output', 'scene_stills');
  fs.mkdirSync(outDir, { recursive: true });

  // 각 scene 가운데 frame
  for (let i = 0; i < 6; i++) {
    const sceneCenterSec = i * 2 + 1; // duration 2초/scene, 가운데 1초 지점
    const frame = Math.min(total - 1, Math.round(sceneCenterSec * fps));
    const out = path.join(outDir, `scene_${i + 1}.png`);
    console.log(`[stills] rendering scene ${i+1} frame ${frame} (${sceneCenterSec}s) -> ${out}`);
    await renderStill({
      composition: comp,
      serveUrl,
      output: out,
      frame,
      inputProps,
      chromiumOptions: { gl: 'swiftshader' },
      imageFormat: 'png',
    });
    console.log(`[stills]   ✓ size=${(fs.statSync(out).size/1024).toFixed(1)}KB`);
  }
  console.log('[stills] DONE');
})().catch((e) => { console.error(e); process.exit(1); });
