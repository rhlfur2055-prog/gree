// server-local.js — 프론트+백엔드 통합 Remotion 렌더 서버
// node remotion-service/server-local.js

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const express  = require('express');
const path     = require('path');
const fs       = require('fs');
const { v4: uuid }          = require('uuid');
const { bundle }            = require('@remotion/bundler');
const { renderMedia, selectComposition } = require('@remotion/renderer');
const { runPipeline, reorderAndRerender } = require('../rag/pipeline_shorts');
const { propose: proposeReorder } = require('../youtube/reorder_engine');
const cron = require('node-cron');
const { Pool } = require('pg');

// ── Postgres 풀 (lazy 초기화) ─────────────────────────────────────
let _pgPool = null;
function pg() {
  if (!_pgPool) {
    const conn = process.env.PG_CONN || process.env.DATABASE_URL;
    if (!conn) throw new Error('PG_CONN 환경변수 없음');
    _pgPool = new Pool({ connectionString: conn, max: 5 });
  }
  return _pgPool;
}

// ── cleanup cron — 매 30분, render_started_at < NOW()-6h 인 'rendering' 행을 'failed' 처리
cron.schedule('*/30 * * * *', async () => {
  try {
    const r = await pg().query(
      `UPDATE ai_shorts.rag_scripts
       SET render_status = 'failed', render_error = 'timeout_cleanup'
       WHERE render_status = 'rendering'
         AND render_started_at < NOW() - INTERVAL '6 hours'
       RETURNING id`
    );
    if (r.rowCount > 0) {
      console.log('[cleanup] timeout → failed:', r.rows.map(x => x.id).join(','));
    }
  } catch (e) {
    console.warn('[cleanup] failed:', e.message);
  }
});

const app  = express();
const PORT = process.env.PORT || 3001;

const OUTPUT_DIR = path.join(__dirname, 'output');
const SHORTS_LOG = path.join(__dirname, '..', 'shorts_log');
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

app.use(express.json({ limit: '50mb' }));

// ── 정렬+재배치 대시보드 HTML (독립 페이지 /scripts) ─────────────────
const SCRIPTS_DASHBOARD_HTML = [
'<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">',
'<title>Scripts · Reorder</title>',
'<style>',
'body{font-family:Inter,Pretendard,system-ui,sans-serif;background:#0f0f14;color:#f0f0f5;margin:0;padding:32px;max-width:1100px;margin:0 auto}',
'h1{font-size:22px;margin:0 0 8px}',
'.sub{color:rgba(240,240,245,.55);font-size:13px;margin-bottom:24px}',
'.tabs{display:flex;gap:8px;margin-bottom:20px}',
'.tab{padding:8px 14px;background:#1e1e2a;border:1px solid rgba(255,255,255,.08);border-radius:8px;cursor:pointer;font-size:13px;color:rgba(240,240,245,.6)}',
'.tab.active{background:rgba(124,106,247,.18);color:#7c6af7;border-color:#7c6af7}',
'.badge{display:inline-block;background:#fbbf24;color:#0f0f14;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:700;margin-left:8px}',
'.row{background:#16161f;border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:16px;margin-bottom:10px;display:grid;grid-template-columns:1fr auto auto;gap:16px;align-items:center}',
'.title{font-size:14px;font-weight:600}',
'.meta{font-size:11px;color:rgba(240,240,245,.5);margin-top:4px}',
'.score{font-size:18px;font-weight:700;color:#7c6af7}',
'.tier-saved{color:#4ade80}.tier-deprecated{color:#f87171}.tier-normal{color:rgba(240,240,245,.7)}',
'.btn{padding:8px 14px;background:#7c6af7;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600}',
'.btn:disabled{background:#333;cursor:not-allowed}',
'.btn-sec{background:#1e1e2a;color:#f0f0f5;border:1px solid rgba(255,255,255,.12)}',
'.modal-bg{position:fixed;inset:0;background:rgba(0,0,0,.7);display:none;align-items:center;justify-content:center;z-index:100}',
'.modal-bg.show{display:flex}',
'.modal{background:#16161f;border:1px solid rgba(255,255,255,.12);border-radius:16px;padding:28px;max-width:680px;width:90%;max-height:85vh;overflow-y:auto}',
'.modal h2{font-size:16px;margin:0 0 12px}',
'.diff{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin:16px 0}',
'.diff-col h3{font-size:12px;color:rgba(240,240,245,.55);margin:0 0 8px;text-transform:uppercase}',
'.seg{background:#1e1e2a;padding:8px 12px;border-radius:6px;margin-bottom:6px;font-size:12px}',
'.seg-hook{border-left:3px solid #f87171}',
'.seg-cta{border-left:3px solid #4ade80}',
'.gain{font-size:14px;margin:12px 0;padding:12px;background:rgba(124,106,247,.1);border-radius:8px}',
'.gain-pos{color:#4ade80}.gain-neg{color:#f87171}',
'.input-row{display:flex;gap:8px;margin-top:8px}',
'.input-row input{flex:1;background:#0f0f14;border:1px solid rgba(255,255,255,.12);color:#f0f0f5;padding:6px 10px;border-radius:6px;font-size:12px}',
'</style></head><body>',
'<h1>Scripts · Retention 기반 정렬</h1>',
'<div class="sub">측정값(retention/CTR/hook_pass) 가중 점수로 정렬. 매핑 안 된 스크립트는 unmeasured 탭.</div>',
'<div id="badge"></div>',
'<div class="tabs">',
'<div class="tab active" data-f="all">전체</div>',
'<div class="tab" data-f="saved">Saved</div>',
'<div class="tab" data-f="deprecated">Deprecated</div>',
'<div class="tab" data-f="unmeasured">매핑 미입력</div>',
'</div>',
'<div id="list">로딩...</div>',

// modal
'<div class="modal-bg" id="modal"><div class="modal">',
'<h2 id="m-title">재배치 제안</h2>',
'<div id="m-body">분석 중...</div>',
'<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:20px">',
'<button class="btn btn-sec" onclick="closeModal()">닫기</button>',
'<button class="btn" id="m-apply" onclick="applyReorder()" disabled>재렌더 승인</button>',
'</div></div></div>',

'<script>',
'let curFilter="all";let curScriptId=null;let curProposal=null;',
'function esc(s){return String(s||"").replace(/[<>&]/g,c=>({"<":"&lt;",">":"&gt;","&":"&amp;"}[c]))}',
'async function load(){',
'  const r=await fetch("/api/scripts/ranked?filter="+curFilter+"&limit=50");',
'  const d=await r.json();',
'  const um=await fetch("/api/scripts/ranked?filter=unmeasured&limit=1").then(r=>r.json());',
'  document.getElementById("badge").innerHTML=um.total>0?\'<div style="margin-bottom:16px">매핑 미입력 <span class="badge">\'+um.total+\'</span></div>\':"";',
'  const html=(d.items||[]).map(it=>{',
'    const tier=it.rank_tier||"normal";',
'    const mapBox=it.video_id?"":\'<div class="input-row"><input id="vid_\'+it.id+\'" placeholder="11자 video_id" maxlength="11"><button class="btn btn-sec" onclick="mapVid(\'+it.id+\')">매핑</button></div>\';',
'    const reorderBtn=it.video_id?\'<button class="btn" onclick="openModal(\'+it.id+\')">재배치 제안 보기</button>\':\'<span style="font-size:11px;color:rgba(240,240,245,.4)">video_id 입력 필요</span>\';',
'    return \'<div class="row"><div><div class="title">\'+esc(it.title||"untitled")+\'</div>\'+',
'      \'<div class="meta">id=\'+it.id+\' · video_id=\'+(it.video_id||"—")+\' · last_sync=\'+(it.last_metric_sync||"never")+\'</div>\'+mapBox+\'</div>\'+',
'      \'<div style="text-align:right"><div class="score">\'+(it.score||"0.0000")+\'</div><div class="meta tier-\'+tier+\'">\'+tier+\'</div></div>\'+',
'      \'<div>\'+reorderBtn+\'</div></div>\';',
'  }).join("");',
'  document.getElementById("list").innerHTML=html||\'<div style="color:rgba(240,240,245,.4);padding:32px;text-align:center">결과 없음</div>\';',
'}',
'document.querySelectorAll(".tab").forEach(t=>t.onclick=()=>{document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));t.classList.add("active");curFilter=t.dataset.f;load()});',
'async function mapVid(id){',
'  const v=document.getElementById("vid_"+id).value.trim();',
'  if(!/^[A-Za-z0-9_-]{11}$/.test(v)){alert("11자 영문/숫자/_/- 만");return}',
'  const r=await fetch("/api/scripts/"+id+"/map-video",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({video_id:v})});',
'  if(r.ok){load()}else{alert("실패: "+(await r.text()))}',
'}',
'async function openModal(id){',
'  curScriptId=id;curProposal=null;',
'  document.getElementById("m-apply").disabled=true;',
'  document.getElementById("m-body").innerHTML="분석 중...";',
'  document.getElementById("modal").classList.add("show");',
'  const r=await fetch("/api/scripts/"+id+"/reorder-proposal");',
'  const p=await r.json();curProposal=p;',
'  if(p.error){document.getElementById("m-body").innerHTML=\'<div style="color:#f87171">에러: \'+p.error+\'</div>\';return}',
'  if(p.skipped){document.getElementById("m-body").innerHTML=\'<div style="color:#fbbf24">스킵: \'+p.reason+\'</div>\';return}',
'  const segHtml=arr=>arr.map(s=>{const cls=s==="hook"?"seg-hook":(s==="cta"?"seg-cta":"");return \'<div class="seg \'+cls+\'">\'+s+"</div>"}).join("");',
'  const gain=p.expected_gain||0;const gcls=gain>=0?"gain-pos":"gain-neg";',
'  document.getElementById("m-body").innerHTML=',
'    \'<div class="diff"><div class="diff-col"><h3>현재</h3>\'+segHtml(p.current_order||[])+\'</div>\'+',
'    \'<div class="diff-col"><h3>제안</h3>\'+segHtml(p.proposed_order||[])+\'</div></div>\'+',
'    \'<div class="gain">expected_gain: <span class="\'+gcls+\'">\'+gain.toFixed(4)+\'</span> · source=\'+p.source_timepoint+\' · views=\'+(p.views||"?")+\'</div>\'+',
'    (p.no_change?\'<div style="color:#fbbf24">변경 없음 — 현재 순서가 이미 최적</div>\':"");',
'  document.getElementById("m-apply").disabled=p.no_change||false;',
'}',
'function closeModal(){document.getElementById("modal").classList.remove("show")}',
'async function applyReorder(){',
'  if(!curScriptId||!curProposal||!curProposal.proposed_order)return;',
'  if(!confirm("재렌더 시작합니다. ElevenLabs/Whisper 비용 발생.\\n계속?"))return;',
'  document.getElementById("m-apply").disabled=true;',
'  const r=await fetch("/api/scripts/"+curScriptId+"/reorder-apply",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({confirm:true,proposed_order:curProposal.proposed_order})});',
'  const j=await r.json();',
'  if(j.jobId){alert("잡 등록됨: "+j.jobId+"\\nSSE 진행: /pipeline/"+j.jobId+"/events");closeModal();load()}',
'  else{alert("실패: "+JSON.stringify(j))}',
'}',
'load();',
'</script></body></html>'
].join('\n');


// ── 번들 ──────────────────────────────────────────────────────────
let bundleLocation = null;
console.log('[bundle] building...');
const bundlePromise = bundle({
  entryPoint: path.join(__dirname, 'src', 'index.ts'),
  webpackOverride: (cfg) => cfg,
}).then(loc => { bundleLocation = loc; console.log('[bundle] ready ✓'); })
  .catch(err => console.error('[bundle] FAILED:', err.message));

// ── editor-player.tsx 번들 (브라우저 Player 마운트용) ─────────────────
const { buildEditorPlayer, OUT: EDITOR_PLAYER_OUT } = require('./scripts/build_editor_player');
let editorPlayerReady = false;
buildEditorPlayer().then(() => { editorPlayerReady = true; })
  .catch(err => console.error('[editor-player] build FAILED:', err.message));

// ── 파이프라인 Job 저장소 + SSE ──────────────────────────────────────
const pipelineJobs = new Map(); // jobId → { status, steps[], logs[], sseClients[] }

function createJob(topic) {
  const jobId = uuid();
  pipelineJobs.set(jobId, {
    jobId, topic, status: 'running',
    steps: { script: 'pending', tts: 'pending', whisper: 'pending', captions: 'pending', render: 'pending' },
    logs: [], result: null, error: null, startedAt: Date.now(),
    sseClients: [],
  });
  return jobId;
}

function jobEvent(jobId, event) {
  const job = pipelineJobs.get(jobId);
  if (!job) return;
  job.logs.push({ ts: Date.now(), ...event });
  const { step, message, data } = event;
  if (step && step !== 'start' && step !== 'done') {
    job.steps[step] = data && data.done ? 'done' : 'running';
  }
  if (step === 'done') job.status = 'done';
  // 연결된 SSE 클라이언트에 push
  const payload = 'data: ' + JSON.stringify(event) + '\n\n';
  for (const res of job.sseClients) {
    try { res.write(payload); } catch (_) {}
  }
  // 완료 시 SSE 연결 종료
  if (step === 'done' || step === 'error') {
    for (const res of job.sseClients) {
      try { res.write('data: ' + JSON.stringify({ step: '_close' }) + '\n\n'); res.end(); } catch (_) {}
    }
    job.sseClients = [];
  }
}

// ── 공통 렌더 ─────────────────────────────────────────────────────
async function doRender(props, hostHeader) {
  if (!bundleLocation) await bundlePromise;
  if (!bundleLocation) throw new Error('번들 빌드 실패');

  if (props.audio_binary_b64) {
    const audioName = uuid() + '_audio.mp3';
    fs.writeFileSync(path.join(OUTPUT_DIR, audioName),
      Buffer.from(props.audio_binary_b64, 'base64'));
    props.audioSrc = `http://${hostHeader}/file/${audioName}`;
    delete props.audio_binary_b64;
  }

  const jobId   = uuid();
  const outFile = path.join(OUTPUT_DIR, jobId + '.mp4');
  const dur     = Number(props.durationSeconds) || 45;

  const compositionId = props.compositionId || 'TechShorts';
  delete props.compositionId;
  // null/undefined 키 정리 — Remotion이 일부 keys에 대해 undefined를 싫어함
  for (const k of Object.keys(props)) {
    if (props[k] === undefined) delete props[k];
  }
  const sceneEffMap = props.sceneEffects || {};
  const sceneEffStr = Object.keys(sceneEffMap).length
    ? Object.entries(sceneEffMap).map(([k,v]) => `${k.toUpperCase()}:${v}`).join(', ')
    : '';
  const segStyleMap = props.segmentStyles || {};
  const segStyleStr = Object.keys(segStyleMap).length
    ? Object.entries(segStyleMap).map(([k, st]) => {
        const keys = Object.keys(st).filter(kk => st[kk] !== undefined).map(kk => kk).join('/');
        return `${k.toUpperCase()}(${keys})`;
      }).join(', ')
    : '';
  console.log(`[render] ${jobId}  ${dur}s  composition=${compositionId}` +
    (props.effectPreset ? `  preset=${props.effectPreset}` : '') +
    (props.effectTuning ? '  effectTuning=on' : '') +
    (props.captions ? `  captions=${(props.captions||[]).length}` : '') +
    (props.scriptScenes ? `  scenes=${(props.scriptScenes||[]).length}` : ''));
  if (sceneEffStr) console.log(`[render] sceneEffects=${sceneEffStr}`);
  if (segStyleStr) console.log(`[render] sceneOverrides=${segStyleStr} position/scale/speed applied`);
  const composition = await selectComposition({
    serveUrl: bundleLocation, id: compositionId, inputProps: props,
  });
  const totalFrames = Math.round(dur * composition.fps);
  console.log(`[render] progress 0%  (0/${totalFrames} frames)  start`);
  const renderT0 = Date.now();
  const milestones = [10, 25, 50, 75, 90];
  const loggedPct = new Set();
  let lastFrames = 0;

  await renderMedia({
    composition:    { ...composition, durationInFrames: totalFrames },
    serveUrl:       bundleLocation,
    codec:          'h264',
    outputLocation: outFile,
    inputProps:     props,
    imageFormat:    'jpeg',
    crf:            parseInt(process.env.REMOTION_CRF, 10) || 26,
    x264Preset:     process.env.REMOTION_X264_PRESET || 'ultrafast',
    concurrency:    parseInt(process.env.REMOTION_CONCURRENCY, 10) || 1,
    browserExecutable: process.env.CHROME_EXECUTABLE_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    chromiumOptions: { gl: 'swiftshader' },
    timeoutInMilliseconds: parseInt(process.env.REMOTION_TIMEOUT_MS, 10) || 120000,
    onProgress: ({ progress, renderedFrames, encodedFrames }) => {
      const pct = Math.round((Number(progress) || 0) * 100);
      const frames = Number(renderedFrames || encodedFrames || 0);
      if (frames !== lastFrames) lastFrames = frames;
      for (const m of milestones) {
        if (pct >= m && !loggedPct.has(m)) {
          loggedPct.add(m);
          const elapsedMs = Date.now() - renderT0;
          console.log(`[render] progress ${m}%  (${frames}/${totalFrames} frames)  ${(elapsedMs/1000).toFixed(1)}s`);
        }
      }
    },
  });

  const elapsedMs = Date.now() - renderT0;
  const sizeKB = Math.round(fs.statSync(outFile).size / 1024);
  console.log(`[render] progress 100%  (${totalFrames}/${totalFrames} frames)  ${(elapsedMs/1000).toFixed(1)}s`);
  console.log(`[render] output=${outFile}  ${sizeKB}KB`);
  console.log(`[done] ${jobId}  ${(elapsedMs/1000).toFixed(1)}s`);
  return { jobId, outFile, sizeKB, url: `http://${hostHeader}/file/${jobId}.mp4` };
}

// ── Vrew 스타일 클립 편집기 마운트 ───────────────────────────────
require('./clips-editor')(app, { SHORTS_LOG, path, fs });

// ── GET /today — 오늘 파일 자동 감지 ─────────────────────────────
// 후처리 모듈 — /today, /render-auto, /normalize-today 공통
const _scriptPP = require('../rag/script_postprocess');

