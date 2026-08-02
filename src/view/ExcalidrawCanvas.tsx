import {
	Excalidraw,
	FONT_FAMILY,
	serializeAsJSON,
} from "@excalidraw/excalidraw";
import { debounce } from "obsidian";
import { useMemo } from "react";
import { isDarkTheme } from "../theme";

// Scene types that Excalidraw's onChange provides and serializeAsJSON consumes,
// derived from serializeAsJSON so we don't depend on Excalidraw's deep type paths.
type SceneElements = Parameters<typeof serializeAsJSON>[0];
type SceneAppState = Parameters<typeof serializeAsJSON>[1];
type SceneFiles = Parameters<typeof serializeAsJSON>[2];

// Deliberately minimal: load the scene via `initialData` on mount and hold no
// state of our own. Calling setState from Excalidraw's render-phase callbacks
// (e.g. excalidrawAPI) can trigger an infinite render loop, so we avoid it.
export function ExcalidrawCanvas({
	initialElements,
	onPersist,
}: {
	initialElements: readonly unknown[];
	/** Called (debounced) with serialized scene JSON when the scene changes. */
	onPersist?: (json: string) => void;
}) {
	const dark = isDarkTheme();

	const handleChange = useMemo(() => {
		if (!onPersist) return undefined;
		return debounce(
			(
				els: SceneElements,
				appState: SceneAppState,
				files: SceneFiles,
			) => {
				onPersist(serializeAsJSON(els, appState, files, "local"));
			},
			800,
			false,
		);
	}, [onPersist]);

	return (
		<div className="merefolk-canvas-fill">
			<Excalidraw
				theme={dark ? "dark" : "light"}
				onChange={handleChange}
				initialData={{
					elements: initialElements as SceneElements,
					appState: {
						viewBackgroundColor: dark ? "#1e1e1e" : "#ffffff",
						// Match the emitted elements so anything drawn afterward
						// shares the same defaults.
						currentItemFontFamily: FONT_FAMILY["Comic Shanns"],
						currentItemFontSize: 16, // small
						currentItemRoughness: 0, // architect
						currentItemArrowType: "elbow",
					},
					scrollToContent: true,
				}}
			/>
		</div>
	);
}
