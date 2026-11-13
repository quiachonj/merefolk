import ELK from "elkjs/lib/elk.bundled.js";
import type { ERModel, PositionedEntity } from "../types";
import { entityMetrics } from "../metrics";

const elk = new ELK();

export interface Point {
	x: number;
	y: number;
}

export interface EdgeLabel {
	text: string;
	x: number;
	y: number;
}

// Fields we read from ELK's layout OUTPUT. elkjs 0.12's bundled types describe
// the result as the input graph (no `sections`, unpositioned labels), so we
// declare the output shape ourselves and cast — the data is present at runtime.
interface ElkOutputEdge {
	id: string;
	sections?: {
		startPoint: Point;
		bendPoints?: Point[];
		endPoint: Point;
	}[];
	labels?: (Point & { text?: string })[];
}

export interface LayoutResult {
	entities: PositionedEntity[];
	/** relationship id -> orthogonal polyline (absolute coords) from ELK. */
	routes: Map<string, Point[]>;
	/** relationship id -> label placed by ELK (absolute top-left). */
	labels: Map<string, EdgeLabel>;
}

const LABEL_CHAR_WIDTH = 8;
const LABEL_HEIGHT = 20;

function labelSize(text: string): { width: number; height: number } {
	return { width: text.length * LABEL_CHAR_WIDTH + 8, height: LABEL_HEIGHT };
}

/**
 * Runs ELK's layered algorithm over the ER graph. Returns each entity with
 * absolute x/y + size, and the orthogonal edge routes ELK computed (which avoid
 * the boxes) so the arrows can follow them instead of cutting straight across.
 */
export async function layoutER(model: ERModel): Promise<LayoutResult> {
	const sized = model.entities.map((entity) => {
		const m = entityMetrics(entity);
		return { entity, width: m.width, height: m.height };
	});

	const graph = {
		id: "root",
		layoutOptions: {
			"elk.algorithm": "layered",
			"elk.direction": "RIGHT",
			"elk.edgeRouting": "ORTHOGONAL",
			// Generous spacing: the inline SVG scales down to fit the note, so a
			// roomy layout reads as a cohesive, zoomed-out whole. Cramming only
			// hurts label + crow's-foot legibility.
			"elk.layered.spacing.nodeNodeBetweenLayers": "110",
			// Excalidraw draws a crow's foot 20px long and shrinks it when the
			// adjoining segment is under 40px. ELK's default (10) put the first
			// bend 10px out of the box; 55 keeps every end segment above 40.
			"elk.layered.spacing.edgeNodeBetweenLayers": "55",
			"elk.spacing.nodeNode": "80",
			"elk.spacing.edgeNode": "25",
			"elk.spacing.edgeEdge": "15",
			// Let ELK reserve space for and position the relationship labels so
			// they don't crowd the lines or boxes.
			"elk.edgeLabels.inline": "false",
			"elk.spacing.edgeLabel": "6",
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
			...(r.label
				? { labels: [{ text: r.label, ...labelSize(r.label) }] }
				: {}),
		})),
	};

	const laidOut = await elk.layout(graph);

	const byId = new Map((laidOut.children ?? []).map((c) => [c.id, c]));
	const entities = sized.map((s) => {
		const node = byId.get(s.entity.id);
		return {
			...s.entity,
			x: node?.x ?? 0,
			y: node?.y ?? 0,
			width: s.width,
			height: s.height,
		};
	});

	const routes = new Map<string, Point[]>();
	const labels = new Map<string, EdgeLabel>();
	for (const edge of (laidOut.edges ?? []) as unknown as ElkOutputEdge[]) {
		const section = edge.sections?.[0];
		if (section) {
			routes.set(edge.id, [
				section.startPoint,
				...(section.bendPoints ?? []),
				section.endPoint,
			]);
		}
		const label = edge.labels?.[0];
		if (label && label.x != null && label.y != null) {
			labels.set(edge.id, {
				text: label.text ?? "",
				x: label.x,
				y: label.y,
			});
		}
	}

	return { entities, routes, labels };
}
