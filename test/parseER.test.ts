import { describe, expect, it } from "vitest";
import { parseGenericTypes, parseMermaidER } from "../src/mermaid/parseER";

const parse = (body: string) => parseMermaidER(`erDiagram\n${body}`);

const rel = (body: string) => {
	const m = parse(body);
	expect(m.skipped).toEqual([]);
	expect(m.relationships).toHaveLength(1);
	return m.relationships[0];
};

describe("relationships", () => {
	it("reads symbol cardinalities and identifying lines", () => {
		const r = rel("CUSTOMER ||--o{ ORDER : places");
		expect(r).toMatchObject({
			leftEntity: "CUSTOMER",
			rightEntity: "ORDER",
			leftCardinality: "exactly-one",
			rightCardinality: "zero-or-more",
			label: "places",
			identifying: true,
		});
	});

	it("reads every symbol on either side", () => {
		expect(rel("A |o--o| B : x")).toMatchObject({
			leftCardinality: "one-or-zero",
			rightCardinality: "one-or-zero",
		});
		expect(rel("A }|--|{ B : x")).toMatchObject({
			leftCardinality: "one-or-more",
			rightCardinality: "one-or-more",
		});
		expect(rel("A }o--o{ B : x")).toMatchObject({
			leftCardinality: "zero-or-more",
			rightCardinality: "zero-or-more",
		});
		// Mermaid's lexer takes any cardinality token on either side.
		expect(rel("A o{--}o B : x")).toMatchObject({
			leftCardinality: "zero-or-more",
			rightCardinality: "zero-or-more",
		});
	});

	it("draws .. as non-identifying", () => {
		expect(rel("A }o..o| B : x").identifying).toBe(false);
	});

	it("reads the .- and -. connectors as non-identifying", () => {
		expect(rel("A ||.-o{ B : has").identifying).toBe(false);
		expect(rel("A ||-.o{ B : has").identifying).toBe(false);
	});

	it("reads word cardinalities", () => {
		expect(rel("A only one to zero or more B : has")).toMatchObject({
			leftCardinality: "exactly-one",
			rightCardinality: "zero-or-more",
			identifying: true,
		});
		expect(
			rel("A zero or one optionally to one or more B : has"),
		).toMatchObject({
			leftCardinality: "one-or-zero",
			rightCardinality: "one-or-more",
			identifying: false,
		});
	});

	it("maps every cardinality word and alias to Mermaid's meaning", () => {
		const cases: Record<string, string> = {
			"one or zero": "one-or-zero",
			"zero or one": "one-or-zero",
			"one or more": "one-or-more",
			"one or many": "one-or-more",
			"1+": "one-or-more",
			"many(1)": "one-or-more",
			"zero or more": "zero-or-more",
			"zero or many": "zero-or-more",
			"0+": "zero-or-more",
			"many(0)": "zero-or-more",
			many: "zero-or-more",
			one: "exactly-one",
			"only one": "exactly-one",
			"1": "exactly-one",
		};
		for (const [token, card] of Object.entries(cases)) {
			expect(rel(`A ${token} to ${token} B : x`)).toMatchObject({
				leftCardinality: card,
				rightCardinality: card,
			});
		}
	});

	it("is case-insensitive for words", () => {
		expect(rel("A ONLY ONE TO Zero Or More B : x")).toMatchObject({
			leftCardinality: "exactly-one",
			rightCardinality: "zero-or-more",
			identifying: true,
		});
	});

	it("allows no spaces around symbols", () => {
		expect(rel("A||--o{B : x")).toMatchObject({
			leftEntity: "A",
			rightEntity: "B",
		});
	});

	it("strips quotes from a label and drops an empty one", () => {
		expect(rel('A ||--o{ B : "ships to"').label).toBe("ships to");
		expect(rel('A ||--o{ B : ""').label).toBeUndefined();
	});

	it("skips a malformed relationship", () => {
		const m = parse("A |--o{ B : x");
		expect(m.relationships).toHaveLength(0);
		expect(m.skipped).toEqual(["A |--o{ B : x"]);
	});

	it("skips the parent marker, which has no ER equivalent here", () => {
		expect(parse("A u--o{ B : x").skipped).toHaveLength(1);
	});
});

