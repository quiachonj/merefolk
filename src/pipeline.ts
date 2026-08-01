import { parseMermaidER } from "./mermaid/parseER";
import { layoutER } from "./layout/elkLayout";
import { emitExcalidrawElements } from "./excalidraw/emit";

/**
 * Full conversion: Mermaid `erDiagram` source -> native Excalidraw elements.
 * parse -> ELK layout -> Excalidraw emit.
 */
export async function mermaidERToExcalidraw(source: string) {
	const model = parseMermaidER(source);
	if (model.entities.length === 0) {
		throw new Error(
			"No ER entities found. Make sure the selection is an `erDiagram` block.",
		);
	}
	const positioned = await layoutER(model);
	return emitExcalidrawElements(positioned, model);
}
