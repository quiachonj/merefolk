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
	id: string;
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
	/** `--` identifying vs `..` non-identifying */
	identifying: boolean;
}

export interface ERModel {
	entities: EREntity[];
	relationships: ERRelationship[];
}

export interface PositionedEntity extends EREntity {
	x: number;
	y: number;
	width: number;
	height: number;
}