describe("entity names and aliases", () => {
	it("accepts hyphens, dots, digits and non-ASCII letters", () => {
		const m = parse(
			"ORDER-ITEM ||--o{ Çliente.v2 : has\n日本 ||--|| 123 : x",
		);
		expect(m.skipped).toEqual([]);
		expect(m.entities.map((e) => e.id)).toEqual([
			"ORDER-ITEM",
			"Çliente.v2",
			"日本",
			"123",
		]);
	});

	it("accepts a quoted entity name and strips the quotes", () => {
		const m = parse('"Order Item" ||--o{ B : has');
		expect(m.skipped).toEqual([]);
		expect(m.entities[0]).toMatchObject({
			id: "Order Item",
			name: "Order Item",
		});
	});

	it("keeps the id as identity and shows the alias", () => {
		const m = parse(
			'p[Person] {\n string name\n}\np ||--o{ b["Big B"] : has',
		);
		expect(m.skipped).toEqual([]);
		expect(m.entities).toMatchObject([
			{ id: "p", name: "Person", attributes: [{ name: "name" }] },
			{ id: "b", name: "Big B" },
		]);
		expect(m.relationships[0]).toMatchObject({
			leftEntity: "p",
			rightEntity: "b",
		});
	});

	it("accepts an alias on a relationship (lenient: Mermaid does not)", () => {
		const m = parse("p[Person] ||--o{ B : has");
		expect(m.skipped).toEqual([]);
		expect(m.entities[0]).toMatchObject({ id: "p", name: "Person" });
	});

	it("takes the first alias given for an entity", () => {
		const m = parse("a[First]\na[Second]");
		expect(m.entities).toHaveLength(1);
		expect(m.entities[0].name).toBe("First");
	});

	it("adds an alias given after the entity was first seen", () => {
		const m = parse("a ||--o{ b : x\na[Alpha]");
		expect(m.entities[0]).toMatchObject({ id: "a", name: "Alpha" });
	});

	it("turns a standalone entity line into an entity", () => {
		const m = parse("A\nB[Bee]");
		expect(m.skipped).toEqual([]);
		expect(m.entities).toMatchObject([
			{ id: "A", name: "A", attributes: [] },
			{ id: "B", name: "Bee", attributes: [] },
		]);
	});
});

describe("attribute blocks", () => {
	it("reads type, name, keys and a comment", () => {
		const m = parse(
			'A {\n string email UK "login identifier"\n int id PK\n}',
		);
		expect(m.skipped).toEqual([]);
		expect(m.entities[0].attributes).toEqual([
			{
				type: "string",
				name: "email",
				keys: ["UK"],
				comment: "login identifier",
			},
			{ type: "int", name: "id", keys: ["PK"], comment: undefined },
		]);
	});

	it("reads keys separated by spaces, commas or both, in any case", () => {
		const keys = (k: string) =>
			parse(`A {\n string id ${k}\n}`).entities[0].attributes[0].keys;
		expect(keys("PK FK")).toEqual(["PK", "FK"]);
		expect(keys("PK, FK")).toEqual(["PK", "FK"]);
		expect(keys("PK,FK")).toEqual(["PK", "FK"]);
		expect(keys("pk , Fk, uk")).toEqual(["PK", "FK", "UK"]);
		expect(keys("fk")).toEqual(["FK"]);
	});

	it("reads keys followed by a comment", () => {
		const a = parse('A {\n string id PK, FK "both"\n}').entities[0]
			.attributes[0];
		expect(a.keys).toEqual(["PK", "FK"]);
		expect(a.comment).toBe("both");
	});

	it("shows generics the way Mermaid does", () => {
		const a = parse("A {\n type~T~ items\n List~List~int~~ nested\n}")
			.entities[0].attributes;
		expect(a[0].type).toBe("type<T>");
		expect(a[1].type).toBe("List<List<int>>");
	});

	it("keeps a generic with a comma and a space in one type", () => {
		const m = parse("A {\n Map~string, int~ lookup PK\n}");
		expect(m.skipped).toEqual([]);
		expect(m.entities[0].attributes[0]).toMatchObject({
			type: "Map<string, int>",
			name: "lookup",
			keys: ["PK"],
		});
	});

	it("reads arrays, sizes, optional types and backticked names", () => {
		const a = parse(
			"A {\n string[] tags\n decimal(10,2) price\n int? count\n string `full name`\n}",
		).entities[0].attributes;
		expect(a.map((x) => `${x.type}:${x.name}`)).toEqual([
			"string[]:tags",
			"decimal(10,2):price",
			"int?:count",
			"string:full name",
		]);
	});

	it("merges a block declared twice", () => {
		const m = parse("A {\n int a\n}\nA {\n int b\n}");
		expect(m.entities[0].attributes.map((x) => x.name)).toEqual(["a", "b"]);
	});
});

