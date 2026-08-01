import {
	Editor,
	MarkdownPostProcessorContext,
	MarkdownView,
	Notice,
	Plugin,
} from "obsidian";
// Bundled as a string by esbuild's `.css -> text` loader (see esbuild.config.mjs).
// Excalidraw 0.18 no longer auto-injects its stylesheet, so we inject it.
import excalidrawStyles from "@excalidraw/excalidraw/index.css";
import {
	ExcalidrawERView,
	VIEW_TYPE_ER_EXCALIDRAW,
} from "./view/ExcalidrawERView";
import { mermaidERToExcalidraw } from "./pipeline";
import { findMermaidBlocks, mermaidBlockAtLine } from "./mermaid/extractBlock";

const NO_BLOCK_MESSAGE =
	"Put the cursor inside a ```mermaid ER block (or select one) first.";

export default class MerefolkPlugin extends Plugin {
	async onload(): Promise<void> {
		// Excalidraw lazy-loads fonts + web-workers from this path at runtime.
		// Default points at a CDN, which needs network access. For an offline
		// build, copy dist/excalidraw-assets/ into the plugin folder and set
		// this to that local path. See README -> "Offline assets".
		const w = window as unknown as { EXCALIDRAW_ASSET_PATH?: string };
		w.EXCALIDRAW_ASSET_PATH ??=
			"https://unpkg.com/@excalidraw/excalidraw@0.18.1/dist/prod/";

		this.injectExcalidrawStyles();

		this.registerView(
			VIEW_TYPE_ER_EXCALIDRAW,
			(leaf) => new ExcalidrawERView(leaf),
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

		// Add a hover "Excalidraw" button to the top-right of rendered Mermaid
		// ER blocks (Reading view / Live Preview).
		this.registerMarkdownPostProcessor((el, ctx) =>
			this.decorateMermaidBlock(el, ctx),
		);
	}

	/**
	 * If the rendered block is a Mermaid ER diagram, add a hover button in its
	 * top-right corner that converts just that block — mirroring the placement
	 * of Obsidian's native "edit this block" control.
	 */
	private decorateMermaidBlock(
		el: HTMLElement,
		ctx: MarkdownPostProcessorContext,
	): void {
		if (el.querySelector(".merefolk-convert-btn")) return;

		const info = ctx.getSectionInfo(el);
		if (!info) return;

		const lines = info.text.split("\n");
		const opening = lines[info.lineStart]?.trim() ?? "";
		if (!/^`{3,}\s*mermaid\b/.test(opening)) return;

		const source = lines.slice(info.lineStart + 1, info.lineEnd).join("\n");
		if (!/\berDiagram\b/.test(source)) return;

		el.addClass("merefolk-mermaid-host");
		const btn = el.createEl("button", {
			cls: "merefolk-convert-btn",
			text: "Excalidraw",
			attr: {
				type: "button",
				"aria-label": "Convert to Excalidraw (Merefolk)",
			},
		});
		btn.addEventListener("click", (evt) => {
			evt.preventDefault();
			evt.stopPropagation();
			void this.openWithDiagram(source);
		});
	}

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
			const elements = await mermaidERToExcalidraw(source);
			const leaf = this.app.workspace.getLeaf(true);
			await leaf.setViewState({
				type: VIEW_TYPE_ER_EXCALIDRAW,
				active: true,
				state: { elements },
			});
		} catch (err) {
			console.error("[merefolk]", err);
			new Notice(`Could not convert diagram: ${(err as Error).message}`);
		}
	}

	private injectExcalidrawStyles(): void {
		const styleEl = document.createElement("style");
		styleEl.id = "merefolk-excalidraw-styles";
		styleEl.textContent = excalidrawStyles;
		document.head.appendChild(styleEl);
		this.register(() => styleEl.remove());
	}
}
