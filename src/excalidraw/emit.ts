import {
	convertToExcalidrawElements,
	FONT_FAMILY,
} from "@excalidraw/excalidraw";
import type { Cardinality, ERModel, PositionedEntity } from "../types";

// ER cardinality -> Excalidraw crow's-foot arrowhead (added in Excalidraw 0.18).
// Excalidraw has no combined "zero" (circle) glyph, so the optional-zero
// variants approximate to their non-zero counterpart.
const CROWFOOT: Record<
	Cardinality,
	"crowfoot_one" | "crowfoot_many" | "crowfoot_one_or_many"
> = {
	"exactly-one": "crowfoot_one",
	"one-or-zero": "crowfoot_one", // approx: no zero-circle glyph
	"one-or-more": "crowfoot_one_or_many",
	"zero-or-more": "crowfoot_many", // approx: no zero-circle glyph
};

const STROKE_COLOR = "#1e1e1e";
const ENTITY_FILL = "#f8f9fa";

/**
 * Turns positioned entities + relationships into native Excalidraw elements.
 * Entities are labelled boxes; relationships are arrows with crow's-foot
 * cardinality at each end. All text uses the Code (Cascadia) font.
 *
 * TODO: render each attribute as its own row instead of one multi-line label.
 */
export function emitExcalidrawElements(
	entities: PositionedEntity[],
	model: ERModel,
) {
	// `convertToExcalidrawElements` accepts skeletons; its published types are
	// stricter than what we hand-build, so we assemble as unknown[] and cast.
	const skeleton: unknown[] = [];

	for (const e of entities) {
		const rows = e.attributes
			.map((a) => {
				const key = a.keys.length ? `${a.keys.join(",")} ` : "";
				return `${key}${a.type} ${a.name}`;
			})
			.join("\n");
		const divider = "─".repeat(Math.max(e.name.length + 2, 8));

		skeleton.push({
			type: "rectangle",
			id: e.id,
			x: e.x,
			y: e.y,
			width: e.width,
			height: e.height,
			strokeColor: STROKE_COLOR,
			backgroundColor: ENTITY_FILL,
			label: {
				text: rows ? `${e.name}\n${divider}\n${rows}` : e.name,
				fontSize: 16,
				fontFamily: FONT_FAMILY.Cascadia,
				textAlign: "left",
				verticalAlign: "top",
			},
		});
	}

	// Bound arrows MUST carry an explicit x/y origin (and we give points too).
	// Without them, convertToExcalidrawElements derives NaN geometry, which
	// propagates to a NaN scene bounding box / zoom and blows the call stack.
	const pos = new Map(entities.map((e) => [e.id, e]));
	for (const r of model.relationships) {
		const a = pos.get(r.leftEntity);
		const b = pos.get(r.rightEntity);
		if (!a || !b) continue;
		const ax = a.x + a.width; // right edge, vertical middle of left box
		const ay = a.y + a.height / 2;
		const bx = b.x; // left edge, vertical middle of right box
		const by = b.y + b.height / 2;
		skeleton.push({
			type: "arrow",
			x: ax,
			y: ay,
			points: [
				[0, 0],
				[bx - ax, by - ay],
			],
			start: { id: r.leftEntity },
			end: { id: r.rightEntity },
			// Crow's foot sits at each entity end: left cardinality at the
			// start, right cardinality at the end.
			startArrowhead: CROWFOOT[r.leftCardinality],
			endArrowhead: CROWFOOT[r.rightCardinality],
			strokeColor: STROKE_COLOR,
			...(r.label
				? { label: { text: r.label, fontFamily: FONT_FAMILY.Cascadia } }
				: {}),
		});
	}

	return convertToExcalidrawElements(
		skeleton as Parameters<typeof convertToExcalidrawElements>[0],
	);
}
