import type { App } from "obsidian";

// Edited scenes persist as `.excalidraw` JSON in a configurable vault folder
// (default: under the vault's config dir, out of the note tree). The directory
// is passed in so the settings tab can point it elsewhere.

function scenePath(dir: string, id: string): string {
	return `${dir}/${id}.excalidraw`;
}

/** Create `dir` and any missing parents (adapter.mkdir isn't recursive). */
async function ensureDir(app: App, dir: string): Promise<void> {
	const parts = dir.split("/").filter(Boolean);
	let cur = "";
	for (const part of parts) {
		cur = cur ? `${cur}/${part}` : part;
		if (!(await app.vault.adapter.exists(cur))) {
			await app.vault.adapter.mkdir(cur);
		}
	}
}

/** The saved scene's elements, or null if there's no (valid) saved scene. */
export async function loadSceneElements(
	app: App,
	dir: string,
	id: string,
): Promise<readonly unknown[] | null> {
	const path = scenePath(dir, id);
	if (!(await app.vault.adapter.exists(path))) return null;
	try {
		const data = JSON.parse(await app.vault.adapter.read(path)) as unknown;
		const elements = (data as { elements?: unknown }).elements;
		return Array.isArray(elements)
			? (elements as readonly unknown[])
			: null;
	} catch {
		return null;
	}
}

/** Write the serialized scene JSON, creating the scene directory as needed. */
export async function saveScene(
	app: App,
	dir: string,
	id: string,
	json: string,
): Promise<void> {
	await ensureDir(app, dir);
	await app.vault.adapter.write(scenePath(dir, id), json);
}

/** Delete a saved scene (used by "Re-sync from Mermaid"). No-op if absent. */
export async function deleteScene(
	app: App,
	dir: string,
	id: string,
): Promise<void> {
	const path = scenePath(dir, id);
	if (await app.vault.adapter.exists(path)) {
		await app.vault.adapter.remove(path);
	}
}
