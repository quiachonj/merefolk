import type { ERModel, EREntity, ERRelationship, Cardinality } from "../types";

// --- Cardinality token maps -------------------------------------------------
// Mermaid ER cardinality is written next to each entity. The token that sits
// AGAINST the connector describes that side's cardinality.
//   CUSTOMER ||--o{ ORDER
//            ^^        left = "||"
//              ^^      connector "--" (identifying)
//                ^^    right = "o{"
const LEFT_CARD: Record<string, Cardinality> = {
	"|o": "one-or-zero",
	"||": "exactly-one",
	"}o": "zero-or-more",
	"}|": "one-or-more",
};

const RIGHT_CARD: Record<string, Cardinality> = {
	"o|": "one-or-zero",
	"||": "exactly-one",
	"o{": "zero-or-more",
	"|{": "one-or-more",
};

// CUSTOMER ||--o{ ORDER : places
const REL_RE =
	/^([A-Za-z0-9_]+)\s+([|}o]{2})(--|\.\.)([o|{}]{2})\s+([A-Za-z0-9_]+)\s*:\s*(.+?)\s*$/;

// CUSTOMER {
const ENTITY_OPEN_RE = /^([A-Za-z0-9_]+)\s*\{$/;

// e.g.  string name PK "primary key"
const ATTR_RE =
	/^([A-Za-z0-9_[\]<> ]+?)\s+([A-Za-z0-9_]+)((?:\s+(?:PK|FK|UK))*)\s*(?:"([^"]*)")?$/;

/**
 * Lightweight, dependency-free parser for the common Mermaid `erDiagram`
 * subset (entity attribute blocks + binary relationships).
 *
 * Aliases, quoted entity names and generics are not parsed; those lines are
 * reported in `skipped`. Full syntax coverage would mean using Mermaid's own
 * parser (`mermaid.mermaidAPI`), which adds the `mermaid` dependency; it is on
 * the CONTRIBUTING.md roadmap.
 */
export function parseMermaidER(source: string): ERModel {
	const lines = source.replace(/\r/g, "").split("\n");
	const entities = new Map<string, EREntity>();
	const relationships: ERRelationship[] = [];

	const ensure = (name: string): EREntity => {
		let e = entities.get(name);
		if (!e) {
			e = { id: name, name, attributes: [] };
			entities.set(name, e);
		}
		return e;
	};

	const skipped: string[] = [];
	let current: EREntity | null = null;
	let relCount = 0;

	for (const raw of lines) {
		const line = raw.trim();
		if (!line || line.startsWith("%%") || line === "erDiagram") continue;

		// Inside an attribute block.
		if (current) {
			if (line === "}") {
				current = null;
				continue;
			}
			const attr = line.match(ATTR_RE);
			if (attr) {
				current.attributes.push({
					type: attr[1].trim(),
					name: attr[2],
					keys: attr[3] ? attr[3].trim().split(/\s+/) : [],
					comment: attr[4],
				});
				continue;
			}
			// Not an attribute: the block was likely left unclosed. Close it and
			// re-handle this line at the top level rather than swallowing the
			// rest of the diagram as bogus attributes.
			current = null;
		}

		const open = line.match(ENTITY_OPEN_RE);
		if (open) {
			current = ensure(open[1]);
			continue;
		}

		const rel = line.match(REL_RE);
		if (rel) {
			const [, left, lc, connector, rc, right, rawLabel] = rel;
			ensure(left);
			ensure(right);
			// Mermaid labels may be quoted ("ships to") — quotes are just
			// delimiters, so strip a single surrounding pair.
			const label = rawLabel?.replace(/^"(.*)"$/, "$1").trim();
			relationships.push({
				id: `rel-${relCount++}`,
				leftEntity: left,
				rightEntity: right,
				leftCardinality: LEFT_CARD[lc] ?? "exactly-one",
				rightCardinality: RIGHT_CARD[rc] ?? "exactly-one",
				label: label && label !== ":" ? label : undefined,
				identifying: connector === "--",
			});
			continue;
		}

		// Nothing matched — record it so the UI can warn about it.
		skipped.push(line);
	}

	return {
		entities: [...entities.values()],
		relationships,
		skipped,
	};
}
