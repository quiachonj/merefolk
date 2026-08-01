# Merefolk

An Obsidian plugin that converts Mermaid **entity-relationship** diagrams into
**native, editable Excalidraw** drawings — not the rasterized image fallback you
get from `@excalidraw/mermaid-to-excalidraw` (which
[does not natively support ER diagrams](https://github.com/excalidraw/mermaid-to-excalidraw/issues/59)).

The canvas is **self-rendered** with `@excalidraw/excalidraw`, so this plugin
does **not** depend on the standalone Obsidian Excalidraw plugin.

## Pipeline

```
Mermaid `erDiagram` source
  └─ src/mermaid/parseER.ts   parse -> ERModel   (entities, attributes, relationships)
     └─ src/layout/elkLayout.ts   ELK layered layout -> positioned entities
        └─ src/excalidraw/emit.ts   -> native Excalidraw elements
           └─ src/view/*   React root hosting <Excalidraw> inside an Obsidian ItemView
```

Entry point: `src/main.ts` (command + ribbon icon → opens the ER view).

## Develop

```bash
npm install
npm run dev      # esbuild watch -> main.js
```

Symlink (or clone) this folder into a test vault so Obsidian loads it:

```bash
# from this folder, into your vault's plugin dir
ln -s "$PWD" "/path/to/Vault/.obsidian/plugins/mermaid-er-excalidraw"
```

On Windows (PowerShell, admin):

```powershell
New-Item -ItemType SymbolicLink -Path "C:\path\to\Vault\.obsidian\plugins\mermaid-er-excalidraw" -Target (Get-Location)
```

Then enable **Mermaid ER to Excalidraw** in Settings → Community plugins, and run
the command **"Convert selected Mermaid ER diagram to Excalidraw"** with an
`erDiagram` block selected.

```bash
npm run build    # type-check + production bundle
```

## Gotchas already handled in this scaffold

1. **Excalidraw 0.18 build wiring** — 0.18 ships conditional exports (prod/dev),
   and its CSS subpath (`@excalidraw/excalidraw/index.css`) has no `default`
   condition, so `esbuild.config.mjs` pins `conditions: ["production"]`. Unlike
   0.17, 0.18 does NOT auto-inject its stylesheet, so it's imported in `main.ts`,
   bundled as a string via the `.css -> text` loader, and injected as a `<style>`
   tag at runtime. `src/globals.d.ts` declares `*.css` so `tsc` is happy.

2. **Asset path** — Excalidraw lazy-loads fonts/workers at runtime. The scaffold
   sets `window.EXCALIDRAW_ASSET_PATH` to a CDN (`.../dist/prod/`) so it renders
   out of the box **(requires network)**. For offline use, copy
   `node_modules/@excalidraw/excalidraw/dist/prod/` assets into the plugin folder
   at build time and point `EXCALIDRAW_ASSET_PATH` at that local path.

3. **Bound arrows need an explicit `x`/`y`** — `convertToExcalidrawElements`
   derives `NaN` geometry for an arrow that only has `start`/`end` bindings and
   no origin. That NaN propagates to a `NaN` scene bounding box → `NaN` zoom →
   `RangeError: Maximum call stack size exceeded`. `emit.ts` gives every arrow an
   `x`/`y` and `points` computed from the entity boxes.

4. **Load via `initialData`, not `updateScene`** — the scene is loaded through
   `initialData` on a fresh mount, and the canvas component holds no React state
   of its own. Calling `setState` from Excalidraw's `excalidrawAPI` render-phase
   callback can trigger an infinite render loop.

## Roadmap / TODO

- [x] End-to-end: parse `erDiagram` -> ELK layout -> native Excalidraw scene.
- [x] Scope conversion to the single ```mermaid block under the cursor
      (selection wins; single-block notes still auto-resolve).
- [x] Native **crow's-foot** cardinality endpoints per side (needs Excalidraw
      0.18+). Optional-zero variants approximate (no combined circle glyph).
- [x] Element defaults: **Excalifont**, small font size, **elbow arrows**,
      "architect" (roughness 0) sloppiness — in `emit.ts` + view `appState`.
- [x] Trim bundle 10 MB -> 6.5 MB: alias out Excalidraw's built-in
      `@excalidraw/mermaid-to-excalidraw` dialog dep (cytoscape/katex) and drop
      the unused `mermaid` dependency. See `src/stubs/` + esbuild `alias`.
- [x] **Feature 2 (Phase 1): inline SVG render.** A markdown post-processor
      replaces rendered Mermaid ER blocks with a beautiful Excalidraw
      `exportToSvg` (fonts auto-inlined), plus a top-right hover **Open** /
      **Copy** button group. Falls back to Mermaid on error. See `toSvg.ts` +
      `main.ts` (`renderErBlock`).
- [ ] **Feature 1 (Phase 2): edit + persist.** Open button already opens the
      editable canvas; next: stable block id (`%% merefolk:<id>`), save the
      edited scene to a `.excalidraw` file, and make the inline SVG prefer the
      saved scene. Source of truth: Mermaid until first edit, then `.excalidraw`.
- [ ] Render each attribute as its own row instead of one multi-line label.
- [ ] Swap the hand-written parser for Mermaid's own ER parser for full syntax
      coverage (aliases, quoted names, generics).
- [ ] Bundle Excalidraw assets locally for offline vaults.
- [ ] Unit tests for `parseER` / `elkLayout` (Vitest).

## License

MIT
