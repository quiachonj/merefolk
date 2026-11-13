import type {
	ERModel,
	EREntity,
	ERAttribute,
	ERRelationship,
	ERDirection,
	Cardinality,
} from "../types";

// The grammar below follows Mermaid's own ER lexer and parser (jison, in
// mermaid's `erDiagram-*.mjs` chunk), so a diagram that Mermaid accepts reads
// the same way here. The parser stays lenient where it is cheap to: an unclosed
// block recovers, and an alias is accepted in a relationship. It never drops a
// line it cannot read; those go to `skipped`.

// --- Cardinalities and connectors -------------------------------------------
// Mermaid lexes these tokens in either position, so `}o--o{` and `o{--}o` are
// both valid. Order matters in the alternation: longer words come before the
// shorter ones they start with (`one or zero` before `one`).
const CARD_SRC = [
	String.raw`one or zero\b`,
	String.raw`one or more\b`,
	String.raw`one or many\b`,
	String.raw`1\+`,
	String.raw`\|o\b`,
	String.raw`zero or one\b`,
	String.raw`zero or more\b`,
	String.raw`zero or many\b`,
	String.raw`0\+`,
	String.raw`\}o\b`,
	String.raw`many\(0\)`,
	String.raw`many\(1\)`,
	String.raw`many\b`,
	String.raw`\}\|`,
	String.raw`only one\b`,
	String.raw`one\b`,
	String.raw`1\b`,
	String.raw`\|\|`,
	String.raw`o\|`,
	String.raw`o\{`,
	String.raw`\|\{`,
].join("|");

const CARDINALITY: Record<string, Cardinality> = {
	"one or zero": "one-or-zero",
	"zero or one": "one-or-zero",
	"|o": "one-or-zero",
	"o|": "one-or-zero",
	"one or more": "one-or-more",
	"one or many": "one-or-more",
	"1+": "one-or-more",
	"many(1)": "one-or-more",
	"}|": "one-or-more",
	"|{": "one-or-more",
	"zero or more": "zero-or-more",
	"zero or many": "zero-or-more",
	"0+": "zero-or-more",
	"many(0)": "zero-or-more",
	many: "zero-or-more",
	"}o": "zero-or-more",
	"o{": "zero-or-more",
	one: "exactly-one",
	"only one": "exactly-one",
	"1": "exactly-one",
	"||": "exactly-one",
};

// Identifying connectors are drawn solid, the rest dashed.
const CONNECTOR_SRC = [
	String.raw`\.\.`,
	"--",
	String.raw`to\b`,
	String.raw`optionally to\b`,
	String.raw`\.-`,
	String.raw`-\.`,
].join("|");

const IDENTIFYING = new Set(["--", "to"]);

// `<card> <connector> <card>` right after the left entity.
const REL_SPEC_RE = new RegExp(
	`^(${CARD_SRC})\\s*(${CONNECTOR_SRC})\\s*(${CARD_SRC})\\s*`,
	"i",
);

// --- Names ------------------------------------------------------------------
// Mermaid's name token: any non-ASCII character, a word character, `-`, `*`
// or `.`, or a double-quoted string without `%`, `\` or line breaks.
const QUOTED_FORBIDDEN = ["%", "\\", "\r", "\n", "\v", "\b"];

function isNameChar(ch: string): boolean {
	return ch.charCodeAt(0) > 127 || /\w/.test(ch) || "-*.".includes(ch);
}

function skipSpace(s: string, i: number): number {
	while (i < s.length && /\s/.test(s[i])) i++;
	return i;
}

function readName(s: string, i: number): { value: string; end: number } | null {
	if (s[i] === '"') {
		let j = i + 1;
		while (j < s.length && s[j] !== '"') {
			if (QUOTED_FORBIDDEN.includes(s[j])) return null;
			j++;
		}
		if (j >= s.length || j === i + 1) return null;
		return { value: s.slice(i + 1, j), end: j + 1 };
	}
	// A name never starts with `-` or `.`: Mermaid lexes `--`, `-.` and `.-`
	// as connectors first, so a line like `---` is not an entity.
	if (s[i] === "-" || s[i] === ".") return null;
	let j = i;
	while (j < s.length && isNameChar(s[j])) j++;
	return j > i ? { value: s.slice(i, j), end: j } : null;
}

interface EntityRef {
	id: string;
	alias?: string;
	/** A `:::class` suffix: Mermaid styling, which is not drawn. */
	styled: boolean;
	/** Index just after the reference and any whitespace that follows. */
	end: number;
}

