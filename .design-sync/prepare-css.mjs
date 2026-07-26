#!/usr/bin/env node
// Homie has no standalone design-system package — components/ui/*.tsx ship
// styled only via Next's build (Tailwind utilities + next/font @font-face,
// both resolved against the real tokens in app/globals.css). This script
// takes the compiled global CSS chunk `next build` already produces and
// rewrites its root-relative font url()s (`/_next/static/media/...`) into
// paths relative to this repo, so design-sync's cssEntry (bounded to the
// package root) can read the real font binaries next build already fetched.
// Re-run after any `npm run build` that changes globals.css/shadcn.css/fonts.

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = dirname(fileURLToPath(import.meta.url)).replace(/\/\.design-sync$/, '');
const cssDir = join(repoRoot, '.next/static/css');
const outPath = join(repoRoot, '.design-sync/.cache/ds-styles.css');

const files = readdirSync(cssDir).filter((f) => f.endsWith('.css'));
if (!files.length) {
  console.error(`no compiled CSS found under ${cssDir} — run \`npm run build\` first`);
  process.exit(1);
}

const combined = files
  .map((f) => readFileSync(join(cssDir, f), 'utf8'))
  .join('\n')
  .replaceAll('/_next/static/media/', '../../.next/static/media/');

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, combined);
console.log(`wrote ${outPath} (${(combined.length / 1024).toFixed(0)} KB, from ${files.length} chunk(s))`);
