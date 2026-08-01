import type { EREntity } from "./types";

// Shared geometry for entity boxes so the layout (which sizes the box) and the
// emit step (which places the header + attribute columns inside it) always agree.

const CHAR_WIDTH = 8; // approx Excalifont advance at 16px
const HEADER_HEIGHT = 34;
const ROW_HEIGHT = 24;
const PAD_X = 12;
const COL_GAP = 12;
const MIN_KEY_COL = 24;

export interface EntityMetrics {
	width: number;
	height: number;
	headerHeight: number;
	rowHeight: number;
	/** Column x-offsets relative to the box's left edge. */
	keyX: number;
	typeX: number;
	nameX: number;
}

const textWidth = (s: string): number => s.length * CHAR_WIDTH;

/**
 * Box size + column offsets for an entity rendered as a table:
 * `[keys] [type] [name]`, with a centered header above a divider.
 */
export function entityMetrics(entity: EREntity): EntityMetrics {
	const attrs = entity.attributes;
	const hasKeys = attrs.some((a) => a.keys.length > 0);

	const keyW = hasKeys
		? Math.max(
				MIN_KEY_COL,
				...attrs.map((a) => textWidth(a.keys.join(","))),
			)
		: 0;
	const typeW = Math.max(0, ...attrs.map((a) => textWidth(a.type)));
	const nameW = Math.max(0, ...attrs.map((a) => textWidth(a.name)));

	const keyCol = hasKeys ? keyW + COL_GAP : 0;
	const typeCol = typeW ? typeW + COL_GAP : 0;
	const bodyW = keyCol + typeCol + nameW;
	const contentW = Math.max(bodyW, textWidth(entity.name));

	return {
		width: PAD_X + contentW + PAD_X,
		height: HEADER_HEIGHT + attrs.length * ROW_HEIGHT + 6,
		headerHeight: HEADER_HEIGHT,
		rowHeight: ROW_HEIGHT,
		keyX: PAD_X,
		typeX: PAD_X + keyCol,
		nameX: PAD_X + keyCol + typeCol,
	};
}