// `Name`, `Name[Alias]`, `Name["Some Alias"]`, optionally followed by
// `:::class`.
function readRef(s: string, start: number): EntityRef | null {
	const name = readName(s, start);
	if (!name) return null;
	let j = skipSpace(s, name.end);
	let alias: string | undefined;
	if (s[j] === "[") {
		const a = readName(s, skipSpace(s, j + 1));
		if (!a) return null;
		j = skipSpace(s, a.end);
		if (s[j] !== "]") return null;
		alias = a.value;
		j = skipSpace(s, j + 1);
	}
	let styled = false;
	if (s.startsWith(":::", j)) {
		j += 3;
		for (;;) {
			const cls = readName(s, j);
			if (!cls) return null;
			j = cls.end;
			if (s[j] !== ",") break;
			j++;
		}
		styled = true;
		j = skipSpace(s, j);
	}
	return { id: name.value, alias, styled, end: j };
}

// --- Generic types ----------------------------------------------------------
// Port of Mermaid's `parseGenericTypes`: `type~T~` is shown as `type<T>`.
function countTildes(s: string): number {
	return s.split("~").length - 1;
}

function processTildeSet(input: string): string {
	if (countTildes(input) <= 1) return input;
	let hasStartingTilde = false;
	if (countTildes(input) % 2 !== 0 && input.startsWith("~")) {
		input = input.substring(1);
		hasStartingTilde = true;
	}
	const chars = [...input];
	let first = chars.indexOf("~");
	let last = chars.lastIndexOf("~");
	while (first !== -1 && last !== -1 && first !== last) {
		chars[first] = "<";
		chars[last] = ">";
		first = chars.indexOf("~");
		last = chars.lastIndexOf("~");
	}
	if (hasStartingTilde) chars.unshift("~");
	return chars.join("");
}

export function parseGenericTypes(input: string): string {
	if (!input.includes("~")) return input;
	const sets = input.split(/(,)/);
	const output: string[] = [];
	for (let i = 0; i < sets.length; i++) {
		let set = sets[i];
		if (set === "," && i > 0 && i + 1 < sets.length) {
			const prev = sets[i - 1];
			const next = sets[i + 1];
			if (countTildes(prev) === 1 && countTildes(next) === 1) {
				set = prev + "," + next;
				i++;
				output.pop();
			}
		}
		output.push(processTildeSet(set));
	}
	return output.join("");
}

// --- Attributes -------------------------------------------------------------
// Mermaid's attribute word: starts with `*`, a letter, `_` or a character from
// U+00C0 up, then those plus digits and `- [ ] ( ) . ,`. Commas are part of a
// word, so `decimal(10,2)` is one word.
// The non-ASCII range (U+00C0 to U+FFFF) is built from code points: written as
// glyphs it is unreadable (U+FFFF is invisible), and Prettier turns escapes in
// a regex literal into glyphs.
const NON_ASCII = `${String.fromCharCode(0xc0)}-${String.fromCharCode(0xffff)}`;
const WORD_RE = new RegExp(
	String.raw`[*A-Za-z_${NON_ASCII}][A-Za-z0-9\-_\[\]().,${NON_ASCII}*]*\??`,
	"y",
);
// Mermaid's generic token: a `~` in the first chunk, then everything up to the
// last `~` on the line (so `Map~string, int~` keeps its space).
const GENERIC_RE = /\S*~.*~\S*/y;
const BACKTICK_RE = /`([^`]+)`/y;
const COMMENT_RE = /"([^"]*)"/y;
const KEYS = new Set(["PK", "FK", "UK"]);

type Token =
	| { t: "word"; v: string }
	| { t: "key"; v: string }
	| { t: "comment"; v: string }
	| { t: "comma" }
	| { t: "close" };

function sticky(re: RegExp, s: string, i: number): RegExpExecArray | null {
	re.lastIndex = i;
	return re.exec(s);
}

function tokenize(s: string): Token[] | null {
	const tokens: Token[] = [];
	let i = skipSpace(s, 0);
	while (i < s.length) {
		const ch = s[i];
		if (ch === "}") {
			tokens.push({ t: "close" });
			i++;
		} else if (ch === ",") {
			tokens.push({ t: "comma" });
			i++;
		} else if (ch === '"') {
			const m = sticky(COMMENT_RE, s, i);
			if (!m) return null;
			tokens.push({ t: "comment", v: m[1] });
			i += m[0].length;
		} else if (ch === "`") {
			const m = sticky(BACKTICK_RE, s, i);
			if (!m) return null;
			tokens.push({ t: "word", v: m[1] });
			i += m[0].length;
		} else {
			const chunk = s.slice(i).match(/^\S*/)?.[0] ?? "";
			const m = chunk.includes("~")
				? (sticky(GENERIC_RE, s, i) ?? sticky(WORD_RE, s, i))
				: sticky(WORD_RE, s, i);
			if (!m) return null;
			const text = m[0];
			// `PK`, `FK`, `UK` in any case, alone or comma-joined (`PK,FK`).
			const parts = text.split(",").filter(Boolean);
			if (
				parts.length > 0 &&
				parts.every((p) => KEYS.has(p.toUpperCase()))
			) {
				for (const p of parts)
					tokens.push({ t: "key", v: p.toUpperCase() });
			} else {
				tokens.push({ t: "word", v: text });
			}
			i += text.length;
		}
		i = skipSpace(s, i);
	}
	return tokens;
}

