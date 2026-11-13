import {
	convertToExcalidrawElements,
	FONT_FAMILY,
} from "@excalidraw/excalidraw";
import type { Cardinality, ERModel, PositionedEntity } from "../types";
import type { DiagramColors } from "../theme";
import type { EdgeLabel, Point } from "../layout/elkLayout";
import { entityMetrics, CHAR_WIDTH } from "../metrics";

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

const FONT = FONT_FAMILY["Comic Shanns"]; // clean, monospace-ish, easy to read
const FONT_SIZE = 16; // "small"
const ROUGHNESS = 0; // "architect" sloppiness

/**
 * Turns positioned entities + relationships into native Excalidraw elements.
 * Each entity is a table: a centered header over a divider, then one row per
 * attribute laid out in aligned `[keys] [type] [name]` columns. Relationships
 * follow ELK's orthogonal routes with crow's-foot cardinality at each end.
 * Colors come from the active theme; text uses Comic Shanns at the small size and
 * shapes use "architect" (roughness 0).
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

	const text = (x: number, y: number, s: string) => ({
		type: "text",
		x,
		y,
		text: s,
		fontSize: FONT_SIZE,
		fontFamily: FONT,
		strokeColor: colors.text,
	});

	for (const e of entities) {
		const m = entityMetrics(e);

		// Container box (arrows bind to this element's id).
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
		});

		// Centered header name.
		const headerW = e.name.length * CHAR_WIDTH;
		skeleton.push(text(e.x + (e.width - headerW) / 2, e.y + 8, e.name));

		// Divider under the header.
		skeleton.push({
			type: "line",
			x: e.x,
			y: e.y + m.headerHeight,
			points: [
				[0, 0],
				[e.width, 0],
			],
			strokeColor: colors.stroke,
			roughness: ROUGHNESS,
		});

		// One row per attribute: [keys] [type] [name] in aligned columns.
		e.attributes.forEach((a, i) => {
			const rowY = e.y + m.headerHeight + i * m.rowHeight + 4;
			if (a.keys.length) {
				skeleton.push(text(e.x + m.keyX, rowY, a.keys.join(",")));
			}
			skeleton.push(text(e.x + m.typeX, rowY, a.type));
			skeleton.push(text(e.x + m.nameX, rowY, a.name));
		});

		// Subtle separators between attribute rows (faint = stroke at low opacity).
		for (let i = 1; i < e.attributes.length; i++) {
			skeleton.push({
				type: "line",
				x: e.x,
				y: e.y + m.headerHeight + i * m.rowHeight,
				points: [
					[0, 0],
					[e.width, 0],
				],
				strokeColor: colors.stroke,
				opacity: 25,
				roughness: ROUGHNESS,
			});
		}
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
		skeleton.push(text(label.x, label.y, label.text));
	}

	return convertToExcalidrawElements(
		skeleton as Parameters<typeof convertToExcalidrawElements>[0],
	);
}
