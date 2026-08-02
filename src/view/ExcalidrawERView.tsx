import { ItemView, WorkspaceLeaf, type ViewStateResult } from "obsidian";
import { StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ExcalidrawCanvas } from "./ExcalidrawCanvas";

export const VIEW_TYPE_ER_EXCALIDRAW = "merefolk-er-view";

/** Minimal surface the view needs to persist edits (implemented by the plugin). */
export interface ScenePersister {
	persistScene(id: string, json: string): void | Promise<void>;
}

interface ERViewState {
	elements?: readonly unknown[];
	sceneId?: string | null;
}

/**
 * Obsidian view that hosts a self-rendered Excalidraw React canvas.
 * We own the React root's lifecycle: create on open, unmount on close.
 */
export class ExcalidrawERView extends ItemView {
	private root: Root | null = null;
	private elements: readonly unknown[] = [];
	private sceneId: string | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private persister: ScenePersister,
	) {
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
		if (state?.elements) this.elements = state.elements;
		if (state?.sceneId !== undefined) this.sceneId = state.sceneId ?? null;
		this.renderCanvas();
		return super.setState(state, result);
	}

	async onOpen(): Promise<void> {
		// `.merefolk-er-view` sets position:relative so the absolutely-filled
		// React canvas has a positioned, sized box to measure.
		this.contentEl.addClass("merefolk-er-view");
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
		const id = this.sceneId;
		this.root.render(
			<StrictMode>
				<ExcalidrawCanvas
					initialElements={this.elements}
					onPersist={
						id
							? (json) =>
									void this.persister.persistScene(id, json)
							: undefined
					}
				/>
			</StrictMode>,
		);
	}
}