interface AttrLine {
	attrs: ERAttribute[];
	/** The text ended the block with `}`. */
	closed: boolean;
}

// One or more attributes: `type name [KEY[, KEY]] ["comment"]`, optionally
// ended by `}`. Returns null when any part is unreadable, so a line is either
// taken whole or reported whole.
function parseAttrLine(text: string): AttrLine | null {
	const tokens = tokenize(text);
	if (!tokens) return null;
	const attrs: ERAttribute[] = [];
	let closed = false;
	let i = 0;
	while (i < tokens.length) {
		const tok = tokens[i];
		if (tok.t === "close") {
			if (i !== tokens.length - 1) return null;
			closed = true;
			break;
		}
		const nameTok = tokens[i + 1];
		if (tok.t !== "word" || nameTok?.t !== "word") return null;
		i += 2;
		const keys: string[] = [];
		for (;;) {
			const k = tokens[i];
			if (k?.t === "key") keys.push(k.v);
			else if (!(k?.t === "comma" && keys.length > 0)) break;
			i++;
		}
		let comment: string | undefined;
		const c = tokens[i];
		if (c?.t === "comment") {
			comment = c.v;
			i++;
		}
		attrs.push({
			type: parseGenericTypes(tok.v),
			name: parseGenericTypes(nameTok.v),
			keys,
			comment,
		});
	}
	return { attrs, closed };
}

// --- Statements -------------------------------------------------------------
type Statement =
	| { kind: "entity"; ref: EntityRef }
	| { kind: "block"; ref: EntityRef; body: AttrLine }
	| {
			kind: "rel";
			left: EntityRef;
			right: EntityRef;
			leftCardinality: Cardinality;
			rightCardinality: Cardinality;
			identifying: boolean;
			label?: string;
	  };

// Styling and grouping statements Mermaid accepts and Merefolk does not draw.
// `end` and bare `subgraph` would otherwise read as entity names.
const UNSUPPORTED_RE = /^(?:classDef|class|style|subgraph|end)(?:\s|$)/i;

function parseStatement(line: string): Statement | null {
	if (UNSUPPORTED_RE.test(line)) return null;
	const left = readRef(line, 0);
	if (!left) return null;
	const rest = line.slice(left.end);
	if (!rest) return { kind: "entity", ref: left };

	if (rest.startsWith("{")) {
		const body = parseAttrLine(rest.slice(1));
		return body ? { kind: "block", ref: left, body } : null;
	}

	const spec = rest.match(REL_SPEC_RE);
	if (!spec) return null;
	const right = readRef(rest, spec[0].length);
	if (!right) return null;
	const tail = rest.slice(right.end).match(/^:\s*(.+?)\s*$/);
	if (!tail) return null;
	// Mermaid labels may be quoted ("ships to"): the quotes are delimiters.
	const label = tail[1].replace(/^"(.*)"$/, "$1").trim();
	return {
		kind: "rel",
		left,
		right,
		leftCardinality: CARDINALITY[spec[1].toLowerCase()],
		rightCardinality: CARDINALITY[spec[3].toLowerCase()],
		identifying: IDENTIFYING.has(spec[2].toLowerCase()),
		label: label && label !== ":" ? label : undefined,
	};
}

