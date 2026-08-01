import {
	Editor,
	MarkdownPostProcessorContext,
	MarkdownView,
	Notice,
	Plugin,
	TFile,
} from "obsidian";
// Bundled as a string by esbuild's `.css -> text` loader (see esbuild.config.mjs).
// Excalidraw 0.18 no longer auto-injects its stylesheet, so we inject it.
import excalidrawStyles from "@excalidraw/excalidraw/index.css";
import {
	ExcalidrawERView,
	VIEW_TYPE_ER_EXCALIDRAW,
} from "./view/ExcalidrawERView";
import { mermaidERToExcalidraw, type ConversionResult } from "./pipeline";
import { findMermaidBlocks, mermaidBlockAtLine } from "./mermaid/extractBlock";
import { copyElementsAsSvg, elementsToSvg } from "./excalidraw/toSvg";
import { extractSceneId, newSceneId, sceneIdComment } from "./scene/id";
import { loadSceneElements, saveScene } from "./scene/store";

const NO_BLOCK_MESSAGE =
	"Put the cursor inside a ```mermaid ER block (or select one) first.";

/** Everything needed to render, open, and persist one ER block. */
interface BlockRef {
	source: string;
	sourcePath: string;
	/** 0-based line of the opening ``` fence in the note. */
	lineStart: number;
	/** Stable scene id from the block's `%% merefolk:<id>` comment, if any. */
	id: string | null;
}

export default class MerefolkPlugin extends Plugin {
	async onload(): Promise<void> {
		// Excalidraw lazy-loads fonts + web-workers from this path at runtime.
		// Default points at a CDN, which needs network access. For an offline
		// build, copy dist/prod/ assets into the plugin folder and set this to
		// that local path. See README -> "Offline assets".
		const w = window as unknown as { EXCALIDRAW_ASSET_PATH?: string };
		w.EXCALIDRAW_ASSET_PATH ??=
			"https://unpkg.com/@excalidraw/excalidraw@0.18.1/dist/prod/";

		this.injectExcalidrawStyles();

		this.registerView(
			VIEW_TYPE_ER_EXCALIDRAW,
			(leaf) => new ExcalidrawERView(leaf, this),
		);

		this.addCommand({
			id: "convert-mermaid-er",
			name: "Convert Mermaid ER diagram to Excalidraw",
			editorCallback: (editor) => this.convertFromEditor(editor),
		});

		this.addRibbonIcon("table", "Merefolk: ER → Excalidraw", () => {
			const view = this.app.workspace.getActiveViewOfType(MarkdownView);
			if (!view) {
				new Notice("Open a note with a Mermaid ER block first.");
				return;
			}
			this.convertFromEditor(view.editor);
		});

		// Replace rendered Mermaid ER blocks with a beautiful Excalidraw SVG
		// plus Open/Copy buttons (Reading view / Live Preview).
		this.registerMarkdownPostProcessor((el, ctx) =>
			this.renderErBlock(el, ctx),
		);

		// Repaint inline renders when the user switches light/dark theme.
		this.registerEvent(
			this.app.workspace.on("css-change", () =>
				this.rerenderInlineRenders(),
			),
		);
	}

	// --- Inline render --------------------------------------------------------

