export interface MermaidBlock {
	/** 0-based line index of the opening ``` fence */
	start: number;
	/** 0-based line index of the closing ``` fence */
	end: number;
	/** inner content between the fences (fences excluded) */
	content: string;
}

// Scan markdown text for fenced ```mermaid blocks. Language is read from the
// opening fence's info string ("mermaid", "mermaid {...}", etc.).
export function findMermaidBlocks(text: string): MermaidBlock[] {
	const lines = text.split("\n");
	const blocks: MermaidBlock[] = [];
	let start = -1;
	let lang = "";

	for (let i = 0; i < lines.length; i++) {
		const fence = lines[i].match(/^\s*```(.*)$/);
		if (!fence) continue;

		if (start === -1) {
			// opening fence
			start = i;
			lang = fence[1].trim().split(/\s+/)[0].toLowerCase();
		} else {
			// closing fence
			if (lang === "mermaid") {
				blocks.push({
					start,
					end: i,
					content: lines.slice(start + 1, i).join("\n"),
				});
			}
			start = -1;
			lang = "";
		}
	}

	return blocks;
}

/** Content of the mermaid block containing `line` (fence lines count as inside), or null. */
export function mermaidBlockAtLine(text: string, line: number): string | null {
	const block = findMermaidBlocks(text).find(
		(b) => line >= b.start && line <= b.end,
	);
	return block ? block.content : null;
}
