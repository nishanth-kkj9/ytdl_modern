import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "dist/",
      "node_modules/",
      "web/node_modules/",
      "graphify-out/",
      "scripts/",
      "repomix-output.xml",
    ],
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      globals: { ...globals.browser },
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // The transport layer deliberately uses `any` for wire payloads
      // (src/api/transport.ts) — the engine event shape is dynamic.
      "@typescript-eslint/no-explicit-any": "off",
      // console is the app's logging mechanism in dev paths.
      "no-console": "off",
    },
  }
);