const DIRECTION_RE = /^direction\s+(TB|BT|LR|RL)/i;
const ACC_RE = /^acc(?:Title|Descr)\s*:/i;
const ACC_DESCR_BLOCK_RE = /^accDescr\s*\{/i;

/**
 * Lightweight, dependency-free parser for Mermaid `erDiagram` source: entity
 * blocks, relationships, aliases, generics, `direction`. Anything it cannot
 * read is reported in `skipped` (and the rest still draws).
 *
 * Not read: styling (`classDef`, `class`, `style`, `:::`), `subgraph`, and the
 * `u` (parent) cardinality marker. Using Mermaid's own parser would cover all
 * of it but adds the `mermaid` dependency; see the CONTRIBUTING.md roadmap.
 */
export function parseMermaidER(source: string): ERModel {
	const lines = source.replace(/\r/g, "").split("\n");
	const entities = new Map<string, EREntity>();
	const relationships: ERRelationship[] = [];
	const skipped: string[] = [];
	let direction: ERDirection | undefined;

	// The id is the identity (what relationships name); `name` is the label the
	// table header shows. The first alias given for an entity wins, as in Mermaid.
	const ensure = (ref: EntityRef): EREntity => {
		let e = entities.get(ref.id);
		if (!e) {
			e = { id: ref.id, name: ref.alias ?? ref.id, attributes: [] };
			entities.set(ref.id, e);
		} else if (ref.alias && e.name === e.id) {
			e.name = ref.alias;
		}
		return e;
	};

	let current: EREntity | null = null;
	let inAccDescr = false;
	let relCount = 0;

	// `line` is the full source line, kept for the skipped list. Returns the
	// entity whose attribute block is still open after this statement, if any.
	const apply = (stmt: Statement, line: string): EREntity | null => {
		// `:::class` is parsed but not drawn; say so instead of hiding it.
		const styled =
			stmt.kind === "rel"
				? stmt.left.styled || stmt.right.styled
				: stmt.ref.styled;
		if (styled) skipped.push(line);

		if (stmt.kind === "entity") {
			ensure(stmt.ref);
		} else if (stmt.kind === "block") {
			const e = ensure(stmt.ref);
			e.attributes.push(...stmt.body.attrs);
			return stmt.body.closed ? null : e;
		} else if (stmt.kind === "rel") {
			ensure(stmt.left);
			ensure(stmt.right);
			relationships.push({
				id: `rel-${relCount++}`,
				leftEntity: stmt.left.id,
				rightEntity: stmt.right.id,
				leftCardinality: stmt.leftCardinality,
				rightCardinality: stmt.rightCardinality,
				label: stmt.label,
				identifying: stmt.identifying,
			});
		}
		return null;
	};

	// Mermaid front matter: a `---` ... `---` block before `erDiagram` that holds
	// a title or config. Metadata, ignored.
	let start = 0;
	while (start < lines.length && !lines[start].trim()) start++;
	if (lines[start]?.trim() === "---") {
		const close = lines.findIndex(
			(l, i) => i > start && l.trim() === "---",
		);
		if (close !== -1) start = close + 1;
	}

	for (const raw of lines.slice(start)) {
		const line = raw.trim();

		// Body of a multi-line `accDescr { ... }`: metadata, ignored.
		if (inAccDescr) {
			if (line.includes("}")) inAccDescr = false;
			continue;
		}
		if (!line || line.startsWith("%%") || /^erDiagram$/i.test(line))
			continue;

		// Inside an attribute block.
		if (current) {
			const attrs = parseAttrLine(line);
			if (attrs) {
				current.attributes.push(...attrs.attrs);
				if (attrs.closed) current = null;
				continue;
			}
			// Not an attribute. A line that opens another entity or is a
			// relationship means the block was left unclosed: close it and handle
			// the line normally. Anything else is reported and the block stays
			// open, so one bad attribute does not drop the ones after it.
			const stmt = parseStatement(line);
			if (stmt && (stmt.kind === "block" || stmt.kind === "rel")) {
				current = apply(stmt, line);
			} else {
				skipped.push(line);
			}
			continue;
		}

		// Metadata Mermaid accepts and Merefolk has nothing to draw for.
		if (ACC_RE.test(line)) continue;
		if (ACC_DESCR_BLOCK_RE.test(line)) {
			inAccDescr = !line.includes("}");
			continue;
		}
		const dir = line.match(DIRECTION_RE);
		if (dir) {
			direction = dir[1].toUpperCase() as ERDirection;
			continue;
		}

		const stmt = parseStatement(line);
		if (stmt) current = apply(stmt, line);
		else skipped.push(line);
	}

	return {
		entities: [...entities.values()],
		relationships,
		direction,
		skipped,
	};
}
