import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { build } from 'esbuild';

const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

const boardRuntime = await build({
  entryPoints: ['src/client/official-workbench/runtime.js'],
  bundle: true,
  minify: true,
  platform: 'browser',
  format: 'iife',
  globalName: 'HithinkFinanceBoard',
  target: 'es2022',
  write: false,
});

await build({
  entryPoints: ['src/client/index.js'],
  outfile: 'dist/client.js',
  bundle: true,
  minify: true,
  platform: 'browser',
  format: 'cjs',
  target: 'es2022',
  external: ['react', 'react-dom', ...(manifest.dsh.client.external ?? [])],
  loader: { '.css': 'text', '.html': 'text', '.png': 'dataurl' },
  plugins: [{
    name: 'official-workbench-runtime',
    setup(builder) {
      builder.onResolve({ filter: /^hithink-official-board-runtime$/ }, (args) => ({
        path: args.path,
        namespace: 'official-workbench',
      }));
      builder.onLoad({ filter: /.*/, namespace: 'official-workbench' }, () => ({
        contents: boardRuntime.outputFiles[0].text,
        loader: 'text',
      }));
    },
  }],
  banner: {
    js: `window.__ModuleLoader__.load({ id: ${JSON.stringify(manifest.name)}, factory: (require) => {
  const module = { exports: {} };`,
  },
  footer: { js: '  return module.exports;\n} });' },
});

for (const [source, name, files] of [
  ['node_modules', 'echarts', ['LICENSE', 'NOTICE']],
  ['node_modules', 'zrender', ['LICENSE']],
  ['node_modules', 'tslib', ['LICENSE.txt', 'CopyrightNotice.txt']],
  ['node_modules', 'lightweight-charts', ['LICENSE']],
  ['third-party', 'lightweight-charts', ['NOTICE']],
  ['third-party', 'fancy-canvas', ['LICENSE']],
]) {
  const destination = new URL(`../dist/third-party/${name}/`, import.meta.url);
  await mkdir(destination, { recursive: true });
  for (const file of files) {
    await copyFile(new URL(`../${source}/${name}/${file}`, import.meta.url), new URL(file, destination));
  }
}
