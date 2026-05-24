#!/usr/bin/env node
/**
 * generate-tts.mjs — 한국어 우선 TTS, ElevenLabs → OpenAI fallback, 해시 캐시
 *
 * 사용:
 *   node scripts/generate-tts.mjs --text "안녕 그리야" --out public/audio
 *   node scripts/generate-tts.mjs --text-file script.txt --voice rachel
 *
 * 환경변수:
 *   ELEVENLABS_API_KEY  (선택, 1순위)
 *   OPENAI_API_KEY      (필수 fallback)
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const args = parseArgs(process.argv.slice(2));
const text = await readText(args);
if (!text) {
  console.error("ERROR: --text 또는 --text-file 필요");
  process.exit(1);
}
const outDir = args.out || "public/audio";
const voice = args.voice || "alloy";
const provider = args.provider || "auto";
fs.mkdirSync(outDir, { recursive: true });

const hash = crypto
  .createHash("sha256")
  .update(`${voice}::${text}`)
  .digest("hex")
  .slice(0, 16);
const mp3Path = path.join(outDir, `${hash}.mp3`);
const metaPath = path.join(outDir, `${hash}.json`);

// 캐시 히트
if (fs.existsSync(mp3Path) && fs.existsSync(metaPath)) {
  const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
  console.log(JSON.stringify({ ...meta, cached: true, path: mp3Path }, null, 2));
  process.exit(0);
}

let result;
const wantsEleven =
  provider === "elevenlabs" ||
  (provider === "auto" && process.env.ELEVENLABS_API_KEY);

if (wantsEleven && process.env.ELEVENLABS_API_KEY) {
  try {
    result = await elevenlabsTTS(text, voice, mp3Path);
  } catch (err) {
    console.error(`[elevenlabs] 실패, OpenAI로 fallback: ${err.message}`);
    if (!process.env.OPENAI_API_KEY) throw err;
    result = await openaiTTS(text, voice, mp3Path);
  }
} else if (process.env.OPENAI_API_KEY) {
  result = await openaiTTS(text, voice, mp3Path);
} else {
  console.error("ERROR: ELEVENLABS_API_KEY 또는 OPENAI_API_KEY 필요");
  process.exit(2);
}

const duration = await probeDuration(mp3Path);
const meta = { ...result, duration, voice, hash, path: mp3Path };
fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
console.log(JSON.stringify({ ...meta, cached: false }, null, 2));

// ───────────────────────────────────────────────────────────
async function elevenlabsTTS(text, voiceId, outPath) {
  // voiceId가 짧으면 기본 다국어 음성 ID로 매핑
  const VOICE_MAP = {
    rachel: "21m00Tcm4TlvDq8ikWAM",
    bella: "EXAVITQu4vr4xnSDxMaL",
    adam: "pNInz6obpgDQGcFmaJgB",
    domi: "AZnzlk1QvdT5XTr3R7Bx",
    josh: "TxGEqnHWrfWFTfGW9XjX",
  };
  const id = VOICE_MAP[voiceId] || voiceId;
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${id}`;

  const res = await fetchWithRetry(url, {
    method: "POST",
    headers: {
      "xi-api-key": process.env.ELEVENLABS_API_KEY,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: "eleven_multilingual_v2",
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  });
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(outPath, buf);
  return { provider: "elevenlabs", model: "eleven_multilingual_v2" };
}

async function openaiTTS(text, voice, outPath) {
  const url = "https://api.openai.com/v1/audio/speech";
  const res = await fetchWithRetry(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini-tts",
      voice,
      input: text,
      response_format: "mp3",
    }),
  });
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(outPath, buf);
  return { provider: "openai", model: "gpt-4o-mini-tts" };
}

async function fetchWithRetry(url, init, attempt = 1) {
  const res = await fetch(url, init);
  if (res.ok) return res;
  if (attempt >= 3) {
    const body = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  if (res.status === 429 || res.status >= 500) {
    const wait = 1000 * Math.pow(2, attempt);
    await new Promise((r) => setTimeout(r, wait));
    return fetchWithRetry(url, init, attempt + 1);
  }
  throw new Error(`HTTP ${res.status}`);
}

async function probeDuration(mp3) {
  try {
    const { execSync } = await import("node:child_process");
    const out = execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${mp3}"`
    )
      .toString()
      .trim();
    return parseFloat(out);
  } catch {
    // ffprobe 없으면 파일 크기로 대략 추정 (128kbps 가정)
    const bytes = fs.statSync(mp3).size;
    return Math.round((bytes / (128 * 1024 / 8)) * 100) / 100;
  }
}

async function readText(args) {
  if (args.text) return args.text;
  if (args["text-file"]) return fs.readFileSync(args["text-file"], "utf-8").trim();
  return null;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const k = a.slice(2);
      const v = argv[i + 1]?.startsWith("--") ? true : argv[i + 1];
      out[k] = v;
      if (v !== true) i++;
    }
  }
  return out;
}