describe("one-line blocks", () => {
	it("reads an empty block", () => {
		const m = parse("A {}\nB { }");
		expect(m.skipped).toEqual([]);
		expect(m.entities.map((e) => e.id)).toEqual(["A", "B"]);
	});

	it("reads a block with one attribute", () => {
		const m = parse("A { string id PK }");
		expect(m.skipped).toEqual([]);
		expect(m.entities[0].attributes).toMatchObject([
			{ type: "string", name: "id", keys: ["PK"] },
		]);
	});

	it("reads a block with several attributes", () => {
		const m = parse('A { string id PK int n "count" }');
		expect(m.skipped).toEqual([]);
		expect(m.entities[0].attributes.map((a) => a.name)).toEqual([
			"id",
			"n",
		]);
	});

	it("reads an alias with a one-line block", () => {
		const m = parse("p[Person] { string id }");
		expect(m.entities[0]).toMatchObject({ id: "p", name: "Person" });
		expect(m.entities[0].attributes).toHaveLength(1);
	});

	it("reports a one-line block it cannot read", () => {
		const m = parse("A { string }");
		expect(m.entities).toHaveLength(0);
		expect(m.skipped).toEqual(["A { string }"]);
	});

	it("lets attributes start on the opening line", () => {
		const m = parse("A { string id PK\n int n\n}");
		expect(m.skipped).toEqual([]);
		expect(m.entities[0].attributes.map((a) => a.name)).toEqual([
			"id",
			"n",
		]);
	});

	it("lets the closing brace follow the last attribute", () => {
		const m = parse("A {\n string id PK }\nB");
		expect(m.skipped).toEqual([]);
		expect(m.entities.map((e) => e.id)).toEqual(["A", "B"]);
	});
});

describe("block recovery", () => {
	it("keeps the block open after an unreadable attribute line", () => {
		const m = parse("A {\n string id PK\n !!! nonsense\n int after\n}\nB");
		expect(m.skipped).toEqual(["!!! nonsense"]);
		expect(m.entities[0].attributes.map((a) => a.name)).toEqual([
			"id",
			"after",
		]);
		// The closing brace ended the block instead of being reported.
		expect(m.entities.map((e) => e.id)).toEqual(["A", "B"]);
	});

	it("keeps reading after several bad lines in a row", () => {
		const m = parse("A {\n ???\n string id\n ???\n string name\n}");
		expect(m.skipped).toEqual(["???", "???"]);
		expect(m.entities[0].attributes).toHaveLength(2);
	});

	it("recovers from an unclosed block when another entity opens (edge case 3)", () => {
		const m = parse(
			[
				"ACCOUNT ||--o{ TX : has",
				"ACCOUNT {",
				"    string id PK",
				"    string owner",
				"TX {",
				"    string id PK",
				"    decimal amount",
				"}",
			].join("\n"),
		);
		expect(m.skipped).toEqual([]);
		expect(m.entities).toMatchObject([
			{ id: "ACCOUNT", attributes: [{ name: "id" }, { name: "owner" }] },
			{ id: "TX", attributes: [{ name: "id" }, { name: "amount" }] },
		]);
	});

	it("recovers from an unclosed block when a relationship follows", () => {
		const m = parse("A {\n int id\nA ||--o{ B : has\nB {\n int id\n}");
		expect(m.skipped).toEqual([]);
		expect(m.relationships).toHaveLength(1);
		expect(m.entities.map((e) => e.attributes.length)).toEqual([1, 1]);
	});

	it("recovers when a one-line block follows an unclosed one", () => {
		const m = parse("A {\n int id\nB { int x }");
		expect(m.skipped).toEqual([]);
		expect(m.entities.map((e) => e.attributes.length)).toEqual([1, 1]);
	});
});

describe("direction", () => {
	it("reads all four directions, in any case", () => {
		for (const d of ["TB", "BT", "LR", "RL"] as const) {
			const m = parse(`direction ${d}\nA ||--o{ B : x`);
			expect(m.skipped).toEqual([]);
			expect(m.direction).toBe(d);
		}
		expect(parse("Direction lr\nA").direction).toBe("LR");
	});

	it("leaves direction unset by default", () => {
		expect(parse("A ||--o{ B : x").direction).toBeUndefined();
	});

	it("uses the last direction line", () => {
		expect(parse("direction TB\ndirection RL\nA").direction).toBe("RL");
	});

	it("reports an unknown direction", () => {
		const m = parse("direction XX\nA");
		expect(m.direction).toBeUndefined();
		expect(m.skipped).toEqual(["direction XX"]);
	});
});

