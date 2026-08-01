import {
	Excalidraw,
	FONT_FAMILY,
	serializeAsJSON,
} from "@excalidraw/excalidraw";
import { debounce } from "obsidian";
import { useMemo } from "react";
import { isDarkTheme } from "../theme";

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
			(els: unknown, appState: unknown, files: unknown) => {
				onPersist(
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					serializeAsJSON(
						els as any,
						appState as any,
						files as any,
						"local",
					),
				);
			},
			800,
			false,
		);
	}, [onPersist]);

	return (
		<div style={{ position: "absolute", inset: 0 }}>
			<Excalidraw
				theme={dark ? "dark" : "light"}
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				onChange={handleChange as any}
				initialData={{
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					elements: initialElements as any,
					appState: {
						viewBackgroundColor: dark ? "#1e1e1e" : "#ffffff",
						// Match the emitted elements so anything drawn afterward
						// shares the same defaults.
						currentItemFontFamily: FONT_FAMILY.Excalifont,
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
