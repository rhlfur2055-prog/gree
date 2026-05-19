// clips-editor.js — Vrew 스타일 씬-클립 1:1 편집기
// server-local.js에서 require('./clips-editor')(app, ctx) 로 마운트

'use strict';

const FORBIDDEN_STARTS = [
  '그리고','그래서','그러나','따라서','그러므로','그런데','하지만',
  '또한','또','이고','이며','입니다','인데','이다','그래','근데',
];

const SECTION_COLORS = {
  hook:     '#ef4444',
  setup:    '#f59e0b',
  reveal:   '#3b82f6',
  cause:    '#8b5cf6',
  solution: '#22c55e',
  cta:      '#06b6d4',
};

function sectionByRatio(i, total) {
  const r = i / Math.max(1, total - 1);
  if (r < 0.10) return 'hook';
  if (r < 0.30) return 'setup';
  if (r < 0.55) return 'reveal';
  if (r < 0.75) return 'cause';
  if (r < 0.92) return 'solution';
  return 'cta';
}

module.exports = function mountClipsEditor(app, { SHORTS_LOG, path, fs }) {

  function todayDate() { return new Date().toISOString().slice(0, 10); }
  function capsPath(d) { return path.join(SHORTS_LOG, `${d}_captions.json`); }
  function scriptPath(d) { return path.join(SHORTS_LOG, `${d}_script_result.json`); }
  function audioPath(d) { return path.join(SHORTS_LOG, `${d}_voice.mp3`); }
  function videoPath(d) { return path.join(SHORTS_LOG, `${d}_video.mp4`); }

  // ── GET /api/clips-data?date= ────────────────────────────────────
  app.get('/api/clips-data', (req, res) => {
    // date 미지정 시 captions.json이 있는 가장 최근 날짜 자동 탐지
    let d = req.query.date;
    if (!d) {
      try {
        const files = fs.readdirSync(SHORTS_LOG)
          .filter(f => f.endsWith('_captions.json')).sort().reverse();
        d = files.length ? files[0].replace('_captions.json', '') : todayDate();
      } catch { d = todayDate(); }
    }
    const cp = capsPath(d);
    if (!fs.existsSync(cp))
      return res.status(404).json({ error: `captions.json 없음 (${d})` });

    let caps = [], title = '';
    try {
      const raw = JSON.parse(fs.readFileSync(cp, 'utf8'));
      caps  = raw.captions || [];
      title = raw.script_title || '';
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }

    let sections = [];
    const sp = scriptPath(d);
    if (fs.existsSync(sp)) {
      try {
        const sc = JSON.parse(fs.readFileSync(sp, 'utf8'));
        title    = title || sc.title || '';
        sections = sc.subtitle_segments || [];
      } catch {}
    }

    const clips = caps.map((c, i) => {
      const midMs = (c.startMs + c.endMs) / 2;
      const seg   = sections.find(s =>
        midMs >= (s.start || 0) * 1000 && midMs < (s.end || 99999) * 1000
      );
      return {
        id: i,
        text: c.text || '',
        tts_text: seg?.tts_text || c.text || '',
        words: c.words || [],
        startMs: c.startMs || 0,
        endMs:   c.endMs   || 0,
        isHighlight: c.isHighlight || false,
        section: seg?.section || sectionByRatio(i, caps.length),
        effect:  seg?.effect  || 'terminal-type',
        highlight_keywords: seg?.highlight_keywords || [],
      };
    });

    const totalMs = clips.length ? clips[clips.length - 1].endMs : 0;
    const hasAudio = fs.existsSync(audioPath(d));
    const hasVideo = fs.existsSync(videoPath(d));
    res.json({
      date: d, title, clips, totalMs, hasAudio, hasVideo,
      audioUrl: `/api/clips-audio/${d}`,
      videoUrl: `/shorts/${d}_video.mp4`,
    });
  });

  // ── POST /api/clips-save ─────────────────────────────────────────
  app.post('/api/clips-save', (req, res) => {
    const { date, clips } = req.body;
    if (!Array.isArray(clips)) return res.status(400).json({ error: 'clips[] 필수' });
    const d  = date || todayDate();
    const cp = capsPath(d);

    // captions.json 재기록
    let raw = {};
    if (fs.existsSync(cp)) {
      try { raw = JSON.parse(fs.readFileSync(cp, 'utf8')); } catch {}
    }
    raw.captions = clips.map((c, i) => ({
      index: i, text: c.text, startMs: c.startMs, endMs: c.endMs,
      isHighlight: !!c.isHighlight, words: c.words || [],
    }));
    fs.writeFileSync(cp, JSON.stringify(raw, null, 2));

    // script_result.json subtitle_segments 재구성
    const sp = scriptPath(d);
    if (fs.existsSync(sp)) {
      try {
        const sc = JSON.parse(fs.readFileSync(sp, 'utf8'));
        sc.subtitle_segments = clips.map((c, i) => ({
          section: c.section || sectionByRatio(i, clips.length),
          text:    c.text,
          tts_text: c.tts_text || c.text,
          start:   +(c.startMs / 1000).toFixed(2),
          end:     +(c.endMs   / 1000).toFixed(2),
          highlight_keywords: c.highlight_keywords || [],
          effect: c.effect || 'terminal-type',
        }));
        if (clips.length)
          sc.estimated_total_seconds = Math.ceil(clips[clips.length - 1].endMs / 1000);
        fs.writeFileSync(sp, JSON.stringify(sc, null, 2));
      } catch (e) {
        console.warn('[clips-save] script update failed:', e.message);
      }
    }
    res.json({ status: 'ok', count: clips.length });
  });

  // ── POST /api/clips-remove-silence ──────────────────────────────
  app.post('/api/clips-remove-silence', (req, res) => {
    const { date, thresholdMs = 400, paddingMs = 50 } = req.body;
    const d  = date || todayDate();
    const cp = capsPath(d);
    if (!fs.existsSync(cp)) return res.status(404).json({ error: 'captions.json 없음' });

    const raw  = JSON.parse(fs.readFileSync(cp, 'utf8'));
    const orig = (raw.captions || []).slice();
    let offset = 0, removed = 0;

    const adjusted = orig.map((c, i) => {
      const c2 = { ...c, startMs: c.startMs - offset, endMs: c.endMs - offset };
      if (i < orig.length - 1) {
        const gap = orig[i + 1].startMs - c.endMs;
        if (gap > thresholdMs) { offset += gap - paddingMs; removed++; }
      }
      return c2;
    });

    raw.captions = adjusted;
    fs.writeFileSync(cp, JSON.stringify(raw, null, 2));
    res.json({ status: 'ok', removed, clips: adjusted });
  });

  // ── GET /api/clips-audio/:date — 날짜별 voice.mp3 서빙 ─────────
  app.get('/api/clips-audio/:date', (req, res) => {
    const d  = path.basename(req.params.date).replace(/[^0-9-]/g, '');
    const p  = path.join(SHORTS_LOG, `${d}_voice.mp3`);
    if (!fs.existsSync(p)) return res.status(404).end();
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Accept-Ranges', 'bytes');
    res.sendFile(p);
  });

  // ── DELETE /api/clips-delete?date= ─────────────────────────────
  app.delete('/api/clips-delete', (req, res) => {
    const d = (req.query.date || '').replace(/[^0-9-]/g, '');
    if (!d) return res.status(400).json({ error: 'date 필수' });
    const exts = ['_captions.json', '_script_result.json', '_voice.mp3', '_video.mp4', '_tts_words.json'];
    let deleted = 0;
    exts.forEach(ext => {
      const p = path.join(SHORTS_LOG, `${d}${ext}`);
      if (fs.existsSync(p)) { fs.unlinkSync(p); deleted++; }
    });
    res.json({ status: 'ok', deleted });
  });

  // ── GET /clips — Vrew 스타일 편집기 UI ──────────────────────────
  app.get('/clips', (_req, res) => {
    res.send(CLIPS_HTML);
  });
};

