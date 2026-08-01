import ELK from "elkjs/lib/elk.bundled.js";
import type { EREntity, ERModel, PositionedEntity } from "../types";

const elk = new ELK();

const HEADER_HEIGHT = 36;
const ROW_HEIGHT = 24;
const CHAR_WIDTH = 8;
const H_PADDING = 24;
const MAX_WIDTH = 360;

function entitySize(entity: EREntity): { width: number; height: number } {
	const longest = Math.max(
		entity.name.length,
		10,
		...entity.attributes.map(
			(a) => a.keys.join(",").length + a.type.length + a.name.length + 4,
		),
	);
	return {
		width: Math.min(longest * CHAR_WIDTH + H_PADDING, MAX_WIDTH),
		height: HEADER_HEIGHT + entity.attributes.length * ROW_HEIGHT + 8,
	};
}

/**
 * Runs ELK's layered algorithm over the ER graph and returns each entity with
 * absolute x/y and its computed box size. ELK gives us far cleaner orthogonal
 * placement for ER graphs than Mermaid's built-in dagre layout.
 */
export async function layoutER(model: ERModel): Promise<PositionedEntity[]> {
	const sized = model.entities.map((entity) => ({
		entity,
		...entitySize(entity),
	}));

	const graph = {
		id: "root",
		layoutOptions: {
			"elk.algorithm": "layered",
			"elk.direction": "RIGHT",
			"elk.layered.spacing.nodeNodeBetweenLayers": "90",
			"elk.spacing.nodeNode": "60",
			"elk.edgeRouting": "ORTHOGONAL",
		},
		children: sized.map((s) => ({
			id: s.entity.id,
			width: s.width,
			height: s.height,
		})),
		edges: model.relationships.map((r) => ({
			id: r.id,
			sources: [r.leftEntity],
			targets: [r.rightEntity],
		})),
	};

	const laidOut = await elk.layout(graph);
	const byId = new Map((laidOut.children ?? []).map((c) => [c.id, c]));

	return sized.map((s) => {
		const node = byId.get(s.entity.id);
		return {
			...s.entity,
			x: node?.x ?? 0,
			y: node?.y ?? 0,
			width: s.width,
			height: s.height,
		};
	});
}
