import { parseMermaidER } from "./mermaid/parseER";
import { layoutER } from "./layout/elkLayout";
import { emitExcalidrawElements } from "./excalidraw/emit";
import { diagramColors, type DiagramColors } from "./theme";

/**
 * Full conversion: Mermaid `erDiagram` source -> native Excalidraw elements.
 * parse -> ELK layout -> Excalidraw emit. Colors default to the active theme.
 */
export async function mermaidERToExcalidraw(
	source: string,
	colors: DiagramColors = diagramColors(),
) {
	const model = parseMermaidER(source);
	if (model.entities.length === 0) {
		throw new Error(
			"No ER entities found. Make sure the selection is an `erDiagram` block.",
		);
	}
	const { entities, routes, labels } = await layoutER(model);
	return emitExcalidrawElements(entities, model, colors, routes, labels);
}
