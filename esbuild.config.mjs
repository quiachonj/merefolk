import esbuild from "esbuild";
import process from "process";
import path from "path";
import { fileURLToPath } from "url";
import { builtinModules } from "node:module";
import { readFileSync, statSync, writeFileSync } from "node:fs";

const dirname = path.dirname(fileURLToPath(import.meta.url));

const banner = `/*
Merefolk: Mermaid ER diagrams as editable Excalidraw drawings in Obsidian.
This file is bundled and minified by esbuild. Source code:
https://github.com/quiachonj/merefolk
*/`;

const prod = process.argv[2] === "production";

// Obsidian auto-loads the plugin's styles.css and forbids injecting <style> tags
// at runtime, so we generate styles.css = Excalidraw's stylesheet + our plugin
// styles on every build.
const stylesPlugin = {
	name: "merefolk-styles",
	setup(build) {
		build.onEnd(() => {
			const excalidrawCss = readFileSync(
				path.resolve(
					dirname,
					"node_modules/@excalidraw/excalidraw/dist/prod/index.css",
				),
				"utf8",
			);
			const pluginCss = readFileSync(
				path.resolve(dirname, "src/styles.css"),
				"utf8",
			);
			writeFileSync(
				path.resolve(dirname, "styles.css"),
				`/* GENERATED — do not edit. Excalidraw stylesheet + src/styles.css. */\n` +
					`${excalidrawCss}\n\n${pluginCss}\n`,
			);
		});
	},
};

// Obsidian Sync's Standard plan caps files at 5 MB, so main.js must stay under
// it or the plugin will not sync. Only the production build is checked (see the
// end of this file): the dev build is unminified with inline source maps and is
// always far larger.
const MAX_BUNDLE_BYTES = 5_000_000;

// Excalidraw lazy-loads its 55 locale chunks through an import() map
// ("./locales/<lang>.json": () => import("./locales/<lang>-<hash>.js")). We
// bundle to one file without splitting, so esbuild inlines all of them:
// 1,665,084 bytes. Merefolk never sets `langCode`, so Excalidraw always uses
// its built-in English. Every other locale becomes an empty module (a missing
// key falls back to the English strings anyway). `en` and `percentages` (the
// translation-coverage table, not a language) are kept. Matching on the name
// prefix, not the hash, survives Excalidraw patch releases. The font-subsetting
// chunk is NOT touched: its inlined binaries are needed for SVG font embedding.
const KEEP_LOCALE = /^(en|percentages)-/;
const stubLocalesPlugin = {
	name: "merefolk-stub-locales",
	setup(build) {
		build.onResolve({ filter: /^\.\/locales\/[^/]+\.js$/ }, (args) => {
			const importer = args.importer.replaceAll("\\", "/");
			if (!importer.includes("/node_modules/@excalidraw/excalidraw/"))
				return;
			if (KEEP_LOCALE.test(path.basename(args.path))) return;
			return { path: args.path, namespace: "merefolk-stub-locale" };
		});
		build.onLoad(
			{ filter: /.*/, namespace: "merefolk-stub-locale" },
			() => ({
				contents: "export default {};",
				loader: "js",
			}),
		);
	},
};

const context = await esbuild.context({
	banner: { js: banner },
	entryPoints: ["src/main.ts"],
	bundle: true,
	format: "cjs",
	target: "es2018",
	platform: "browser",
	// React/Excalidraw JSX -> React 18 automatic runtime.
	jsx: "automatic",
	// Excalidraw 0.18 ships conditional exports (prod/dev); pin production so its
	// JS resolves to the prod build.
	conditions: ["production"],
	alias: {
		// Excalidraw only dynamically import()s this for its built-in Mermaid
		// dialog, which Merefolk never opens. Alias it to a tiny stub to drop
		// ~3.6 MB (cytoscape/katex) from the bundle. See src/stubs/.
		"@excalidraw/mermaid-to-excalidraw": path.resolve(
			dirname,
			"src/stubs/mermaid-to-excalidraw.ts",
		),
	},
	define: {
		"process.env.NODE_ENV": prod ? '"production"' : '"development"',
	},
	external: [
		"obsidian",
		"electron",
		"@codemirror/autocomplete",
		"@codemirror/collab",
		"@codemirror/commands",
		"@codemirror/language",
		"@codemirror/lint",
		"@codemirror/search",
		"@codemirror/state",
		"@codemirror/view",
		"@lezer/common",
		"@lezer/highlight",
		"@lezer/lr",
		...builtinModules,
	],
	plugins: [stylesPlugin, stubLocalesPlugin],
	sourcemap: prod ? false : "inline",
	treeShaking: true,
	outfile: "main.js",
	minify: prod,
	logLevel: "info",
});

if (prod) {
	await context.rebuild();
	const size = statSync(path.resolve(dirname, "main.js")).size;
	if (size >= MAX_BUNDLE_BYTES) {
		console.error(
			`main.js is ${size} bytes, at or over the ${MAX_BUNDLE_BYTES}-byte ` +
				`limit (Obsidian Sync Standard caps files at 5 MB). Check the ` +
				`locale stub and the mermaid-to-excalidraw alias.`,
		);
		process.exit(1);
	}
	process.exit(0);
} else {
	await context.watch();
}
