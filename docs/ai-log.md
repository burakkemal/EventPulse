# AI Interaction Log

## Session 1 — Project Initialization

**Date:** 2026-02-17

### Interaction Context (Provided to AI)

The following context and constraints were explicitly provided to the AI before starting:

- The full EventPulse case study documentation was shared in advance.
- If the AI could not access or recall the case study, it was instructed to stop and ask for it again.
- The task was framed as a **senior-level backend engineering assessment**.
- AI assistance was limited strictly to **project scaffolding and infrastructure setup**.
- The AI was explicitly instructed **not to generate any business logic or domain-specific code**.

**Technical constraints given to the AI:**
- Backend stack: Fastify + TypeScript
- Language: TypeScript (strict mode)
- Database: PostgreSQL
- ORM: Choose either Drizzle or Prisma and justify the choice
- Cache / Queue: Redis using ioredis
- Emphasis on clarity, maintainability, and controlled AI usage

---

### Interaction Summary
Scaffolded the EventPulse project structure from scratch as part of a senior-level technical assessment.
The scope was intentionally limited to infrastructure and tooling initialization, based on the provided case study constraints, with all domain and business logic deferred to later phases.

Generated `package.json`, `tsconfig.json`, `docker-compose.yml`, `.gitignore`, and `.env.example`. Created the four Clean Architecture layers under `src/`.


### Technical Decisions

| Decision | Rationale |
|---|---|
| **Drizzle ORM over Prisma** | SQL-first with zero runtime overhead (no query engine binary). Critical for the p95 < 200ms ingestion target. Full control over connection pooling via the `postgres` (postgres.js) driver. |
| **`postgres` (postgres.js) driver** | Native ESM, supports pipelining, and works seamlessly with Drizzle. Lighter than `pg`. |
| **`zod` for validation** | Case study allows zod or fluent-json-schema. Zod integrates cleanly with TypeScript's type system and can derive Fastify schemas. |
| **ES2022 target + NodeNext modules** | Aligns with ESM-only constraint. ES2022 gives us native `structuredClone`, `Array.at()`, top-level await. |
| **`noUncheckedIndexedAccess: true`** | Strict-mode hardening — forces null checks on array/object index access, preventing silent `undefined` bugs. |
| **Alpine-based Docker images** | Minimal attack surface, smaller pull size for local dev. |
| **Health checks in docker-compose** | Enables proper startup ordering and `depends_on` with `condition: service_healthy` in later phases. |

### AI Limitations/Fixes
None — this was a straightforward scaffolding task with no corrective iterations.

### Validation Method
```bash
# Verify directory structure
find . -not -path './node_modules/*' | sort

# Verify TypeScript config is valid
npx tsc --noEmit  # (after npm install)

# Verify Docker services start
docker compose up -d
docker compose ps   # both should show "healthy"
```
