#!/usr/bin/env node
/**
 * scripts/download_sfx.js
 * ─────────────────────────────────────────────────────────────────────────
 * SFX 다운로드/합성 자동화 스크립트
 *
 * 우선순위:
 *   1. Pixabay API 다운로드 (PIXABAY_API_KEY 있을 때)
 *   2. Node.js PCM 합성 → WAV → ffmpeg MP3 인코딩 (항상 폴백)
 *
 * 사용법:
 *   node scripts/download_sfx.js
 *   node scripts/download_sfx.js --synth-only   (합성 강제)
 *   node scripts/download_sfx.js --verify-only  (검증만)
 *
 * 필요:
 *   .env (n8nproject/.env) 에 PIXABAY_API_KEY=xxx 추가 시 실제 파일 다운로드
 */

'use strict';

const fs    = require('fs');
const path  = require('path');
const https = require('https');
const http  = require('http');
const os    = require('os');
const { spawnSync } = require('child_process');

// ─── 경로 / 설정 ─────────────────────────────────────────────────────────
const ROOT    = path.join(__dirname, '..');
const SFX_DIR = path.join(ROOT, 'public', 'sfx');
const ENV_PATH = path.join(ROOT, '..', '.env'); // n8nproject/.env

const SYNTH_ONLY   = process.argv.includes('--synth-only');
const VERIFY_ONLY  = process.argv.includes('--verify-only');

const PI2 = 2 * Math.PI;
const SR  = 44100; // 샘플레이트

// ─── 유틸 ────────────────────────────────────────────────────────────────
const lerp  = (a, b, t) => a + (b - a) * t;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

function loadEnv() {
  try {
    return fs.readFileSync(ENV_PATH, 'utf8')
      .split('\n')
      .reduce((acc, line) => {
        const eq = line.indexOf('=');
        if (eq > 0) {
          const k = line.slice(0, eq).trim();
          const v = line.slice(eq + 1).trim();
          if (k) acc[k] = v;
        }
        return acc;
      }, {});
  } catch { return {}; }
}

// Remotion 번들 ffmpeg 위치 탐색
function findFfmpeg() {
  const bundled = path.join(
    ROOT,
    'node_modules/@remotion/compositor-win32-x64-msvc/ffmpeg.exe',
  );
  if (fs.existsSync(bundled)) return bundled;
  return process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
}

function findFfprobe() {
  const bundled = path.join(
    ROOT,
    'node_modules/@remotion/compositor-win32-x64-msvc/ffprobe.exe',
  );
  if (fs.existsSync(bundled)) return bundled;
  return process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe';
}

// ─── WAV 기록 (mono 16-bit PCM) ──────────────────────────────────────────
function writeMono16Wav(filepath, samples) {
  const dataLen = samples.length * 2;
  const buf = Buffer.alloc(44 + dataLen);

  buf.write('RIFF', 0);              buf.writeUInt32LE(36 + dataLen, 4);
  buf.write('WAVE', 8);              buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);         buf.writeUInt16LE(1, 20);    // PCM
  buf.writeUInt16LE(1, 22);          buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28);     buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);             buf.writeUInt32LE(dataLen, 40);

  for (let i = 0; i < samples.length; i++) {
    const s = clamp(Math.round(samples[i] * 32767), -32768, 32767);
    buf.writeInt16LE(s, 44 + i * 2);
  }
  fs.writeFileSync(filepath, buf);
}

// WAV → MP3 인코딩 (Remotion 번들 ffmpeg)
function wavToMp3(wavPath, mp3Path, ffmpeg) {
  const res = spawnSync(ffmpeg, [
    '-y', '-i', wavPath,
    '-c:a', 'libmp3lame', '-b:a', '128k', '-ar', '44100',
    mp3Path,
  ], { encoding: 'utf8' });

  if (res.status !== 0) {
    throw new Error(`ffmpeg WAV→MP3 실패:\n${res.stderr || res.stdout}`);
  }
  try { fs.unlinkSync(wavPath); } catch {}
}

// ─── PCM 합성 함수 (8종) ─────────────────────────────────────────────────

