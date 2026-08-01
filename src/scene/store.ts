import type { App } from "obsidian";

// Edited scenes persist as `.excalidraw` JSON under the plugin's config dir, so
// they stay out of the note tree but travel with the vault's `.obsidian` folder.
const SCENE_DIR = "merefolk/scenes";

function sceneDir(app: App): string {
	return `${app.vault.configDir}/${SCENE_DIR}`;
}

function scenePath(app: App, id: string): string {
	return `${sceneDir(app)}/${id}.excalidraw`;
}

export function sceneExists(app: App, id: string): Promise<boolean> {
	return app.vault.adapter.exists(scenePath(app, id));
}

/** The saved scene's elements, or null if there's no (valid) saved scene. */
export async function loadSceneElements(
	app: App,
	id: string,
): Promise<readonly unknown[] | null> {
	const path = scenePath(app, id);
	if (!(await app.vault.adapter.exists(path))) return null;
	try {
		const data = JSON.parse(await app.vault.adapter.read(path));
		return Array.isArray(data.elements) ? data.elements : null;
	} catch {
		return null;
	}
}

/** Write the serialized scene JSON, creating the scene directory as needed. */
export async function saveScene(
	app: App,
	id: string,
	json: string,
): Promise<void> {
	const dir = sceneDir(app);
	if (!(await app.vault.adapter.exists(dir))) {
		await app.vault.adapter.mkdir(dir);
	}
	await app.vault.adapter.write(scenePath(app, id), json);
}
