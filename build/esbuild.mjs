// Bundles each content-script entry as a self-contained IIFE. Two entries
// (MAIN-world bridge, isolated content script) share src/shared/protocol.ts.
import * as esbuild from 'esbuild';

const common = {
  bundle: true,
  format: 'iife',
  target: 'chrome120',
  sourcemap: true,
  logLevel: 'info',
  loader: { '.css': 'text' },
};

await esbuild.build({ ...common, entryPoints: ['src/bridge/bridge.ts'], outfile: 'dist/bridge.js' });
await esbuild.build({ ...common, entryPoints: ['src/content/content.ts'], outfile: 'dist/content.js' });