// 옛 산출물을 자동으로 새 6-section 규격(≤14자 자막, ≥3 keywords)으로 마이그레이션 +
// captions.json이 있으면 실제 audio 길이로 segment durations 동기화.
// idempotent: 이미 normalize된 결과를 다시 호출해도 동일한 결과.
function normalizeAndPersist(scriptPath, captionsPath) {
  let script;
  try { script = JSON.parse(fs.readFileSync(scriptPath, 'utf8')); } catch { return null; }
  const before = {
    chars: (script.subtitle_segments || []).map(s => (s.text||'').length),
    kws:   (script.subtitle_segments || []).map(s => (s.highlight_keywords||[]).length),
    dur:   script.estimated_total_seconds,
  };
  // 1) 6-section + ≤14자 + ≥3 키워드 정규화
  _scriptPP.normalizeTo6Sections(script);
  // 2) captions.json이 있으면 audio 실제 길이로 segments 비례 압축
  if (captionsPath && fs.existsSync(captionsPath)) {
    try {
      const caps = JSON.parse(fs.readFileSync(captionsPath, 'utf8'));
      const audioSec = _scriptPP.audioDurationFromCaptions(caps);
      if (audioSec > 0) {
        _scriptPP.syncToAudioDuration(script, audioSec);
      }
    } catch (e) {
      console.warn('[normalize] captions parse failed:', e.message);
    }
  }
  const after = {
    chars: (script.subtitle_segments || []).map(s => (s.text||'').length),
    kws:   (script.subtitle_segments || []).map(s => (s.highlight_keywords||[]).length),
    dur:   script.estimated_total_seconds,
  };
  const changed =
    JSON.stringify(before.chars) !== JSON.stringify(after.chars) ||
    JSON.stringify(before.kws)   !== JSON.stringify(after.kws)   ||
    before.dur !== after.dur;
  if (changed) {
    fs.writeFileSync(scriptPath, JSON.stringify(script, null, 2), 'utf8');
    console.log(`[normalize] migrated ${path.basename(scriptPath)}  chars=${before.chars}→${after.chars}  kws=${before.kws}→${after.kws}  dur=${before.dur}→${after.dur}s`);
  }
  return { script, changed, before, after };
}

app.get('/today', (_req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const files = {
    script:   path.join(SHORTS_LOG, `${today}_script_result.json`),
    captions: path.join(SHORTS_LOG, `${today}_captions.json`),
    audio:    path.join(SHORTS_LOG, `${today}_voice.mp3`),
  };
  const result = {};
  let script = null;
  for (const [k, p] of Object.entries(files)) {
    result[k] = fs.existsSync(p);
  }
  if (result.script) {
    const r = normalizeAndPersist(files.script, result.captions ? files.captions : null);
    if (r) script = r.script;
  }
  res.json({
    date: today,
    files: result,
    ready: Object.values(result).every(Boolean),
    script: script ? {
      title: script.title,
      hook: script.hook,
      estimated_total_seconds: script.estimated_total_seconds,
      subtitle_segments: script.subtitle_segments,
      audio_synced: !!script._audio_synced,
      audio_sync_ratio: script._audio_sync_ratio,
      script_warnings: script.script_warnings,
    } : null,
  });
});

// 명시적 마이그레이션 — 결과 before/after 반환
app.post('/normalize-today', (_req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const scriptPath   = path.join(SHORTS_LOG, `${today}_script_result.json`);
  const captionsPath = path.join(SHORTS_LOG, `${today}_captions.json`);
  if (!fs.existsSync(scriptPath)) return res.status(404).json({ error: 'script_result.json 없음' });
  const r = normalizeAndPersist(scriptPath, fs.existsSync(captionsPath) ? captionsPath : null);
  if (!r) return res.status(500).json({ error: 'normalize 실패' });
  res.json({
    status: 'done',
    changed: r.changed,
    before: r.before,
    after: r.after,
    audio_synced: !!r.script._audio_synced,
    audio_sync_ratio: r.script._audio_sync_ratio,
    audio_sync_from: r.script._audio_sync_from,
  });
});

// ── POST /render-auto — 오늘 파일 렌더 ───────────────────────────
// ── POST /tts-regenerate — voice/speed 옵션으로 오늘 TTS만 다시 생성 ──
// body: { voice?: string, speed?: number, subtitle_segments?: [...] }
// - voice가 비어있으면 ElevenLabs(default), 있으면 OpenAI TTS(alloy/echo/...).
// - script_result.json의 tts_script를 우선 사용. body의 subtitle_segments가 있으면 그것으로 tts_script 재구성.
app.post('/tts-regenerate', async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const scriptPath = path.join(SHORTS_LOG, `${today}_script_result.json`);
  const audioPath  = path.join(SHORTS_LOG, `${today}_voice.mp3`);
  if (!fs.existsSync(scriptPath)) {
    return res.status(400).json({ error: '오늘 script_result.json 없음' });
  }
  try {
    const script = JSON.parse(fs.readFileSync(scriptPath, 'utf8'));
    const voice  = String(req.body?.voice || '').trim();
    const speed  = Math.max(0.5, Math.min(2, Number(req.body?.speed) || 1));
    const segs   = req.body?.subtitle_segments;

    // tts_script 합성: subtitle_segments가 있으면 tts_text들을 이어붙임
    let ttsText;
    if (Array.isArray(segs) && segs.length) {
      ttsText = segs.map(s => (s.tts_text || s.text || '').trim()).filter(Boolean).join(' ');
      // script_result.json도 같이 업데이트해서 다음 /render-auto에 반영
      script.subtitle_segments = segs;
      script.tts_script = ttsText;
      fs.writeFileSync(scriptPath, JSON.stringify(script, null, 2));
    } else {
      ttsText = script.tts_script || script.full_script || '';
    }
    if (!ttsText || ttsText.length < 5) {
      return res.status(400).json({ error: 'tts_script가 비어있음' });
    }

    let sizeKB = 0;
    if (voice) {
      // OpenAI TTS
      const { default: OpenAI } = await import('openai').catch(() => ({ default: require('openai').default || require('openai') }));
      const oai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      console.log(`[tts-regen] OpenAI voice=${voice} speed=${speed} chars=${ttsText.length}`);
      const resp = await oai.audio.speech.create({
        model: process.env.OPENAI_TTS_MODEL || 'tts-1',
        voice,
        input: ttsText,
        speed,
      });
      const buf = Buffer.from(await resp.arrayBuffer());
      fs.writeFileSync(audioPath, buf);
      sizeKB = Math.round(buf.length / 1024);
    } else {
      // ElevenLabs (pipeline_shorts.js의 genTTS 재사용)
      const { genTTS } = require('../rag/pipeline_shorts');
      console.log(`[tts-regen] ElevenLabs (default voice) speed=${speed} chars=${ttsText.length}`);
      // speed override 위해 env 임시 변경은 안 함 — genTTS 내부 voice_settings.speed가 1.15 고정. speed 적용은 OpenAI 경로만.
      // 사용자가 speed를 바꿔 보이게 하려면 voice를 OpenAI 중 선택해야 한다 (UI에 안내).
      const sz = await genTTS(ttsText, audioPath, (step, msg) => console.log(`[tts-regen] ${step}: ${msg}`));
      sizeKB = Math.round(sz / 1024);
    }

    console.log(`[tts-regen] done ${sizeKB}KB`);
    res.json({ status: 'done', sizeKB, voice: voice || 'elevenlabs-default', speed });
  } catch (e) {
    console.error('[tts-regen] error', e);
    res.status(500).json({ error: e.message || String(e) });
  }
});

app.post('/render-auto', async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const scriptPath   = path.join(SHORTS_LOG, `${today}_script_result.json`);
  const captionsPath = path.join(SHORTS_LOG, `${today}_captions.json`);
  const audioPath    = path.join(SHORTS_LOG, `${today}_voice.mp3`);

  for (const p of [scriptPath, captionsPath, audioPath]) {
    if (!fs.existsSync(p))
      return res.status(400).json({ error: `파일 없음: ${path.basename(p)}` });
  }

  // 옛 산출물 자동 마이그레이션 + audio 길이 동기화
  normalizeAndPersist(scriptPath, captionsPath);

  const script   = JSON.parse(fs.readFileSync(scriptPath, 'utf8'));
  const captions = JSON.parse(fs.readFileSync(captionsPath, 'utf8'));
  const audioBuf = fs.readFileSync(audioPath);
  // duration: body > script(이미 audio sync 적용됨) > captions 추정 > 45 fallback
  const dur      = Number(req.body?.durationSeconds) || script.estimated_total_seconds
                   || _scriptPP.audioDurationFromCaptions(captions) || 45;
  const segs     = req.body?.subtitle_segments || script.subtitle_segments || [];

  // 기본을 새 Vrew 효과 시스템(VrewCodingClean)으로 변경.
  const compositionId = req.body?.compositionId || 'VrewCodingClean';

  // ── 6세그먼트 1:1 매핑 빌더 ─────────────────────────────────────
  // subtitle_segments를 section 순서대로 그룹핑해서 scriptScenes를 만든다.
  // 한 section의 효과 = 그 섹션의 첫 segment에 지정된 effect, 없으면 SECTION_TO_EFFECT 기본값.
  const SECTION_TO_EFFECT = {
    hook: 'terminal-type', setup: 'code-typing', intro: 'code-typing',
    reveal: 'workflow-nodes', problem: 'workflow-nodes',
    cause: 'log-stream',
    solution: 'checklist-run', demo: 'checklist-run',
    cta: 'cursor-blink', conclusion: 'cursor-blink',
  };
  const VALID_EFFECTS = new Set(['terminal-type','code-typing','log-stream','workflow-nodes','checklist-run','cursor-blink','none']);

  const sectionOrder = [];
  const sectionGroup = new Map(); // section -> { segs: [], start, end, firstEffect }
  for (const s of segs) {
    const sec = (s.section || '').toLowerCase();
    if (!sec) continue;
    if (!sectionGroup.has(sec)) {
      sectionGroup.set(sec, {
        segs: [],
        start: Number(s.start) || 0,
        end:   Number(s.end)   || 0,
        firstEffect: VALID_EFFECTS.has(s.effect) ? s.effect : null,
      });
      sectionOrder.push(sec);
    }
    const g = sectionGroup.get(sec);
    g.segs.push(s);
    g.end = Math.max(g.end, Number(s.end) || g.end);
    if (!g.firstEffect && VALID_EFFECTS.has(s.effect)) g.firstEffect = s.effect;
  }

  const builtScenes = sectionOrder.map((sec, i) => {
    const g = sectionGroup.get(sec);
    const caption   = g.segs.map(x => x.text).filter(Boolean).join(' ');
    const narration = g.segs.map(x => x.tts_text || x.text).filter(Boolean).join(' ');
    const effect = g.firstEffect || SECTION_TO_EFFECT[sec] || 'code-typing';
    // segment 단위 style override — 같은 section의 첫 seg의 style을 채택 (없으면 빈 객체)
    const style = (g.segs.find(x => x.style && typeof x.style === 'object') || {}).style || {};
    return {
      scene_id:  `S${i+1}_${sec}`,
      section:   sec,
      duration:  Math.max(0.5, (g.end - g.start) || (dur / Math.max(1, sectionOrder.length))),
      narration,
      caption,
      effect,
      style,
    };
  });

  // 빈 scene 제거 + 중복 CTA 압축
  const cleanedScenes = builtScenes.filter(s => (s.caption && s.caption.trim()) || (s.narration && s.narration.trim()));
  // 중복 CTA 제거: cta section이 여러 개 있을 일은 없지만 안전망
  const seen = new Set();
  const finalScenes = cleanedScenes.filter(s => {
    if (s.section === 'cta' && seen.has('cta')) return false;
    seen.add(s.section);
    return true;
  });

  // 로그용 매핑 문자열
  const sceneEffectsLog = finalScenes
    .map(s => `${s.section.toUpperCase()}:${s.effect}`).join(', ');
  console.log(`[render-auto] sceneEffects=${sceneEffectsLog || '(none)'}`);

  // sceneEffects 맵 (override 전달용)
  const sceneEffectsMap = {};
  for (const s of finalScenes) sceneEffectsMap[s.section] = s.effect;
  // body로 들어온 sceneEffects가 있으면 덮어쓰기
  Object.assign(sceneEffectsMap, req.body?.sceneEffects || {});

  // segment 단위 visual override 맵 — section → style 객체
  const segmentStylesMap = {};
  for (const s of finalScenes) {
    if (s.style && Object.keys(s.style).length) segmentStylesMap[s.section] = s.style;
  }
  // body로 들어온 segmentStyles 우선 적용
  Object.assign(segmentStylesMap, req.body?.segmentStyles || {});

  // 사용자 요청 로그 형식: [editor] segmentOverrides=HOOK:x=120,y=860,scale=1.2,effect=terminal-type
  const overridesLog = Object.entries(segmentStylesMap).map(([sec, st]) => {
    const parts = Object.entries(st).map(([k,v]) => `${k}=${v}`).join(',');
    const eff = sceneEffectsMap[sec];
    return `${sec.toUpperCase()}:${parts}${eff ? `,effect=${eff}` : ''}`;
  }).join(' | ');
  if (overridesLog) console.log(`[editor] segmentOverrides=${overridesLog}`);

  // pipeline_shorts.js의 normalizeTo6Sections가 이미 script.scenes에 6개+effect를 채워줌.
  // 그것이 valid 하면 그대로 사용, 아니면 segs 기반 finalScenes로 fallback.
  const scriptHas6 = Array.isArray(script.scenes) && script.scenes.length === 6
    && script.scenes.every(s => s && s.section && VALID_EFFECTS.has(s.effect));
  const chosenScenes = scriptHas6
    ? script.scenes.map((s,i) => ({
        scene_id: s.scene_id || `S${i+1}_${s.section}`,
        section: s.section,
        duration: s.duration ?? (dur / 6),
        caption: s.caption || '',
        narration: s.narration || s.caption || '',
        effect: s.effect,
        // segment style: 사용자가 editor에서 만든 override를 그대로 주입
        style: segmentStylesMap[s.section.toLowerCase()] || segmentStylesMap[s.scene_id] || {},
      }))
    : (finalScenes.length ? finalScenes : (script.scenes || null));

  // 최종 effect 맵 재계산 (script.scenes 우선)
  if (scriptHas6) {
    sceneEffectsMap.__fromScript = true;
    for (const s of chosenScenes) sceneEffectsMap[s.section] = s.effect;
  }
  Object.assign(sceneEffectsMap, req.body?.sceneEffects || {});

  // effectTuning / effectPreset / sceneOverrides 는 body 에서 직접 받아 그대로 통과
  const props = {
    compositionId,
    hook:              script.hook,
    subtitle_segments: segs,
    captions:          captions.captions,
    scriptScenes:      chosenScenes,
    sceneEffects:      sceneEffectsMap,
    segmentStyles:     segmentStylesMap,
    durationSeconds:   dur,
    audio_binary_b64:  audioBuf.toString('base64'),
    effectTuning:      req.body?.effectTuning,
    effectPreset:      req.body?.effectPreset,
    sceneOverrides:    req.body?.sceneOverrides,
  };

  try {
    const r = await doRender(props, req.headers.host || `localhost:${PORT}`);
    // shorts_log에도 복사
    const dest = path.join(SHORTS_LOG, `${today}_video.mp4`);
    fs.copyFileSync(r.outFile, dest);
    res.json({ status: 'done', url: r.url, sizeKB: r.sizeKB, saved: dest });
  } catch (e) {
    res.status(500).json({ status: 'failed', error: e.message });
  }
});

// ── POST /pipeline — 완전 자동화 파이프라인 실행 ───────────────────
app.post('/pipeline', async (req, res) => {
  const topic = (req.body?.topic || '').trim();
  if (!topic) return res.status(400).json({ error: 'topic 필드 필요' });

  const mode           = req.body?.mode           || 'default';
  const realNews       = req.body?.realNews       || null;
  const prebuiltScript = req.body?.prebuilt_script || null;  // n8n factcheck 워크플로에서 완성 스크립트 전달

  const jobId = createJob(topic);
  res.json({ jobId, status: 'started' });

  const host = req.headers.host || `localhost:${PORT}`;

  // 백그라운드 실행
  runPipeline(topic, {
    mode,
    realNews,
    prebuiltScript,
    onProgress: (step, message, data) => {
      jobEvent(jobId, { step, message, data });
    },
    renderFn: (props) => doRender(props, host),
  }).then(result => {
    const job = pipelineJobs.get(jobId);
    if (job) { job.result = result; job.status = 'done'; }
  }).catch(e => {
    const job = pipelineJobs.get(jobId);
    if (job) { job.error = e.message; job.status = 'error'; }
    jobEvent(jobId, { step: 'error', message: e.message, data: {} });
  });
});

// ── GET /pipeline/:id — Job 상태 조회 ───────────────────────────────
app.get('/pipeline/:id', (req, res) => {
  const job = pipelineJobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'job 없음' });
  const { sseClients, ...safe } = job;
  res.json(safe);
});