	/**
	 * If the rendered block is a Mermaid ER diagram, replace its output with an
	 * Excalidraw-exported SVG and a top-right Open/Copy button group. On any
	 * failure we leave Obsidian's Mermaid render untouched.
	 */
	private renderErBlock(
		el: HTMLElement,
		ctx: MarkdownPostProcessorContext,
	): void {
		if (el.querySelector(".merefolk-render")) return;

		const info = ctx.getSectionInfo(el);
		if (!info) return;

		const lines = info.text.split("\n");
		const opening = lines[info.lineStart]?.trim() ?? "";
		if (!/^`{3,}\s*mermaid\b/.test(opening)) return;

		const source = lines.slice(info.lineStart + 1, info.lineEnd).join("\n");
		if (!/\berDiagram\b/.test(source)) return;

		void this.replaceWithSvg(el, {
			source,
			sourcePath: ctx.sourcePath,
			lineStart: info.lineStart,
			id: extractSceneId(source),
		});
	}

	private async replaceWithSvg(
		el: HTMLElement,
		ref: BlockRef,
	): Promise<void> {
		let elements: readonly unknown[];
		let skipped: string[];
		let svg: SVGSVGElement;
		try {
			const res = await this.resolveElements(ref);
			elements = res.elements;
			skipped = res.skipped;
			svg = await elementsToSvg(elements);
		} catch (err) {
			// Not a valid ER diagram (or export failed) — leave Mermaid's render.
			console.debug("[merefolk] inline render skipped:", err);
			return;
		}

		// Keep the intrinsic width so the SVG renders at natural size and only
		// scales DOWN to fit the note (never stretches up). Drop the fixed
		// height so it keeps aspect ratio via the viewBox.
		svg.removeAttribute("height");
		svg.addClass("merefolk-svg");

		el.empty();
		const wrap = el.createDiv({ cls: "merefolk-render" });
		// Stashed so we can re-render this block on a theme change or after a save.
		wrap.dataset.merefolkSource = ref.source;
		wrap.dataset.merefolkPath = ref.sourcePath;
		wrap.dataset.merefolkLine = String(ref.lineStart);
		if (ref.id) wrap.dataset.merefolkId = ref.id;
		wrap.appendChild(svg);
		this.addOverlays(wrap, ref, elements, skipped);
	}

	/** Prefer a saved (edited) scene; otherwise derive from the Mermaid source. */
	private async resolveElements(ref: BlockRef): Promise<ConversionResult> {
		if (ref.id) {
			const saved = await loadSceneElements(this.app, ref.id);
			if (saved) return { elements: saved, skipped: [] };
		}
		return mermaidERToExcalidraw(ref.source);
	}

	private addOverlays(
		wrap: HTMLElement,
		ref: BlockRef,
		elements: readonly unknown[],
		skipped: string[],
	): void {
		// Always-visible warning (top-left) when the parser dropped lines, so an
		// incomplete render never looks complete.
		if (skipped.length) {
			const warn = wrap.createEl("button", {
				cls: "merefolk-warn",
				text: `⚠ ${skipped.length}`,
				attr: {
					type: "button",
					"aria-label": `${skipped.length} line(s) not recognized`,
					title: `Not recognized — render may be incomplete:\n${skipped.join("\n")}`,
				},
			});
			warn.addEventListener("click", (evt) => {
				evt.preventDefault();
				this.warnSkipped(skipped);
			});
		}

		const bar = wrap.createDiv({ cls: "merefolk-btn-bar" });

		const open = bar.createEl("button", {
			cls: "merefolk-btn",
			text: "Open",
			attr: {
				type: "button",
				"aria-label": "Open in editable Excalidraw",
			},
		});
		open.addEventListener("click", (evt) => {
			evt.preventDefault();
			void this.openBlock(ref);
		});

		const copy = bar.createEl("button", {
			cls: "merefolk-btn",
			text: "Copy",
			attr: { type: "button", "aria-label": "Copy diagram as SVG" },
		});
		copy.addEventListener("click", async (evt) => {
			evt.preventDefault();
			try {
				await copyElementsAsSvg(elements);
				new Notice("Copied SVG to clipboard");
			} catch (err) {
				console.error("[merefolk]", err);
				new Notice("Could not copy SVG");
			}
		});
	}

	/** Re-render every inline SVG (e.g. on a theme change). */
	private rerenderInlineRenders(): void {
		document
			.querySelectorAll<HTMLElement>(".merefolk-render")
			.forEach((wrap) => this.rerenderWrap(wrap));
	}

	/** Re-render only the inline blocks bound to a given saved scene. */
	private refreshInlineById(id: string): void {
		document
			.querySelectorAll<HTMLElement>(
				`.merefolk-render[data-merefolk-id="${CSS.escape(id)}"]`,
			)
			.forEach((wrap) => this.rerenderWrap(wrap));
	}

	private rerenderWrap(wrap: HTMLElement): void {
		const ref = this.refFromWrap(wrap);
		const el = wrap.parentElement;
		if (ref && el instanceof HTMLElement) void this.replaceWithSvg(el, ref);
	}

	private refFromWrap(wrap: HTMLElement): BlockRef | null {
		const { merefolkSource, merefolkPath, merefolkLine, merefolkId } =
			wrap.dataset;
		if (merefolkSource == null || merefolkPath == null) return null;
		return {
			source: merefolkSource,
			sourcePath: merefolkPath,
			lineStart: Number(merefolkLine ?? 0),
			id: merefolkId ?? null,
		};
	}

	// --- Edit + persist -------------------------------------------------------

	/** Open a block in the editable canvas, ensuring it has a persistent id. */
	private async openBlock(ref: BlockRef): Promise<void> {
		try {
			let id = ref.id;
			if (!id) {
				id = newSceneId();
				await this.injectSceneId(ref, id);
			}
			let elements = await loadSceneElements(this.app, id);
			if (!elements) {
				const res = await mermaidERToExcalidraw(ref.source);
				elements = res.elements;
				if (res.skipped.length) this.warnSkipped(res.skipped);
			}
			await this.openElements(elements, id);
		} catch (err) {
			console.error("[merefolk]", err);
			new Notice(`Could not open diagram: ${(err as Error).message}`);
		}
	}

	/**
	 * Insert a `%% merefolk:<id>` comment right after the block's `erDiagram`
	 * line. Placing it after the declaration (not before) keeps the block valid
	 * Mermaid, and matching the declaration's indentation keeps it tidy.
	 */
	private async injectSceneId(ref: BlockRef, id: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(ref.sourcePath);
		if (!(file instanceof TFile)) return;
		await this.app.vault.process(file, (data) => {
			const lines = data.split("\n");

			// Find the erDiagram line within this block; bail at the closing fence.
			let declLine = -1;
			for (let i = ref.lineStart; i < lines.length; i++) {
				if (i > ref.lineStart && /^\s*```/.test(lines[i])) break;
				if (/^\s*erDiagram\b/.test(lines[i])) {
					declLine = i;
					break;
				}
			}
			if (declLine === -1) return data; // couldn't locate it; leave note as-is

