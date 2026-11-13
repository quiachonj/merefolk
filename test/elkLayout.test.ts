import { describe, expect, it } from "vitest";
import { layoutER } from "../src/layout/elkLayout";
import { entityMetrics } from "../src/metrics";
import { parseMermaidER } from "../src/mermaid/parseER";

const BODY = `
	CUSTOMER ||--o{ ORDER : places
	CUSTOMER ||--o| ADDRESS : "ships to"
	ORDER ||--|{ LINE_ITEM : contains
	PRODUCT ||--o{ LINE_ITEM : "ordered as"
	ORDER }o..o| COUPON : uses
	CUSTOMER { string id PK }
	ORDER { string id PK }
`;

const length = (a: { x: number; y: number }, b: { x: number; y: number }) =>
	Math.hypot(a.x - b.x, a.y - b.y);

describe("layout direction", () => {
	for (const dir of [undefined, "LR", "RL", "TB", "BT"] as const) {
		it(`keeps room for crow's feet with direction ${dir ?? "default"}`, async () => {
			const model = parseMermaidER(
				`erDiagram\n${dir ? `direction ${dir}\n` : ""}${BODY}`,
			);
			expect(model.skipped).toEqual([]);
			const { entities, routes } = await layoutER(model);

			for (const e of entities) {
				for (const v of [e.x, e.y, e.width, e.height]) {
					expect(Number.isFinite(v)).toBe(true);
				}
			}
			expect(routes.size).toBe(model.relationships.length);
			for (const pts of routes.values()) {
				for (const p of pts) {
					expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(
						true,
					);
				}
				// Excalidraw shrinks a crow's foot on a segment under 40px.
				expect(length(pts[0], pts[1])).toBeGreaterThanOrEqual(40);
				const n = pts.length;
				expect(length(pts[n - 2], pts[n - 1])).toBeGreaterThanOrEqual(
					40,
				);
			}
		});
	}

	it("flows left to right by default and top to bottom for TB", async () => {
		const flow = async (direction: string) => {
			const m = parseMermaidER(`erDiagram\n${direction}\nA ||--o{ B : x`);
			const { entities } = await layoutER(m);
			const [a, b] = entities;
			return { dx: b.x - a.x, dy: b.y - a.y };
		};
		const lr = await flow("");
		expect(lr.dx).toBeGreaterThan(0);
		const tb = await flow("direction TB");
		expect(tb.dy).toBeGreaterThan(0);
		const rl = await flow("direction RL");
		expect(rl.dx).toBeLessThan(0);
		const bt = await flow("direction BT");
		expect(bt.dy).toBeLessThan(0);
	});
});

describe("entity size", () => {
	it("is sized from the alias that the header shows, not the id", () => {
		const aliased = parseMermaidER(
			'erDiagram\np["A very long display name"]',
		).entities[0];
		const plain = parseMermaidER("erDiagram\np").entities[0];
		expect(aliased.id).toBe("p");
		expect(entityMetrics(aliased).width).toBeGreaterThan(
			entityMetrics(plain).width,
		);
		expect(entityMetrics(aliased).width).toBe(
			12 + "A very long display name".length * 9.6 + 12,
		);
	});

	it("is sized from the displayed generic type", () => {
		const e = parseMermaidER("erDiagram\nA {\n List~int~ xs\n}")
			.entities[0];
		expect(e.attributes[0].type).toBe("List<int>");
	});

	it("draws an entity with no attributes as just its header", () => {
		const bare = parseMermaidER("erDiagram\nCoupon").entities[0];
		const one = parseMermaidER("erDiagram\nCoupon { string code }")
			.entities[0];
		const header = entityMetrics(one).headerHeight;
		expect(entityMetrics(bare).height).toBe(header);
		expect(entityMetrics(one).height).toBeGreaterThan(header);
	});
});