/** whoosh — 0.45s | 노이즈 + 100→3000Hz 업스윕 */
function synth_whoosh() {
  const dur = 0.45;
  const n   = Math.round(SR * dur);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t     = i / SR;
    const phase = t / dur;
    // 이차 가속 스윕
    const freq  = lerp(100, 3000, phase * phase);
    const noise = (Math.random() * 2 - 1);
    const chirp = Math.sin(PI2 * freq * t);
    // 엔벨로프: 빠른 attack → 지수 decay
    const env = Math.min(t / 0.03, 1) * Math.exp(-3.5 * phase);
    out[i] = (noise * 0.55 + chirp * 0.45) * env * 0.85;
  }
  return out;
}

/** impact_low — 0.55s | 55Hz 서브베이스 펀치 + 노이즈 */
function synth_impact_low() {
  const dur = 0.55;
  const n   = Math.round(SR * dur);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t   = i / SR;
    const sub  = Math.sin(PI2 * 55 * t)  * Math.exp(-4.5 * t);
    const harm = Math.sin(PI2 * 110 * t) * Math.exp(-7 * t) * 0.45;
    const noise = (Math.random() * 2 - 1) * Math.exp(-14 * t) * 0.25;
    const env = Math.min(t / 0.005, 1);
    out[i] = clamp((sub + harm + noise) * env * 0.8, -1, 1);
  }
  return out;
}

/** impact_high — 0.3s | 1200Hz 스냅 + 노이즈 burst */
function synth_impact_high() {
  const dur = 0.30;
  const n   = Math.round(SR * dur);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t    = i / SR;
    const snap  = Math.sin(PI2 * 1200 * t) * Math.exp(-18 * t);
    const noise = (Math.random() * 2 - 1) * Math.exp(-15 * t) * 0.5;
    const env = Math.min(t / 0.003, 1);
    out[i] = clamp((snap + noise) * env * 0.85, -1, 1);
  }
  return out;
}

/** tick — 0.12s | 2000Hz 단발 클릭 */
function synth_tick() {
  const dur = 0.12;
  const n   = Math.round(SR * dur);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t  = i / SR;
    out[i]   = Math.sin(PI2 * 2000 * t) * Math.exp(-55 * t) * 0.90;
  }
  return out;
}

/** glitch — 0.28s | 디지털 글리치 (비조화 사인 합산 + 노이즈) */
function synth_glitch() {
  const dur = 0.28;
  const n   = Math.round(SR * dur);
  const out = new Float32Array(n);
  // 8개 비조화 사인을 합산해 "디지털 노이즈" 시뮬레이션
  const freqs = [800, 1117, 1534, 2051, 2687, 3342, 4096, 5012];
  for (let i = 0; i < n; i++) {
    const t   = i / SR;
    let s = 0;
    for (let h = 0; h < freqs.length; h++) {
      s += Math.sin(PI2 * freqs[h] * t) * (1 / (h + 1));
    }
    const noise = (Math.random() * 2 - 1) * 0.35;
    const env = Math.exp(-6 * t) * Math.min(t / 0.008, 1);
    out[i] = clamp((s * 0.35 + noise) * env * 0.80, -1, 1);
  }
  return out;
}

/** chime — 1.0s | 2200+3300+4400Hz 벨 (하모닉 계열, 천천히 감쇠) */
function synth_chime() {
  const dur = 1.00;
  const n   = Math.round(SR * dur);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t  = i / SR;
    const f1 = Math.sin(PI2 * 2200 * t) * Math.exp(-2.0 * t);
    const f2 = Math.sin(PI2 * 3300 * t) * Math.exp(-2.6 * t) * 0.42;
    const f3 = Math.sin(PI2 * 4400 * t) * Math.exp(-3.2 * t) * 0.18;
    const env = Math.min(t / 0.006, 1);
    out[i] = (f1 + f2 + f3) * env * 0.75;
  }
  return out;
}

/** bass_drop — 0.85s | 80→35Hz 서브베이스 피치 드롭 */
function synth_bass_drop() {
  const dur = 0.85;
  const n   = Math.round(SR * dur);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t     = i / SR;
    const phase = t / dur;
    const freq  = lerp(80, 35, phase);     // 피치 하강
    const bass  = Math.sin(PI2 * freq * t) * Math.exp(-1.8 * t);
    const punch = (Math.random() * 2 - 1) * Math.exp(-25 * t) * 0.18;
    const env   = Math.min(t / 0.008, 1);
    out[i] = clamp((bass + punch) * env * 0.88, -1, 1);
  }
  return out;
}

