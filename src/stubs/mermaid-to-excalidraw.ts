// Stub for Excalidraw's built-in "Mermaid to Excalidraw" dialog dependency.
//
// Excalidraw only ever `import()`s @excalidraw/mermaid-to-excalidraw lazily,
// when a user opens its Mermaid dialog. Merefolk does its own ER conversion and
// never opens that dialog, so esbuild aliases the real package (~6 MB, incl.
// cytoscape + katex) to this no-op to keep the bundle lean. See esbuild.config.mjs.

export function parseMermaidToExcalidraw(): never {
	throw new Error(
		"Excalidraw's built-in Mermaid dialog is not available in Merefolk.",
	);
}