describe("ignored statements", () => {
	it("ignores comments and %%{init}%% directives (edge case 4)", () => {
		const m = parse(
			[
				"%% this comment is ignored",
				'%%{init: {"theme": "dark"}}%%',
				"USER ||--o{ SESSION : opens",
				"USER {",
				"    string id PK",
				"}",
			].join("\n"),
		);
		expect(m.skipped).toEqual([]);
		expect(m.entities).toHaveLength(2);
	});

	it("ignores comments inside a block", () => {
		const m = parse("A {\n %% note\n int id\n}");
		expect(m.skipped).toEqual([]);
		expect(m.entities[0].attributes).toHaveLength(1);
	});

	it("ignores accTitle and accDescr, including the multi-line form", () => {
		const m = parse(
			[
				"accTitle: A title",
				"accDescr: One line",
				"accDescr {",
				"  A longer",
				"  description with A ||--o{ B : text",
				"}",
				"A ||--o{ B : has",
			].join("\n"),
		);
		expect(m.skipped).toEqual([]);
		expect(m.entities.map((e) => e.id)).toEqual(["A", "B"]);
		expect(m.relationships).toHaveLength(1);
	});

	it("ignores a one-line accDescr block", () => {
		expect(parse("accDescr { short }\nA").skipped).toEqual([]);
	});

	it("reports styling and subgraph lines, which are not drawn", () => {
		const m = parse(
			[
				"classDef hot fill:#f96",
				"class A hot",
				"style A fill:#f9f",
				"subgraph one",
				"A ||--o{ B : has",
				"end",
			].join("\n"),
		);
		expect(m.skipped).toEqual([
			"classDef hot fill:#f96",
			"class A hot",
			"style A fill:#f9f",
			"subgraph one",
			"end",
		]);
		// The structure still draws.
		expect(m.relationships).toHaveLength(1);
	});

	it("draws an entity with a :::class suffix and reports the styling", () => {
		const m = parse("A:::hot ||--o{ B:::cold : has\nC:::hot");
		expect(m.entities.map((e) => e.id)).toEqual(["A", "B", "C"]);
		expect(m.relationships).toHaveLength(1);
		expect(m.skipped).toEqual(["A:::hot ||--o{ B:::cold : has", "C:::hot"]);
	});
});

describe("unreadable input", () => {
	it("reports a malformed relationship but draws the rest (edge case 1)", () => {
		const m = parse(
			[
				"AUTHOR ||--o{ BOOK : writes",
				"AUTHOR |--o{ REVIEW : receives",
				"AUTHOR {",
				"    string id PK",
				"}",
				"BOOK {",
				"    string id PK",
				"}",
				"REVIEW {",
				"    int rating",
				"}",
			].join("\n"),
		);
		expect(m.skipped).toEqual(["AUTHOR |--o{ REVIEW : receives"]);
		expect(m.entities.map((e) => e.id)).toEqual([
			"AUTHOR",
			"BOOK",
			"REVIEW",
		]);
		expect(m.relationships).toHaveLength(1);
	});

	it("finds no entities in nonsense (edge case 5)", () => {
		const m = parse("this is not valid !!!\n??? nonsense");
		expect(m.entities).toHaveLength(0);
		expect(m.skipped).toEqual(["this is not valid !!!", "??? nonsense"]);
	});

	it("reports a stray closing brace", () => {
		expect(parse("A\n}").skipped).toEqual(["}"]);
	});

	it("handles CRLF line endings", () => {
		const m = parseMermaidER(
			"erDiagram\r\nA ||--o{ B : has\r\nA {\r\n int id\r\n}\r\n",
		);
		expect(m.skipped).toEqual([]);
		expect(m.entities[0].attributes).toHaveLength(1);
	});
});

describe("parseGenericTypes", () => {
	it("matches Mermaid", () => {
		expect(parseGenericTypes("plain")).toBe("plain");
		expect(parseGenericTypes("type~T~")).toBe("type<T>");
		expect(parseGenericTypes("Map~string,int~")).toBe("Map<string,int>");
		expect(parseGenericTypes("List~List~int~~")).toBe("List<List<int>>");
	});
});

describe("front matter", () => {
	it("ignores a --- block before erDiagram", () => {
		const m = parseMermaidER(
			[
				"---",
				"title: Orders",
				"config:",
				"  theme: forest",
				"---",
				"erDiagram",
				"A ||--o{ B : has",
			].join("\n"),
		);
		expect(m.skipped).toEqual([]);
		expect(m.entities.map((e) => e.id)).toEqual(["A", "B"]);
		expect(m.relationships).toHaveLength(1);
	});

	it("still reports a stray --- that is not front matter", () => {
		const m = parse("A ||--o{ B : has\n---");
		expect(m.skipped).toEqual(["---"]);
	});
});

describe("non-ASCII names", () => {
	it("reads accented and CJK entity and attribute names", () => {
		const m = parse(
			"Cliente ||--o{ Pedido : realiza\n注文 {\n  string 番号 PK\n}",
		);
		expect(m.skipped).toEqual([]);
		expect(m.entities.map((e) => e.id)).toEqual([
			"Cliente",
			"Pedido",
			"注文",
		]);
		expect(m.entities[2].attributes[0]).toMatchObject({
			type: "string",
			name: "番号",
			keys: ["PK"],
		});
	});
});