/** riser — 1.5s | 150→2000Hz 업스윕 + 점증 노이즈 빌드업 */
function synth_riser() {
  const dur = 1.50;
  const n   = Math.round(SR * dur);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t      = i / SR;
    const phase  = t / dur;
    const freq   = lerp(150, 2000, phase * phase); // 이차 가속
    const chirp  = Math.sin(PI2 * freq * t);
    const noise  = (Math.random() * 2 - 1) * 0.45;
    // 진폭: 시간에 따라 증가
    const ampEnv  = Math.pow(phase, 0.6);
    // 마지막 0.25s fade-out
    const fadeOut = Math.min((dur - t) / 0.25, 1);
    out[i] = clamp((chirp * 0.6 + noise * 0.4) * ampEnv * fadeOut * 0.85, -1, 1);
  }
  return out;
}

// ─── SFX 스펙 맵 ─────────────────────────────────────────────────────────
const SFX_SPECS = {
  whoosh:      { fn: synth_whoosh,      dur: 0.45, desc: '노이즈 업스윕 (0.45s)' },
  impact_low:  { fn: synth_impact_low,  dur: 0.55, desc: '서브베이스 펀치 (0.55s)' },
  impact_high: { fn: synth_impact_high, dur: 0.30, desc: '고주파 스냅 (0.30s)' },
  tick:        { fn: synth_tick,        dur: 0.12, desc: '단발 클릭 (0.12s)' },
  glitch:      { fn: synth_glitch,      dur: 0.28, desc: '디지털 글리치 (0.28s)' },
  chime:       { fn: synth_chime,       dur: 1.00, desc: '벨 잔향 (1.00s)' },
  bass_drop:   { fn: synth_bass_drop,   dur: 0.85, desc: '서브베이스 드롭 (0.85s)' },
  riser:       { fn: synth_riser,       dur: 1.50, desc: '업스윕 빌드업 (1.50s)' },
};

// Pixabay API 검색어 맵 (key 있을 때 시도)
const PIXABAY_QUERIES = {
  whoosh:      'whoosh swipe sound effect',
  impact_low:  'impact boom explosion low sound effect',
  impact_high: 'impact hit snap high sound effect',
  tick:        'tick click button sound effect',
  glitch:      'glitch digital error sound effect',
  chime:       'chime bell ding sound effect',
  bass_drop:   'bass drop boom sound effect',
  riser:       'riser buildup tension sound effect',
};

// ─── Pixabay 다운로드 ─────────────────────────────────────────────────────

