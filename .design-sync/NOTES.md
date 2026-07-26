# design-sync notes — Homie

## Repo shape

Homie has no standalone design-system package. The "design system" is:
- **Tokens + base styles**: `app/globals.css` (hand-written, source of truth — see the comment at the top of `tailwind.config.ts`).
- **Component primitives**: `components/ui/*.tsx` (shadcn/ui, generated once then hand-maintained) plus `components/PhoneLink.tsx` and `components/SiteHeader.tsx`.
- Tailwind (`app/shadcn.css`, preflight off) exists only to carry the shadcn components and is aliased onto the real custom-property tokens — it is not a second design language.

There is no `dist/`, no build script for a component library, and no Storybook. `homie-design-system/` at the repo root is unrelated — it's a *handoff bundle exported from* claude.ai/design for implementing a mockup, the reverse direction of this sync.

## Local setup (not obvious from config.json alone)

- **`node_modules/homie-landing` is a symlink to the repo root** (`cd node_modules && ln -s .. homie-landing`), so `--node-modules <repo>/node_modules --config .design-sync/config.json` resolves `PKG_DIR` (`join(NODE_MODULES, cfg.pkg)`) to the repo root itself — this repo IS the "package", just not laid out as an installed dependency. **The symlink name must equal `cfg.pkg`** (`"homie-landing"`). It's machine-local state inside gitignored `node_modules/` — recreate it after every fresh clone / `npm ci`:
  ```sh
  (cd node_modules && ln -sfn .. homie-landing)
  test -d node_modules/homie-landing/components && echo ok
  ```
- **`cfg.cssEntry` (`.design-sync/.cache/ds-styles.css`) is generated, not hand-written.** `npm run build` (a real `next build`) compiles `app/globals.css` + `app/shadcn.css` into one hashed chunk under `.next/static/css/` — that single chunk already contains the real tokens (`--oat` etc.), the real applied Tailwind utility classes (`.bg-primary{background-color:var(--apricot)}`), AND next/font's real self-hosted `@font-face` rules (Fredoka/Nunito/JetBrains Mono, already subsetted into local `.woff2` files under `.next/static/media/` — no need to fetch fonts from Google ourselves). `.design-sync/prepare-css.mjs` copies that chunk and rewrites its root-relative font `url(/_next/static/media/...)` references to `../../.next/static/media/...` so they resolve as real files under the package root (`cssEntry` containment is bounded to `PKG_DIR`). Re-run after any `npm run build`.
- **`npm run build` exits non-zero** in this environment — page prerendering fails because Clerk's publishable key isn't set (no `.env.local`). That's fine: CSS/font compilation happens before prerendering and still succeeds. `cfg.buildCmd` uses `;` not `&&` so `prepare-css.mjs` still runs after the (expected) build "failure". Don't chase that exit code.
- **`cfg.srcDir` is explicitly `"components"`** — the auto-detect priority is `src/ → lib/ → components/`, and this repo has a top-level `lib/` (server utilities, no React) that would otherwise shadow the real component root.

## Re-sync risks (read this before re-running)

- If `app/globals.css`, `app/shadcn.css`, or the Google Fonts loaded in `app/layout.tsx` change, re-run `cfg.buildCmd` (`npm run build; node .design-sync/prepare-css.mjs`) before re-running the converter — `ds-styles.css` is a snapshot, not live.
- If `cfg.pkg` or the symlink name ever drift apart, the build fails at `PKG_DIR` resolution (`[NO_DIST]`-style error) — see the symlink note above.
- The component list comes from `deriveComponentsFromSrc` (no `.d.ts`/dist — synth-entry mode), which captures **every** exported PascalCase value in `components/**/*.tsx`, including compound-component subparts (e.g. `SelectTrigger`, `DropdownMenuItem`). Check `componentSrcMap` in `config.json` for which of those are excluded from top-level cards (they still ship in the bundle — just not as their own preview).
- `.d.ts` contracts are weaker than a real build would produce (no ts-morph resolution against a shipped type root) — expect simpler `<Name>Props` bodies.
