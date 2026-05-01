# TheaterPlanner workspace

Monorepo: React webapp + Hono API.

<projects>
  webapp/    — React + Vite (port 8000). Use `VITE_BACKEND_URL` only when the API runs on another origin in development (e.g. `http://localhost:3000`). In production the app uses relative `/api/...` URLs.

  backend/   — Hono API (port 3000). Better Auth: `baseURL: env.BACKEND_URL` with `trustedProxyHeaders: true`.
  Webapp auth client: `baseURL: import.meta.env.VITE_BACKEND_URL || undefined`.
  Webapp API helper: `import.meta.env.VITE_BACKEND_URL || ""` (empty = relative URLs).
</projects>

<agents>
  Use subagents for project-specific work:
  - backend-developer: Changes to the backend API
  - webapp-developer: Changes to the webapp frontend

  Each agent reads its project's CLAUDE.md for detailed instructions.
</agents>

<coordination>
  When a feature needs both frontend and backend:
  1. Define Zod schemas for request/response in backend/src/types.ts (shared contracts)
  2. Implement backend route using the schemas
  3. Test backend with cURL (use $BACKEND_URL, never localhost)
  4. Implement frontend, importing schemas from backend/src/types.ts to parse responses
  5. Test the integration

  <shared_types>
    All API contracts live in backend/src/types.ts as Zod schemas.
    Both backend and frontend can import from this file — single source of truth.
  </shared_types>
</coordination>

<skills>
  Shared skills in .claude/skills/:
  - database-auth: Set up Prisma + Better Auth for user accounts and data persistence
  - ai-apis-like-chatgpt: Use this skill when the user asks you to make an app that requires an AI API.

  Frontend only skills:
  - frontend-app-design: Create distinctive, production-grade web interfaces using React, Tailwind, and shadcn/ui. Use when building pages, components, or styling any web UI.
</skills>