// ── GET /pipeline/:id/events — SSE 스트림 ───────────────────────────
app.get('/pipeline/:id/events', (req, res) => {
  const job = pipelineJobs.get(req.params.id);
  if (!job) { res.status(404).end(); return; }

  res.writeHead(200, {
    'Content-Type':  'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection':    'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  // 기존 로그 재생 (늦게 연결한 클라이언트용)
  for (const log of job.logs) {
    res.write('data: ' + JSON.stringify(log) + '\n\n');
  }

  if (job.status === 'done' || job.status === 'error') {
    res.write('data: ' + JSON.stringify({ step: '_close' }) + '\n\n');
    res.end();
    return;
  }

  job.sseClients.push(res);
  req.on('close', () => {
    job.sseClients = job.sseClients.filter(c => c !== res);
  });
});

// ── POST /render — JSON body 렌더 ────────────────────────────────
app.post('/render', async (req, res) => {
  const props = req.body;
  // 새 effect-tuning 기반 composition(VrewCodingClean 등)은 subtitle_segments 없이도 가능
  const newStyleComposition = props?.compositionId && props.compositionId !== 'TechShorts';
  if (!newStyleComposition && !props?.subtitle_segments)
    return res.status(400).json({ error: 'subtitle_segments 필드 필요' });
  // effectTuning / sceneOverrides 등 새 키는 props에 그대로 두면 inputProps로 통과됨
  try {
    const r = await doRender(props, req.headers.host || `localhost:${PORT}`);
    // outFile: pipeline_shorts.renderVideo 가 shorts_log/qN/ 에 mp4 복사 시 사용 (로컬 동일 머신 전제)
    res.json({ status: 'done', url: r.url, path: r.outFile, outFile: r.outFile, sizeKB: r.sizeKB });
  } catch (e) {
    res.status(500).json({ status: 'failed', error: e.message });
  }
});

// ── GET /files ────────────────────────────────────────────────────
app.get('/files', (_req, res) => {
  let output = [];
  try {
    output = fs.readdirSync(OUTPUT_DIR)
      .filter(f => f.endsWith('.mp4')).sort().reverse().slice(0, 20)
      .map(f => ({ name: f, sizeKB: Math.round(fs.statSync(path.join(OUTPUT_DIR, f)).size / 1024) }));
  } catch {}
  let shortsLog = [];
  try { shortsLog = fs.readdirSync(SHORTS_LOG).sort().reverse().slice(0, 30); } catch {}
  res.json({ output, shortsLog });
});

// ── GET /file/:name ───────────────────────────────────────────────
app.get('/file/:filename', (req, res) => {
  const file = path.join(OUTPUT_DIR, path.basename(req.params.filename));
  if (!fs.existsSync(file)) return res.status(404).send('not found');
  res.sendFile(file);
});

// ── Remotion Player 클라이언트 번들 ───────────────────────────────
app.get('/editor-player.js', (_req, res) => {
  if (!fs.existsSync(EDITOR_PLAYER_OUT)) return res.status(503).send('// editor-player bundle not ready');
  res.set('Content-Type', 'application/javascript; charset=utf-8');
  res.set('Cache-Control', 'no-cache'); // 개발 중 즉시 반영
  res.sendFile(EDITOR_PLAYER_OUT);
});

// ── 정적 자원 (Pretendard 폰트 등) ──
app.use('/static', express.static(path.join(__dirname, 'public')));
// Remotion staticFile()이 만드는 절대 경로 호환 — /fonts/* 등도 public에서 서빙
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

// ── GET /api/scripts/ranked — 대시보드 정렬 ───────────────────────
// ?limit=30&offset=0&filter=all|saved|deprecated|unmeasured
const RANKED_FILTER_WHERE = {
  all:         '1=1',
  saved:       "rank_tier = 'saved'",
  deprecated:  "rank_tier = 'deprecated'",
  unmeasured:  'video_id IS NULL',
};

app.get('/api/scripts/ranked', async (req, res) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit, 10)  || 30, 100);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0,  0);
    const filter = String(req.query.filter || 'all');
    const where  = RANKED_FILTER_WHERE[filter];
    if (!where) return res.status(400).json({ error: `invalid filter: ${filter}` });

    const itemsSql = `
      SELECT id, title, content, video_id, saved, deprecated,
             retention_rate, ctr_score, last_metric_sync, created_at,
             score, rank_tier
      FROM ai_shorts.rag_scripts_ranked
      WHERE ${where}
      LIMIT $1 OFFSET $2`;
    const countSql = `
      SELECT COUNT(*)::int AS total
      FROM ai_shorts.rag_scripts_ranked
      WHERE ${where}`;

    const [itemsRes, countRes] = await Promise.all([
      pg().query(itemsSql, [limit, offset]),
      pg().query(countSql),
    ]);

    res.json({
      items:  itemsRes.rows,
      total:  countRes.rows[0].total,
      limit,
      offset,
      filter,
    });
  } catch (e) {
    console.error('[ranked]', e);
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/scripts/:id/reorder-proposal ─────────────────────────
// reorder_engine.propose() 호출 후 rag_scripts.reorder_proposal 컬럼에 캐싱
app.get('/api/scripts/:id/reorder-proposal', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'invalid id' });

    const r = await pg().query(
      `SELECT video_id FROM ai_shorts.rag_scripts WHERE id = $1`,
      [id]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'script not found' });
    const videoId = r.rows[0].video_id;
    if (!videoId) return res.status(400).json({ error: 'video_id NULL — 매핑 후 시도하세요' });

    const proposal = await proposeReorder(videoId);

    await pg().query(
      `UPDATE ai_shorts.rag_scripts SET reorder_proposal = $1::jsonb WHERE id = $2`,
      [JSON.stringify(proposal), id]
    );

    res.json(proposal);
  } catch (e) {
    console.error('[reorder-proposal]', e);
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/scripts/:id/reorder-apply ───────────────────────────
// body: { confirm: true, proposed_order?: string[] }
// proposed_order 미지정 시 reorder_proposal 컬럼에서 읽음.
// pipeline 잡으로 등록 → SSE로 진행상황 (/pipeline/:id/events) 노출
app.post('/api/scripts/:id/reorder-apply', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'invalid id' });
    if (req.body.confirm !== true) return res.status(400).json({ error: 'confirm:true required' });

    let proposedOrder = req.body.proposed_order;
    if (!Array.isArray(proposedOrder)) {
      const r = await pg().query(
        `SELECT reorder_proposal FROM ai_shorts.rag_scripts WHERE id = $1`,
        [id]
      );
      const cached = r.rows[0] && r.rows[0].reorder_proposal;
      if (!cached || !Array.isArray(cached.proposed_order)) {
        return res.status(400).json({ error: 'no cached proposal — call /reorder-proposal first' });
      }
      proposedOrder = cached.proposed_order;
    }

    // pipeline jobStore에 등록 (SSE 재사용)
    const jobId = createJob(`reorder script ${id}`);
    res.json({ jobId, scriptId: id, proposedOrder });

    // 비동기 실행
    (async () => {
      const job = pipelineJobs.get(jobId);
      try {
        const doRender = async (inputProps) => {
          await bundlePromise;
          const out = path.join(OUTPUT_DIR, `${jobId}.mp4`);
          const composition = await selectComposition({
            serveUrl: bundleLocation, id: 'TechShorts', inputProps,
          });
          await renderMedia({
            composition, serveUrl: bundleLocation, codec: 'h264',
            outputLocation: out, inputProps,
          });
          const sizeKB = Math.round(fs.statSync(out).size / 1024);
          return { outFile: out, url: `/file/${path.basename(out)}`, sizeKB };
        };

        const result = await reorderAndRerender(id, proposedOrder, {
          onProgress: (step, message, data) => jobEvent(jobId, { step, message, data }),
          renderFn: doRender,
        });
        job.status = 'done';
        job.result = result;
        jobEvent(jobId, { step: 'final', message: 'reorder 완료', data: result });
      } catch (e) {
        job.status = 'error';
        job.error = e.message;
        jobEvent(jobId, { step: 'error', message: e.message, data: {} });
      }
    })();
  } catch (e) {
    console.error('[reorder-apply]', e);
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/scripts/:id/map-video ───────────────────────────────
// body: { video_id: 'xxxxxxxxxxx' }
// rag_scripts.video_id UPDATE + youtube_videos UPSERT (필요시)
app.post('/api/scripts/:id/map-video', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const videoId = String(req.body.video_id || '').trim();
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'invalid id' });
    if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) return res.status(400).json({ error: 'video_id must be 11 chars' });

    const channelId = process.env.YOUTUBE_CHANNEL_ID || 'UNKNOWN';
    await pg().query(
      `INSERT INTO ai_shorts.youtube_videos (video_id, channel_id, script_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (video_id) DO UPDATE SET script_id = EXCLUDED.script_id`,
      [videoId, channelId, id]
    );
    await pg().query(
      `UPDATE ai_shorts.rag_scripts SET video_id = $1 WHERE id = $2`,
      [videoId, id]
    );
    res.json({ ok: true, scriptId: id, videoId });
  } catch (e) {
    console.error('[map-video]', e);
    res.status(500).json({ error: e.message });
  }
});

// ── GET /scripts — 정렬 + 재배치 승인 대시보드 (독립 페이지) ────────
app.get('/scripts', (_req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(SCRIPTS_DASHBOARD_HTML);
});

// ────────────────────────────────────────────────────────────────────
// ── B-5 배치 대시보드 ──────────────────────────────────────────────
// ────────────────────────────────────────────────────────────────────
const batchWorker = require('../rag/batch_worker');
let batchRunning = null; // Promise — 중복 실행 방지

// 30일 초과 캐시/output 정리 — 매 6시간
const BATCH_CACHE_DIRS = [
  path.join(__dirname, '..', 'cache', 'tts'),
  path.join(__dirname, '..', 'cache', 'whisper'),
  path.join(__dirname, 'output'),
  path.join(__dirname, '..', 'shorts_log'),
];
cron.schedule('0 */6 * * *', () => {
  const cutoff = Date.now() - 30 * 24 * 3600 * 1000;
  let removed = 0, scanned = 0;
  for (const dir of BATCH_CACHE_DIRS) {
    if (!fs.existsSync(dir)) continue;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const ent of entries) {
        const full = path.join(dir, ent.name);
        try {
          const st = fs.statSync(full);
          scanned++;
          if (st.mtimeMs < cutoff) {
            if (ent.isDirectory()) fs.rmSync(full, { recursive: true, force: true });
            else fs.unlinkSync(full);
            removed++;
          }
        } catch (_) {}
      }
    } catch (_) {}
  }
  if (removed > 0) console.log(`[disk-cleanup] removed ${removed}/${scanned} files (>30d)`);
});

