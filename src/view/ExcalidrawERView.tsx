import { ItemView, WorkspaceLeaf, type ViewStateResult } from "obsidian";
import { StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ExcalidrawCanvas } from "./ExcalidrawCanvas";

export const VIEW_TYPE_ER_EXCALIDRAW = "merefolk-er-view";

interface ERViewState {
	elements?: readonly unknown[];
}

/**
 * Obsidian view that hosts a self-rendered Excalidraw React canvas.
 * We own the React root's lifecycle: create on open, unmount on close.
 */
export class ExcalidrawERView extends ItemView {
	private root: Root | null = null;
	private elements: readonly unknown[] = [];

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_ER_EXCALIDRAW;
	}

	getDisplayText(): string {
		return "Merefolk ER diagram";
	}

	getIcon(): string {
		return "table";
	}

	async setState(state: ERViewState, result: ViewStateResult): Promise<void> {
		if (state?.elements) {
			this.elements = state.elements;
			this.renderCanvas();
		}
		return super.setState(state, result);
	}

	async onOpen(): Promise<void> {
		this.contentEl.addClass("merefolk-er-view");
		// The React root fills this element absolutely, so it must be a
		// positioned, sized box.
		this.contentEl.style.position = "relative";
		this.renderCanvas();
	}

	async onClose(): Promise<void> {
		this.root?.unmount();
		this.root = null;
	}

	private renderCanvas(): void {
		if (!this.root) {
			this.root = createRoot(this.contentEl);
		}
		this.root.render(
			<StrictMode>
				<ExcalidrawCanvas initialElements={this.elements} />
			</StrictMode>,
		);
	}
}
