export interface DiagramColors {
	/** Box borders + arrow strokes. */
	stroke: string;
	/** Entity box fill. */
	fill: string;
	/** Label text. */
	text: string;
}

/** Obsidian sets `theme-dark` / `theme-light` on <body>. */
export function isDarkTheme(): boolean {
	return document.body.classList.contains("theme-dark");
}

/**
 * Diagram palette for the current (or a given) theme. Baked into the elements
 * so strokes/text/fill all read against the note background — a single fixed
 * dark stroke would vanish on a dark theme.
 */
export function diagramColors(dark: boolean = isDarkTheme()): DiagramColors {
	return dark
		? { stroke: "#ced4da", fill: "#2b2b2b", text: "#e9ecef" }
		: { stroke: "#1e1e1e", fill: "#f8f9fa", text: "#1e1e1e" };
}
