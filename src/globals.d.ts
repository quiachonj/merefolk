// CSS imported into TS is bundled as a string by esbuild's `.css -> text`
// loader (see esbuild.config.mjs). Declare the module shape for TypeScript.
declare module "*.css" {
	const content: string;
	export default content;
}
