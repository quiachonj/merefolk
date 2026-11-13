# Contributing to Merefolk

This file is for people changing the plugin. If you only want to use it, the
[README](README.md) has everything you need.

## Build from source

You need Node 24 or later, or any Node with npm 11 or later. With npm 10,
`npm ci` rejects the lockfile because it reads the scoped `overrides` in
`package.json` differently.

```bash
npm install
npm run dev      # watch build: writes main.js and styles.css
npm run build    # type-check, then the production bundle
npm run lint
```

To load your build in Obsidian, link the repo into a test vault's plugins
folder, then enable Merefolk under Settings → Community plugins. On Windows a
junction works without admin rights:

```powershell
New-Item -ItemType Junction -Path "C:\path\to\Vault\.obsidian\plugins\merefolk" -Target (Get-Location)
```

`test/sample-er.md` has a full diagram, a minimal one, and one block per
malformed or unsupported case. Open it in the test vault to check every path.

## How it works

```
Mermaid erDiagram
  └─ src/mermaid/parseER.ts       parse -> ERModel (+ skipped lines)
     └─ src/layout/elkLayout.ts     ELK layout -> positions, edge routes, label positions
        └─ src/excalidraw/emit.ts     -> Excalidraw elements (theme colors, crow's-foot)
           ├─ src/excalidraw/toSvg.ts   SVG for the inline render
           └─ src/view/*                React canvas in an ItemView, edit and save
```

| File | What it does |
|---|---|
| `src/main.ts` | Plugin entry: the markdown post-processor that draws the inline render and its buttons, the command, the ribbon icon, the settings tab, theme repaint, writing the scene id into the note, and saving |
| `src/pipeline.ts` | `mermaidERToExcalidraw()`: parse, layout, emit |
| `src/types.ts` | The `ERModel` types every stage shares |
| `src/theme.ts` | Light and dark diagram colors |
| `src/metrics.ts` | Entity box sizes, shared by layout and emit so they agree |
| `src/mermaid/parseER.ts` | The ER parser. It collects lines it can't read so the UI can warn |
| `src/mermaid/extractBlock.ts` | Finds `mermaid` blocks in a note, and the one under the cursor |
| `src/layout/elkLayout.ts` | ELK layered layout, orthogonal routes, label positions |
| `src/excalidraw/emit.ts` | Positioned entities to Excalidraw elements |
| `src/excalidraw/toSvg.ts` | Elements to SVG, for the inline render and Copy |
| `src/scene/id.ts` | The `%% merefolk:<id>` line that links a block to its saved scene |
| `src/scene/store.ts` | Load, save and delete `.excalidraw` scene files |
| `src/view/ExcalidrawERView.tsx` | The Obsidian view that owns the React root |
| `src/view/ExcalidrawCanvas.tsx` | The Excalidraw canvas, with a debounced save |
| `src/stubs/mermaid-to-excalidraw.ts` | Empty stand-in for a package we keep out of the bundle |
| `src/styles.css` | Plugin styles. The build adds Excalidraw's CSS in front to make the root `styles.css` |

## Things that will bite you

Merefolk needs `@excalidraw/excalidraw` 0.18 or later (`^0.18.1`). The
crow's-foot arrowheads (`crowfoot_one`, `crowfoot_many`,
`crowfoot_one_or_many`) don't exist in 0.17. Never run `npm audit fix --force`:
it downgrades Excalidraw to 0.17.6.

1. **Build wiring.** Excalidraw 0.18 ships conditional exports, so
   `esbuild.config.mjs` sets `conditions: ["production"]`. Obsidian loads the
   plugin's `styles.css` itself and doesn't allow `<style>` tags injected at
   runtime, so the `merefolk-styles` build step writes the root `styles.css` from
   Excalidraw's `dist/prod/index.css` plus `src/styles.css`. Edit
   `src/styles.css`. The root file is generated and gitignored.
2. **Arrows need explicit `x`/`y` and points.** Without them
   `convertToExcalidrawElements` produces `NaN` geometry, which turns into a
   `NaN` zoom and a stack overflow. Arrows use ELK's route points.
3. **`elbowed` doesn't route in a static export.** Excalidraw only routes elbow
   arrows while you interact with them, so we use ELK's orthogonal
   `edge.sections` instead.
4. **Load scenes through `initialData` on a fresh mount.** Calling `setState`
   from the `excalidrawAPI` callback causes an infinite render loop.
5. **Colors are baked in per theme.** A fixed dark stroke disappears on a dark
   background, so inline renders are redrawn on the `css-change` event.
6. **Excalidraw's Mermaid dialog is aliased out.** Excalidraw lazily imports
   `@excalidraw/mermaid-to-excalidraw` (cytoscape, katex) for a dialog Merefolk
   never opens. `esbuild.config.mjs` points it at `src/stubs/`, which keeps about
   3.6 MB out of `main.js`.
7. **Only English locales are bundled, and the build checks the size.**
   Excalidraw lazily imports 55 locale files, and a single-file bundle inlines
   all of them (about 1.67 MB). Merefolk never sets `langCode`, so Excalidraw
   always uses English. The `merefolk-stub-locales` build step replaces every
   locale except `en-*` and `percentages-*` with an empty module. It matches on
   the name, not the hash, so patch releases keep working. The font-subsetting
   chunk stays, because SVG font embedding needs it. Obsidian Sync's Standard
   plan caps files at 5 MB, so `npm run build` fails when `main.js` reaches
   5,000,000 bytes. The dev build is unminified and isn't checked. Today
   `main.js` is about 4.8 MB.

## Releasing

Run `npm version <x.y.z>`. It updates `manifest.json` and `versions.json`. Then
push a tag that matches the manifest version exactly, with no `v` prefix. The
release workflow builds the plugin and attaches `main.js`, `manifest.json` and
`styles.css` to a GitHub release. The CI workflow runs the same install and
build on every pull request, so make sure it is green before you tag.

## Roadmap

- [ ] Use Mermaid's own ER parser for full syntax support (adds the `mermaid`
      dependency).
- [ ] Bundle Excalidraw's assets (fonts and workers) so the plugin works offline.
- [ ] Unit tests for `parseER` and `elkLayout` (Vitest).