/** HTTPS GET → Buffer */
function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, { timeout: 10000 }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return httpsGet(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

/** Pixabay 음악/SFX API 검색 → 첫 번째 download_url 반환 */
async function pixabaySearch(query, apiKey) {
  const q = encodeURIComponent(query);
  // Pixabay API: 음악/SFX는 media_type=music 사용 (sound effects 포함)
  const url = `https://pixabay.com/api/?key=${apiKey}&q=${q}&media_type=music&per_page=5&safesearch=true`;
  const buf  = await httpsGet(url);
  const json = JSON.parse(buf.toString('utf8'));
  if (!json.hits || json.hits.length === 0) return null;

  // download_url 또는 webformatURL 중 mp3를 포함하는 항목 선택
  const hit = json.hits.find(h => h.audio_url || h.webformatURL?.includes('.mp3'));
  if (!hit) return null;

  // 오디오 URL 우선순위: audio_url → webformatURL
  return hit.audio_url || hit.webformatURL || null;
}

/** Pixabay에서 SFX mp3 다운로드 */
async function downloadFromPixabay(name, mp3Path, apiKey) {
  process.stdout.write(`  [Pixabay] "${PIXABAY_QUERIES[name]}" 검색 중... `);
  try {
    const audioUrl = await pixabaySearch(PIXABAY_QUERIES[name], apiKey);
    if (!audioUrl) {
      console.log('결과 없음 → 합성으로 대체');
      return false;
    }
    console.log(`다운로드: ${audioUrl.slice(0, 60)}...`);
    const buf = await httpsGet(audioUrl);
    if (buf.length < 1000) {
      console.log('파일 너무 작음 → 합성으로 대체');
      return false;
    }
    fs.writeFileSync(mp3Path, buf);
    console.log(`  ✅ Pixabay: ${mp3Path} (${(buf.length / 1024).toFixed(1)}KB)`);
    return true;
  } catch (e) {
    console.log(`실패 (${e.message}) → 합성으로 대체`);
    return false;
  }
}

// ─── 합성 생성 ────────────────────────────────────────────────────────────

function synthesizeSfx(name, mp3Path, ffmpeg) {
  const spec = SFX_SPECS[name];
  process.stdout.write(`  [합성] ${name}: ${spec.desc} ... `);

  // 1. PCM 샘플 생성
  const samples = spec.fn();

  // 2. temp WAV 저장
  const tmpWav = path.join(os.tmpdir(), `sfx_${name}_${Date.now()}.wav`);
  writeMono16Wav(tmpWav, samples);

  // 3. WAV → MP3
  wavToMp3(tmpWav, mp3Path, ffmpeg);

  const size = fs.statSync(mp3Path).size;
  console.log(`✅ ${(size / 1024).toFixed(1)}KB`);
}

// ─── 검증 ────────────────────────────────────────────────────────────────

function verifyAllSfx(ffprobe) {
  console.log('\n── 검증 ──────────────────────────────────────────────────');
  let allOk = true;
  const results = [];

  for (const [name, spec] of Object.entries(SFX_SPECS)) {
    const p = path.join(SFX_DIR, `${name}.mp3`);
    if (!fs.existsSync(p)) {
      console.log(`  ❌ 누락: ${name}.mp3`);
      allOk = false;
      continue;
    }

    const size  = fs.statSync(p).size;
    // ffprobe로 길이 확인 (8611 = 이전 무음 파일)
    const res   = spawnSync(ffprobe, [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'csv=p=0',
      p,
    ], { encoding: 'utf8' });

    const durSec = parseFloat(res.stdout?.trim() || '0');
    const isSilentPlaceholder = size === 8611;
    const isDurationOk = durSec >= spec.dur * 0.7;
    const ok = !isSilentPlaceholder && isDurationOk;

    const mark = ok ? '✅' : '⚠️ ';
    const note = isSilentPlaceholder ? '무음 플레이스홀더!' : `${durSec.toFixed(2)}s`;
    console.log(`  ${mark} ${name}.mp3 — ${(size/1024).toFixed(1)}KB / ${note}`);
    results.push({ name, ok, size, durSec, spec });
    if (!ok) allOk = false;
  }

  console.log('\n  기대 길이 범위:');
  for (const r of results) {
    if (!r.ok) {
      console.log(`    ${r.name}: 기대 ≥${(r.spec.dur * 0.7).toFixed(2)}s, 실제 ${r.durSec.toFixed(2)}s`);
    }
  }

  return allOk;
}

// ─── LICENSES.md 기록 ────────────────────────────────────────────────────

function writeLicenses(source) {
  const ts    = new Date().toISOString();
  const lines = [
    '# SFX Licenses',
    '',
    `생성일: ${ts}`,
    `소스: ${source}`,
    '',
    '## 파일 목록',
    '',
    ...Object.entries(SFX_SPECS).map(([name, spec]) =>
      `- **${name}.mp3** — ${spec.desc}`,
    ),
    '',
    '## 라이선스 안내',
    '',
  ];

  if (source === 'synthetic') {
    lines.push(
      '모든 파일은 Node.js PCM 수식 합성으로 자동 생성되었습니다.',
      '저작권 제한 없음. 프로젝트 내부 사용 전용.',
      '',
      '> 실제 고품질 SFX가 필요하면 아래 수동 다운로드 가이드 참조',
    );
  } else {
    lines.push(
      '파일 출처: Pixabay (https://pixabay.com)',
      '라이선스: Pixabay Content License',
      '상업적 이용 가능 / 귀속 표시 불필요',
      '',
      '각 파일의 원본 URL은 다운로드 로그를 참조하세요.',
    );
  }

  lines.push(
    '',
    '## 수동 고품질 SFX 교체 가이드',
    '',
    '### 무료 소스 (CC0 / Royalty-Free)',
    '',
    '| 소스 | URL | 라이선스 |',
    '|------|-----|---------|',
    '| Pixabay Sound Effects | https://pixabay.com/sound-effects/ | Pixabay License |',
    '| Freesound (CC0 필터) | https://freesound.org | CC0 |',
    '| Zapsplat (무료 계정) | https://www.zapsplat.com | Standard |',
    '| BBC Sound Effects | https://sound-effects.bbcrewind.co.uk | RC |',
    '',
    '### 교체 방법',
    '',
    '```bash',
    '# 1. 위 사이트에서 각 SFX 다운로드 (MP3 128kbps 이상)',
    '# 2. public/sfx/ 폴더에 복사',
    '#    파일명 반드시 아래와 동일하게 유지:',
    '#    whoosh.mp3, impact_low.mp3, impact_high.mp3, tick.mp3',
    '#    glitch.mp3, chime.mp3, bass_drop.mp3, riser.mp3',
    '# 3. 검증: node scripts/download_sfx.js --verify-only',
    '```',
    '',
    '### Pixabay API 키 설정 (자동 다운로드)',
    '',
    '```bash',
    '# 1. https://pixabay.com/api/ 에서 무료 API 키 발급',
    '# 2. n8nproject/.env 에 추가:',
    '#    PIXABAY_API_KEY=your_key_here',
    '# 3. 재실행: node scripts/download_sfx.js',
    '```',
  );

  const licPath = path.join(SFX_DIR, 'LICENSES.md');
  fs.writeFileSync(licPath, lines.join('\n'), 'utf8');
  console.log(`  📄 LICENSES.md 작성 완료: ${licPath}`);
}

// ─── 메인 ────────────────────────────────────────────────────────────────

async function main() {
  console.log('══════════════════════════════════════════════════════');
  console.log('  SFX 다운로드/합성 스크립트');
  console.log('══════════════════════════════════════════════════════\n');

  const ffmpeg  = findFfmpeg();
  const ffprobe = findFfprobe();
  console.log(`ffmpeg:  ${ffmpeg}`);
  console.log(`ffprobe: ${ffprobe}`);

  if (!fs.existsSync(SFX_DIR)) fs.mkdirSync(SFX_DIR, { recursive: true });

  // ── 검증만 모드
  if (VERIFY_ONLY) {
    const ok = verifyAllSfx(ffprobe);
    process.exit(ok ? 0 : 1);
  }

  // ── API 키 확인
  const env      = loadEnv();
  const pixabayKey = env.PIXABAY_API_KEY || process.env.PIXABAY_API_KEY || '';
  const hasKey    = !SYNTH_ONLY && pixabayKey.length > 5;

  console.log(`\n모드: ${hasKey ? '🌐 Pixabay API → 합성 폴백' : '🔧 합성 전용 (PCM → WAV → MP3)'}`);
  if (!hasKey && !SYNTH_ONLY) {
    console.log('  ℹ️  PIXABAY_API_KEY 미설정 → 합성 모드로 진행');
    console.log('     (설정법: n8nproject/.env 에 PIXABAY_API_KEY=... 추가)\n');
  }

  let usedPixabay = false;
  const sources = {};

  console.log('\n── SFX 생성 ──────────────────────────────────────────────');
  for (const name of Object.keys(SFX_SPECS)) {
    const mp3Path = path.join(SFX_DIR, `${name}.mp3`);

    let downloaded = false;
    if (hasKey) {
      downloaded = await downloadFromPixabay(name, mp3Path, pixabayKey);
      if (downloaded) { usedPixabay = true; sources[name] = 'pixabay'; }
    }

    if (!downloaded) {
      synthesizeSfx(name, mp3Path, ffmpeg);
      sources[name] = 'synthetic';
    }
  }

  // ── LICENSES.md 작성
  console.log('\n── 라이선스 기록 ─────────────────────────────────────────');
  const sourceType = usedPixabay ? 'pixabay+synthetic' : 'synthetic';
  writeLicenses(sourceType);

  // ── 검증
  const allOk = verifyAllSfx(ffprobe);

  // ── 결과 요약
  console.log('\n══════════════════════════════════════════════════════');
  if (allOk) {
    console.log('  ✅ 모든 SFX 준비 완료!');
    console.log('\n  다음 단계:');
    console.log('  1. npx remotion preview → 영상 미리보기로 SFX 확인');
    console.log('  2. 볼륨 조정이 필요하면 CinematicShorts.tsx의 SFX volume 수치 조정');
    console.log('     현재: volume={0.55} (권장: 0.4~0.7 범위)');
    console.log('  3. 실제 고품질 SFX 교체: public/sfx/LICENSES.md 참조');
  } else {
    console.log('  ⚠️  일부 SFX 문제 감지. 위 로그 확인 후 재실행하세요.');
  }
  console.log('══════════════════════════════════════════════════════\n');
}

main().catch(e => {
  console.error('\n❌ 오류:', e.message);
  process.exit(1);
});
