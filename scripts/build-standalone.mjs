import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const css = fs.readFileSync(path.join(root, 'src/styles.css'), 'utf8');

const result = await esbuild.build({
  entryPoints: [path.join(root, 'src/main.tsx')],
  bundle: true,
  write: false,
  format: 'iife',
  target: ['es2020'],
  loader: { '.css': 'empty' },
  minify: false,
});

const jsCode = result.outputFiles[0].text;

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Elsewhere · 一角色一手机 (Phase 1 Standalone)</title>
<style>
${css}
</style>
</head>
<body>
<div id="app"></div>
<script>
${jsCode}
</script>
</body>
</html>
`;

fs.mkdirSync(path.join(root, 'public'), { recursive: true });
fs.writeFileSync(path.join(root, 'public/Elsewhere_Phase1_Standalone.html'), html, 'utf8');
console.log('Standalone HTML generated:', path.join(root, 'public/Elsewhere_Phase1_Standalone.html'), 'bytes:', Buffer.byteLength(html));
