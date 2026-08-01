// A stable per-block id, stored as a Mermaid comment (`%% merefolk:<id>`) inside
// the erDiagram block. Mermaid ignores `%%` lines and so does our parser, so the
// id rides along invisibly and survives edits to the diagram.

const ID_RE = /%%\s*merefolk:([A-Za-z0-9_-]+)/;

export function extractSceneId(source: string): string | null {
	return source.match(ID_RE)?.[1] ?? null;
}

export function newSceneId(): string {
	return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function sceneIdComment(id: string): string {
	return `%% merefolk:${id}`;
}
