import {
	Editor,
	MarkdownPostProcessorContext,
	MarkdownView,
	Modal,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	TFile,
	normalizePath,
} from "obsidian";
import {
	ExcalidrawERView,
	VIEW_TYPE_ER_EXCALIDRAW,
} from "./view/ExcalidrawERView";
import { mermaidERToExcalidraw } from "./pipeline";
import { findMermaidBlocks, mermaidBlockAtLine } from "./mermaid/extractBlock";
import { copyElementsAsSvg, elementsToSvg } from "./excalidraw/toSvg";
import { extractSceneId, newSceneId, sceneIdComment } from "./scene/id";
import { deleteScene, loadSceneElements, saveScene } from "./scene/store";

const NO_BLOCK_MESSAGE =
	"Put the cursor inside a ```mermaid ER block (or select one) first.";

interface MerefolkSettings {
	/** Vault-relative folder for saved scenes; empty = default under configDir. */
	sceneFolder: string;
}

const DEFAULT_SETTINGS: MerefolkSettings = { sceneFolder: "" };

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
	settings: MerefolkSettings = DEFAULT_SETTINGS;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.addSettingTab(new MerefolkSettingTab(this.app, this));

		// Excalidraw lazy-loads fonts + web-workers from this path at runtime.
		// Default points at a CDN, which needs network access. For an offline
		// build, copy dist/prod/ assets into the plugin folder and set this to
		// that local path. See README -> "Offline assets".
		const w = window as unknown as { EXCALIDRAW_ASSET_PATH?: string };
		w.EXCALIDRAW_ASSET_PATH ??=
			"https://unpkg.com/@excalidraw/excalidraw@0.18.1/dist/prod/";

		this.registerView(
			VIEW_TYPE_ER_EXCALIDRAW,
			(leaf) => new ExcalidrawERView(leaf, this),
		);

		this.addCommand({
			id: "convert-mermaid-er",
			name: "Convert Mermaid ER diagram to Excalidraw",
			editorCallback: (editor) => {
				void this.convertFromEditor(editor);
			},
		});

		this.addRibbonIcon("table", "Merefolk: ER → Excalidraw", () => {
			const view = this.app.workspace.getActiveViewOfType(MarkdownView);
			if (!view) {
				new Notice("Open a note with a Mermaid ER block first.");
				return;
			}
			void this.convertFromEditor(view.editor);
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
		let fromSaved: boolean;
		let svg: SVGSVGElement;
		try {
			const res = await this.resolveElements(ref);
			elements = res.elements;
			skipped = res.skipped;
			fromSaved = res.fromSaved;
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
		this.addOverlays(wrap, ref, elements, skipped, fromSaved);
	}

	/** Prefer a saved (edited) scene; otherwise derive from the Mermaid source. */
	private async resolveElements(ref: BlockRef): Promise<{
		elements: readonly unknown[];
		skipped: string[];
		fromSaved: boolean;
	}> {
		if (ref.id) {
			const saved = await loadSceneElements(
				this.app,
				this.sceneDir(),
				ref.id,
			);
			if (saved) return { elements: saved, skipped: [], fromSaved: true };
		}
		const res = await mermaidERToExcalidraw(ref.source);
		return {
			elements: res.elements,
			skipped: res.skipped,
			fromSaved: false,
		};
	}

	private addOverlays(
		wrap: HTMLElement,
		ref: BlockRef,
		elements: readonly unknown[],
		skipped: string[],
		fromSaved: boolean,
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
		copy.addEventListener("click", (evt) => {
			evt.preventDefault();
			void this.copyToClipboard(elements);
		});

		// Escape hatch: only shown when this block is rendering a saved (edited)
		// scene — lets the user discard edits and go back to the Mermaid source.
		if (fromSaved && ref.id) {
			const id = ref.id;
			const resync = bar.createEl("button", {
				cls: "merefolk-btn",
				text: "Re-sync",
				attr: {
					type: "button",
					"aria-label": "Discard edits and regenerate from Mermaid",
				},
			});
			resync.addEventListener("click", (evt) => {
				evt.preventDefault();
				new ConfirmModal(this.app, {
					title: "Re-sync from Mermaid?",
					body:
						"This discards your Excalidraw edits for this diagram and " +
						"regenerates it from the Mermaid source. This can't be undone.",
					confirmText: "Discard edits",
					onConfirm: async () => {
						await deleteScene(this.app, this.sceneDir(), id);
						this.rerenderWrap(wrap);
						new Notice("Re-synced from Mermaid");
					},
				}).open();
			});
		}
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
			let elements = await loadSceneElements(
				this.app,
				this.sceneDir(),
				id,
			);
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
		await saveScene(this.app, this.sceneDir(), id, json);
		this.refreshInlineById(id);
	}

	private async copyToClipboard(elements: readonly unknown[]): Promise<void> {
		try {
			await copyElementsAsSvg(elements);
			new Notice("Copied SVG to clipboard");
		} catch (err) {
			console.error("[merefolk]", err);
			new Notice("Could not copy SVG");
		}
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

	// --- Settings -------------------------------------------------------------

	/** Resolved folder where scenes are saved (configured, or the default). */
	sceneDir(): string {
		const custom = this.settings.sceneFolder.trim();
		return custom ? normalizePath(custom) : this.defaultSceneFolder();
	}

	async loadSettings(): Promise<void> {
		const data =
			(await this.loadData()) as Partial<MerefolkSettings> | null;
		this.settings = { ...DEFAULT_SETTINGS, ...(data ?? {}) };
	}

	/** Default scene folder under the vault's (possibly renamed) config dir. */
	defaultSceneFolder(): string {
		return `${this.app.vault.configDir}/merefolk/scenes`;
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}

class MerefolkSettingTab extends PluginSettingTab {
	constructor(
		app: MerefolkPlugin["app"],
		private plugin: MerefolkPlugin,
	) {
		super(app, plugin);
	}

	display(): void {
		this.containerEl.empty();

		const defaultDir = this.plugin.defaultSceneFolder();
		new Setting(this.containerEl)
			.setName("Scene folder")
			.setDesc(
				"Vault-relative folder for saved .excalidraw scenes. " +
					`Leave empty to use the default (${defaultDir}). ` +
					"Changing this does not move existing scenes.",
			)
			.addText((text) =>
				text
					.setPlaceholder(defaultDir)
					.setValue(this.plugin.settings.sceneFolder)
					.onChange(async (value) => {
						this.plugin.settings.sceneFolder = value;
						await this.plugin.saveSettings();
					}),
			);
	}
}

/** Minimal confirm dialog for destructive actions (e.g. discarding edits). */
class ConfirmModal extends Modal {
	constructor(
		app: MerefolkPlugin["app"],
		private opts: {
			title: string;
			body: string;
			confirmText: string;
			onConfirm: () => void | Promise<void>;
		},
	) {
		super(app);
	}

	onOpen(): void {
		this.titleEl.setText(this.opts.title);
		this.contentEl.createEl("p", { text: this.opts.body });
		const buttons = this.contentEl.createDiv({
			cls: "modal-button-container",
		});
		const confirm = buttons.createEl("button", {
			text: this.opts.confirmText,
			cls: "mod-warning",
		});
		confirm.addEventListener("click", () => {
			this.close();
			void this.opts.onConfirm();
		});
		const cancel = buttons.createEl("button", { text: "Cancel" });
		cancel.addEventListener("click", () => this.close());
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
