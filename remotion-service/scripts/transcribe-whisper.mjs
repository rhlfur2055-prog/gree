#!/usr/bin/env node
/**
 * transcribe-whisper.mjs — 오디오 → 단어 단위 자막 (Whisper-1)
 *
 * 사용:
 *   node scripts/transcribe-whisper.mjs --audio public/audio/abc.mp3 --out src/captions.json
 *
 * 출력 형식:
 *   [{ word: "안녕", start: 0.12, end: 0.45 }, ...]
 *
 * 환경변수: OPENAI_API_KEY
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const args = parseArgs(process.argv.slice(2));
const audio = args.audio;
const outPath = args.out || "src/captions.json";
const language = args.language || "ko";

if (!audio || !fs.existsSync(audio)) {
  console.error("ERROR: --audio <existing-file> 필요");
  process.exit(1);
}
if (!process.env.OPENAI_API_KEY) {
  console.error("ERROR: OPENAI_API_KEY 필요");
  process.exit(2);
}

// 해시 캐시
const fileHash = crypto.createHash("sha256").update(fs.readFileSync(audio)).digest("hex").slice(0, 16);
const cacheDir = path.join(path.dirname(audio), ".whisper-cache");
fs.mkdirSync(cacheDir, { recursive: true });
const cachePath = path.join(cacheDir, `${fileHash}-${language}.json`);

if (fs.existsSync(cachePath)) {
  console.error(`[whisper] cache hit: ${cachePath}`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.copyFileSync(cachePath, outPath);
  console.log(JSON.stringify({ cached: true, words: JSON.parse(fs.readFileSync(cachePath, "utf-8")).length, out: outPath }));
  process.exit(0);
}

// FormData 빌드
const form = new FormData();
const buf = fs.readFileSync(audio);
const filename = path.basename(audio);
form.append("file", new Blob([buf], { type: "audio/mpeg" }), filename);
form.append("model", "whisper-1");
form.append("language", language);
form.append("response_format", "verbose_json");
form.append("timestamp_granularities[]", "word");

const res = await fetchWithRetry("https://api.openai.com/v1/audio/transcriptions", {
  method: "POST",
  headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
  body: form,
});
const json = await res.json();
const words = (json.words || []).map((w) => ({
  word: w.word,
  start: Math.round(w.start * 1000) / 1000,
  end: Math.round(w.end * 1000) / 1000,
}));

fs.writeFileSync(cachePath, JSON.stringify(words, null, 2));
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(words, null, 2));

console.log(JSON.stringify({ cached: false, words: words.length, duration: json.duration, out: outPath }));

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
