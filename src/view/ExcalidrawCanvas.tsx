import { Excalidraw, FONT_FAMILY } from "@excalidraw/excalidraw";

// Deliberately minimal: load the scene via `initialData` on mount and hold no
// state of our own. Calling setState from Excalidraw's render-phase callbacks
// (e.g. excalidrawAPI) can trigger an infinite render loop, so we avoid it.
export function ExcalidrawCanvas({
	initialElements,
}: {
	initialElements: readonly unknown[];
}) {
	return (
		<div style={{ position: "absolute", inset: 0 }}>
			<Excalidraw
				initialData={{
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					elements: initialElements as any,
					appState: {
						viewBackgroundColor: "#ffffff",
						// Default new shapes/text to the Code font too.
						currentItemFontFamily: FONT_FAMILY.Cascadia,
					},
					scrollToContent: true,
				}}
			/>
		</div>
	);
}
