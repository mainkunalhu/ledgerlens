<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## LedgerLens design system (@shadcn/lint)

After making UI changes, run `bun run --filter web lint` and fix all errors.
Rules enforced on our code (`components/ui/**` and `hooks/**` are generated
registry code and exempt):

- `shadcn/no-arbitrary-values` — no `[...]` utilities; use theme scale
  (e.g. `rounded-xs`, `min-h-100`, `max-w-full`, `lg:col-span-5`).
- `shadcn/no-unknown-classes` — only classes Tailwind can generate.
- `shadcn/no-restyle` (`allow: ["layout"]`) — shadcn components take
  `variant`/`size` props and layout-only classNames (flex, gap, w-full,
  col-span). No color/typography/spacing overrides; add a variant in
  `components/ui/` instead. Plain elements are unrestricted.
- Dynamic geometry (bbox overlay positions, key colors) lives in inline
  `style` — that is intentional, not a violation.
- Overlay correctness: the viewer grid uses `items-start` so the overlay
  container always equals the image height; never let grid stretch change
  the container behind percentage-positioned boxes.
