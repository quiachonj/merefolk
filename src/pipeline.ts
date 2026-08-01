import { parseMermaidER } from "./mermaid/parseER";
import { layoutER } from "./layout/elkLayout";
import { emitExcalidrawElements } from "./excalidraw/emit";
import { diagramColors, type DiagramColors } from "./theme";

export interface ConversionResult {
	elements: readonly unknown[];
	/** Non-blank, non-comment source lines the parser did not recognize. */
	skipped: string[];
}

/**
 * Full conversion: Mermaid `erDiagram` source -> native Excalidraw elements.
 * parse -> ELK layout -> Excalidraw emit. Colors default to the active theme.
 * `skipped` reports lines the (lenient) parser could not make sense of, so the
 * UI can warn that the render may be incomplete.
 */
export async function mermaidERToExcalidraw(
	source: string,
	colors: DiagramColors = diagramColors(),
): Promise<ConversionResult> {
	const model = parseMermaidER(source);
	if (model.entities.length === 0) {
		throw new Error(
			"No ER entities found. Make sure the selection is an `erDiagram` block.",
		);
	}
	const { entities, routes, labels } = await layoutER(model);
	const elements = emitExcalidrawElements(
		entities,
		model,
		colors,
		routes,
		labels,
	);
	return { elements, skipped: model.skipped };
}