// GET /api/batch/queue — 큐 현황 (active + 최근 finished)
app.get('/api/batch/queue', async (_req, res) => {
  try {
    const r = await pg().query(
      `SELECT id, topic, priority, status, kind, retry_count,
              error, created_at, started_at, finished_at, script_id
       FROM ai_shorts.topic_queue
       ORDER BY
         CASE status
           WHEN 'running' THEN 0
           WHEN 'pending' THEN 1
           WHEN 'failed'  THEN 2
           WHEN 'done'    THEN 3
           ELSE 4
         END,
         priority DESC, created_at DESC
       LIMIT 200`
    );
    const active = Array.from(batchWorker.STATE.active.values());
    res.json({
      worker_running: !!batchRunning,
      stop_reason: batchWorker.STATE.stopReason,
      active,
      finished_recent: batchWorker.STATE.finished.slice(0, 20),
      rows: r.rows,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/batch/stats — 일일 처리량 / 비용
app.get('/api/batch/stats', async (_req, res) => {
  try {
    const r = await pg().query(
      `SELECT day, done_count, failed_count, running_count, pending_count, est_cost_usd
       FROM ai_shorts.topic_queue_daily_stats
       LIMIT 30`
    );
    res.json({ days: r.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/batch/events — SSE
app.get('/api/batch/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type':  'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection':    'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  // 초기 snapshot
  res.write('data: ' + JSON.stringify({
    type: 'snapshot',
    active: Array.from(batchWorker.STATE.active.values()),
    finished: batchWorker.STATE.finished.slice(0, 10),
    worker_running: !!batchRunning,
  }) + '\n\n');
  batchWorker.STATE.listeners.add(res);
  req.on('close', () => batchWorker.STATE.listeners.delete(res));
});

// POST /api/batch/seed — 페르소나 도메인 키워드 50개 시드
app.post('/api/batch/seed', async (req, res) => {
  try {
    const count = Math.min(parseInt(req.body?.count, 10) || 50, 200);
    const r = await pg().query(`SELECT ai_shorts.seed_topic_queue($1) AS inserted`, [count]);
    res.json({ ok: true, inserted: r.rows[0].inserted, requested: count });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/batch/enqueue — 단일 토픽 enqueue
app.post('/api/batch/enqueue', async (req, res) => {
  try {
    const topic    = String(req.body?.topic || '').trim();
    const priority = parseInt(req.body?.priority, 10) || 0;
    if (!topic) return res.status(400).json({ error: 'topic 필요' });
    const r = await pg().query(
      `INSERT INTO ai_shorts.topic_queue (topic, priority, kind) VALUES ($1, $2, 'topic')
       RETURNING id, topic, priority, status`,
      [topic, priority]
    );
    res.json({ ok: true, row: r.rows[0] });
  } catch (e) {
    if (/topic_queue_dedup/.test(e.message)) {
      return res.status(409).json({ error: 'duplicate_within_7d', detail: e.message });
    }
    res.status(500).json({ error: e.message });
  }
});

// POST /api/batch/start — 워커 데몬 시작 (in-process)
app.post('/api/batch/start', async (req, res) => {
  if (batchRunning) return res.status(409).json({ error: 'worker already running' });
  batchWorker.STATE.stopReason = null;
  const drain = req.body?.drain !== false;
  batchRunning = batchWorker.run({ drain, once: req.body?.once === true })
    .then(s => { console.log('[batch] worker exit:', s.text); })
    .catch(e => { console.error('[batch] worker FATAL', e); })
    .finally(() => { batchRunning = null; });
  res.json({ ok: true, started: true, drain });
});

// POST /api/batch/stop — 진행 중인 워커 정지 (현재 잡 완료 후 종료)
app.post('/api/batch/stop', (_req, res) => {
  batchWorker.STATE.stopReason = 'user_stopped';
  res.json({ ok: true, stop_signaled: true });
});

// GET /batch — 대시보드 HTML
const BATCH_DASHBOARD_HTML = [
'<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">',
'<title>Batch · 영상 처리량</title>',
'<style>',
'body{font-family:Inter,Pretendard,system-ui,sans-serif;background:#0f0f14;color:#f0f0f5;margin:0;padding:32px;max-width:1280px;margin:0 auto}',
'h1{font-size:22px;margin:0 0 4px}.sub{color:rgba(240,240,245,.55);font-size:13px;margin-bottom:20px}',
'.row{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px}',
'.card{background:#16161f;border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:16px}',
'.card .label{font-size:11px;color:rgba(240,240,245,.5);text-transform:uppercase;letter-spacing:.06em}',
'.card .val{font-size:28px;font-weight:700;margin-top:6px;color:#7c6af7}',
'.card .val.ok{color:#4ade80}.card .val.bad{color:#f87171}.card .val.warn{color:#fbbf24}',
'.btns{display:flex;gap:8px;margin-bottom:18px;flex-wrap:wrap}',
'.btn{padding:8px 14px;background:#7c6af7;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600}',
'.btn:disabled{background:#333;cursor:not-allowed}',
'.btn-sec{background:#1e1e2a;color:#f0f0f5;border:1px solid rgba(255,255,255,.12)}',
'.btn-bad{background:#7f1d1d;color:#fca5a5}',
'.cols{display:grid;grid-template-columns:1fr 1fr;gap:16px}',
'.box{background:#16161f;border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:16px}',
'.box h3{font-size:14px;margin:0 0 12px}',
'table{width:100%;border-collapse:collapse;font-size:12px}',
'th,td{padding:6px 8px;text-align:left;border-bottom:1px solid rgba(255,255,255,.05)}',
'th{color:rgba(240,240,245,.5);font-weight:600;text-transform:uppercase;font-size:10px;letter-spacing:.06em}',
'.s-pending{color:rgba(240,240,245,.6)}.s-running{color:#fbbf24}.s-done{color:#4ade80}.s-failed{color:#f87171}',
'.kind-reorder{color:#c4b5fd}',
'.chart{height:160px;display:flex;align-items:flex-end;gap:6px;padding:8px 0}',
'.bar{flex:1;background:linear-gradient(180deg,#7c6af7 0%,#4338ca 100%);border-radius:3px 3px 0 0;min-height:2px;position:relative}',
'.bar.fail{background:linear-gradient(180deg,#f87171 0%,#7f1d1d 100%)}',
'.bar-lbl{position:absolute;bottom:-18px;left:0;right:0;text-align:center;font-size:9px;color:rgba(240,240,245,.4)}',
'.toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#1e1e2a;color:#f0f0f5;padding:12px 20px;border-radius:8px;font-size:13px;font-weight:600;z-index:999;display:none;box-shadow:0 8px 24px rgba(0,0,0,.6);border:1px solid rgba(255,255,255,.12)}',
'.live{display:inline-block;width:8px;height:8px;border-radius:50%;background:#4ade80;animation:pulse 1.4s infinite;margin-right:6px;vertical-align:middle}',
'@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}',
'</style></head><body>',
'<h1>Batch · 영상 처리량</h1>',
'<div class="sub">topic_queue 기반 다중 영상 동시 생성. <span id="live-dot"></span><span id="live-text">SSE 연결 중…</span></div>',

'<div class="row">',
'<div class="card"><div class="label">오늘 처리</div><div class="val ok" id="m-done">—</div></div>',
'<div class="card"><div class="label">오늘 실패</div><div class="val bad" id="m-failed">—</div></div>',
'<div class="card"><div class="label">대기중</div><div class="val warn" id="m-pending">—</div></div>',
'<div class="card"><div class="label">오늘 비용 추산 (USD)</div><div class="val" id="m-cost">—</div></div>',
'</div>',

'<div class="btns">',
'<button class="btn" id="b-start" onclick="startWorker()">워커 시작</button>',
'<button class="btn btn-bad" id="b-stop" onclick="stopWorker()">정지 (현재 잡 완료 후)</button>',
'<button class="btn btn-sec" onclick="seedTopics(50)">주제 50개 즉시 큐잉</button>',
'<button class="btn btn-sec" onclick="seedTopics(10)">10개</button>',
'<button class="btn btn-sec" onclick="enqOne()">+ 토픽 직접 추가</button>',
'<button class="btn btn-sec" onclick="loadAll()">새로고침</button>',
'</div>',

'<div class="cols">',
'<div class="box"><h3>최근 30일 처리량</h3><div class="chart" id="chart"></div></div>',
'<div class="box"><h3>실행 중 (active)</h3><div id="active-list">없음</div></div>',
'</div>',

'<div class="box" style="margin-top:16px"><h3>큐 (최근 200건)</h3>',
'<table id="qtbl"><thead><tr><th>id</th><th>status</th><th>kind</th><th>topic</th><th>priority</th><th>retry</th><th>created</th><th>finished</th><th>error</th></tr></thead><tbody></tbody></table>',
'</div>',

'<div class="toast" id="toast"></div>',

'<script>',
'function esc(s){return String(s||"").replace(/[<>&]/g,c=>({"<":"&lt;",">":"&gt;","&":"&amp;"}[c]))}',
'function toast(msg,ok){const t=document.getElementById("toast");t.textContent=msg;t.style.borderColor=ok?"#4ade80":"#f87171";t.style.display="block";setTimeout(()=>t.style.display="none",2400)}',
'function fmtTime(s){if(!s)return"—";const d=new Date(s);return d.toISOString().slice(11,19)}',
'async function loadAll(){await Promise.all([loadStats(),loadQueue()])}',
'async function loadStats(){',
'  const r=await fetch("/api/batch/stats");const d=await r.json();',
'  const today=(d.days||[])[0]||{};',
'  document.getElementById("m-done").textContent=today.done_count||0;',
'  document.getElementById("m-failed").textContent=today.failed_count||0;',
'  document.getElementById("m-pending").textContent=today.pending_count||0;',
'  document.getElementById("m-cost").textContent="$"+(today.est_cost_usd||"0.000");',
'  // 차트 — 최근 14일',
'  const arr=(d.days||[]).slice(0,14).reverse();',
'  const max=Math.max(1,...arr.map(x=>(x.done_count||0)+(x.failed_count||0)));',
'  document.getElementById("chart").innerHTML=arr.map(x=>{',
'    const dh=Math.round(((x.done_count||0)/max)*150);',
'    const fh=Math.round(((x.failed_count||0)/max)*150);',
'    const day=String(x.day||"").slice(5);',
'    return \'<div style="flex:1;display:flex;flex-direction:column;justify-content:flex-end;position:relative;min-height:160px;padding-bottom:20px">\'+',
'      \'<div class="bar fail" style="height:\'+fh+\'px"></div>\'+',
'      \'<div class="bar" style="height:\'+dh+\'px" title="done=\'+(x.done_count||0)+\' failed=\'+(x.failed_count||0)+\'"></div>\'+',
'      \'<div class="bar-lbl">\'+day+\'</div></div>\';',
'  }).join("");',
'}',
'async function loadQueue(){',
'  const r=await fetch("/api/batch/queue");const d=await r.json();',
'  document.getElementById("b-start").disabled=d.worker_running;',
'  document.getElementById("b-stop").disabled=!d.worker_running;',
'  // active',
'  const al=(d.active||[]);',
'  document.getElementById("active-list").innerHTML=al.length===0?\'<div style="color:rgba(240,240,245,.4)">없음 — 시작 버튼을 누르세요</div>\':',
'    al.map(a=>\'<div style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,.05)"><div style="font-size:12px;font-weight:600">#\'+a.queueId+\' · \'+esc(a.topic)+\'</div><div style="font-size:11px;color:#fbbf24;margin-top:2px">\'+esc(a.step)+\' — \'+esc(a.message)+\'</div></div>\').join("");',
'  // queue table',
'  const tbody=document.querySelector("#qtbl tbody");',
'  tbody.innerHTML=(d.rows||[]).map(r=>{',
'    return \'<tr><td>\'+r.id+\'</td><td class="s-\'+r.status+\'">\'+r.status+\'</td>\'+',
'      \'<td class="\'+(r.kind==="reorder"?"kind-reorder":"")+\'">\'+r.kind+\'</td>\'+',
'      \'<td>\'+esc(r.topic).slice(0,80)+\'</td><td>\'+r.priority+\'</td>\'+',
'      \'<td>\'+r.retry_count+\'</td><td>\'+fmtTime(r.created_at)+\'</td><td>\'+fmtTime(r.finished_at)+\'</td>\'+',
'      \'<td style="color:#f87171;font-size:10px;max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="\'+esc(r.error||"")+\'">\'+esc(r.error||"")+\'</td></tr>\';',
'  }).join("");',
'}',
'async function seedTopics(n){',
'  const r=await fetch("/api/batch/seed",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({count:n})});',
'  const d=await r.json();',
'  if(d.ok){toast("시드 완료: "+d.inserted+"/"+d.requested+" inserted",true);loadAll()}else toast("실패: "+(d.error||"?"),false);',
'}',
'async function enqOne(){',
'  const t=prompt("토픽?");if(!t)return;',
'  const r=await fetch("/api/batch/enqueue",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({topic:t})});',
'  const d=await r.json();',
'  if(d.ok){toast("추가됨 #"+d.row.id,true);loadAll()}else toast("실패: "+(d.error||"?"),false);',
'}',
'async function startWorker(){',
'  const r=await fetch("/api/batch/start",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"});',
'  const d=await r.json();',
'  if(d.ok){toast("워커 시작",true);loadAll()}else toast("실패: "+(d.error||"?"),false);',
'}',
'async function stopWorker(){',
'  if(!confirm("현재 잡 완료 후 정지합니다."))return;',
'  const r=await fetch("/api/batch/stop",{method:"POST"});',
'  const d=await r.json();if(d.ok){toast("정지 신호 전송",true)}',
'}',
'// SSE',
'function connect(){',
'  const es=new EventSource("/api/batch/events");',
'  es.onopen=()=>{document.getElementById("live-dot").innerHTML=\'<span class="live"></span>\';document.getElementById("live-text").textContent="실시간 연결됨";};',
'  es.onmessage=(ev)=>{try{const e=JSON.parse(ev.data);',
'    if(e.type==="claim"||e.type==="done"||e.type==="failed"||e.type==="snapshot"||e.type==="progress"){loadQueue()}',
'    if(e.type==="done"||e.type==="failed"){loadStats()}',
'  }catch(_){}};',
'  es.onerror=()=>{document.getElementById("live-text").textContent="재연결 중…";setTimeout(connect,3000);es.close()};',
'}',
'connect();loadAll();setInterval(loadAll,15000);',
'</script></body></html>'
].join('\n');

app.get('/batch', (_req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(BATCH_DASHBOARD_HTML);
});

// ── GET /health ───────────────────────────────────────────────────
app.get('/health', (_req, res) =>
  res.json({ ok: true, bundle: !!bundleLocation, port: PORT }));

// ── 오늘 영상/음성 서빙 ─────────────────────────────────────────
// HEAD/GET 모두 명시 처리. <video> 태그의 동시 Range 요청을 createReadStream으로
// 직접 처리해 sendFile 동시성으로 인한 503 회피.
function serveTodayFile(p, contentType, req, res) {
  if (!fs.existsSync(p)) return res.status(404).json({ error: '파일 없음', path: path.basename(p) });
  let stat;
  try { stat = fs.statSync(p); } catch (e) { return res.status(500).json({ error: e.message }); }
  res.setHeader('Content-Type', contentType);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'no-cache');
  if (req.method === 'HEAD') {
    res.setHeader('Content-Length', stat.size);
    return res.status(200).end();
  }
  const range = req.headers.range;
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(String(range));
    if (!m) { res.setHeader('Content-Length', stat.size); return fs.createReadStream(p).pipe(res); }
    const start = m[1] === '' ? 0 : parseInt(m[1], 10);
    const end   = m[2] === '' ? stat.size - 1 : Math.min(parseInt(m[2], 10), stat.size - 1);
    if (isNaN(start) || isNaN(end) || start > end) {
      res.setHeader('Content-Range', `bytes */${stat.size}`);
      return res.status(416).end();
    }
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
    res.setHeader('Content-Length', end - start + 1);
    const stream = fs.createReadStream(p, { start, end });
    stream.on('error', () => { try { res.destroy(); } catch (_) {} });
    return stream.pipe(res);
  }
  res.setHeader('Content-Length', stat.size);
  const stream = fs.createReadStream(p);
  stream.on('error', () => { try { res.destroy(); } catch (_) {} });
  stream.pipe(res);
}

function todayPath(suffix) {
  const today = new Date().toISOString().slice(0, 10);
  return path.join(SHORTS_LOG, `${today}_${suffix}`);
}

app.get ('/audio/today', (req, res) => serveTodayFile(todayPath('voice.mp3'), 'audio/mpeg', req, res));
app.head('/audio/today', (req, res) => serveTodayFile(todayPath('voice.mp3'), 'audio/mpeg', req, res));
app.get ('/video/today', (req, res) => serveTodayFile(todayPath('video.mp4'), 'video/mp4', req, res));
app.head('/video/today', (req, res) => serveTodayFile(todayPath('video.mp4'), 'video/mp4', req, res));

// ── POST /save-edit — 세그먼트 수정 저장 ─────────────────────────
app.post('/save-edit', (req, res) => {
  const { subtitle_segments, tts_script } = req.body || {};
  if (!subtitle_segments) return res.status(400).json({ error: 'subtitle_segments 없음' });
  const today = new Date().toISOString().slice(0, 10);
  const scriptPath = path.join(SHORTS_LOG, `${today}_script_result.json`);
  if (!fs.existsSync(scriptPath)) return res.status(404).json({ error: 'script_result.json 없음' });
  const script = JSON.parse(fs.readFileSync(scriptPath, 'utf8'));
  script.subtitle_segments = subtitle_segments;
  if (tts_script) script.tts_script = tts_script;
  fs.writeFileSync(scriptPath, JSON.stringify(script, null, 2), 'utf8');
  res.json({ ok: true, saved: scriptPath, count: subtitle_segments.length });
});

// ── GET /waveform — 오디오 웨이브폼 데이터 ───────────────────────
app.get('/waveform', async (_req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const p = require('path').join(SHORTS_LOG, `${today}_voice.mp3`);
  if (!fs.existsSync(p)) return res.status(404).json({ error: '없음' });
  const buf = fs.readFileSync(p);
  res.json({ base64: buf.toString('base64'), size: buf.length });
});

// ── GET /editor — 고품질 영상 편집기 ────────────────────────────
app.get('/editor', (_req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Remotion Editor</title>
<style>
:root{
  --bg0:#080808;--bg1:#101010;--bg2:#161616;--bg3:#1e1e1e;
  --border:#252525;--border2:#2e2e2e;
  --text1:#f0f0f0;--text2:#a0a0a0;--text3:#555;
  --accent:#3b82f6;--accent2:#6366f1;
  --green:#22c55e;--red:#ef4444;--yellow:#f59e0b;--purple:#8b5cf6;
}
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;overflow:hidden}
body{font-family:'Pretendard','Noto Sans KR',system-ui,sans-serif;background:var(--bg0);color:var(--text1);display:flex;flex-direction:column}
/* ── 공통 ── */
.topbar{background:var(--bg1);border-bottom:1px solid var(--border);padding:0 14px;height:52px;display:flex;align-items:center;gap:8px;flex-shrink:0;z-index:20;overflow:hidden}
.logo{font-size:14px;font-weight:700;color:var(--text1);letter-spacing:-.02em;display:flex;align-items:center;gap:6px;padding:6px 10px;border-radius:6px;text-decoration:none}
.logo svg{opacity:.7;transition:opacity .15s}
.logo-link{cursor:pointer;transition:background .15s,color .15s}
.logo-link:hover{background:rgba(99,102,241,0.12);color:#a5b4fc}
.logo-link:hover svg{opacity:1}
.logo-link:active{background:rgba(99,102,241,0.22)}
.badge{font-size:9px;font-weight:800;background:#6d28d9;color:#e9d5ff;padding:4px 9px;border-radius:99px;letter-spacing:.06em;text-transform:uppercase;text-decoration:none;display:inline-flex;align-items:center}
.badge-link{cursor:pointer;transition:background .15s,box-shadow .15s,transform .1s}
.badge-link:hover{background:#7c3aed;box-shadow:0 0 0 3px rgba(124,58,237,0.25)}
.badge-link:active{transform:scale(0.95)}
/* ── 툴바 옵션 드로어 ── */
.toolbar-opts summary::-webkit-details-marker{display:none}
.toolbar-opts[open] summary{background:var(--bg3);color:var(--text1)}
.toolbar-opts-panel{position:absolute;top:calc(100% + 6px);right:0;background:var(--bg1);border:1px solid var(--border);border-radius:10px;padding:12px;min-width:260px;display:flex;flex-direction:column;gap:8px;box-shadow:0 12px 32px rgba(0,0,0,0.5);z-index:30}
.opt-row{display:flex;align-items:center;gap:8px;font-size:11px;color:var(--text2)}
.opt-row > span:first-child{width:90px;flex-shrink:0}
.opt-row select,.opt-row input[type=range]{flex:1;background:var(--bg2);color:var(--text1);border:1px solid var(--border2);border-radius:5px;padding:4px 6px;font-size:11px;font-family:inherit}
.opt-num{display:inline-block;width:36px;font-family:monospace;font-size:11px;color:var(--text1);text-align:right}
.spacer{flex:1}
.sep{width:1px;height:24px;background:var(--border);margin:0 4px}
.btn{display:inline-flex;align-items:center;gap:5px;border:none;border-radius:6px;padding:7px 13px;font-size:12px;font-weight:600;cursor:pointer;transition:all .12s;text-decoration:none;white-space:nowrap;font-family:inherit}
.btn-primary{background:var(--accent);color:#fff}.btn-primary:hover{background:#2563eb;box-shadow:0 0 0 3px rgba(59,130,246,.25)}
.btn-primary:disabled{background:#1e3a5f;color:#3b6ea8;cursor:not-allowed;box-shadow:none}
.btn-ghost{background:transparent;color:var(--text2);border:1px solid var(--border2)}.btn-ghost:hover{background:var(--bg3);color:var(--text1)}
.btn-danger{background:#7f1d1d;color:#fca5a5;border:1px solid #991b1b}.btn-danger:hover{background:#991b1b}
.btn-green{background:#14532d;color:#4ade80;border:1px solid #166534}.btn-green:hover{background:#166534}
.btn-purple{background:#4c1d95;color:#c4b5fd;border:1px solid #5b21b6}.btn-purple:hover{background:#5b21b6}
.btn-sm{padding:5px 10px;font-size:11px;border-radius:5px}
.btn-icon{width:30px;height:30px;padding:0;border-radius:6px;font-size:14px}
/* ── layout: 2-column fixed ── */
.editor-body{display:flex;flex:1;min-height:0;overflow:hidden}
/* ── left: preview panel — 고정 폭, 내부 스크롤 ── */
.panel-left{width:400px;flex-shrink:0;border-right:1px solid var(--border);display:flex;flex-direction:column;background:var(--bg1);overflow-y:auto;overflow-x:hidden}
.media-wrap{padding:16px 16px 0;flex-shrink:0}
.media-wrap video,.media-wrap audio{width:100%;border-radius:10px;background:#000;border:1px solid var(--border2);aspect-ratio:9/16;object-fit:contain;max-height:300px}
.audio-viz{width:100%;height:80px;border-radius:10px;background:var(--bg0);border:1px solid var(--border2);margin-top:0;position:relative;overflow:hidden;cursor:pointer}
.time-bar{padding:10px 16px 0;display:flex;align-items:center;gap:10px}
.time-cur{font-size:18px;font-family:'SF Mono','Fira Code',monospace;color:var(--green);font-weight:700;letter-spacing:.04em;min-width:70px}
.time-dur{font-size:11px;color:var(--text3);font-family:monospace}
.transport{display:flex;align-items:center;gap:6px;padding:10px 16px}
.play-btn{width:38px;height:38px;border-radius:50%;background:var(--accent);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:14px;color:#fff;transition:.12s}
.play-btn:hover{background:#2563eb;transform:scale(1.05)}
/* ── script section ── */
.script-box{flex:1;overflow-y:auto;padding:12px 16px;border-top:1px solid var(--border)}
.section-label{font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:var(--text3);margin-bottom:8px}
.script-words{display:flex;flex-wrap:wrap;gap:3px 2px;line-height:1.8}
.sw{font-size:13px;color:var(--text2);padding:1px 3px;border-radius:3px;cursor:pointer;transition:.08s}
.sw:hover{background:var(--bg3);color:var(--text1)}
.sw.playing{background:rgba(59,130,246,.2);color:#93c5fd}
.sw.hi{color:#fbbf24;font-weight:600}
/* ── center: timeline + captions ── */
.panel-center{flex:1;min-width:0;display:flex;flex-direction:column;overflow:hidden;background:var(--bg0)}
/* timeline */
.tl-header{height:28px;border-bottom:1px solid var(--border);display:flex;align-items:center;padding:0 12px;gap:8px;flex-shrink:0;background:var(--bg1)}
.tl-label{font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.08em}
.tl-wrap{height:100px;position:relative;background:var(--bg0);border-bottom:1px solid var(--border);cursor:crosshair;flex-shrink:0;overflow-x:auto;overflow-y:hidden}
#tl-canvas{display:block;width:100%;height:100%;min-width:100%}
.playhead{position:absolute;top:0;bottom:0;width:1.5px;background:var(--accent);pointer-events:none;z-index:10}
.playhead::before{content:'';position:absolute;top:0;left:-4px;width:9px;height:9px;background:var(--accent);border-radius:50%}
/* caption cards — 내부 스크롤, 카드 폭 컨테이너 기준 */
.cap-scroll{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;padding:8px 12px;display:flex;flex-direction:column;gap:4px}
.cap-card{max-width:100%}
.cap-card-inner{display:flex;align-items:stretch;gap:8px;min-width:0}
.cap-body{flex:1;min-width:0;padding:10px 12px}
.cap-text,.cap-tts{word-break:break-word;overflow-wrap:anywhere}
.cap-card{border-radius:8px;border:1px solid var(--border);background:var(--bg2);cursor:pointer;transition:all .1s;position:relative;overflow:hidden}
.efx-panel{margin-top:8px;padding:8px 10px;border:1px dashed var(--border2);border-radius:6px;background:rgba(124,106,247,0.06)}
.efx-row{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:6px}
.efx-slider{display:flex;align-items:center;gap:6px;font-size:10px;color:var(--text2);flex:1;min-width:120px}
.efx-key{display:inline-block;width:36px;color:var(--text3);text-transform:uppercase;font-weight:700}
.efx-slider input[type=range]{flex:1;min-width:60px}
.efx-val{display:inline-block;width:42px;font-family:monospace;color:var(--text1);text-align:right}
.efx-preset-sel{background:var(--bg2);color:var(--text1);border:1px solid var(--border2);border-radius:5px;padding:3px 6px;font-size:10px}
/* ── Remotion Player (실시간 미리보기) ── */
.rmt-wrap{padding:12px 16px 0;flex-shrink:0;user-select:none}
.rmt-label{display:flex;justify-content:space-between;font-size:10px;color:var(--text2);font-weight:700;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px}
.rmt-player{width:100%;aspect-ratio:9/16;margin:0 auto;border:1px solid var(--border2);border-radius:8px;overflow:hidden;background:#000}
/* ── interactive stage (1080x1920 mini preview) ── */
.stage-wrap{padding:8px 16px 0;flex-shrink:0;user-select:none}
.stage-label{display:flex;justify-content:space-between;font-size:10px;color:var(--text2);font-weight:700;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px}
.stage{position:relative;width:100%;aspect-ratio:9/16;margin:0 auto;background:linear-gradient(135deg,#0f172a 0%,#1e1b4b 70%,#0f172a 100%);border:1px solid var(--border2);border-radius:8px;overflow:hidden;box-shadow:inset 0 0 24px rgba(0,0,0,0.6)}
.stage-grid{position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.04) 1px,transparent 1px);background-size:27px 48px;pointer-events:none}
.stage-card{position:absolute;background:rgba(15,23,42,0.92);border:2px solid #fbbf24;border-radius:6px;padding:6px 8px;color:#fff;font-family:monospace;cursor:move;box-shadow:0 4px 14px rgba(0,0,0,0.5),0 0 0 1px rgba(255,255,255,0.08) inset;display:flex;flex-direction:column;gap:3px;overflow:hidden}
.stage-card-header{font-size:9px;font-weight:900;letter-spacing:0.05em;color:#fbbf24;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.stage-card-body{font-size:8.5px;color:#cbd5e1;line-height:1.3;overflow:hidden;flex:1}
.resize-handle{position:absolute;bottom:-7px;right:-7px;width:14px;height:14px;background:#7c3aed;border:2px solid #fff;border-radius:50%;cursor:nwse-resize;box-shadow:0 2px 6px rgba(124,58,237,0.5)}
.stage-caption{position:absolute;bottom:14px;left:12px;right:12px;text-align:center;color:#fff;font-weight:900;font-size:11px;line-height:1.25;text-shadow:0 2px 6px rgba(0,0,0,0.85);pointer-events:none;background:rgba(0,0,0,0.35);border-radius:4px;padding:3px 6px}
.stage-hint{position:absolute;top:50%;left:0;right:0;text-align:center;transform:translateY(-50%);color:var(--text3);font-size:10px;font-family:monospace;pointer-events:none}
.stage-actions{display:flex;justify-content:center;gap:6px;margin-top:6px}
.cap-card:hover{border-color:var(--border2);background:var(--bg3)}
.cap-card.active{border-color:var(--accent);background:#0c1a2e;box-shadow:0 0 0 1px rgba(59,130,246,.3)}
.cap-card-inner{display:flex;gap:0;align-items:stretch}
.cap-color-bar{width:3px;flex-shrink:0;border-radius:3px 0 0 3px}
.cap-body{flex:1;padding:8px 10px;min-width:0}
.cap-meta{display:flex;align-items:center;gap:6px;margin-bottom:5px}
.sec-pill{font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;padding:2px 6px;border-radius:3px}
.efx-sel{font-size:10px;background:var(--bg0);border:1px solid var(--border);color:var(--text2);border-radius:4px;padding:1px 4px;cursor:pointer;font-family:inherit}
.cap-time{font-size:9px;font-family:monospace;color:var(--text3);margin-left:auto}
.cap-text{font-size:13px;color:var(--text1);line-height:1.5;word-break:keep-all}
.cap-tts{font-size:11px;color:#6ee7b7;margin-top:3px;line-height:1.4}
.cap-kws{display:flex;flex-wrap:wrap;gap:3px;margin-top:5px}
.kw-tag{font-size:10px;padding:1px 6px;border-radius:99px;background:rgba(59,130,246,.15);color:#93c5fd;border:1px solid rgba(59,130,246,.3);cursor:pointer}
.kw-tag:hover{background:rgba(239,68,68,.2);color:#fca5a5;border-color:rgba(239,68,68,.3)}
.cap-actions{display:flex;flex-direction:column;gap:3px;padding:6px 6px 6px 0;justify-content:center}
/* edit mode */
.cap-card.editing{border-color:#6366f1;background:#0d0f1f}
.edit-ta{width:100%;background:transparent;border:none;color:var(--text1);font-size:13px;resize:none;font-family:inherit;outline:none;line-height:1.5}
.edit-tts-ta{width:100%;background:transparent;border:none;color:#6ee7b7;font-size:11px;resize:none;font-family:inherit;outline:none;line-height:1.5;margin-top:2px}
.kw-add-row{display:flex;gap:4px;margin-top:6px}
.kw-add-input{flex:1;background:var(--bg0);border:1px solid var(--border2);border-radius:4px;color:var(--text1);padding:3px 7px;font-size:11px;font-family:inherit}
/* section colors */
.c-hook{background:#f87171}.c-setup,.c-intro{background:#60a5fa}
.c-reveal{background:#f472b6}.c-cause{background:#a78bfa}
.c-solution,.c-demo{background:#4ade80}.c-cta{background:#fbbf24}
.c-chapter1,.c-chapter2,.c-chapter3{background:#c084fc}
.p-hook{background:#3a1a1a;color:#f87171}.p-setup,.p-intro{background:#1a2a3a;color:#60a5fa}
.p-reveal{background:#3a1a2a;color:#f472b6}.p-cause{background:#2a1a3a;color:#a78bfa}
.p-solution,.p-demo{background:#1a2a1a;color:#4ade80}.p-cta{background:#3a2a1a;color:#fbbf24}
.p-chapter1,.p-chapter2,.p-chapter3{background:#2a1a3a;color:#c084fc}
/* spinner / toast */
.spin{display:inline-block;width:11px;height:11px;border:2px solid currentColor;border-top-color:transparent;border-radius:50%;animation:sp .5s linear infinite}
@keyframes sp{to{transform:rotate(360deg)}}
.toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:var(--bg3);color:var(--text1);padding:10px 18px;border-radius:8px;font-size:13px;font-weight:600;z-index:999;display:none;box-shadow:0 8px 24px rgba(0,0,0,.6);border:1px solid var(--border2)}
.toast.ok{border-color:var(--green);color:var(--green)}
.toast.err{border-color:var(--red);color:#fca5a5}
/* scrollbar */
::-webkit-scrollbar{width:5px;height:5px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:var(--border2);border-radius:99px}
</style>
</head>
<body>
<div class="topbar">
  <a class="logo logo-link" href="/editor" title="에디터 새로고침" aria-label="Remotion Editor 새로고침">
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1" y="1" width="14" height="14" rx="3" stroke="#6366f1" stroke-width="1.5"/><path d="M5 8l2.5 2.5L11 5.5" stroke="#6366f1" stroke-width="1.5" stroke-linecap="round"/></svg>
    <span>Remotion Editor</span>
  </a>
  <a class="badge badge-link" href="/" title="자동화 파이프라인 홈으로" aria-label="자동화 파이프라인 홈">Studio</a>
  <div id="title-display" style="font-size:11px;color:var(--text3);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"></div>
  <a class="btn btn-purple btn-sm" href="/#topic" title="새 AI 주제로 영상 만들기" style="flex-shrink:0;text-decoration:none">+ 새 AI 영상</a>
  <button class="btn btn-ghost btn-sm" onclick="addSegment()" style="flex-shrink:0">+ 세그</button>
  <button class="btn btn-ghost btn-sm" onclick="compressSilence()" style="flex-shrink:0" title="segment 사이 공백을 0.1초로 압축">⏱ 무음압축</button>
  <button class="btn btn-green btn-sm" id="btn-save" onclick="saveEdits()" style="flex-shrink:0">저장</button>
  <button class="btn btn-primary btn-sm" id="btn-render" onclick="doRender()" style="flex-shrink:0">&#127910; 재렌더</button>
  <details class="toolbar-opts" style="flex-shrink:0;position:relative">
    <summary class="btn btn-ghost btn-sm" style="list-style:none;cursor:pointer">⚙ 옵션</summary>
    <div class="toolbar-opts-panel">
      <label class="opt-row"><span>preset</span>
        <select id="effect-preset">
          <option value="vrew-coding-clean">vrew-coding-clean</option>
          <option value="vrew-minimal">vrew-minimal</option>
          <option value="vrew-bold-hook">vrew-bold-hook</option>
        </select>
      </label>
      <label class="opt-row"><span>배경</span>
        <select id="effect-bg">
          <option value="dark-gradient">dark-gradient</option>
          <option value="glassmorphism">glassmorphism</option>
          <option value="purple-tech">purple-tech</option>
          <option value="terminal">terminal</option>
          <option value="neon-grid">neon-grid</option>
          <option value="clean-white">clean-white</option>
        </select>
      </label>
      <label class="opt-row"><span>자막 fontSize</span>
        <input type="range" id="effect-fontSize" min="40" max="120" value="66"><span id="effect-fontSize-val" class="opt-num">66</span>
      </label>
      <label class="opt-row"><span>자막 위치</span>
        <select id="caption-pos">
          <option value="bottom">↓ bottom</option>
          <option value="center">○ center</option>
          <option value="top">↑ top</option>
        </select>
      </label>
      <label class="opt-row"><span>TTS voice</span>
        <select id="tts-voice">
          <option value="">default(ElevenLabs)</option>
          <option value="alloy">alloy</option><option value="echo">echo</option>
          <option value="fable">fable</option><option value="onyx">onyx</option>
          <option value="nova">nova</option><option value="shimmer">shimmer</option>
        </select>
      </label>
      <label class="opt-row"><span>TTS speed</span>
        <input type="range" id="tts-speed" min="0.6" max="1.6" step="0.05" value="1"><span id="tts-speed-val" class="opt-num">1.00</span>
      </label>
      <button class="btn btn-ghost btn-sm" id="btn-tts" onclick="regenTTS()" style="margin-top:6px">🎙 TTS만 재생성</button>
    </div>
  </details>
</div>

<div class="editor-body">
  <!-- ── 왼쪽: 미디어 + 대본 ── -->
  <div class="panel-left">
    <div class="media-wrap">
      <video id="vid" controls muted playsinline style="display:none"></video>
      <canvas class="audio-viz" id="waveform-canvas" onclick="seekWaveform(event)" style="display:none"></canvas>
      <div id="media-placeholder" style="width:100%;height:180px;border-radius:10px;background:var(--bg0);border:1px solid var(--border2);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;color:var(--text3);font-size:12px">
        <div style="font-size:28px">&#127910;</div>
        <div>미디어 로딩 중...</div>
      </div>
    </div>
    <div class="rmt-wrap">
      <div class="rmt-label">
        <span>Remotion Player <span style="color:var(--text3);font-weight:400">(실시간 미리보기)</span></span>
        <span id="rmt-status" style="font-family:monospace;color:#fbbf24">loading…</span>
      </div>
      <div id="rmt-player" class="rmt-player"></div>
    </div>
    <div class="time-bar">
      <div class="time-cur" id="time-disp">0:00</div>
      <div class="time-dur" id="time-dur">/ 0:00</div>
    </div>
    <div class="transport">
      <button class="btn btn-ghost btn-icon" onclick="seek(-5)" title="−5초">⏮</button>
      <button class="play-btn" id="play-btn" onclick="togglePlay()">▶</button>
      <button class="btn btn-ghost btn-icon" onclick="seek(5)" title="+5초">⏭</button>
      <button class="btn btn-ghost btn-sm" onclick="seek(-1)">−1s</button>
      <button class="btn btn-ghost btn-sm" onclick="seek(1)">+1s</button>
    </div>
    <div class="script-box">
      <div class="section-label">대본 전문</div>
      <div class="script-words" id="script-words"></div>
    </div>
  </div>

  <!-- ── 가운데: 타임라인 + 자막 카드 ── -->
  <div class="panel-center">
    <div class="tl-header">
      <span class="tl-label">타임라인</span>
      <span id="tl-seg-count" style="font-size:10px;color:var(--text3)"></span>
      <div style="flex:1"></div>
      <span style="font-size:10px;color:var(--text3)">클릭하여 이동 · 더블클릭으로 텍스트 편집</span>
    </div>
    <div class="tl-wrap" id="tl-wrap" onclick="seekTimeline(event)">
      <canvas id="tl-canvas"></canvas>
      <div class="playhead" id="playhead" style="left:0"></div>
    </div>
    <div class="cap-scroll" id="cap-scroll">
      <!-- 카드가 여기 렌더 -->
    </div>
  </div>
</div>

<div class="toast" id="toast"></div>

<script>
// ── 상태 ──
let segs = [], dur = 0, media = null, audioCtx = null, waveData = null, activeIdx = -1, editIdx = -1;

// ── 초기화 ──
(async () => {
  const d = await fetch('/today').then(r=>r.json());
  if (!d.script) { showToast('오늘 파일 없음 — gen_script 먼저 실행', 'err'); return; }

  document.getElementById('title-display').textContent = d.script.title || '';
  segs = JSON.parse(JSON.stringify(d.script.subtitle_segments || []));
  dur  = d.script.estimated_total_seconds || 45;

  renderScript();
  renderCards();
  updateTlCount();
  updateStage();

  // 미디어 세팅
  const vid = document.getElementById('vid');
  const ph  = document.getElementById('media-placeholder');

  function showMedia(el) {
    ph.style.display = 'none';
    el.style.display = 'block';
  }
  function showNoMedia(msg) {
    ph.innerHTML = '<div style="font-size:24px">&#127910;</div><div>' + msg + '</div>';
    ph.style.display = 'flex';
  }

  const vidOk = await fetch('/video/today', {method:'HEAD'}).then(r=>r.ok).catch(()=>false);
  if (vidOk) {
    vid.src = '/video/today?' + Date.now();
    showMedia(vid);
    media = vid;
    vid.addEventListener('timeupdate', onTime);
    vid.addEventListener('loadedmetadata', () => { dur = Math.max(dur, vid.duration); updateDur(); drawTimeline(); });
    vid.addEventListener('error', () => showNoMedia('영상 로드 실패 — 재렌더 필요'));
  } else {
    const audOk = await fetch('/audio/today', {method:'HEAD'}).then(r=>r.ok).catch(()=>false);
    if (audOk) {
      const canvas = document.getElementById('waveform-canvas');
      showMedia(canvas);
      await loadWaveform();
      const a = new Audio('/audio/today');
      a.addEventListener('timeupdate', onTime);
      a.addEventListener('loadedmetadata', () => { dur = Math.max(dur, a.duration); updateDur(); drawTimeline(); });
      media = a;
    } else {
      showNoMedia('파이프라인을 실행하면 여기에 영상이 표시됩니다');
    }
  }
  updateDur();
  drawTimeline();
})();

// ── 웨이브폼 로드 ──
async function loadWaveform() {
  try {
    const { base64 } = await fetch('/waveform').then(r=>r.json());
    const binary = atob(base64);
    const arr = new Uint8Array(binary.length);
    for (let i=0;i<binary.length;i++) arr[i]=binary.charCodeAt(i);

    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const decoded = await audioCtx.decodeAudioData(arr.buffer);
    const data = decoded.getChannelData(0);
    const N = 400;
    waveData = [];
    const step = Math.floor(data.length / N);
    for (let i=0;i<N;i++) {
      let max = 0;
      for (let j=0;j<step;j++) max = Math.max(max, Math.abs(data[i*step+j]||0));
      waveData.push(max);
    }
    dur = Math.max(dur, decoded.duration);
    updateDur();
    drawWaveform();
    drawTimeline();
  } catch(e) { console.warn('waveform failed:', e.message); }
}

function drawWaveform() {
  const canvas = document.getElementById('waveform-canvas');
  if (!waveData || !canvas) return;
  const W = canvas.offsetWidth, H = canvas.offsetHeight;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0,0,W,H);
  const barW = W / waveData.length;
  const t = media ? media.currentTime || 0 : 0;
  const pct = t / Math.max(dur,1);
  for (let i=0;i<waveData.length;i++) {
    const h = waveData[i] * (H-8) * 0.9;
    const x = i * barW;
    const played = i/waveData.length < pct;
    ctx.fillStyle = played ? '#3b82f6' : '#1e293b';
    ctx.fillRect(x+1, (H-h)/2, Math.max(barW-1.5, 1), h);
  }
}

function seekWaveform(e) {
  const canvas = document.getElementById('waveform-canvas');
  const pct = e.offsetX / canvas.offsetWidth;
  const t = pct * dur;
  if (media) media.currentTime = t;
  else { updatePlayhead(t); drawWaveform(); }
  updatePlayhead(t);
  drawWaveform();
  highlightActive(t);
}

// ── 대본 단어 렌더 ──
function renderScript() {
  const el = document.getElementById('script-words');
  const allKws = new Set(segs.flatMap(s=>s.highlight_keywords||[]));
  const text = segs.map(s=>s.tts_text||s.text).join(' ');
  const words = text.split(/\s+/).filter(Boolean);
  el.innerHTML = words.map(w => {
    const isHi = [...allKws].some(k => w.includes(k));
    return '<span class="sw' + (isHi?' hi':'') + '" onclick="seekToWord(this)">' + w + '</span>';
  }).join(' ');
}

function seekToWord(el) {
  // 단어 위치로 근사 탐색
  const words = document.querySelectorAll('.sw');
  const idx = [...words].indexOf(el);
  const totalWords = words.length;
  const t = (idx / totalWords) * dur;
  if (media) media.currentTime = t;
  updatePlayhead(t);
}

// ── 자막 카드 렌더 ──
const SEC_COL = {hook:'#f87171',setup:'#60a5fa',intro:'#60a5fa',reveal:'#f472b6',
  cause:'#a78bfa',solution:'#4ade80',demo:'#34d399',cta:'#fbbf24',
  chapter1:'#c084fc',chapter2:'#c084fc',chapter3:'#c084fc'};
// 6 고정 scene effect (none은 수동 선택용)
const EFFECTS = ['terminal-type','code-typing','log-stream','workflow-nodes','checklist-run','cursor-blink','none'];
const SECTION_TO_EFFECT = {
  hook:'terminal-type', setup:'code-typing', intro:'code-typing',
  reveal:'workflow-nodes', problem:'workflow-nodes',
  cause:'log-stream',
  solution:'checklist-run', demo:'checklist-run',
  cta:'cursor-blink', conclusion:'cursor-blink',
};
function defaultEffectFor(section) {
  return SECTION_TO_EFFECT[(section||'').toLowerCase()] || 'code-typing';
}

function renderCards() {
  const el = document.getElementById('cap-scroll');
  el.innerHTML = segs.map((s,i) => renderCard(s,i)).join('');
  refreshPresetSelects();
}

function renderCard(s, i) {
  const col  = SEC_COL[s.section] || '#888';
  // 새 6 effect 우선, 없으면 section→default. (legacy visual_effect는 무시)
  const efx  = (EFFECTS.includes(s.effect) ? s.effect : defaultEffectFor(s.section));
  const efxOpts = EFFECTS.map(e=>'<option value="'+e+'"'+(e===efx?' selected':'')+'>'+e+'</option>').join('');
  const kws  = (s.highlight_keywords||[]).map(k=>
    '<span class="kw-tag" onclick="removeKw('+i+',event,\\'' + k + '\\')">'+ k +'</span>').join('');
  const isEdit = i === editIdx;
  const isActive = i === activeIdx;
  // segment 단위 visual override (s.style)
  s.style = s.style || {};
  const st = s.style;
  const sNum = (v, dflt) => Number.isFinite(Number(v)) ? Number(v) : dflt;
  const cur = {
    scale:   sNum(st.scale,   1),
    opacity: sNum(st.opacity, 1),
    speed:   sNum(st.speed,   1),
    delay:   sNum(st.delay,   0),
    x:       sNum(st.x, 0),
    y:       sNum(st.y, 0),
  };

  return '<div class="cap-card'+(i===activeIdx?' active':'')+(isEdit?' editing':'') + '" id="card-'+i+'" onclick="activateCard('+i+')">' +
    '<div class="cap-card-inner">' +
    '<div class="cap-color-bar c-'+s.section+'" style="background:'+col+'"></div>' +
    '<div class="cap-body">' +
      '<div class="cap-meta">' +
        '<span class="sec-pill p-'+s.section+'">'+s.section+'</span>' +
        '<select class="efx-sel" onchange="setEffect('+i+',this.value)" onclick="event.stopPropagation()">'+efxOpts+'</select>' +
        '<span class="cap-time">'+fmtT(s.start)+'→'+fmtT(s.end)+'</span>' +
      '</div>' +
      (isEdit
        ? '<textarea class="edit-ta" id="ta-text-'+i+'" rows="2" onclick="event.stopPropagation()" onblur="saveField('+i+',\\'text\\')">'+(s.text||'')+'</textarea>' +
          '<textarea class="edit-tts-ta" id="ta-tts-'+i+'" rows="2" onclick="event.stopPropagation()" onblur="saveField('+i+',\\'tts\\')">'+(s.tts_text||s.text||'')+'</textarea>' +
          '<div class="kw-add-row"><input class="kw-add-input" id="kw-inp-'+i+'" placeholder="키워드 추가" onkeydown="addKwKey(event,'+i+')"><button class="btn btn-ghost btn-sm" onclick="addKwBtn('+i+')">+</button></div>'
        : '<div class="cap-text" ondblclick="startEdit('+i+')">'+(s.text||'<em style=\\"color:var(--text3)\\">빈 텍스트</em>')+'</div>' +
          '<div class="cap-tts">'+(s.tts_text||'')+'</div>'
      ) +
      (kws ? '<div class="cap-kws">'+kws+'</div>' : '') +
      (isActive ? renderEffectPanel(i, cur) : '') +
    '</div>' +
    '<div class="cap-actions">' +
      '<button class="btn btn-ghost btn-icon btn-sm" onclick="splitSeg('+i+',event)" title="분할">✂</button>' +
      '<button class="btn btn-danger btn-icon btn-sm" onclick="delSeg('+i+',event)" title="삭제">✕</button>' +
    '</div>' +
    '</div></div>';
}

// ── 효과 편집 미니 패널 (active 카드 안에 렌더) ──
function renderEffectPanel(i, cur) {
  const slider = (key, min, max, step, val) =>
    '<label class="efx-slider" onclick="event.stopPropagation()">' +
      '<span class="efx-key">'+key+'</span>' +
      '<input type="range" min="'+min+'" max="'+max+'" step="'+step+'" value="'+val+'" oninput="setStyle('+i+',\\'' + key + '\\',this.value);document.getElementById(\\'efx-val-'+i+'-'+key+'\\').textContent=this.value">' +
      '<span class="efx-val" id="efx-val-'+i+'-'+key+'">'+val+'</span>' +
    '</label>';
  return '<div class="efx-panel" onclick="event.stopPropagation()">' +
    '<div class="efx-row">' +
      slider('scale',   0.5, 2,   0.05, cur.scale) +
      slider('opacity', 0,   1,   0.05, cur.opacity) +
    '</div>' +
    '<div class="efx-row">' +
      slider('speed',   0.3, 3,   0.05, cur.speed) +
      slider('delay',   0,   2,   0.05, cur.delay) +
    '</div>' +
    '<div class="efx-row">' +
      slider('x',      -300, 300, 5,    cur.x) +
      slider('y',      -300, 300, 5,    cur.y) +
    '</div>' +
    '<div class="efx-row" style="gap:4px">' +
      '<button class="btn btn-ghost btn-sm" onclick="resetStyle('+i+')">리셋</button>' +
      '<button class="btn btn-ghost btn-sm" onclick="savePresetFromCard('+i+')">프리셋 저장</button>' +
      '<select class="efx-preset-sel" onchange="applyPresetToCard('+i+',this.value);this.value=\\'\\'">' +
        '<option value="">프리셋 불러오기…</option>' +
      '</select>' +
      '<button class="btn btn-ghost btn-sm" onclick="copyStyleToAll('+i+')" title="이 segment의 효과 값을 모든 segment에 적용">전체 적용</button>' +
    '</div>' +
  '</div>';
}

function updateTlCount() {
  document.getElementById('tl-seg-count').textContent = segs.length + '개 세그먼트';
}

// ── 편집 ──
function activateCard(i) {
  if (editIdx !== -1 && editIdx !== i) commitEdit(editIdx);
  activeIdx = i;
  if (media) { media.currentTime = segs[i]?.start || 0; }
  renderCards();
  updatePlayhead(segs[i]?.start || 0);
  updateStage();
}

// ── stage 제거: Player 단일 미리보기로 통합 ──
// 기존 호출(updateStage/startDrag/startResize/centerActive/resetActiveStyle)이 남아 있어도
// 깨지지 않게 no-op 스텁만 둔다.
function updateStage(){}
function startDrag(){}
function startResize(){}
function centerActive(){
  if (activeIdx < 0) return;
  segs[activeIdx].style = segs[activeIdx].style || {};
  segs[activeIdx].style.x = 0; segs[activeIdx].style.y = 0; segs[activeIdx].style.scale = 1;
  renderCards(); showToast('위치/크기 초기화', 'ok');
}
function resetActiveStyle(){
  if (activeIdx < 0) return;
  segs[activeIdx].style = {};
  renderCards(); showToast('style 전부 리셋', 'ok');
}
const STAGE_SECTION_COLORS = {
  hook:'#fb923c', setup:'#60a5fa', intro:'#60a5fa',
  reveal:'#a78bfa', problem:'#a78bfa',
  cause:'#f87171',
  solution:'#22c55e', demo:'#22c55e',
  cta:'#facc15', conclusion:'#facc15',
};
function updateStage() {
  const card    = document.getElementById('stage-card');
  const info    = document.getElementById('stage-info');
  const capEl   = document.getElementById('stage-caption');
  const hintEl  = document.getElementById('stage-hint');
  if (activeIdx < 0 || !segs[activeIdx]) {
    if (card) card.style.display = 'none';
    if (info) info.textContent = '— 선택 없음 —';
    if (capEl) capEl.textContent = '';
    if (hintEl) hintEl.style.display = 'block';
    return;
  }
  const s = segs[activeIdx];
  s.style = s.style || {};
  const sx = Number(s.style.x ?? 0);
  const sy = Number(s.style.y ?? 0);
  const sc = Number(s.style.scale ?? 1);
  const sec = (s.section || '?').toUpperCase();
  const eff = s.effect || (typeof defaultEffectFor === 'function' ? defaultEffectFor(s.section) : 'code-typing');
  const col = STAGE_SECTION_COLORS[(s.section||'').toLowerCase()] || '#fbbf24';

  // 효과 카드 기본 box (1080x1920 좌표계): 640x640 가운데
  const dims = _stageDims();
  const baseW = 640, baseH = 640;
  const w = baseW * sc * dims.scale;
  const h = baseH * sc * dims.scale;
  const cx = dims.w/2 + sx * dims.scale;
  const cy = dims.h/2 + sy * dims.scale;

  card.style.display = 'flex';
  card.style.left = (cx - w/2) + 'px';
  card.style.top  = (cy - h/2) + 'px';
  card.style.width  = Math.max(40, w)  + 'px';
  card.style.height = Math.max(40, h)  + 'px';
  card.style.borderColor = col;
  card.style.boxShadow = '0 4px 14px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.08) inset, 0 0 18px ' + col + '55';
  document.getElementById('stage-card-header').textContent = sec + ' · ' + eff;
  document.getElementById('stage-card-header').style.color = col;
  document.getElementById('stage-card-body').textContent = (s.text||'').slice(0, 100);
  capEl.textContent = s.text || '';
  hintEl.style.display = 'none';
  info.textContent = 'x=' + Math.round(sx) + '  y=' + Math.round(sy) + '  s=' + sc.toFixed(2);
}

// ── drag ──
let _dragState = null;
function startDrag(e) {
  if (e.target && e.target.classList && e.target.classList.contains('resize-handle')) return;
  e.preventDefault(); e.stopPropagation();
  if (activeIdx < 0) return;
  const s = segs[activeIdx]; s.style = s.style || {};
  _dragState = {
    sx: e.clientX, sy: e.clientY,
    x0: Number(s.style.x ?? 0),
    y0: Number(s.style.y ?? 0),
  };
  document.addEventListener('mousemove', _onDrag);
  document.addEventListener('mouseup', _endDrag);
}
function _onDrag(e) {
  if (!_dragState) return;
  const sc = _stageDims().scale || 0.25;
  const dx = (e.clientX - _dragState.sx) / sc;
  const dy = (e.clientY - _dragState.sy) / sc;
  // 1080x1920 안에서 합리적 범위로 클램프
  const nx = Math.max(-500, Math.min(500, Math.round(_dragState.x0 + dx)));
  const ny = Math.max(-800, Math.min(800, Math.round(_dragState.y0 + dy)));
  segs[activeIdx].style.x = nx;
  segs[activeIdx].style.y = ny;
  updateStage();
}
function _endDrag() {
  document.removeEventListener('mousemove', _onDrag);
  document.removeEventListener('mouseup', _endDrag);
  if (_dragState) {
    renderCards();   // 슬라이더 값 갱신
    showToast('위치: x=' + segs[activeIdx].style.x + '  y=' + segs[activeIdx].style.y, 'ok');
  }
  _dragState = null;
}

// ── resize (corner handle) ──
let _resizeState = null;
function startResize(e) {
  e.preventDefault(); e.stopPropagation();
  if (activeIdx < 0) return;
  const s = segs[activeIdx]; s.style = s.style || {};
  _resizeState = {
    sx: e.clientX, sy: e.clientY,
    s0: Number(s.style.scale ?? 1),
  };
  document.addEventListener('mousemove', _onResize);
  document.addEventListener('mouseup', _endResize);
}
function _onResize(e) {
  if (!_resizeState) return;
  const dx = e.clientX - _resizeState.sx;
  const dy = e.clientY - _resizeState.sy;
  // 100px 드래그 = +0.5 scale 정도
  const delta = (dx + dy) / 200;
  const newScale = Math.max(0.3, Math.min(2.5, _resizeState.s0 + delta));
  segs[activeIdx].style.scale = Math.round(newScale * 100) / 100;
  updateStage();
}
function _endResize() {
  document.removeEventListener('mousemove', _onResize);
  document.removeEventListener('mouseup', _endResize);
  if (_resizeState) {
    renderCards();
    showToast('크기: scale=' + segs[activeIdx].style.scale, 'ok');
  }
  _resizeState = null;
}

// stage 보조 버튼
function centerActive() {
  if (activeIdx < 0) return;
  segs[activeIdx].style = segs[activeIdx].style || {};
  segs[activeIdx].style.x = 0;
  segs[activeIdx].style.y = 0;
  segs[activeIdx].style.scale = 1;
  renderCards();
  updateStage();
  showToast('위치/크기 초기화', 'ok');
}
function resetActiveStyle() {
  if (activeIdx < 0) return;
  segs[activeIdx].style = {};
  renderCards();
  updateStage();
  showToast('style 전부 리셋', 'ok');
}

function startEdit(i) {
  if (editIdx !== -1 && editIdx !== i) commitEdit(editIdx);
  editIdx = i;
  activeIdx = i;
  renderCards();
  setTimeout(() => {
    const ta = document.getElementById('ta-text-' + i);
    if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
  }, 30);
}

function saveField(i, field) {
  const id = field === 'text' ? 'ta-text-' : 'ta-tts-';
  const ta = document.getElementById(id + i);
  if (!ta) return;
  segs[i][field === 'text' ? 'text' : 'tts_text'] = ta.value;
}

function commitEdit(i) {
  saveField(i, 'text');
  saveField(i, 'tts');
  editIdx = -1;
}

function removeKw(i, e, kw) {
  e.stopPropagation();
  segs[i].highlight_keywords = (segs[i].highlight_keywords||[]).filter(k=>k!==kw);
  renderCards(); renderScript();
}

function addKwKey(e, i) { if(e.key==='Enter'){e.preventDefault();addKwBtn(i);} }
function addKwBtn(i) {
  const inp = document.getElementById('kw-inp-' + i);
  if (!inp || !inp.value.trim()) return;
  segs[i].highlight_keywords = [...(segs[i].highlight_keywords||[]), inp.value.trim()];
  renderCards(); renderScript();
}

function setEffect(i, val) {
  // 새 6 scene effect 만 허용 (+ 'none'). 같은 section의 다른 카드도 함께 변경해서 1:1 매핑을 유지.
  segs[i].effect = val;
  const sec = (segs[i].section || '').toLowerCase();
  if (sec) {
    for (let k=0; k<segs.length; k++) {
      if ((segs[k].section||'').toLowerCase() === sec) segs[k].effect = val;
    }
  }
  renderCards();
  drawTimeline();
  showToast('effect: ' + (segs[i].section||'?').toUpperCase() + ' → ' + val, 'ok');
}

// ── segment visual override (scale/opacity/speed/delay/x/y) ──
function setStyle(i, key, val) {
  segs[i].style = segs[i].style || {};
  const v = Number(val);
  segs[i].style[key] = Number.isFinite(v) ? v : val;
  if (i === activeIdx) updateStage();
}
function resetStyle(i) {
  segs[i].style = {};
  renderCards();
  if (i === activeIdx) updateStage();
  showToast('style 리셋', 'ok');
}
function copyStyleToAll(i) {
  const src = JSON.parse(JSON.stringify(segs[i].style || {}));
  for (let k = 0; k < segs.length; k++) segs[k].style = JSON.parse(JSON.stringify(src));
  renderCards();
  showToast('이 segment 효과값을 전체에 적용', 'ok');
}

// ── 효과 프리셋 (localStorage) ──
const PRESET_KEY = 'editor_segment_presets_v1';
function loadPresets() {
  try { return JSON.parse(localStorage.getItem(PRESET_KEY) || '{}'); } catch (_) { return {}; }
}
function savePresetFromCard(i) {
  const name = prompt('프리셋 이름 (예: big-terminal, fast-log):', '');
  if (!name || !name.trim()) return;
  const presets = loadPresets();
  presets[name.trim()] = {
    style: JSON.parse(JSON.stringify(segs[i].style || {})),
    effect: segs[i].effect || null,
  };
  localStorage.setItem(PRESET_KEY, JSON.stringify(presets));
  renderCards();
  showToast('프리셋 저장: ' + name.trim(), 'ok');
}
function applyPresetToCard(i, name) {
  if (!name) return;
  const presets = loadPresets();
  const p = presets[name];
  if (!p) { showToast('프리셋 없음: ' + name, 'err'); return; }
  segs[i].style = JSON.parse(JSON.stringify(p.style || {}));
  if (p.effect) segs[i].effect = p.effect;
  renderCards();
  showToast('프리셋 적용: ' + name + ' → ' + (segs[i].section||'?'), 'ok');
}
// 프리셋 셀렉트 박스에 옵션 채우기 (renderCards 후 호출)
function refreshPresetSelects() {
  const presets = loadPresets();
  const opts = Object.keys(presets).map(k => '<option value="'+k+'">'+k+'</option>').join('');
  document.querySelectorAll('.efx-preset-sel').forEach(sel => {
    // 첫 옵션(라벨)은 유지
    const head = sel.options[0] ? sel.options[0].outerHTML : '<option value="">프리셋 불러오기…</option>';
    sel.innerHTML = head + opts;
  });
}

// ── 무음 압축: segment 사이 공백을 0.1초로 압축 ──
function compressSilence() {
  if (segs.length === 0) return;
  let cursor = segs[0].start || 0;
  for (let i = 0; i < segs.length; i++) {
    const dur = Math.max(0.3, (Number(segs[i].end) || 0) - (Number(segs[i].start) || 0));
    segs[i].start = Number(cursor.toFixed(2));
    segs[i].end   = Number((cursor + dur).toFixed(2));
    cursor = segs[i].end + 0.1; // 0.1초 간격 유지
  }
  dur = (segs[segs.length-1].end || dur);
  renderCards();
  drawTimeline();
  showToast('무음 압축 완료 — 총 ' + dur.toFixed(1) + 's', 'ok');
}

// ── TTS만 재생성 ──
async function regenTTS() {
  if (editIdx !== -1) commitEdit(editIdx);
  const btn = document.getElementById('btn-tts');
  btn.disabled = true; btn.innerHTML = '<span class="spin"></span> TTS...';
  try {
    await saveEdits();
    const voice = (document.getElementById('tts-voice')||{}).value || '';
    const speed = Number((document.getElementById('tts-speed')||{}).value) || 1;
    const r = await fetch('/tts-regenerate', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ voice, speed, subtitle_segments: segs }),
    }).then(r=>r.json());
    if (r.error) throw new Error(r.error);
    showToast('TTS 재생성 ✓ ' + (r.sizeKB||'?') + 'KB · ' + (r.voice||'default') + ' x' + speed.toFixed(2), 'ok');
    // audio reload
    if (media && media.tagName === 'AUDIO') { media.src = '/audio/today?t=' + Date.now(); media.load(); }
  } catch (e) { showToast('TTS 실패: ' + e.message, 'err'); }
  finally { btn.disabled=false; btn.innerHTML='🎙 TTS'; }
}

// ── 세그먼트 조작 ──
function delSeg(i, e) {
  e.stopPropagation();
  if (!confirm('삭제하시겠습니까?')) return;
  segs.splice(i, 1);
  editIdx = -1; activeIdx = -1;
  renderCards(); drawTimeline(); updateTlCount();
}

function splitSeg(i, e) {
  e.stopPropagation();
  const s = segs[i], mid = (s.start + s.end) / 2;
  segs.splice(i, 1,
    { ...s, end: mid, text: s.text + ' ①', tts_text: (s.tts_text||s.text) + ' ①' },
    { ...s, start: mid, text: s.text + ' ②', tts_text: (s.tts_text||s.text) + ' ②' }
  );
  editIdx = -1;
  renderCards(); drawTimeline(); updateTlCount();
  showToast('분할 완료 — 더블클릭으로 텍스트 편집', 'ok');
}

function addSegment() {
  const last = segs[segs.length-1];
  const st = last ? last.end : 0;
  segs.push({ start: st, end: st+3, text: '새 세그먼트', tts_text: '새 세그먼트', section: 'cta', highlight_keywords: [], glossary: [], visual_effect: 'none' });
  editIdx = segs.length-1; activeIdx = editIdx;
  renderCards(); drawTimeline(); updateTlCount();
  setTimeout(() => document.getElementById('card-'+(segs.length-1))?.scrollIntoView({behavior:'smooth',block:'end'}), 50);
}

// ── 플레이어 ──
function fmtT(s) {
  if (s==null) return '?';
  const m = Math.floor(s/60), sec = Math.floor(s%60);
  return m + ':' + String(sec).padStart(2,'0');
}
function fmtTF(s) {
  const m = Math.floor(s/60), sec = (s%60).toFixed(1);
  return m + ':' + String(sec).padStart(4,'0');
}

function updateDur() {
  document.getElementById('time-dur').textContent = '/ ' + fmtT(dur);
}

function onTime() {
  const t = media.currentTime;
  document.getElementById('time-disp').textContent = fmtTF(t);
  document.getElementById('play-btn').textContent = media.paused ? '▶' : '⏸';
  updatePlayhead(t);
  drawWaveform();
  highlightActive(t);
}

function highlightActive(t) {
  const idx = segs.findIndex(s => t >= s.start && t < s.end);
  if (idx === activeIdx) return;
  if (editIdx !== -1) return;
  activeIdx = idx;
  document.querySelectorAll('.cap-card').forEach((c,i) => {
    c.classList.toggle('active', i === idx);
  });
  if (idx >= 0) document.getElementById('card-'+idx)?.scrollIntoView({block:'nearest',behavior:'smooth'});

  // 대본 단어 하이라이트
  const words = document.querySelectorAll('.sw');
  const totalW = words.length;
  const pct = t / Math.max(dur, 1);
  const curW = Math.floor(pct * totalW);
  words.forEach((w,i) => w.classList.toggle('playing', Math.abs(i - curW) < 2));
}

function updatePlayhead(t) {
  const pct = Math.min(t / Math.max(dur,1), 1);
  document.getElementById('playhead').style.left = (pct * 100) + '%';
}

function togglePlay() {
  if (!media) return;
  if (media.paused) { if (audioCtx?.state === 'suspended') audioCtx.resume(); media.play(); }
  else media.pause();
  document.getElementById('play-btn').textContent = media.paused ? '▶' : '⏸';
}

function seek(s) {
  if (!media) return;
  media.currentTime = Math.max(0, Math.min((media.currentTime||0)+s, dur));
}

// ── 타임라인 ──
function drawTimeline() {
  const canvas = document.getElementById('tl-canvas');
  const wrap   = document.getElementById('tl-wrap');
  canvas.width = wrap.clientWidth; canvas.height = wrap.clientHeight;
  const ctx = canvas.getContext('2d'), W = canvas.width, H = canvas.height;
  const d = Math.max(dur, 1);

  ctx.fillStyle = '#080808'; ctx.fillRect(0,0,W,H);

  // 눈금
  const step = d <= 60 ? 5 : d <= 180 ? 10 : 30;
  for (let t=0; t<=d; t+=step) {
    const x = (t/d)*W;
    ctx.strokeStyle = '#1e1e1e'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, H-16); ctx.lineTo(x, H); ctx.stroke();
    ctx.fillStyle = '#3a3a3a'; ctx.font = '9px monospace';
    ctx.fillText(fmtT(t), x+2, H-2);
  }

  // 세그먼트 블록
  for (let i=0; i<segs.length; i++) {
    const s = segs[i];
    const x1 = (s.start/d)*W, x2 = (s.end/d)*W;
    const bw = Math.max(x2-x1-1, 2);
    const col = SEC_COL[s.section] || '#555';
    const isActive = i === activeIdx;

    ctx.fillStyle = col + (isActive ? '40' : '1a');
    ctx.fillRect(x1, 2, bw, H-20);
    ctx.strokeStyle = col + (isActive ? 'cc' : '55');
    ctx.lineWidth = isActive ? 2 : 1;
    ctx.strokeRect(x1, 2, bw, H-20);

    if (bw > 24) {
      ctx.fillStyle = col;
      ctx.font = 'bold 9px sans-serif';
      ctx.fillText(s.section.slice(0,4).toUpperCase(), x1+4, 14);
    }
    if (bw > 60) {
      ctx.fillStyle = '#ccc';
      ctx.font = '9px sans-serif';
      ctx.fillText(s.text.slice(0, Math.floor(bw/6.5)), x1+4, 26);
    }
    // effect indicator
    if (s.visual_effect && s.visual_effect !== 'none' && bw > 16) {
      ctx.fillStyle = '#fbbf24';
      ctx.font = '8px sans-serif';
      ctx.fillText('✦', x1+4, H-22);
    }
  }
}

window.addEventListener('resize', () => { drawTimeline(); drawWaveform(); });

// ── 효과 컨트롤(상단 툴바) live preview ──
(function(){
  const fs = document.getElementById('effect-fontSize');
  const fsv = document.getElementById('effect-fontSize-val');
  if (fs && fsv) fs.addEventListener('input', () => { fsv.textContent = fs.value; });
  const ts = document.getElementById('tts-speed');
  const tsv = document.getElementById('tts-speed-val');
  if (ts && tsv) ts.addEventListener('input', () => { tsv.textContent = Number(ts.value).toFixed(2); });
})();

function seekTimeline(e) {
  const wrap = document.getElementById('tl-wrap');
  const pct  = e.offsetX / wrap.clientWidth;
  const t    = pct * dur;
  if (media) { media.currentTime = t; if(audioCtx?.state==='suspended') audioCtx.resume(); }
  updatePlayhead(t);
  drawWaveform();
  highlightActive(t);
}

// ── 저장 & 재렌더 ──
async function saveEdits() {
  if (editIdx !== -1) commitEdit(editIdx);
  const btn = document.getElementById('btn-save');
  btn.disabled = true; btn.innerHTML = '<span class="spin"></span>';
  try {
    const ttsScript = segs.map(s=>s.tts_text||s.text).join(' ');
    const r = await fetch('/save-edit', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ subtitle_segments: segs, tts_script: ttsScript }),
    }).then(r=>r.json());
    if (r.error) throw new Error(r.error);
    showToast('저장 완료 ✓  ' + r.count + '개', 'ok');
    renderScript();
  } catch(e) { showToast('저장 실패: '+e.message, 'err'); }
  finally { btn.disabled=false; btn.innerHTML='저장'; }
}

async function doRender() {
  if (editIdx !== -1) commitEdit(editIdx);
  const btn = document.getElementById('btn-render');
  btn.disabled = true; btn.innerHTML = '<span class="spin"></span> 렌더 중...';
  try {
    await saveEdits();
    const effectPreset = (document.getElementById('effect-preset')||{}).value || 'vrew-coding-clean';
    const fontSize = Number((document.getElementById('effect-fontSize')||{}).value) || 66;
    const bgType   = (document.getElementById('effect-bg')||{}).value || 'dark-gradient';
    const capPos = (document.getElementById('caption-pos')||{}).value || 'bottom';
    const effectTuning = {
      caption:    { fontSize, position: capPos },
      background: { type: bgType },
    };
    // section별 effect 맵을 함께 전송 (sceneOverrides 안에 effect 필드로도 보냄)
    const sceneEffects = {};
    const segmentStyles = {};
    for (const s of segs) {
      const sec = (s.section||'').toLowerCase();
      if (!sec) continue;
      const eff = s.effect && s.effect !== 'none' ? s.effect : null;
      if (eff && !sceneEffects[sec]) sceneEffects[sec] = eff;
      if (s.style && typeof s.style === 'object' && Object.keys(s.style).length && !segmentStyles[sec]) {
        // 빈 값/기본값(scale=1,opacity=1,speed=1) 제거
        const clean = {};
        for (const [k,v] of Object.entries(s.style)) {
          if (v === undefined || v === null || v === '') continue;
          const nv = Number(v);
          if (Number.isFinite(nv)) {
            if (k==='scale' && nv === 1) continue;
            if (k==='opacity' && nv === 1) continue;
            if (k==='speed' && nv === 1) continue;
            if (k==='delay' && nv === 0) continue;
            if ((k==='x'||k==='y') && nv === 0) continue;
            clean[k] = nv;
          } else clean[k] = v;
        }
        if (Object.keys(clean).length) segmentStyles[sec] = clean;
      }
    }
    // 클라이언트도 자체 [editor] log를 콘솔에 찍어 사용자가 바로 확인 가능
    const editorLog = Object.entries(segmentStyles).map(function(entry){
      const sec = entry[0], st = entry[1];
      const parts = Object.entries(st).map(function(e){ return e[0]+'='+e[1]; }).join(',');
      return sec.toUpperCase()+':'+parts+',effect='+(sceneEffects[sec]||defaultEffectFor(sec));
    }).join(' | ');
    if (editorLog) console.log('[editor] segmentOverrides=' + editorLog);
    const r = await fetch('/render-auto', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        durationSeconds: dur,
        subtitle_segments: segs,
        compositionId: 'VrewCodingClean',
        effectPreset,
        effectTuning,
        sceneEffects,
        segmentStyles,
      }),
    }).then(r=>r.json());
    if (r.error) throw new Error(r.error);
    showToast('렌더 완료 ✓  ' + r.sizeKB + 'KB', 'ok');
    // 비디오 리로드
    const vid = document.getElementById('vid');
    vid.src = '/video/today?t=' + Date.now();
    vid.style.display = 'block';
    document.getElementById('waveform-canvas').style.display = 'none';
    media = vid;
    vid.addEventListener('timeupdate', onTime);
    vid.addEventListener('loadedmetadata', () => { dur = vid.duration; updateDur(); drawTimeline(); });
  } catch(e) { showToast('렌더 실패: '+e.message, 'err'); }
  finally { btn.disabled=false; btn.innerHTML='🎬 재렌더'; }
}

function showToast(msg, type='ok') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast ' + type;
  el.style.display = 'block';
  clearTimeout(el._t);
  el._t = setTimeout(()=>el.style.display='none', 3000);
}
</script>
<script src="/editor-player.js" defer></script>
<script>
// ── editor → Remotion Player 동기화 ──
// segs / sceneEffects / segmentStyles / effectTuning을 합쳐 Player에 라이브 주입.
// 1초에 한 번 최대로 throttle해서 너무 잦은 리렌더 방지.
let _rmtTimer = null;
function pushRmtUpdate(immediate) {
  if (_rmtTimer) { clearTimeout(_rmtTimer); _rmtTimer = null; }
  const send = () => {
    if (!window.__rmtReady || typeof window.__rmtUpdate !== 'function') return;
    const status = document.getElementById('rmt-status');
    try {
      const fontSize = Number((document.getElementById('effect-fontSize')||{}).value) || 66;
      const bgType   = (document.getElementById('effect-bg')||{}).value || 'dark-gradient';
      const capPos   = (document.getElementById('caption-pos')||{}).value || 'bottom';
      const effectPreset = (document.getElementById('effect-preset')||{}).value || 'vrew-coding-clean';
      const sceneEffects = {};
      const segmentStyles = {};
      const scriptScenes = [];
      let cursor = 0;
      for (const sec of ['hook','setup','reveal','cause','solution','cta']) {
        const grp = segs.filter(s => (s.section||'').toLowerCase() === sec);
        if (!grp.length) continue;
        const caption   = grp.map(x => x.text).filter(Boolean).join(' ');
        const narration = grp.map(x => x.tts_text || x.text).filter(Boolean).join(' ');
        const firstEff = (grp.find(x => x.effect && x.effect !== 'none') || {}).effect;
        const eff = firstEff || (typeof defaultEffectFor === 'function' ? defaultEffectFor(sec) : 'code-typing');
        const firstStyle = (grp.find(x => x.style && typeof x.style === 'object') || {}).style || {};
        const sStart = Math.min.apply(null, grp.map(x => Number(x.start)||0));
        const sEnd   = Math.max.apply(null, grp.map(x => Number(x.end)||0));
        const dSec   = Math.max(0.5, (sEnd - sStart) || (dur / 6));
        scriptScenes.push({
          scene_id: 'S'+(scriptScenes.length+1)+'_'+sec,
          section: sec, duration: dSec,
          caption: caption, narration: narration, effect: eff,
          style: firstStyle,
        });
        sceneEffects[sec] = eff;
        if (firstStyle && Object.keys(firstStyle).length) segmentStyles[sec] = firstStyle;
        cursor += dSec;
      }
      const totalSec = Math.max(scriptScenes.reduce((a,s)=>a+s.duration, 0), dur || 15);
      const props = {
        durationSeconds: totalSec,
        scriptScenes: scriptScenes.length ? scriptScenes : undefined,
        sceneEffects, segmentStyles,
        effectPreset,
        effectTuning: { caption: { fontSize: fontSize, position: capPos }, background: { type: bgType } },
        words: extractWordsFromSegs(segs),
        debug: false,
      };
      window.__rmtUpdate(props);
      if (status) { status.textContent = 'live · ' + scriptScenes.length + ' scenes'; status.style.color = '#22c55e'; }
    } catch (e) {
      console.warn('[editor] pushRmtUpdate err', e);
      if (status) { status.textContent = 'err: ' + e.message; status.style.color = '#ef4444'; }
    }
  };
  if (immediate) send();
  else _rmtTimer = setTimeout(send, 250);
}

// caption words 변환 — captions.json의 words를 우선, 없으면 segment 기반으로 균등 분배
function extractWordsFromSegs(segs) {
  const out = [];
  for (const s of segs) {
    const text = (s.text || '').trim();
    if (!text) continue;
    const start = Number(s.start) || 0;
    const end   = Number(s.end)   || (start + 1);
    const tokens = text.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;
    const per = (end - start) / tokens.length;
    const hl = new Set((s.highlight_keywords || []).map(String));
    for (let i = 0; i < tokens.length; i++) {
      out.push({
        text: tokens[i],
        startMs: Math.round((start + i*per) * 1000),
        endMs:   Math.round((start + (i+1)*per) * 1000),
        highlight: hl.has(tokens[i]),
      });
    }
  }
  return out;
}

// 기존 활성화/슬라이더 함수에 hook
const _origActivate = window.activateCard;
window.activateCard = function(i){ _origActivate(i); pushRmtUpdate(true); };
const _origSetStyle = window.setStyle;
window.setStyle = function(i,k,v){ _origSetStyle(i,k,v); pushRmtUpdate(false); };
const _origSetEffect = window.setEffect;
window.setEffect = function(i,v){ _origSetEffect(i,v); pushRmtUpdate(true); };
const _origCompress = window.compressSilence;
window.compressSilence = function(){ _origCompress(); pushRmtUpdate(true); };
const _origResetStyle = window.resetStyle;
window.resetStyle = function(i){ _origResetStyle(i); pushRmtUpdate(true); };
const _origCenter = window.centerActive;
if (_origCenter) window.centerActive = function(){ _origCenter(); pushRmtUpdate(true); };
const _origReset = window.resetActiveStyle;
if (_origReset) window.resetActiveStyle = function(){ _origReset(); pushRmtUpdate(true); };

// 상단 툴바 변경에도 반응
['effect-preset','effect-bg','effect-fontSize','caption-pos'].forEach(function(id){
  const el = document.getElementById(id);
  if (el) el.addEventListener('change', function(){ pushRmtUpdate(true); });
  if (el && el.type === 'range') el.addEventListener('input', function(){ pushRmtUpdate(false); });
});

// Player가 로드될 때까지 polling 후 첫 동기화
(function waitRmt(){
  if (window.__rmtReady) {
    pushRmtUpdate(true);
    return;
  }
  setTimeout(waitRmt, 200);
})();
</script>
</body>
</html>`);
});

// ── POST /upload-image — 이미지 업로드 ──────────────────────────
app.post('/upload-image', express.raw({ type: ['image/*'], limit: '20mb' }), (req, res) => {
  if (!req.body?.length) return res.status(400).json({ error: 'no body' });
  const ext = (req.headers['content-type'] || 'image/png').split('/')[1].split(';')[0];
  const filename = uuid() + '.' + ext;
  const filepath = path.join(OUTPUT_DIR, filename);
  fs.writeFileSync(filepath, req.body);
  const host = req.headers.host || `localhost:${PORT}`;
  res.json({ url: `http://${host}/file/${filename}`, filename });
});

// ── GET /images — 업로드된 이미지 목록 ──────────────────────────
app.get('/images', (_req, res) => {
  const exts = new Set(['.png','.jpg','.jpeg','.gif','.webp','.svg']);
  let imgs = [];
  try {
    imgs = fs.readdirSync(OUTPUT_DIR)
      .filter(f => exts.has(path.extname(f).toLowerCase()))
      .sort().reverse().slice(0, 40)
      .map(f => ({ name: f, url: `/file/${f}` }));
  } catch {}
  res.json(imgs);
});

// ── GET /shorts/:name — shorts_log 영상 서빙 ─────────────────────
app.get('/shorts/:name', (req, res) => {
  const p = path.join(SHORTS_LOG, path.basename(req.params.name));
  if (!fs.existsSync(p) || !p.endsWith('.mp4')) return res.status(404).end();
  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Accept-Ranges', 'bytes');
  res.sendFile(p);
});

// ── GET / — 대시보드 ──────────────────────────────────────────────
function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

app.get('/', (_req, res) => {
  // shorts_log 날짜별 영상 (제목 표시)
  let rendered = [];
  try {
    const logFiles = fs.readdirSync(SHORTS_LOG)
      .filter(f => f.endsWith('_video.mp4')).sort().reverse().slice(0, 8);
    rendered = logFiles.map(f => {
      const datePrefix = f.replace('_video.mp4', '');
      const sizeKB = Math.round(fs.statSync(path.join(SHORTS_LOG, f)).size / 1024);
      let title = datePrefix;
      try {
        const sc = JSON.parse(fs.readFileSync(path.join(SHORTS_LOG, `${datePrefix}_script_result.json`), 'utf8'));
        title = sc.title ? `${datePrefix} — ${sc.title.slice(0, 28)}` : datePrefix;
      } catch {}
      return { name: f, label: title, sizeKB, path: f };
    });
    // OUTPUT_DIR fallback if no shorts_log videos
    if (rendered.length === 0) {
      rendered = fs.readdirSync(OUTPUT_DIR)
        .filter(f => f.endsWith('.mp4')).sort().reverse().slice(0, 6)
        .map(f => ({ name: f, label: f.slice(0, 24) + '…', sizeKB: Math.round(fs.statSync(path.join(OUTPUT_DIR, f)).size / 1024), path: `/file/${f}` }));
    }
  } catch {}

  const today = new Date().toISOString().slice(0,10);
  const hasScript   = fs.existsSync(path.join(SHORTS_LOG, `${today}_script_result.json`));
  const hasAudio    = fs.existsSync(path.join(SHORTS_LOG, `${today}_voice.mp3`));
  const hasCaptions = fs.existsSync(path.join(SHORTS_LOG, `${today}_captions.json`));
  const hasVideo    = fs.existsSync(path.join(SHORTS_LOG, `${today}_video.mp4`));
  let scriptTitle = '', scriptHook = '';
  try {
    const sc = JSON.parse(fs.readFileSync(path.join(SHORTS_LOG, `${today}_script_result.json`), 'utf8'));
    scriptTitle = sc.title || ''; scriptHook = sc.hook || '';
  } catch {}

  // ── 동적 조각 빌드 ─────────────────────────────────────────────
  const badge = (has) => has
    ? 'class="file-badge badge-ok">✓'
    : 'class="file-badge badge-no">✗';

  const scriptPreviewHtml = scriptTitle
    ? '<div class="script-card">' +
        '<div class="script-label">오늘 대본</div>' +
        '<div class="script-title">' + escHtml(scriptTitle) + '</div>' +
        '<div class="script-hook">' + escHtml(scriptHook) + '</div>' +
      '</div>'
    : '';

  const renderItemsHtml = rendered.length > 0
    ? rendered.map(function(f) {
        const href = f.path
          ? (f.path.startsWith('/') ? f.path : '/shorts/' + encodeURIComponent(f.name))
          : '/file/' + encodeURIComponent(f.name);
        return '<div class="render-item">' +
          '<span class="render-name">' + escHtml(f.label || f.name) + '</span>' +
          '<span class="render-meta">' + f.sizeKB + 'KB</span>' +
          '<a class="render-link" href="' + href + '" target="_blank">&#9654;</a>' +
        '</div>';
      }).join('')
    : '<div style="color:var(--text2);font-size:12px;padding:8px 0">파이프라인을 실행하면 여기에 표시됩니다</div>';

  // ── HTML ──────────────────────────────────────────────────────
  res.send('<!DOCTYPE html>\n<html lang="ko">\n<head>\n' +
'<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">\n' +
'<title>Shorts Studio</title>\n' +
'<style>\n' +
':root{--bg0:#0f0f14;--bg1:#16161f;--bg2:#1e1e2a;--border:rgba(255,255,255,0.08);--text1:#f0f0f5;--text2:rgba(240,240,245,0.55);--accent:#7c6af7;--accent-soft:rgba(124,106,247,0.15);--green:#4ade80;--green-soft:rgba(74,222,128,0.12);--red:#f87171;--yellow:#fbbf24;--blue:#60a5fa;--radius:12px;}\n' +
'*{box-sizing:border-box;margin:0;padding:0}\n' +
'body{font-family:"Inter","Pretendard",system-ui,sans-serif;background:var(--bg0);color:var(--text1);min-height:100vh;display:flex}\n' +
'.sidebar{width:220px;background:var(--bg1);border-right:1px solid var(--border);padding:28px 0;flex-shrink:0;display:flex;flex-direction:column}\n' +
'.sidebar-logo{padding:0 24px 28px;font-size:16px;font-weight:700;letter-spacing:-0.3px;text-decoration:none;color:inherit;display:block;cursor:pointer;transition:opacity .15s}\n' +
'.sidebar-logo:hover{opacity:0.85}\n' +
'.sidebar-logo span{color:var(--accent)}\n' +
'.nav-item{display:flex;align-items:center;gap:10px;padding:13px 24px;margin:2px 8px;border-radius:8px;font-size:13px;font-weight:500;color:var(--text2);cursor:pointer;text-decoration:none;transition:all 0.15s;border-left:3px solid transparent;line-height:1.4}\n' +
'.nav-item:hover{color:var(--text1);background:rgba(255,255,255,0.06);transform:translateX(2px)}\n' +
'.nav-item.active{color:var(--accent);background:var(--accent-soft);border-left-color:var(--accent);font-weight:700}\n' +
'.nav-item.active:hover{transform:none}\n' +
'.nav-cta{margin:14px 16px 0;padding:11px 14px;background:var(--accent);color:#fff !important;border-radius:8px;font-size:12px;font-weight:700;text-align:center;text-decoration:none;display:block;cursor:pointer;transition:all .15s;letter-spacing:0.02em}\n' +
'.nav-cta:hover{background:#6d5bef;box-shadow:0 4px 14px rgba(124,106,247,0.35);transform:translateY(-1px)}\n' +
'.nav-cta:active{transform:translateY(0)}\n' +
'.nav-divider{margin:8px 24px;border-top:1px solid var(--border)}\n' +
'.main{flex:1;overflow-y:auto;padding:36px;max-width:980px}\n' +
'.page-title{font-size:22px;font-weight:700;margin-bottom:6px}\n' +
'.page-sub{font-size:13px;color:var(--text2);margin-bottom:28px}\n' +
'.launcher-card{background:var(--bg1);border:1px solid var(--border);border-radius:16px;padding:28px;margin-bottom:24px;scroll-margin-top:16px;transition:box-shadow .3s}\n' +
'.launcher-card:target{box-shadow:0 0 0 2px var(--accent),0 8px 28px rgba(124,106,247,0.25)}\n' +
'.launcher-label{font-size:11px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:var(--text2);margin-bottom:12px}\n' +
'.topic-row{display:flex;gap:12px}\n' +
'.topic-input{flex:1;background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:14px 16px;font-size:14px;color:var(--text1);outline:none;transition:border 0.2s;font-family:inherit}\n' +
'.topic-input:focus{border-color:var(--accent)}\n' +
'.topic-input::placeholder{color:var(--text2)}\n' +
'.btn-start{background:var(--accent);color:#fff;border:none;border-radius:10px;padding:14px 28px;font-size:14px;font-weight:600;cursor:pointer;transition:opacity 0.2s;white-space:nowrap;font-family:inherit}\n' +
'.btn-start:hover{opacity:0.85}\n' +
'.btn-start:disabled{opacity:0.4;cursor:not-allowed}\n' +
'.pipeline-steps{display:flex;gap:0;margin-top:24px;position:relative}\n' +
'.pipeline-steps::before{content:"";position:absolute;top:21px;left:22px;right:22px;height:2px;background:var(--border);z-index:0}\n' +
'.step-item{flex:1;display:flex;flex-direction:column;align-items:center;gap:8px;position:relative;z-index:1}\n' +
'.step-circle{width:44px;height:44px;border-radius:50%;background:var(--bg2);border:2px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:18px;transition:all 0.3s}\n' +
'.step-circle.running{border-color:var(--accent);background:var(--accent-soft);animation:pulse 1.2s infinite}\n' +
'.step-circle.done{border-color:var(--green);background:var(--green-soft)}\n' +
'.step-circle.error{border-color:var(--red);background:rgba(248,113,113,0.1)}\n' +
'.step-label{font-size:11px;font-weight:600;color:var(--text2);text-align:center}\n' +
'.step-msg{font-size:10px;color:var(--text2);text-align:center;max-width:80px;line-height:1.3;min-height:14px}\n' +
'@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.6}}\n' +
'.log-card{background:#0a0a10;border:1px solid var(--border);border-radius:10px;padding:14px 16px;margin-top:16px;display:none}\n' +
'.log-card.show{display:block}\n' +
'.log-lines{font-family:"Fira Code",Consolas,monospace;font-size:11px;color:#4ade80;line-height:1.9;max-height:180px;overflow-y:auto;white-space:pre-wrap}\n' +
'.grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px}\n' +
'.status-card,.renders-card,.script-card{background:var(--bg1);border:1px solid var(--border);border-radius:12px;padding:20px;margin-bottom:16px}\n' +
'.card-title{font-size:11px;font-weight:600;letter-spacing:0.8px;text-transform:uppercase;color:var(--text2);margin-bottom:14px}\n' +
'.file-row{display:flex;align-items:center;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--border)}\n' +
'.file-row:last-child{border-bottom:none}\n' +
'.file-name{font-size:12px;color:var(--text2)}\n' +
'.file-badge{font-size:11px;font-weight:600;padding:2px 10px;border-radius:20px}\n' +
'.badge-ok{background:var(--green-soft);color:var(--green)}\n' +
'.badge-no{background:rgba(248,113,113,0.1);color:var(--red)}\n' +
'.script-label{font-size:10px;font-weight:600;letter-spacing:0.8px;text-transform:uppercase;color:var(--accent);margin-bottom:8px}\n' +
'.script-title{font-size:15px;font-weight:700;margin-bottom:6px;line-height:1.4}\n' +
'.script-hook{font-size:13px;color:var(--text2);line-height:1.6}\n' +
'.render-item{display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)}\n' +
'.render-item:last-child{border-bottom:none}\n' +
'.render-name{font-size:11px;font-family:monospace;color:var(--text2);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-right:8px}\n' +
'.render-meta{font-size:11px;color:var(--text2);margin-right:12px;flex-shrink:0}\n' +
'.render-link{font-size:11px;color:var(--accent);text-decoration:none;flex-shrink:0}\n' +
'.toast{position:fixed;bottom:24px;right:24px;background:var(--bg2);border:1px solid var(--border);color:var(--text1);padding:12px 20px;border-radius:10px;font-size:13px;display:none;z-index:999}\n' +
'.toast.ok{border-color:var(--green)}\n' +
'.toast.err{border-color:var(--red)}\n' +
'.spin{display:inline-block;width:13px;height:13px;border:2px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;animation:spin 0.7s linear infinite;vertical-align:-2px;margin-right:6px}\n' +
'@keyframes spin{to{transform:rotate(360deg)}}\n' +
'</style>\n</head>\n<body>\n' +

'<nav class="sidebar">\n' +
'<a class="sidebar-logo" href="/" title="홈으로">Shorts<span>Studio</span></a>\n' +
'<a class="nav-item active" href="/" aria-current="page">&#9654; 파이프라인</a>\n' +
'<a class="nav-item" href="/editor">&#9986; 에디터</a>\n' +
'<a class="nav-item" href="/clips">&#9986;&#65039; 클립 편집기</a>\n' +
'<a class="nav-cta" href="/#topic">+ 새 AI 영상 만들기</a>\n' +
'</nav>\n' +

'<main class="main">\n' +
'<div class="page-title">자동화 파이프라인</div>\n' +
'<div class="page-sub">주제 입력 → 대본(RAG) → TTS → Whisper → Remotion 렌더 자동 실행</div>\n' +

'<div class="launcher-card" id="topic">\n' +
'<div class="launcher-label">&#10024; 새 AI 영상 만들기 — 주제 입력</div>\n' +
'<div class="topic-row">\n' +
'<input class="topic-input" id="topic-input" type="text"\n' +
'  placeholder="예: AI 에이전트 자동화 실전, n8n으로 숏츠 만드는 법..." autofocus/>\n' +
'<button class="btn-start" id="btn-start" onclick="startPipeline()">&#9654; 시작</button>\n' +
'</div>\n' +

'<div class="pipeline-steps">\n' +
'<div class="step-item"><div class="step-circle" id="step-script">&#128221;</div><div class="step-label">대본</div><div class="step-msg" id="msg-script">대기</div></div>\n' +
'<div class="step-item"><div class="step-circle" id="step-tts">&#127897;</div><div class="step-label">TTS</div><div class="step-msg" id="msg-tts">대기</div></div>\n' +
'<div class="step-item"><div class="step-circle" id="step-whisper">&#128065;</div><div class="step-label">Whisper</div><div class="step-msg" id="msg-whisper">대기</div></div>\n' +
'<div class="step-item"><div class="step-circle" id="step-captions">&#128203;</div><div class="step-label">자막</div><div class="step-msg" id="msg-captions">대기</div></div>\n' +
'<div class="step-item"><div class="step-circle" id="step-render">&#127910;</div><div class="step-label">렌더</div><div class="step-msg" id="msg-render">대기</div></div>\n' +
'</div>\n' +

'<div class="log-card" id="log-card"><div class="log-lines" id="log-lines"></div></div>\n' +
'</div>\n' +   // launcher-card

scriptPreviewHtml +

'<div class="grid2">\n' +
'<div class="status-card"><div class="card-title">오늘 파일 (' + today + ')</div>\n' +
'<div class="file-row"><span class="file-name">대본 (script_result.json)</span><span ' + badge(hasScript) + '> 대본</span></div>\n' +
'<div class="file-row"><span class="file-name">음성 (voice.mp3)</span><span ' + badge(hasAudio) + '> 음성</span></div>\n' +
'<div class="file-row"><span class="file-name">자막 (captions.json)</span><span ' + badge(hasCaptions) + '> 자막</span></div>\n' +
'<div class="file-row"><span class="file-name">영상 (video.mp4)</span><span ' + badge(hasVideo) + '> 영상</span></div>\n' +
'</div>\n' +
'<div class="renders-card"><div class="card-title">최근 렌더 (' + rendered.length + '개)</div>\n' +
renderItemsHtml +
'</div>\n' +
'</div>\n' +  // grid2
'</main>\n' +
'<div class="toast" id="toast"></div>\n' +
'<script>\n' +
'var currentEs = null;\n' +
'function startPipeline() {\n' +
'  var topic = document.getElementById("topic-input").value.trim();\n' +
'  if (!topic) { showToast("주제를 입력하세요","err"); return; }\n' +
'  var btn = document.getElementById("btn-start");\n' +
'  btn.disabled = true; btn.innerHTML = \'<span class="spin"></span> 실행 중...\';\n' +
'  var logCard = document.getElementById("log-card");\n' +
'  var logLines = document.getElementById("log-lines");\n' +
'  logCard.className = "log-card show"; logLines.textContent = "";\n' +
'  ["script","tts","whisper","captions","render"].forEach(function(s){\n' +
'    document.getElementById("step-"+s).className = "step-circle";\n' +
'    document.getElementById("msg-"+s).textContent = "대기";\n' +
'  });\n' +
'  fetch("/pipeline",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({topic:topic})})\n' +
'  .then(function(r){return r.json();})\n' +
'  .then(function(data){\n' +
'    if (data.error) throw new Error(data.error);\n' +
'    appendLog("파이프라인 시작 — job: "+data.jobId);\n' +
'    connectSSE(data.jobId, btn);\n' +
'  })\n' +
'  .catch(function(e){\n' +
'    appendLog("오류: "+e.message); btn.disabled=false; btn.innerHTML="&#9654; 시작";\n' +
'    showToast("시작 실패: "+e.message,"err");\n' +
'  });\n' +
'}\n' +
'function connectSSE(jobId, btn) {\n' +
'  if (currentEs) currentEs.close();\n' +
'  currentEs = new EventSource("/pipeline/"+jobId+"/events");\n' +
'  currentEs.onmessage = function(e) {\n' +
'    var ev; try { ev = JSON.parse(e.data); } catch(_){return;}\n' +
'    if (ev.step === "_close") { currentEs.close(); btn.disabled=false; btn.innerHTML="&#9654; 시작"; return; }\n' +
'    appendLog("["+ev.step+"] "+ev.message);\n' +
'    var stepEl = document.getElementById("step-"+ev.step);\n' +
'    var msgEl  = document.getElementById("msg-"+ev.step);\n' +
'    if (stepEl) {\n' +
'      var isDone = ev.data && ev.data.done;\n' +
'      stepEl.className = "step-circle "+(isDone?"done":"running");\n' +
'      if (msgEl) { msgEl.textContent = ev.message.slice(0,22); }\n' +
'    }\n' +
'    if (ev.step === "done") {\n' +
'      showToast("완료! "+(ev.data&&ev.data.sizeKB?ev.data.sizeKB+"KB":""),"ok");\n' +
'      setTimeout(function(){ location.reload(); }, 2500);\n' +
'    }\n' +
'    if (ev.step === "error") {\n' +
'      showToast("오류: "+ev.message,"err");\n' +
'      ["script","tts","whisper","captions","render"].forEach(function(s){\n' +
'        var el=document.getElementById("step-"+s);\n' +
'        if(el&&el.className.indexOf("running")>=0) el.className="step-circle error";\n' +
'      });\n' +
'      btn.disabled=false; btn.innerHTML="&#9654; 시작";\n' +
'    }\n' +
'  };\n' +
'  currentEs.onerror = function(){ currentEs.close(); btn.disabled=false; btn.innerHTML="&#9654; 시작"; };\n' +
'}\n' +
'function appendLog(msg) {\n' +
'  var el = document.getElementById("log-lines");\n' +
'  el.textContent += msg+"\\n"; el.scrollTop = el.scrollHeight;\n' +
'}\n' +
'function showToast(msg, type) {\n' +
'  var el=document.getElementById("toast");\n' +
'  el.textContent=msg; el.className="toast "+(type||"ok"); el.style.display="block";\n' +
'  clearTimeout(el._t); el._t=setTimeout(function(){el.style.display="none";},4000);\n' +
'}\n' +
'document.getElementById("topic-input").addEventListener("keydown",function(e){if(e.key==="Enter")startPipeline();});\n' +
'</script>\n</body>\n</html>');
});
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n[server-local] http://localhost:${PORT}`);
});
