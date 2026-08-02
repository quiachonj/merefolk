import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import obsidianmd from "eslint-plugin-obsidianmd";

export default [
	...obsidianmd.configs.recommended,
	{
		files: ["src/**/*.{ts,tsx}"],
		languageOptions: {
			parser: tsparser,
			parserOptions: {
				sourceType: "module",
				ecmaFeatures: { jsx: true },
				projectService: true,
				tsconfigRootDir: import.meta.dirname,
			},
		},
		plugins: { "@typescript-eslint": tseslint },
		rules: {
			"@typescript-eslint/no-unused-vars": [
				"warn",
				{ argsIgnorePattern: "^_" },
			],
			// "ER" is a legitimate acronym; this rule mishandles it (and it
			// wasn't part of the community-plugin review).
			"obsidianmd/ui/sentence-case": "off",
		},
	},
];
