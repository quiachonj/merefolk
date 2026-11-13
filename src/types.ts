// Domain model for a parsed Mermaid ER diagram.
// Intentionally decoupled from both Mermaid's internals and Excalidraw's
// element shape so the parse -> layout -> emit stages stay independent.

export type Cardinality =
	"one-or-zero" | "exactly-one" | "zero-or-more" | "one-or-more";

export interface ERAttribute {
	type: string;
	name: string;
	/** e.g. ["PK"], ["FK"], ["PK", "FK"] */
	keys: string[];
	comment?: string;
}

export interface EREntity {
	/** Identity: what relationships and the Excalidraw box refer to. */
	id: string;
	/** What the table header shows: the alias when there is one, else the id. */
	name: string;
	attributes: ERAttribute[];
}

export interface ERRelationship {
	id: string;
	leftEntity: string;
	rightEntity: string;
	leftCardinality: Cardinality;
	rightCardinality: Cardinality;
	label?: string;
	/** Identifying (`--`, `to`) is drawn solid; non-identifying (`..`, `.-`, `-.`, `optionally to`) dashed. */
	identifying: boolean;
}

/** Mermaid's `direction` values: top-bottom, bottom-top, left-right, right-left. */
export type ERDirection = "TB" | "BT" | "LR" | "RL";

export interface ERModel {
	entities: EREntity[];
	relationships: ERRelationship[];
	/** From a `direction` line; unset means Merefolk's default (left to right). */
	direction?: ERDirection;
	/** Non-blank, non-comment lines the parser did not recognize. */
	skipped: string[];
}

export interface PositionedEntity extends EREntity {
	x: number;
	y: number;
	width: number;
	height: number;
}
