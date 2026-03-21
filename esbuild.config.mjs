import { build, context } from 'esbuild';
import { cpSync, mkdirSync } from 'fs';

const isWatch = process.argv.includes('--watch');

const entryPoints = [
  'src/background/service-worker.ts',
  'src/content/degradation.ts',
  'src/ui/popup/popup.ts',
  'src/ui/options/options.ts',
  'src/ui/blocked/blocked.ts',
  'src/ui/speed-bump/speed-bump.ts',
];

const buildOptions = {
  entryPoints,
  bundle: true,
  outdir: 'dist',
  format: 'esm',
  target: 'es2022',
  sourcemap: true,
  // Preserve directory structure in output
  outbase: 'src',
};

function copyStaticAssets() {
  mkdirSync('dist', { recursive: true });
  cpSync('static/', 'dist/', { recursive: true });
  // Copy HTML and CSS files from ui directories
  for (const page of ['popup', 'options', 'blocked', 'speed-bump']) {
    const srcDir = `src/ui/${page}`;
    const destDir = `dist/ui/${page}`;
    mkdirSync(destDir, { recursive: true });
    try {
      cpSync(`${srcDir}/${page}.html`, `${destDir}/${page}.html`);
      cpSync(`${srcDir}/${page}.css`, `${destDir}/${page}.css`);
    } catch {
      // Files may not exist yet during early development
    }
  }
}

if (isWatch) {
  const ctx = await context(buildOptions);
  copyStaticAssets();
  await ctx.watch();
  console.log('Watching for changes...');
} else {
  await build(buildOptions);
  copyStaticAssets();
  console.log('Build complete.');
}
