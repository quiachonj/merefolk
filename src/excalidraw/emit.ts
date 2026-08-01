import {
	convertToExcalidrawElements,
	FONT_FAMILY,
} from "@excalidraw/excalidraw";
import type { Cardinality, ERModel, PositionedEntity } from "../types";
import type { DiagramColors } from "../theme";
import type { EdgeLabel, Point } from "../layout/elkLayout";

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

const FONT = FONT_FAMILY.Excalifont; // hand-drawn default
const FONT_SIZE = 16; // "small"
const ROUGHNESS = 0; // "architect" sloppiness

/**
 * Turns positioned entities + relationships into native Excalidraw elements.
 * Entities are labelled boxes; relationships follow ELK's orthogonal routes
 * (which avoid the boxes) with crow's-foot cardinality at each end. Colors come
 * from the active theme so strokes/text read against the note background; text
 * uses Excalifont at the small size and shapes use "architect" (roughness 0).
 *
 * TODO: render each attribute as its own row instead of one multi-line label.
 */
export function emitExcalidrawElements(
	entities: PositionedEntity[],
	model: ERModel,
	colors: DiagramColors,
	routes: Map<string, Point[]>,
	labels: Map<string, EdgeLabel>,
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
			strokeColor: colors.stroke,
			backgroundColor: colors.fill,
			roughness: ROUGHNESS,
			label: {
				text: rows ? `${e.name}\n${divider}\n${rows}` : e.name,
				fontSize: FONT_SIZE,
				fontFamily: FONT,
				strokeColor: colors.text,
				textAlign: "left",
				verticalAlign: "top",
			},
		});
	}

	// Arrows follow ELK's orthogonal route. An explicit x/y origin + points is
	// required — without them convertToExcalidrawElements derives NaN geometry,
	// which propagates to a NaN scene bounding box / zoom and blows the stack.
	const pos = new Map(entities.map((e) => [e.id, e]));
	for (const r of model.relationships) {
		const a = pos.get(r.leftEntity);
		const b = pos.get(r.rightEntity);
		if (!a || !b) continue;

		const route = routes.get(r.id);
		let ox: number;
		let oy: number;
		let points: number[][];
		if (route && route.length >= 2) {
			ox = route[0].x;
			oy = route[0].y;
			points = route.map((p) => [p.x - ox, p.y - oy]);
		} else {
			// Fallback: straight from right edge of A to left edge of B.
			ox = a.x + a.width;
			oy = a.y + a.height / 2;
			points = [
				[0, 0],
				[b.x - ox, b.y + b.height / 2 - oy],
			];
		}

		skeleton.push({
			type: "arrow",
			x: ox,
			y: oy,
			points,
			start: { id: r.leftEntity },
			end: { id: r.rightEntity },
			// Crow's foot sits at each entity end: left cardinality at the
			// start, right cardinality at the end.
			startArrowhead: CROWFOOT[r.leftCardinality],
			endArrowhead: CROWFOOT[r.rightCardinality],
			strokeColor: colors.stroke,
			roughness: ROUGHNESS,
		});
	}

	// Relationship labels as standalone text at ELK's computed positions, so
	// they sit clear of the lines and boxes instead of on the arrow midpoint.
	for (const r of model.relationships) {
		const label = labels.get(r.id);
		if (!label?.text) continue;
		skeleton.push({
			type: "text",
			x: label.x,
			y: label.y,
			text: label.text,
			fontSize: FONT_SIZE,
			fontFamily: FONT,
			strokeColor: colors.text,
		});
	}

	return convertToExcalidrawElements(
		skeleton as Parameters<typeof convertToExcalidrawElements>[0],
	);
}
