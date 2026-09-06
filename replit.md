# RetinoAI

RetinoAI is a frontend-only healthcare screening workspace for upload-first retinal image review, patient context, explainable AI demo states, and clinician follow-up decisions.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + TypeScript
- Routing: Wouter
- Styling: Tailwind CSS v4 with local theme tokens
- UI: Lucide React icons and scaffolded shadcn/ui primitives
- Current scope: frontend-only mock data; no backend, database, auth, AI API, or hardware integration

## Where things live

- `artifacts/retinoai/src/App.tsx` — route map, mock domain data, reusable UI, and frontend-only flows
- `artifacts/retinoai/src/index.css` — RetinoAI theme tokens, typography, responsive layout utilities, and accessibility states
- `artifacts/retinoai` — deployable web artifact and managed preview workflow
- `attached_assets/` — source brief supplied for the RetinoAI prototype

## Architecture decisions

- The first release is upload-first and software-only; hardware is represented only as a future-development card.
- Demo data and frontend state keep all core navigation and review flows demonstrable without claiming clinical diagnosis or real AI processing.
- The screening route owns the quality-check, analysis, results, explainability, comparison, and doctor-review progression.
- The app defaults to the dashboard and provides a responsive shell with a mobile navigation drawer pattern.

## Product

- Mock sign-in with Demo Mode
- Dashboard overview with recent screening activity and follow-up pulse
- Searchable/filterable patient list with six-step registration wizard
- Patient profiles with screening history and contextual tabs
- Upload-first retinal screening flow with removable image/report mock files
- Image quality, prototype AI analysis, explainability, comparison, and clinical review screens
- Reports, follow-ups, settings, offline-first messaging, and future capture-device placeholder

## User preferences

- Keep the interface calm, clinical, accessible, and suitable for a hackathon demonstration.
- Do not use definitive diagnosis language; use prototype/demo and clinician-review wording.

## Gotchas

- The RetinoAI workflow provides `PORT` and `BASE_PATH`; use the managed workflow rather than starting Vite manually.
- The API and database artifacts are intentionally not part of the current RetinoAI feature scope.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
