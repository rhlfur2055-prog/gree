// scripts/build_editor_player.js
// editor-player.tsx → output/editor-player.bundle.js (browser IIFE)
// 사용: const { buildEditorPlayer } = require('./scripts/build_editor_player'); await buildEditorPlayer();
//
// 서버 기동 시 한 번 호출되어 클라이언트 번들을 만든다.

const path = require('path');
const fs = require('fs');
const esbuild = require('esbuild');

const ENTRY  = path.join(__dirname, '..', 'src', 'editor-player.tsx');
const OUTDIR = path.join(__dirname, '..', 'output');
const OUT    = path.join(OUTDIR, 'editor-player.bundle.js');

async function buildEditorPlayer({ watch = false } = {}) {
  fs.mkdirSync(OUTDIR, { recursive: true });

  /** @type {import('esbuild').BuildOptions} */
  const opts = {
    entryPoints: [ENTRY],
    bundle: true,
    outfile: OUT,
    format: 'iife',
    platform: 'browser',
    target: 'es2020',
    sourcemap: false,
    minify: false,           // 디버깅 편의를 위해 일단 끔
    jsx: 'automatic',
    jsxDev: false,
    loader: { '.png': 'dataurl', '.svg': 'text' },
    define: {
      'process.env.NODE_ENV': '"production"',
      'process.env.REMOTION_INSIDE_PLAYER': '"true"',
    },
    // remotion이 staticFile 등을 위해 빌드 시 환경에 기대는 게 있지만,
    // Player 안에서는 process가 없으므로 stub
    inject: [],
    logLevel: 'info',
  };

  if (watch) {
    const ctx = await esbuild.context(opts);
    await ctx.watch();
    console.log('[editor-player] watching for changes...');
    return ctx;
  }

  const t0 = Date.now();
  await esbuild.build(opts);
  const sz = fs.statSync(OUT).size;
  console.log(`[editor-player] built ${OUT.split(/[\\/]/).pop()}  ${(sz/1024).toFixed(0)}KB  (${Date.now()-t0}ms)`);
  return OUT;
}

module.exports = { buildEditorPlayer, OUT };

// CLI: node scripts/build_editor_player.js
if (require.main === module) {
  buildEditorPlayer().catch(e => { console.error(e); process.exit(1); });
}
