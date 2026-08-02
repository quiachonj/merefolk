# Merefolk

<!-- Downloads badge — uncomment once accepted into the community store:
[![Downloads](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fobsidianmd%2Fobsidian-releases%2Fmaster%2Fcommunity-plugin-stats.json&query=%24.merefolk.downloads&label=downloads&color=7c3aed)](https://obsidian.md/plugins?id=merefolk) -->
[![Release](https://img.shields.io/github/v/release/quiachonj/merefolk?sort=semver&color=7c3aed)](https://github.com/quiachonj/merefolk/releases)
[![License](https://img.shields.io/github/license/quiachonj/merefolk?color=7c3aed)](LICENSE)

An Obsidian plugin that renders Mermaid **entity-relationship** diagrams as
beautiful, **editable Excalidraw** drawings — not the rasterized image fallback
you get from `@excalidraw/mermaid-to-excalidraw` (which
[does not natively support ER diagrams](https://github.com/excalidraw/mermaid-to-excalidraw/issues/59)).

**Website:** [merefolk.amberlogica.com](https://merefolk.amberlogica.com/) ·
**Support:** [Buy me a coffee](https://buymeacoffee.com/joshquiachon) ☕

Write a normal ```mermaid `erDiagram` block. Merefolk replaces it inline with a
hand-drawn Excalidraw render — crow's-foot cardinality, clean orthogonal
routing, non-crowding labels — and lets you open it in a full Excalidraw canvas
to edit, with your changes saved back and shown in the note.

<!-- TODO: add a screenshot or GIF of a rendered diagram + the Open/edit flow. -->
<!-- ![Merefolk rendering an erDiagram as an editable Excalidraw drawing](docs/screenshot.png) -->

## Install

> [!NOTE]
> Merefolk isn't in the Obsidian community store yet. Until it is, install it via
> [BRAT](https://github.com/TfTHacker/obsidian42-brat) or build it from source —
> see [Development](#development).

<!-- Once accepted into the community store, this becomes:
In Obsidian: **Settings → Community plugins → Browse**, search **Merefolk**,
Install, then Enable. -->

Merefolk is **desktop-only** and requires **Excalidraw 0.18+** to be installed
and enabled (for crow's-foot arrowheads).

## Usage

1. In any note, write a fenced ` ```mermaid ` block containing an `erDiagram`:

   ~~~
   ```mermaid
   erDiagram
       CUSTOMER ||--o{ ORDER : places
       ORDER ||--|{ LINE_ITEM : contains
       CUSTOMER {
           string name
           string email PK
       }
   ```
   ~~~

2. Switch to **Reading view** or **Live Preview**. Merefolk replaces the block
   inline with a hand-drawn Excalidraw diagram — crow's-foot cardinality, clean
   orthogonal routing, and real table rows. It scales to fit the note and
   repaints when you switch light/dark theme.

3. Hover the diagram and use the button group:
   - **Open** — launches the diagram in a full, editable Excalidraw canvas.
   - **Copy** — copies the rendered SVG.

4. Edit in the canvas. Your changes save to a companion `.excalidraw` scene, and
   the inline render prefers that saved scene from then on.

5. Changed your mind? On an edited diagram, use **Re-sync from Mermaid** to
   discard the saved scene and regenerate from the source block.

> [!NOTE]
> The Mermaid text is the source of truth **until your first edit** — after that,
> the saved scene wins.

**Three entry points** open a diagram: the inline **Open** button, the command
**"Convert Mermaid ER diagram to Excalidraw"**, and the ribbon icon
(**Merefolk: ER → Excalidraw**).

## Settings

Open **Settings → Merefolk**.

| Setting | What it does | Default |
|---------|--------------|---------|
| **Scene folder** | Vault-relative folder where saved `.excalidraw` scenes are stored. | `.obsidian/merefolk/scenes/` (leave empty for default) |

> [!NOTE]
> Changing the scene folder does not move existing scenes.

## Features

- **Native crow's-foot cardinality** per side (`||`, `|o`, `o{`, `}o` → Excalidraw
  0.18 crow's-foot arrowheads).
- **ELK layout** with orthogonal, box-avoiding **arrow routing** and **edge-label
  placement** (labels don't crowd the lines).
- **Real table rendering** — each entity is a table: centered header, divider,
  aligned `[keys] [type] [name]` columns (one element per cell), and subtle row
  separators.
- **Theme-aware** colors (light/dark), with live repaint on theme switch.
- **Clean defaults** — Comic Shanns (mono, easy to read), small text,
  "architect" (clean) roughness.
- **Edit + persist** — Open into a live Excalidraw canvas; edits save to a
  `.excalidraw` scene and the inline render prefers it. A **Re-sync** button
  discards edits and regenerates from the source.
- **Robust to malformed input** — unrecognized lines are flagged with a ⚠ badge
  (never silently dropped); a totally invalid block falls back to Mermaid's own
  error; non-ER Mermaid is left untouched.

---

## Architecture

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

## Development

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

- [x] Settings tab for the scene-folder location.
- [x] "Re-sync from Mermaid" escape hatch — a per-diagram button (shown only on
      edited scenes) that discards edits and regenerates from the source.
- [x] Render each attribute as its own row — a real table (centered header +
      divider + aligned `[keys] [type] [name]` columns), one element per cell.
- [ ] Swap the hand-written parser for Mermaid's own ER parser (full syntax
      fidelity, at the cost of the `mermaid` dep).
- [ ] Bundle Excalidraw assets locally for offline vaults.
- [ ] Unit tests for `parseER` / `elkLayout` (Vitest).

## Support

If Merefolk is useful to you, you can support development:

- ☕ [Buy me a coffee](https://buymeacoffee.com/joshquiachon)
- 🌐 [merefolk.amberlogica.com](https://merefolk.amberlogica.com/)

## License

MIT © Josh Quiachon / Amberlogica