// ── HTML ─────────────────────────────────────────────────────────
const CLIPS_HTML = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Shorts Studio</title>
<style>
:root{
  --bg0:#0a0a0a;--bg1:#111;--bg2:#181818;--bg3:#222;
  --border:#252525;--border2:#333;
  --text1:#f0f0f0;--text2:#888;--text3:#444;
  --accent:#3b82f6;--red:#ef4444;--green:#22c55e;--amber:#f59e0b;--purple:#8b5cf6;--cyan:#06b6d4;
}
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;background:var(--bg0);color:var(--text1);font-family:'Pretendard','Noto Sans KR',system-ui,sans-serif;overflow:hidden}
body{display:flex;flex-direction:column}

/* ── Vrew 스타일 최상단 툴바 ── */
.vrew-bar{height:50px;background:var(--bg1);border-bottom:1px solid var(--border);display:flex;align-items:center;gap:0;flex-shrink:0;user-select:none}
.vb-brand{display:flex;align-items:center;gap:6px;padding:0 16px;font-size:13px;font-weight:800;color:var(--text1);border-right:1px solid var(--border);height:100%}
.vb-brand span{font-size:9px;font-weight:700;background:#6d28d9;color:#e9d5ff;padding:2px 6px;border-radius:4px;letter-spacing:.06em}
.vb-group{display:flex;align-items:center;gap:1px;padding:0 8px;height:100%;border-right:1px solid var(--border)}
.vb-btn{display:inline-flex;flex-direction:column;align-items:center;gap:2px;border:none;background:transparent;color:var(--text2);cursor:pointer;padding:6px 10px;border-radius:5px;transition:.1s;font-size:9px;font-family:inherit;white-space:nowrap;height:44px;justify-content:center}
.vb-btn .icon{font-size:16px;line-height:1}
.vb-btn:hover{background:var(--bg3);color:var(--text1)}
.vb-btn:disabled{opacity:.35;cursor:not-allowed}
.vb-btn.active{color:var(--accent)}
.vb-sep{width:1px;height:24px;background:var(--border);margin:0 4px;flex-shrink:0}
.vb-spacer{flex:1}
.vb-right{display:flex;align-items:center;gap:6px;padding:0 12px}
.btn-save{background:var(--accent);color:#fff;border:none;border-radius:6px;padding:6px 14px;font-size:11px;font-weight:700;cursor:pointer;transition:.1s;font-family:inherit}
.btn-save:hover{background:#2563eb}
.btn-render{background:#14532d;color:var(--green);border:1px solid #166534;border-radius:6px;padding:6px 14px;font-size:11px;font-weight:700;cursor:pointer;transition:.1s;font-family:inherit}
.btn-render:hover{background:#166534;color:#fff}
.btn-render:disabled{opacity:.4;cursor:not-allowed}

/* ── 본문 2패널 ── */
.studio-body{flex:1;display:flex;min-height:0;overflow:hidden}

/* ── 왼쪽: 플레이어 패널 (Vrew 스타일) ── */
.player-panel{width:230px;flex-shrink:0;border-right:1px solid var(--border);display:flex;flex-direction:column;background:var(--bg1);overflow:hidden}
.player-wrap{padding:12px 12px 0;flex-shrink:0}
.player-screen{width:100%;aspect-ratio:9/16;background:#000;border-radius:8px;border:1px solid var(--border2);overflow:hidden;position:relative;max-height:240px;display:flex;align-items:center;justify-content:center}
.player-screen video{width:100%;height:100%;object-fit:contain}
.player-screen .no-video{color:var(--text3);font-size:11px;text-align:center;padding:20px}
.player-controls{display:flex;align-items:center;gap:8px;padding:8px 12px;border-top:1px solid var(--border);flex-shrink:0}
.play-btn{width:32px;height:32px;border-radius:50%;background:var(--accent);border:none;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:12px;flex-shrink:0;transition:.1s}
.play-btn:hover{background:#2563eb}
.time-disp{font-size:11px;font-family:monospace;color:var(--green);font-weight:700}
.player-info{padding:8px 12px;border-top:1px solid var(--border);flex-shrink:0}
.player-project{font-size:10px;font-weight:700;color:var(--text2);margin-bottom:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.player-title{font-size:12px;font-weight:600;color:var(--text1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

/* ── 오른쪽: 편집 패널 ── */
.edit-panel{flex:1;min-width:0;display:flex;flex-direction:column;overflow:hidden;background:var(--bg0)}

/* ── 생성 모드 (CapCut 스타일) ── */
.gen-mode{flex:1;display:flex;flex-direction:column;overflow-y:auto;padding:32px 48px 80px}
.gen-hero{text-align:center;margin-bottom:32px}
.gen-hero h1{font-size:28px;font-weight:800;color:var(--text1);margin-bottom:8px;letter-spacing:-.02em}
.gen-hero p{font-size:13px;color:var(--text2)}
.gen-input-wrap{background:var(--bg2);border:1px solid var(--border2);border-radius:12px;padding:16px;margin-bottom:24px;transition:.1s}
.gen-input-wrap:focus-within{border-color:var(--accent)}
.gen-input{width:100%;background:transparent;border:none;color:var(--text1);font-size:14px;font-family:inherit;resize:none;outline:none;min-height:60px;line-height:1.6}
.gen-input::placeholder{color:var(--text3)}
.gen-input-footer{display:flex;align-items:center;gap:8px;margin-top:10px;border-top:1px solid var(--border);padding-top:10px}
.gen-mode-sel{background:var(--bg3);color:var(--text2);border:1px solid var(--border2);border-radius:6px;padding:5px 10px;font-size:11px;font-family:inherit;outline:none;cursor:pointer}
.gen-mode-sel:focus{border-color:var(--accent);color:var(--text1)}
.gen-go{display:flex;align-items:center;gap:6px;background:var(--accent);color:#fff;border:none;border-radius:8px;padding:8px 18px;font-size:13px;font-weight:700;cursor:pointer;margin-left:auto;transition:.1s;font-family:inherit}
.gen-go:hover{background:#2563eb}
.gen-go:disabled{background:#1c3557;color:#3b6ea8;cursor:not-allowed}

/* ── 파이프라인 진행 ── */
.pipeline-progress{background:var(--bg2);border:1px solid var(--border2);border-radius:10px;padding:16px;margin-bottom:20px}
.pp-title{font-size:12px;font-weight:700;color:var(--text2);margin-bottom:10px;text-transform:uppercase;letter-spacing:.06em}
.pp-steps{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px}
.pp-step{display:flex;align-items:center;gap:5px;background:var(--bg3);border-radius:6px;padding:4px 10px;font-size:11px;color:var(--text2)}
.pp-step.done{color:var(--green)}.pp-step.running{color:var(--amber)}.pp-step.error{color:var(--red)}
.pp-log{font-size:10px;font-family:monospace;color:var(--text3);max-height:80px;overflow-y:auto;line-height:1.5}

/* ── 최근 프로젝트 ── */
.recent-title{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:var(--text3);margin-bottom:12px}
.recent-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px}
.recent-card{background:var(--bg2);border:1px solid var(--border);border-radius:8px;overflow:hidden;cursor:pointer;transition:.1s}
.recent-card:hover{border-color:var(--accent);transform:translateY(-1px)}
.recent-thumb{aspect-ratio:9/16;background:#000;position:relative;overflow:hidden;max-height:120px}
.recent-thumb video,.recent-thumb img{width:100%;height:100%;object-fit:cover}
.recent-thumb .no-thumb{display:flex;align-items:center;justify-content:height:100%;color:var(--text3);font-size:20px}
.recent-del{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(239,68,68,0.85);color:#fff;border:none;border-radius:50%;width:32px;height:32px;font-size:14px;cursor:pointer;display:none;align-items:center;justify-content:center;z-index:10;transition:.15s;backdrop-filter:blur(2px)}
.recent-card:hover .recent-del{display:flex}
.recent-del:hover{background:#dc2626;transform:translate(-50%,-50%) scale(1.15)}
.recent-info{padding:8px}
.recent-date{font-size:9px;color:var(--text3);margin-bottom:2px}
.recent-name{font-size:11px;font-weight:600;color:var(--text1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

/* ── 편집 모드 클립 리스트 ── */
.edit-mode{flex:1;display:flex;flex-direction:column;overflow:hidden}
.scene-bar{display:flex;align-items:center;gap:8px;padding:8px 20px;border-bottom:1px solid var(--border);flex-shrink:0;background:var(--bg1)}
.scene-label{font-size:13px;font-weight:800;color:var(--text1)}
.scene-dur{margin-left:auto;font-size:11px;color:var(--text3);font-family:monospace}
.clips-scroll{flex:1;overflow-y:auto;padding:4px 0 60px}

/* ── Vrew 클립 행 ── */
.clip-row{display:flex;align-items:stretch;border-bottom:1px solid var(--border);background:var(--bg0);cursor:pointer;transition:.08s;position:relative}
.clip-row:hover{background:var(--bg2)}
.clip-row.active{background:#0f1f38;border-left:2px solid var(--accent)}
.clip-row.warn{border-left:2px solid var(--red)}
.clip-check{width:36px;flex-shrink:0;display:flex;align-items:center;justify-content:center}
.clip-check input[type=checkbox]{width:14px;height:14px;accent-color:var(--accent);cursor:pointer}
.clip-num{width:28px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:12px;color:var(--text3);font-weight:700}
.clip-icon{width:48px;flex-shrink:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;padding:8px 0;color:var(--text3)}
.clip-icon .ci-icon{font-size:18px}
.clip-icon .ci-label{font-size:8px;letter-spacing:.04em}
.clip-content{flex:1;min-width:0;padding:10px 8px}
.clip-words{display:flex;flex-wrap:wrap;gap:3px;margin-bottom:8px;align-items:center}
.word-chip{display:inline-flex;align-items:center;background:var(--bg3);border:1px solid var(--border2);border-radius:4px;padding:1px 6px;font-size:11px;color:var(--text2);transition:.08s}
.word-chip.hi{color:#fbbf24;border-color:#78350f;background:#1a1200}
.word-unknown{display:inline-flex;align-items:center;background:#1a1a1a;border:1px dashed var(--border2);border-radius:4px;padding:1px 6px;font-size:11px;color:var(--text3)}
.split-pt{width:8px;height:20px;background:transparent;border:none;cursor:col-resize;color:transparent;font-size:8px;display:inline-flex;align-items:center;justify-content:center;padding:0;transition:.1s;font-family:inherit;border-radius:2px}
.clip-words:hover .split-pt{color:var(--border2)}
.split-pt:hover{color:var(--accent)!important;background:rgba(59,130,246,.15)}
.clip-subtitle-row{display:flex;align-items:center;gap:6px}
.clip-sub-icon{font-size:11px;color:var(--text3);flex-shrink:0}
.clip-subtitle{flex:1;background:transparent;border:none;color:var(--text1);font-size:13px;font-weight:500;outline:none;padding:0;font-family:inherit;cursor:text}
.clip-subtitle:focus{color:#fff}
.clip-warn-mark{font-size:10px;color:var(--red);flex-shrink:0}
.clip-meta{display:flex;align-items:center;gap:6px;margin-top:6px}
.clip-time-btn{font-size:10px;color:var(--text3);background:none;border:none;cursor:pointer;font-family:monospace;padding:0;transition:.1s}
.clip-time-btn:hover{color:var(--accent)}
.clip-section-badge{font-size:9px;font-weight:800;text-transform:uppercase;border-radius:3px;padding:1px 5px}
.clip-thumb{width:60px;flex-shrink:0;display:flex;align-items:center;justify-content:center;padding:4px;border-left:1px solid var(--border)}
.clip-thumb-inner{width:52px;aspect-ratio:9/16;background:var(--bg2);border-radius:4px;overflow:hidden;position:relative;display:flex;align-items:flex-end;justify-content:center}
.clip-thumb-dur{position:absolute;bottom:2px;left:0;right:0;text-align:center;font-size:8px;font-family:monospace;color:#fff;background:rgba(0,0,0,.6);padding:1px}
.clip-actions-col{width:32px;flex-shrink:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;padding:4px;border-left:1px solid var(--border)}
.ca-btn{width:24px;height:24px;border:none;background:transparent;color:var(--text3);cursor:pointer;border-radius:4px;font-size:11px;display:flex;align-items:center;justify-content:center;transition:.1s}
.ca-btn:hover{background:var(--bg3);color:var(--text1)}
.ca-btn.del:hover{background:#450a0a;color:var(--red)}

/* ── + 클립 추가 ── */
.add-clip-zone{display:flex;align-items:center;justify-content:center;padding:3px 20px}
.add-clip-btn{flex:1;background:transparent;border:1px dashed var(--border);border-radius:5px;color:var(--text3);font-size:11px;padding:4px;cursor:pointer;transition:.1s;font-family:inherit}
.add-clip-btn:hover{border-color:var(--accent);color:var(--accent)}

/* ── 시간 모달 ── */
.time-modal{position:fixed;inset:0;background:rgba(0,0,0,.7);display:none;align-items:center;justify-content:center;z-index:300}
.time-modal.show{display:flex}
.time-panel{background:var(--bg2);border:1px solid var(--border2);border-radius:12px;padding:20px;min-width:260px}
.time-panel h3{font-size:13px;margin-bottom:12px}
.tf{display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:11px;color:var(--text2)}
.tf span{width:60px;flex-shrink:0}
.tf input{flex:1;background:var(--bg0);border:1px solid var(--border2);color:var(--text1);border-radius:5px;padding:5px 8px;font-size:12px;font-family:monospace;outline:none}
.tf input:focus{border-color:var(--accent)}
.modal-btns{display:flex;gap:8px;justify-content:flex-end;margin-top:14px}
.mbtn{border:none;border-radius:6px;padding:6px 14px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit}
.mbtn-cancel{background:var(--bg3);color:var(--text2)}
.mbtn-ok{background:var(--accent);color:#fff}

/* ── 푸터 (편집 모드) ── */
.edit-footer{position:fixed;bottom:0;left:230px;right:0;height:44px;background:var(--bg1);border-top:1px solid var(--border);display:flex;align-items:center;gap:10px;padding:0 16px;z-index:100;font-size:11px;color:var(--text2)}
.edit-footer b{color:var(--text1)}
.ef-warn{color:var(--red);font-weight:700}

/* ── 토스트 ── */
.toast{position:fixed;bottom:60px;left:50%;transform:translateX(-50%);background:#1e293b;border:1px solid #334155;color:#f1f5f9;padding:8px 18px;border-radius:8px;font-size:12px;font-weight:600;z-index:400;opacity:0;pointer-events:none;transition:opacity .2s;white-space:nowrap}
.toast.show{opacity:1}

/* ── 통계 바 ── */
.stats-bar{height:26px;background:var(--bg1);border-bottom:1px solid var(--border);display:flex;align-items:center;gap:16px;padding:0 20px;flex-shrink:0;font-size:10px;color:var(--text2)}
.stats-bar b{color:var(--text1)}
</style>
</head>
<body>

<!-- ── Vrew 스타일 툴바 ── -->
<div class="vrew-bar">
  <div class="vb-brand">🎬 <span>STUDIO</span></div>

  <div class="vb-group">
    <button class="vb-btn" onclick="switchToGen()" title="새 AI 영상 만들기">
      <span class="icon">✦</span>새 AI 영상
    </button>
    <button class="vb-btn" onclick="openProjectPicker()" title="최근 프로젝트 열기">
      <span class="icon">📂</span>프로젝트 열기
    </button>
  </div>

  <div class="vb-group" id="edit-tools">
    <button class="vb-btn" id="btn-merge-up" onclick="mergeSelected()" disabled title="선택 클립을 위 클립과 병합">
      <span class="icon">⤵</span>클립 합치기
    </button>
    <button class="vb-btn" onclick="splitAtChecked()" disabled id="btn-split" title="단어 칩 클릭 후 분할">
      <span class="icon">✂</span>클립 나누기
    </button>
    <div class="vb-sep"></div>
    <button class="vb-btn" onclick="removeSilence()" title="무음 구간 제거">
      <span class="icon">⟨⟩</span>무음구간 줄이기
    </button>
  </div>

  <div class="vb-spacer"></div>
  <div class="vb-right">
    <div id="status-chip" style="font-size:10px;color:var(--text3)"></div>
    <button class="btn-save" onclick="saveClips()">저장</button>
    <button class="btn-render" id="btn-render" onclick="renderNow()">렌더 내보내기</button>
  </div>
</div>

<!-- ── 통계 바 ── -->
<div class="stats-bar" id="stats-bar" style="display:none">
  클립: <b id="st-count">-</b>&nbsp;&nbsp;총 길이: <b id="st-dur">-</b>
  &nbsp;&nbsp;<span id="st-warn"></span>
</div>

<!-- ── 본문 ── -->
<div class="studio-body">

  <!-- 왼쪽: 플레이어 -->
  <div class="player-panel">
    <div class="player-wrap">
      <div class="player-screen" id="player-screen">
        <video id="preview-video" preload="metadata"></video>
        <div class="no-video" id="no-video-msg">영상 없음</div>
      </div>
    </div>
    <audio id="main-audio" preload="none"></audio>
    <div class="player-controls">
      <button class="play-btn" onclick="togglePlay()" id="play-btn">▶</button>
      <span class="time-disp" id="time-disp">0:00</span>
    </div>
    <div class="player-info">
      <div class="player-project" id="player-date">-</div>
      <div class="player-title" id="player-title">프로젝트 없음</div>
    </div>
  </div>

  <!-- 오른쪽: 편집/생성 패널 -->
  <div class="edit-panel">

    <!-- 생성 모드 -->
    <div class="gen-mode" id="gen-mode">
      <div class="gen-hero">
        <h1>새 AI 영상 만들기</h1>
        <p>주제 입력 → n8n이 대본·TTS·렌더까지 자동 실행합니다</p>
      </div>
      <div class="gen-input-wrap">
        <textarea class="gen-input" id="topic-input" rows="3"
          placeholder="예: AI 할루시네이션 왜 생기나, n8n 자동화 실전, GPT-4o 이미지 생성 한계..."></textarea>
        <div class="gen-input-footer">
          <select class="gen-mode-sel" id="pipeline-mode">
            <option value="cinematic">🎬 Cinematic</option>
            <option value="meme">😂 Meme</option>
            <option value="news">📰 News</option>
          </select>
          <button class="gen-go" id="gen-btn" onclick="startGenerate()">
            <span>↑</span> 생성 시작
          </button>
        </div>
      </div>

      <!-- 파이프라인 진행 -->
      <div class="pipeline-progress" id="pp" style="display:none">
        <div class="pp-title">파이프라인 실행 중...</div>
        <div class="pp-steps" id="pp-steps"></div>
        <div class="pp-log" id="pp-log"></div>
      </div>

      <!-- 최근 프로젝트 -->
      <div class="recent-title">최근 프로젝트</div>
      <div class="recent-grid" id="recent-grid">
        <div style="color:var(--text3);font-size:11px">로딩 중...</div>
      </div>
    </div>

    <!-- 편집 모드 -->
    <div class="edit-mode" id="edit-mode" style="display:none">
      <div class="scene-bar">
        <span class="scene-label">씬 1</span>
        <span class="scene-dur" id="scene-dur">-</span>
      </div>
      <div class="clips-scroll" id="clips-scroll"></div>
    </div>

    <!-- 편집 모드 푸터 -->
    <div class="edit-footer" id="edit-footer" style="display:none">
      <span>클립 <b id="ef-count">-</b>개</span>
      <span>총 <b id="ef-dur">-</b>초</span>
      <span id="ef-warn"></span>
      <span style="flex:1"></span>
      <button style="background:var(--bg3);color:var(--text2);border:1px solid var(--border2);border-radius:5px;padding:4px 10px;font-size:10px;cursor:pointer;font-family:inherit" onclick="switchToGen()">← 새 영상</button>
    </div>
  </div>
</div>

<!-- 시간 모달 -->
<div class="time-modal" id="time-modal">
  <div class="time-panel">
    <h3>시간 조절</h3>
    <div class="tf"><span>시작 (ms)</span><input type="number" id="t-start" step="10"></div>
    <div class="tf"><span>종료 (ms)</span><input type="number" id="t-end" step="10"></div>
    <div class="modal-btns">
      <button class="mbtn mbtn-cancel" onclick="closeTimeModal()">취소</button>
      <button class="mbtn mbtn-ok" onclick="applyTime()">적용</button>
    </div>
  </div>
</div>

<div class="toast" id="toast"></div>

<script>
// ── 상태 ──────────────────────────────────────────────────────────
const SECTION_COLORS={hook:'#ef4444',setup:'#f59e0b',reveal:'#3b82f6',cause:'#8b5cf6',solution:'#22c55e',cta:'#06b6d4'};
const FORBIDDEN=['그리고','그래서','그러나','따라서','그러므로','그런데','하지만','또한','또','이고','이며','입니다','인데','이다','그래','근데'];
let clips=[], currentDate='', timeModalIdx=-1;
const audio=document.getElementById('main-audio');
const video=document.getElementById('preview-video');
const playBtn=document.getElementById('play-btn');
const timeDisp=document.getElementById('time-disp');

// ── 초기화 ────────────────────────────────────────────────────────
(async function init(){
  await loadRecent();
  // 최근 clips가 있으면 자동으로 편집 모드로 전환
  const r=await fetch('/api/clips-data').catch(()=>null);
  if(r && r.ok){
    const d=await r.json();
    if(d.clips && d.clips.length){
      loadClipsData(d);
      return;
    }
  }
  // 없으면 생성 모드 유지
})();

// ── 최근 프로젝트 로드 ─────────────────────────────────────────────
async function loadRecent(){
  try{
    const r=await fetch('/files');
    const files=(await r.json()).filter(f=>f.name.endsWith('.mp4')).slice(0,8);
    const grid=document.getElementById('recent-grid');
    if(!files.length){grid.innerHTML='<div style="color:var(--text3);font-size:11px">아직 영상이 없습니다</div>';return;}
    grid.innerHTML=files.map(f=>{
      const name=f.name.replace('.mp4','');
      const date=name.slice(0,10)||name;
      return \`<div class="recent-card" onclick="openProject('\${date}')">
        <div class="recent-thumb">
          <video src="/file/\${f.name}" preload="none" style="width:100%;height:100%;object-fit:cover"></video>
          <div class="no-thumb" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center">🎬</div>
          <button class="recent-del" onclick="deleteProject(event,'\${date}')">🗑</button>
        </div>
        <div class="recent-info">
          <div class="recent-date">\${date}</div>
          <div class="recent-name">\${esc(name.slice(11)||name)}</div>
        </div>
      </div>\`;
    }).join('');
  }catch(e){document.getElementById('recent-grid').innerHTML='<div style="color:var(--text3);font-size:11px">로드 실패</div>';}
}

// ── 프로젝트 삭제 ──────────────────────────────────────────────────
async function deleteProject(e, date){
  e.stopPropagation();
  if(!confirm(date+' 프로젝트를 삭제할까요?\n(관련 파일이 모두 삭제됩니다)'))return;
  try{
    const r=await fetch('/api/clips-delete?date='+date,{method:'DELETE'});
    if(!r.ok)throw new Error(await r.text());
    toast('삭제 완료: '+date);
    loadRecent();
  }catch(er){toast('삭제 실패: '+er.message);}
}

// ── 프로젝트 열기 ──────────────────────────────────────────────────
async function openProject(date){
  const url='/api/clips-data'+(date?'?date='+date:'');
  try{
    const r=await fetch(url);
    if(!r.ok)throw new Error(await r.text());
    const d=await r.json();
    loadClipsData(d);
  }catch(e){toast('프로젝트 열기 실패: '+e.message);}
}

function openProjectPicker(){
  const d=prompt('날짜 입력 (YYYY-MM-DD)', currentDate||new Date().toISOString().slice(0,10));
  if(d) openProject(d);
}

function loadClipsData(d){
  currentDate=d.date||'';
  clips=d.clips||[];
  document.getElementById('player-date').textContent=d.date||'';
  document.getElementById('player-title').textContent=d.title||'(제목 없음)';
  // 비디오/오디오 세팅
  if(d.videoUrl){
    video.src=d.videoUrl;
    video.style.display='';
    document.getElementById('no-video-msg').style.display='none';
  }
  if(d.audioUrl){audio.src=d.audioUrl;audio.load();}
  switchToEdit();
}

// ── 모드 전환 ──────────────────────────────────────────────────────
function switchToGen(){
  document.getElementById('gen-mode').style.display='';
  document.getElementById('edit-mode').style.display='none';
  document.getElementById('edit-footer').style.display='none';
  document.getElementById('stats-bar').style.display='none';
  loadRecent();
}

function switchToEdit(){
  document.getElementById('gen-mode').style.display='none';
  document.getElementById('edit-mode').style.display='flex';
  document.getElementById('edit-footer').style.display='flex';
  document.getElementById('stats-bar').style.display='flex';
  renderClipList();
  updateStats();
}

// ── AI 영상 생성 ───────────────────────────────────────────────────
async function startGenerate(){
  const topic=document.getElementById('topic-input').value.trim();
  if(!topic){toast('주제를 입력하세요');document.getElementById('topic-input').focus();return;}
  const mode=document.getElementById('pipeline-mode').value;
  document.getElementById('gen-btn').disabled=true;
  const pp=document.getElementById('pp');
  pp.style.display='';
  document.getElementById('pp-steps').innerHTML='';
  document.getElementById('pp-log').innerHTML='';

  try{
    const r=await fetch('/pipeline',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({topic,mode})});
    const j=await r.json();
    if(!j.jobId){throw new Error(j.error||JSON.stringify(j));}
    trackPipeline(j.jobId);
  }catch(e){
    toast('생성 실패: '+e.message);
    document.getElementById('gen-btn').disabled=false;
    pp.style.display='none';
  }
}

function trackPipeline(jobId){
  const stepsEl=document.getElementById('pp-steps');
  const logEl=document.getElementById('pp-log');
  const STEP_LABELS={script:'📝 대본',tts:'🔊 TTS',whisper:'👂 자막',captions:'📋 캡션',render:'🎬 렌더'};
  const stepState={};

  const es=new EventSource('/pipeline/'+jobId+'/events');
  es.onmessage=function(e){
    const ev=JSON.parse(e.data);
    if(ev.step==='_close'){es.close();return;}
    // 스텝 업데이트
    if(ev.step && STEP_LABELS[ev.step]){
      stepState[ev.step]=ev.data?.done?'done':'running';
      stepsEl.innerHTML=Object.entries(STEP_LABELS).map(([k,v])=>{
        const s=stepState[k]||'pending';
        const icon=s==='done'?'✓':s==='running'?'⟳':'○';
        return \`<div class="pp-step \${s}">\${icon} \${v}</div>\`;
      }).join('');
    }
    if(ev.message){
      const line=document.createElement('div');
      line.textContent=ev.message;
      logEl.appendChild(line);
      logEl.scrollTop=logEl.scrollHeight;
    }
    if(ev.step==='done'){
      es.close();
      toast('생성 완료! 클립 편집 모드로 이동합니다');
      setTimeout(()=>openProject(''),1000);
      document.getElementById('gen-btn').disabled=false;
    }
    if(ev.step==='error'){
      es.close();
      toast('오류: '+(ev.message||'알 수 없는 오류'));
      document.getElementById('gen-btn').disabled=false;
    }
  };
  es.onerror=()=>{es.close();document.getElementById('gen-btn').disabled=false;};
}

// ── 클립 렌더 ──────────────────────────────────────────────────────
function renderClipList(){
  const el=document.getElementById('clips-scroll');
  if(!clips.length){
    el.innerHTML='<div style="color:var(--text3);padding:40px;text-align:center;font-size:13px">클립이 없습니다</div>';
    return;
  }
  const totalMs=clips[clips.length-1].endMs;
  document.getElementById('scene-dur').textContent='00:00 + '+(totalMs/1000).toFixed(1)+'초';

  let html='';
  clips.forEach((c,i)=>{
    const sec=c.section||'hook';
    const col=SECTION_COLORS[sec]||'#888';
    const dur=((c.endMs-c.startMs)/1000).toFixed(2);
    const isForbidden=FORBIDDEN.some(w=>(c.text||'').startsWith(w));
    const warnCls=isForbidden?' warn':'';

    const chips=(c.words||[]).map((w,wi)=>{
      const isHi=(c.highlight_keywords||[]).some(k=>(w.text||'').toLowerCase().includes(k.toLowerCase()));
      const chip=\`<span class="word-chip\${isHi?' hi':''}">\${esc(w.text)}</span>\`;
      const splitBtn=wi<(c.words||[]).length-1
        ?\`<button class="split-pt" title="여기서 분할" onclick="event.stopPropagation();splitClip(\${i},\${wi+1})">|</button>\`
        :'';
      return chip+splitBtn;
    }).join('');

    html+=\`<div class="clip-row\${warnCls}" data-id="\${i}" id="clip-\${i}" onclick="onClipClick(event,\${i})">
  <div class="clip-check" onclick="event.stopPropagation()"><input type="checkbox" id="chk-\${i}" onchange="onCheck()"></div>
  <div class="clip-num">\${i+1}</div>
  <div class="clip-icon"><span class="ci-icon">🎬</span><span class="ci-label">영상편집</span></div>
  <div class="clip-content">
    <div class="clip-words" id="words-\${i}">\${chips||'<span style="color:var(--text3);font-size:10px">단어 없음</span>'}</div>
    <div class="clip-subtitle-row">
      <span class="clip-sub-icon">≡</span>
      <input class="clip-subtitle" value="\${esc(c.text)}" onclick="event.stopPropagation()"
        oninput="clips[\${i}].text=this.value;updateStats()">
      \${isForbidden?'<span class="clip-warn-mark" title="접속어로 시작">⚠</span>':''}
    </div>
    <div class="clip-meta">
      <button class="clip-time-btn" onclick="event.stopPropagation();openTimeModal(\${i})">\${msToTime(c.startMs)} + \${dur}초</button>
      <span class="clip-section-badge" style="background:\${col}22;color:\${col}">\${sec}</span>
    </div>
  </div>
  <div class="clip-thumb">
    <div class="clip-thumb-inner">
      <div style="font-size:16px;width:100%;text-align:center;padding-top:8px">\${sec==='hook'?'🔥':sec==='cta'?'👋':'📺'}</div>
      <div class="clip-thumb-dur">\${dur}s</div>
    </div>
  </div>
  <div class="clip-actions-col" onclick="event.stopPropagation()">
    \${i>0?\`<button class="ca-btn" title="위와 병합" onclick="mergeWith(\${i})">⤴</button>\`:''}
    <button class="ca-btn del" title="삭제" onclick="deleteClip(\${i})">🗑</button>
  </div>
</div>
<div class="add-clip-zone">
  <button class="add-clip-btn" onclick="insertClip(\${i+1})">+ 클립 추가</button>
</div>\`;
  });
  el.innerHTML=html;
}

// ── 클립 클릭 ─────────────────────────────────────────────────────
function onClipClick(ev,i){
  if(ev.target.closest('.clip-actions-col')||ev.target.closest('.clip-time-btn')||ev.target.closest('.clip-subtitle')) return;
  const c=clips[i];
  // 오디오 시크
  if(c && audio.src){
    audio.currentTime=c.startMs/1000;
    audio.play().catch(()=>{});
  }
  // 비디오 시크
  if(c && video.src) video.currentTime=c.startMs/1000;
  // 행 하이라이트
  document.querySelectorAll('.clip-row').forEach(r=>r.classList.remove('active'));
  document.getElementById('clip-'+i)?.classList.add('active');
}

// ── 체크박스 ──────────────────────────────────────────────────────
function onCheck(){
  const checked=getCheckedIndices();
  document.getElementById('btn-merge-up').disabled=checked.length<1;
  document.getElementById('btn-split').disabled=checked.length<1;
}

function getCheckedIndices(){
  return clips.map((_,i)=>i).filter(i=>document.getElementById('chk-'+i)?.checked);
}

// ── 분할 ─────────────────────────────────────────────────────────
function splitClip(clipIdx,wordIdx){
  const c=clips[clipIdx];
  if(!c||!c.words||wordIdx<=0||wordIdx>=c.words.length)return;
  const w1=c.words.slice(0,wordIdx),w2=c.words.slice(wordIdx);
  const midMs=w2[0].startMs;
  const c1={...c,words:w1,text:w1.map(w=>w.text).join(' '),endMs:midMs};
  const c2={...c,words:w2,text:w2.map(w=>w.text).join(' '),startMs:midMs};
  clips.splice(clipIdx,1,c1,c2);
  reindex();renderClipList();updateStats();toast('✂ 분할 완료');
}

function splitAtChecked(){
  const idx=getCheckedIndices();
  if(idx.length===0){toast('클립을 먼저 체크하세요');return;}
  // 각 선택 클립을 중간 단어에서 분할 (뒤에서부터 처리해야 인덱스 안 밀림)
  idx.sort((a,b)=>b-a).forEach(i=>{
    const c=clips[i];
    if(!c||!c.words||c.words.length<2)return;
    const mid=Math.floor(c.words.length/2);
    splitClip(i,mid);
  });
}

// ── 병합 ─────────────────────────────────────────────────────────
function mergeWith(i){
  if(i<=0||i>=clips.length)return;
  const a=clips[i-1],b=clips[i];
  clips.splice(i-1,2,{...a,text:(a.text+' '+b.text).trim(),tts_text:(a.tts_text+' '+b.tts_text).trim(),
    words:[...(a.words||[]),...(b.words||[])],endMs:b.endMs,
    highlight_keywords:[...(a.highlight_keywords||[]),...(b.highlight_keywords||[])]});
  reindex();renderClipList();updateStats();toast('⤵ 병합 완료');
}

function mergeSelected(){
  const idx=getCheckedIndices().sort((a,b)=>a-b);
  if(idx.length<1)return;
  for(let i=idx.length-1;i>0;i--) mergeWith(idx[i]);
  document.getElementById('btn-merge-up').disabled=true;
}

// ── 삭제 ─────────────────────────────────────────────────────────
function deleteClip(i){
  if(!confirm(\`클립 \${i+1} 삭제?\`))return;
  clips.splice(i,1);reindex();renderClipList();updateStats();toast('🗑 삭제됨');
}

// ── 클립 추가 ─────────────────────────────────────────────────────
function insertClip(after){
  const prev=clips[after-1],next=clips[after];
  const sMs=prev?prev.endMs:0,eMs=next?next.startMs:sMs+2000;
  clips.splice(after,0,{text:'(새 클립)',tts_text:'',words:[],startMs:sMs,endMs:eMs,
    isHighlight:false,section:prev?.section||'setup',effect:'code-typing',highlight_keywords:[]});
  reindex();renderClipList();updateStats();
}

// ── 무음 제거 ─────────────────────────────────────────────────────
async function removeSilence(){
  if(!currentDate){toast('프로젝트를 먼저 열어주세요');return;}
  const ms=parseInt(prompt('클립 간 무음 기준 (ms) — 이 값 이상 간격이면 압축',400)||'400',10);
  if(isNaN(ms))return;
  try{
    const r=await fetch('/api/clips-remove-silence',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({date:currentDate,thresholdMs:ms})});
    const d=await r.json();
    if(d.error)throw new Error(d.error);
    if(d.clips){
      clips=d.clips;reindex();renderClipList();updateStats();
      toast(\`⟨⟩ 무음 \${d.removed}개 제거됨 (저장 후 반영)\`);
    } else {
      toast('제거할 무음 없음 (기준: '+ms+'ms)');
    }
  }catch(e){toast('오류: '+e.message);}
}

// ── 오디오/비디오 컨트롤 ──────────────────────────────────────────
function togglePlay(){
  const isAudio=audio.src&&!audio.paused||(!audio.paused);
  if(audio.paused){audio.play().catch(()=>{});if(video.src)video.play().catch(()=>{});}
  else{audio.pause();video.pause();}
}
audio.addEventListener('play',()=>{playBtn.textContent='⏸';});
audio.addEventListener('pause',()=>{playBtn.textContent='▶';});
audio.addEventListener('timeupdate',()=>{
  const ms=audio.currentTime*1000;
  timeDisp.textContent=msToTime(ms);
  document.querySelectorAll('.clip-row').forEach(row=>{
    const i=parseInt(row.dataset.id,10);const c=clips[i];
    if(c&&ms>=c.startMs&&ms<=c.endMs)row.classList.add('active');
    else row.classList.remove('active');
  });
});

// ── 시간 모달 ─────────────────────────────────────────────────────
function openTimeModal(i){
  timeModalIdx=i;
  document.getElementById('t-start').value=clips[i].startMs;
  document.getElementById('t-end').value=clips[i].endMs;
  document.getElementById('time-modal').classList.add('show');
}
function closeTimeModal(){document.getElementById('time-modal').classList.remove('show');}
function applyTime(){
  const i=timeModalIdx;if(i<0||!clips[i])return closeTimeModal();
  const s=parseInt(document.getElementById('t-start').value,10);
  const e=parseInt(document.getElementById('t-end').value,10);
  if(isNaN(s)||isNaN(e)||e<=s){alert('종료 > 시작');return;}
  clips[i].startMs=s;clips[i].endMs=e;closeTimeModal();renderClipList();updateStats();toast('시간 적용');
}

// ── 저장 ──────────────────────────────────────────────────────────
async function saveClips(){
  document.getElementById('status-chip').textContent='저장 중...';
  try{
    const r=await fetch('/api/clips-save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({date:currentDate,clips})});
    const d=await r.json();
    toast('✓ 저장 완료 ('+d.count+'개)');
    document.getElementById('status-chip').textContent='저장됨';
  }catch(e){toast('저장 실패: '+e.message);document.getElementById('status-chip').textContent='';}
}

// ── 렌더 ──────────────────────────────────────────────────────────
async function renderNow(){
  await saveClips();
  if(!confirm('저장 후 Remotion으로 렌더합니다 (TTS 재생성 없음)\\n계속?'))return;
  document.getElementById('btn-render').disabled=true;
  document.getElementById('status-chip').textContent='렌더 중...';
  try{
    const r=await fetch('/render-auto',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
    const d=await r.json();
    if(d.jobId){
      toast('🎬 렌더 완료: '+d.jobId);
      if(d.url)window.open(d.url,'_blank');
    }else{toast('렌더 오류: '+(d.error||JSON.stringify(d)));}
  }catch(e){toast('렌더 실패: '+e.message);}
  finally{document.getElementById('btn-render').disabled=false;document.getElementById('status-chip').textContent='';}
}

// ── 통계 ──────────────────────────────────────────────────────────
function updateStats(){
  const n=clips.length;
  const dur=n?((clips[n-1].endMs)/1000).toFixed(1):0;
  document.getElementById('st-count').textContent=n;
  document.getElementById('st-dur').textContent=dur+'s';
  document.getElementById('ef-count').textContent=n;
  document.getElementById('ef-dur').textContent=dur;
  const warns=clips.filter(c=>FORBIDDEN.some(w=>(c.text||'').startsWith(w)));
  const wEl=document.getElementById('st-warn');
  const eWEl=document.getElementById('ef-warn');
  if(warns.length){const t='⚠ 접속어 '+warns.length+'개';wEl.innerHTML='<span style="color:#ef4444;font-weight:700">'+t+'</span>';eWEl.innerHTML='<span class="ef-warn">'+t+'</span>';}
  else{wEl.textContent='';eWEl.textContent='';}
}

// ── 유틸 ──────────────────────────────────────────────────────────
function reindex(){clips.forEach((c,i)=>c.id=i);}
function msToTime(ms){const s=Math.floor(ms/1000),m=Math.floor(s/60),ss=(s%60).toString().padStart(2,'0');return m+':'+ss;}
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
let toastT;
function toast(msg){const el=document.getElementById('toast');el.textContent=msg;el.classList.add('show');clearTimeout(toastT);toastT=setTimeout(()=>el.classList.remove('show'),2400);}
</script>
</body>
</html>`;
