import { defineConfig, globalIgnores } from "eslint/config";
import nextPlugin from "@next/eslint-plugin-next";
import typescriptParser from "@typescript-eslint/parser";

export default defineConfig([
  {
    files: ["**/*.{js,mjs,ts,tsx}"],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: { ecmaVersion: 2022, sourceType: "module", ecmaFeatures: { jsx: true } }
    },
    plugins: { "@next/next": nextPlugin },
    rules: { "@next/next/no-img-element": "warn" }
  },
  globalIgnores([".next/**", "node_modules/**", "data/**"])
]);
