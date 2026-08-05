import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    files: ["src/features/decision/**/*.{ts,tsx}"],
    rules: {
      "max-len": [
        "error",
        {
          code: 180,
          ignoreUrls: true,
        },
      ],
    },
  },
  // Backend modules (Phase 1A + Phase 1B/C/D modularization). server.mjs
  // is now a thin composition root (Phase 1D), so it's covered here too.
  {
    extends: [js.configs.recommended],
    files: ["server/ai/**/*.js", "server/domain/**/*.js", "server/config/**/*.js", "server/pipeline/**/*.js", "server/http/**/*.js", "server.mjs"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: globals.node,
    },
  },
  // Evaluation harness (Phase 3A). Linted on the same terms as the backend it
  // exercises. It is deliberately a separate config block, not an extension of
  // the backend one: evals/ is not production code, production code never
  // imports it, and a repository-protection test enforces that direction.
  {
    extends: [js.configs.recommended],
    files: ["evals/**/*.js", "evals/**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: globals.node,
    },
  },
);
