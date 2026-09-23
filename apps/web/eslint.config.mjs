import { plugin as shadcn } from "@shadcn/lint";
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { shadcn },
    settings: {
      shadcn: {
        ui: "@/components/ui",
        note: "LedgerLens design rules: use theme tokens and component variants; see AGENTS.md.",
      },
    },
    rules: {
      // No arbitrary values (p-[13px]) — stay on the theme scale.
      "shadcn/no-arbitrary-values": "error",
      // No classes Tailwind cannot generate.
      "shadcn/no-unknown-classes": "error",
      // Pages may place components but not restyle them.
      "shadcn/no-restyle": ["error", { allow: ["layout"] }],
    },
  },
  // Registry components style each other by design (calendar → Button,
  // button-group → Separator); lint only our own usage. Generated hooks
  // also trip react-hooks/set-state-in-effect by design.
  {
    files: ["components/ui/**/*.{ts,tsx}", "hooks/**/*.{ts,tsx}"],
    rules: {
      "shadcn/no-arbitrary-values": "off",
      "shadcn/no-unknown-classes": "off",
      "shadcn/no-restyle": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
