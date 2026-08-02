import { exportToClipboard, exportToSvg } from "@excalidraw/excalidraw";

interface ExportOpts {
	elements: readonly unknown[];
	appState: Record<string, unknown>;
	files: Record<string, unknown>;
	exportPadding?: number;
}

// Excalidraw's published types don't resolve cleanly under type-aware linting,
// so we pin concrete signatures for the two helpers we use. Our pipeline hands
// us real Excalidraw elements; we keep the element type loose at this boundary.
const svgExport = exportToSvg as unknown as (
	opts: ExportOpts,
) => Promise<SVGSVGElement>;
const clipboardExport = exportToClipboard as unknown as (
	opts: ExportOpts & { type: "png" | "svg" | "json" },
) => Promise<void>;

// Transparent background so the render sits on the note's own background.
const APP_STATE: Record<string, unknown> = { exportBackground: false };
// Breathing room around the diagram so it doesn't touch the note edges.
const PADDING = 20;

/**
 * Render Excalidraw elements to a standalone SVG. Fonts are inlined by default,
 * so the SVG is self-contained.
 */
export function elementsToSvg(
	elements: readonly unknown[],
): Promise<SVGSVGElement> {
	return svgExport({
		elements,
		appState: APP_STATE,
		files: {},
		exportPadding: PADDING,
	});
}

/** Copy the elements to the clipboard as SVG. */
export function copyElementsAsSvg(elements: readonly unknown[]): Promise<void> {
	return clipboardExport({
		elements,
		appState: APP_STATE,
		files: {},
		type: "svg",
	});
}
