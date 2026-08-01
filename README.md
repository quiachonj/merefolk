# Merefolk

An Obsidian plugin that renders Mermaid **entity-relationship** diagrams as
beautiful, **editable Excalidraw** drawings — not the rasterized image fallback
you get from `@excalidraw/mermaid-to-excalidraw` (which
[does not natively support ER diagrams](https://github.com/excalidraw/mermaid-to-excalidraw/issues/59)).

Write a normal ```mermaid `erDiagram` block. Merefolk replaces it inline with a
hand-drawn Excalidraw render — crow's-foot cardinality, clean orthogonal
routing, non-crowding labels — and lets you open it in a full Excalidraw canvas
to edit, with your changes saved back and shown in the note.

## Two features

1. **Render** — in Reading view / Live Preview, an `erDiagram` block is replaced
   by a self-contained Excalidraw SVG (fonts inlined), with a hover **Open** /
   **Copy** button group. It scales down to fit the note and repaints on a
   light/dark theme change.
2. **Edit + persist** — **Open** launches the diagram in a live, editable
   Excalidraw canvas. Edits are saved to a companion `.excalidraw` scene and the
   inline render prefers that saved scene from then on. The Mermaid text is the
   source of truth until your first edit; after that, the saved scene is.

## Highlights

- **Native crow's-foot cardinality** per side (`||`, `|o`, `o{`, `}o` → Excalidraw
  0.18 crow's-foot arrowheads).
- **ELK layout** with orthogonal, box-avoiding **arrow routing** and **edge-label
  placement** (labels don't crowd the lines).
- **Theme-aware** colors (light/dark), with live repaint on theme switch.
- **Hand-drawn defaults** — Excalifont, small text, "architect" (clean) roughness.
- **Robust to malformed input** — unrecognized lines are flagged with a ⚠ badge
  (never silently dropped); a totally invalid block falls back to Mermaid's own
  error; non-ER Mermaid is left untouched.
- **Three entry points** — the inline **Open** button, a command, and a ribbon icon.

## Pipeline

```
Mermaid `erDiagram`
  └─ src/mermaid/parseER.ts     parse -> ERModel (+ skipped lines)
     └─ src/layout/elkLayout.ts   ELK layered layout -> positions, edge routes, label positions
        └─ src/excalidraw/emit.ts   -> native Excalidraw elements (theme colors, crow's-foot)
           ├─ src/excalidraw/toSvg.ts   exportToSvg -> inline render (Feature 2)
           └─ src/view/*               React canvas in an ItemView -> edit + persist (Feature 1)
```

Scene persistence: `src/scene/` (stable `%% merefolk:<id>` block id + `.excalidraw`
files under `.obsidian/merefolk/scenes/`).

## Install (development)

Merefolk isn't in the community store yet. To run it from source:

```bash
npm install
npm run dev      # esbuild watch -> main.js
```

Symlink (or junction) this repo into a test vault's plugins folder so Obsidian
loads it, then enable **Merefolk** under Settings → Community plugins:

```powershell
# Windows (no admin needed): junction the repo into the vault
New-Item -ItemType Junction -Path "C:\path\to\Vault\.obsidian\plugins\merefolk" -Target (Get-Location)
```

```bash
npm run build    # type-check + production bundle
```

Open `test/sample-er.md` (which also contains malformed/edge-case fixtures) to
exercise every path.

## Hard-won implementation notes

> [!IMPORTANT]
> Requires **Excalidraw 0.18+** — crow's-foot arrowheads (`crowfoot_one` /
> `crowfoot_many` / `crowfoot_one_or_many`) don't exist before it.

1. **0.18 build wiring** — 0.18 ships conditional exports and its CSS subpath has
   no `default` condition, so `esbuild.config.mjs` pins `conditions: ["production"]`.
   0.18 does NOT auto-inject its stylesheet, so it's imported and bundled as a
   string via the `.css -> text` loader, then injected at runtime (`src/globals.d.ts`
   declares `*.css`).
2. **Bound arrows need explicit `x`/`y` + points** — otherwise
   `convertToExcalidrawElements` derives `NaN` geometry, which cascades to a `NaN`
   zoom and a call-stack overflow. Arrows use ELK's route points.
3. **`elbowed` doesn't route in a static export** — elbow routing is
   interaction-time only. We use ELK's orthogonal `edge.sections` for the arrow
   points instead.
4. **Load scenes via `initialData`** on a fresh mount, never `setState` from the
   `excalidrawAPI` render-phase callback (infinite render loop).
5. **Theme:** colors are baked per active theme (a fixed dark stroke is invisible
   on a dark background); inline renders re-derive on the `css-change` event.
6. **Bundle:** aliased out Excalidraw's built-in `@excalidraw/mermaid-to-excalidraw`
   dialog dep (cytoscape/katex, ~6 MB) via `src/stubs/` — it's only lazily
   imported and we never open that dialog.

## Roadmap

- [ ] Settings tab for the scene-folder location.
- [ ] "Re-sync from Mermaid" escape hatch for an edited scene.
- [ ] Render each attribute as its own row instead of one multi-line label.
- [ ] Swap the hand-written parser for Mermaid's own ER parser (full syntax
      fidelity, at the cost of the `mermaid` dep).
- [ ] Bundle Excalidraw assets locally for offline vaults.
- [ ] Unit tests for `parseER` / `elkLayout` (Vitest).

## License

MIT