			if (lines[declLine + 1]?.includes("merefolk:")) return data; // already tagged
			const indent = lines[declLine].match(/^\s*/)?.[0] ?? "";
			lines.splice(declLine + 1, 0, `${indent}${sceneIdComment(id)}`);
			return lines.join("\n");
		});
	}

	/** Persist a scene's JSON, then refresh any inline renders of it. */
	async persistScene(id: string, json: string): Promise<void> {
		await saveScene(this.app, id, json);
		this.refreshInlineById(id);
	}

	private warnSkipped(skipped: string[]): void {
		new Notice(
			`Merefolk skipped ${skipped.length} unrecognized line(s):\n` +
				skipped.join("\n"),
		);
	}

	// --- Editor command / ribbon (ephemeral, no persistence) ------------------

	private async convertFromEditor(editor: Editor): Promise<void> {
		const source = this.resolveErSource(editor);
		if (!source) {
			new Notice(NO_BLOCK_MESSAGE);
			return;
		}
		await this.openWithDiagram(source);
	}

	/**
	 * Pick the ER source for the current editor:
	 *   1. an explicit selection wins,
	 *   2. otherwise the ```mermaid block under the cursor,
	 *   3. otherwise, if the note has exactly one mermaid block, use it.
	 */
	private resolveErSource(editor: Editor): string | null {
		const selection = editor.getSelection();
		if (selection && selection.trim()) return selection;

		const text = editor.getValue();
		const atCursor = mermaidBlockAtLine(text, editor.getCursor().line);
		if (atCursor) return atCursor;

		const blocks = findMermaidBlocks(text);
		return blocks.length === 1 ? blocks[0].content : null;
	}

	private async openWithDiagram(source: string): Promise<void> {
		try {
			const { elements, skipped } = await mermaidERToExcalidraw(source);
			if (skipped.length) this.warnSkipped(skipped);
			await this.openElements(elements);
		} catch (err) {
			console.error("[merefolk]", err);
			new Notice(`Could not convert diagram: ${(err as Error).message}`);
		}
	}

	/** Open the editable Excalidraw view with pre-computed elements. */
	private async openElements(
		elements: readonly unknown[],
		sceneId?: string,
	): Promise<void> {
		const leaf = this.app.workspace.getLeaf(true);
		await leaf.setViewState({
			type: VIEW_TYPE_ER_EXCALIDRAW,
			active: true,
			state: { elements, sceneId: sceneId ?? null },
		});
	}

	private injectExcalidrawStyles(): void {
		const styleEl = document.createElement("style");
		styleEl.id = "merefolk-excalidraw-styles";
		styleEl.textContent = excalidrawStyles;
		document.head.appendChild(styleEl);
		this.register(() => styleEl.remove());
	}
}
