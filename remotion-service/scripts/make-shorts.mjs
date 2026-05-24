#!/usr/bin/env node
/**
 * make-shorts.mjs — End-to-end 파이프라인: 스크립트 → TTS → Whisper → Remotion 렌더
 *
 * 사용:
 *   node scripts/make-shorts.mjs \
 *     --script script.txt \
 *     --beats beats.json \
 *     --comp GreeEmotion \
 *     --platform youtube-shorts \
 *     --out ../out
 *
 * 또는 표정 데모 (오디오 없이):
 *   node scripts/make-shorts.mjs --comp GreeAllEmotions --no-audio --out ../out
 */
import fs from "node:fs";
import path from "node:path";
import { execSync, spawnSync } from "node:child_process";

const args = parseArgs(process.argv.slice(2));
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
process.chdir(root);

const comp = args.comp || "GreeAllEmotions";
const platform = args.platform || "youtube-shorts";
const outDir = path.resolve(root, args.out || "../out");
fs.mkdirSync(outDir, { recursive: true });

const propsObj = {};

// 1) TTS
if (!args["no-audio"] && (args.script || args["script-file"])) {
  const text = args.script || fs.readFileSync(args["script-file"], "utf-8").trim();
  console.error("[1/4] TTS 생성 중...");
  const ttsRes = runJson("node", [
    "scripts/generate-tts.mjs",
    "--text", text,
    "--out", "public/audio",
    "--voice", args.voice || "alloy",
  ]);
  const audioRel = path.relative("public", ttsRes.path).replace(/\\/g, "/");
  propsObj.audioFile = audioRel;
  propsObj.audioDuration = ttsRes.duration;
  console.error(`  → ${ttsRes.path} (${ttsRes.duration}s${ttsRes.cached ? ", cached" : ""})`);

  // 2) Whisper
  if (process.env.OPENAI_API_KEY) {
    console.error("[2/4] Whisper 자막 추출 중...");
    const captionsPath = path.join("public", "captions", `${path.basename(ttsRes.path, ".mp3")}.json`);
    fs.mkdirSync(path.dirname(captionsPath), { recursive: true });
    runJson("node", [
      "scripts/transcribe-whisper.mjs",
      "--audio", ttsRes.path,
      "--out", captionsPath,
      "--language", args.language || "ko",
    ]);
    propsObj.captions = JSON.parse(fs.readFileSync(captionsPath, "utf-8"));
    console.error(`  → ${propsObj.captions.length} words`);
  } else {
    console.error("[2/4] Whisper 스킵 (OPENAI_API_KEY 없음)");
  }
} else {
  console.error("[1-2/4] 오디오 스킵");
}

// 3) Beats
if (args.beats && fs.existsSync(args.beats)) {
  propsObj.beats = JSON.parse(fs.readFileSync(args.beats, "utf-8"));
}
if (args.title) propsObj.title = args.title;

// 4) Render + postprocess
const propsFile = path.join(outDir, `${comp}-props.json`);
fs.writeFileSync(propsFile, JSON.stringify(propsObj, null, 2));
console.error(`[3/4] Props: ${propsFile}`);
console.error(`[4/4] Remotion 렌더 + 후처리...`);

const res = spawnSync("bash", ["scripts/render-and-postprocess.sh", comp, platform, outDir, propsFile], {
  stdio: "inherit",
});
process.exit(res.status || 0);

// ──────────────────────────────────
function runJson(cmd, argv) {
  const out = execSync(`${cmd} ${argv.map((a) => `"${a.replace(/"/g, '\\"')}"`).join(" ")}`, {
    stdio: ["ignore", "pipe", "inherit"],
  }).toString();
  // 마지막 줄이 JSON
  const lines = out.trim().split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    try { return JSON.parse(lines[i]); } catch {}
  }
  throw new Error(`stdout에 JSON이 없음: ${out.slice(0, 200)}`);
}
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const k = a.slice(2);
      const v = argv[i + 1]?.startsWith("--") || argv[i + 1] === undefined ? true : argv[i + 1];
      out[k] = v;
      if (v !== true) i++;
    }
  }
  return out;
}
