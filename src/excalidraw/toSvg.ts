import { exportToClipboard, exportToSvg } from "@excalidraw/excalidraw";

// Our pipeline hands us Excalidraw elements; keep the boundary loose so we
// don't depend on Excalidraw's deep element types.
type Elements = Parameters<typeof exportToSvg>[0]["elements"];

// Transparent background so the render sits on the note's own background.
const APP_STATE = { exportBackground: false };
// Breathing room around the diagram so it doesn't touch the note edges.
const PADDING = 20;

/**
 * Render Excalidraw elements to a standalone SVG. Fonts (Excalifont) are
 * inlined by default, so the SVG is self-contained.
 */
export function elementsToSvg(
	elements: readonly unknown[],
): Promise<SVGSVGElement> {
	return exportToSvg({
		elements: elements as Elements,
		appState: APP_STATE,
		files: {},
		exportPadding: PADDING,
	});
}

/** Copy the elements to the clipboard as SVG. */
export function copyElementsAsSvg(elements: readonly unknown[]): Promise<void> {
	return exportToClipboard({
		elements: elements as Elements,
		appState: APP_STATE,
		files: {},
		type: "svg",
	});
}
