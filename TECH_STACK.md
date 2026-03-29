# Tech Stack – Bravo4 ColoHacks

Detailed analysis of every technology used in this project, the rationale behind each choice, and how the pieces fit together.

---

## 1. Summary Table

| Category | Technology | Version |
|----------|-----------|---------|
| Full-stack framework | Next.js | 16.2.x |
| UI library | React | 19.2.x |
| Language | TypeScript | 5.x |
| Styling | Tailwind CSS | 4.x |
| Database | PostgreSQL | – |
| ORM | Prisma | 7.x |
| Authentication | NextAuth.js (Auth.js v5) | 5.0.0-beta |
| Validation | Zod | 4.x |
| Unit/Integration tests | Jest + React Testing Library | 30.x / 16.x |
| Component test renderer | ts-jest | 29.x |
| Linting | ESLint (eslint-config-next) | 9.x |
| Deployment | Vercel | – |
| Runtime | Node.js | ≥ 20 |
| Package manager | npm | ≥ 10 |

---

## 2. Frontend

### Next.js 16 (App Router)

Next.js is the primary application framework. The project uses the **App Router** introduced in Next.js 13, which provides:

- **File-based routing** – every `page.tsx` file inside `app/` becomes a route automatically.
- **Server Components** – React components render on the server by default, reducing client-side JavaScript.
- **Server Actions** – form submissions and data mutations can be handled directly in server functions without separate API endpoints.
- **Streaming & Suspense** – incremental page rendering for faster time-to-first-byte.
- **Built-in API routes** – backend endpoints live alongside frontend code in the same project.

```
app/
├── layout.tsx       ← Root layout (server component)
├── page.tsx         ← Landing page (server component)
└── api/             ← API route handlers
    └── auth/[...nextauth]/route.ts
```

**Why Next.js?** It eliminates the need for a separate backend server in a hackathon context, ships production-optimised bundles out of the box, and integrates seamlessly with Vercel for instant deployment.

---

### React 19

React is the underlying UI library. Next.js builds on top of it.

Key React 19 features used:
- **Server Components** – zero-JS components rendered on the server.
- **`use` hook** – simplified data fetching inside components.
- **Actions** – async form submissions via `useTransition`.

---

### TypeScript 5

All source files are written in TypeScript. Strict mode is enabled in `tsconfig.json`, meaning:

- No implicit `any` types.
- Strict null checks – `null | undefined` are never silently ignored.
- Strict function types.

TypeScript provides autocomplete, inline documentation, and catches bugs at compile time rather than in production.

---

### Tailwind CSS 4

Utility-first CSS framework applied via class names directly on JSX elements. Tailwind CSS 4 uses the new Oxide engine (compiled via `@tailwindcss/postcss`) for significantly faster builds.

Key benefits for a hackathon:
- No context-switching between CSS files and component files.
- Consistent design system (spacing, colours, typography) out of the box.
- Dark mode support via the `dark:` variant.

---

## 3. Backend & Database

### PostgreSQL

The relational database that stores all persistent application data. PostgreSQL is chosen for:

- ACID-compliant transactions.
- Rich query language and JSON support.
- Strong ecosystem compatibility (Prisma, Supabase, Neon, Railway).

In development, a local PostgreSQL instance can be used. In production, a managed provider such as [Neon](https://neon.tech) or [Railway](https://railway.app) is recommended.

---

### Prisma ORM 7

Prisma is the database toolkit that provides:

1. **Schema definition** – `prisma/schema.prisma` is the single source of truth for the database structure.
2. **Config file** – `prisma.config.ts` holds the database connection URL and migration settings (Prisma 7+ approach).
3. **Migrations** – `prisma migrate dev` generates SQL migrations from schema changes.
4. **Type-safe client** – the generated Prisma Client surfaces all queries as fully-typed TypeScript functions; no raw SQL strings at the application layer.

```prisma
// prisma/schema.prisma
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

```ts
// prisma.config.ts  (Prisma 7 – connection URL lives here, not in schema.prisma)
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
```

**Prisma Client** is auto-generated into `app/generated/prisma/` and consumed by server-side code.

---

### NextAuth.js (Auth.js v5)

NextAuth.js handles all authentication concerns:

- **OAuth providers** – connect with GitHub, Google, Discord, etc.
- **Credential provider** – email/password sign-in.
- **Session management** – JWT or database sessions.
- **Middleware** – protect routes by checking session state.

In Next.js App Router, the auth handler is mounted at `app/api/auth/[...nextauth]/route.ts`.

---

## 4. Data Validation

### Zod 4

Zod provides runtime schema validation with automatic TypeScript type inference.

```ts
import { z } from "zod";

const UserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).optional(),
});

type User = z.infer<typeof UserSchema>; // TypeScript type derived automatically
```

Zod is used to:
- Validate form inputs before database writes.
- Parse and validate API request bodies in route handlers.
- Ensure external API responses match expected shapes.

---

## 5. Testing

### Jest 30

Jest is the test runner. Configuration lives in `package.json` (or a dedicated `jest.config.ts`). The test environment is `jsdom` for component tests and `node` for pure logic tests.

### React Testing Library 16

Provides utilities to render React components and assert on their output in a user-centric way (querying by role, label text, etc.) rather than by implementation details.

### ts-jest 29

TypeScript transformer for Jest, so test files can be written in `.ts` / `.tsx` without a separate compilation step.

---

## 6. Code Quality

### ESLint 9 + eslint-config-next

`eslint-config-next` extends the base ESLint config with Next.js-specific rules:

- Warns about missing `key` props in lists.
- Enforces correct use of `next/image` and `next/link`.
- Prevents synchronous `fetch` in Server Components.

Run linting with:

```bash
npm run lint
```

---

## 7. Deployment & CI/CD

### Vercel

Vercel is the recommended deployment platform for Next.js applications. It provides:

- **Zero-config deployment** – push to GitHub and the project deploys automatically.
- **Preview deployments** – every pull request gets its own preview URL.
- **Edge network** – static assets served from a global CDN.
- **Serverless functions** – Next.js API routes and Server Actions run as serverless functions.

**Environment variables** (`DATABASE_URL`, `AUTH_SECRET`, etc.) are set through the Vercel project dashboard or CLI.

---

## 8. Architecture Diagram

```
┌─────────────────────────────────────────────────┐
│                    Browser                       │
│   React 19 (Client Components + Hydration)       │
└───────────────────────┬─────────────────────────┘
                        │ HTTP / RSC Payloads
┌───────────────────────▼─────────────────────────┐
│             Next.js 16 (App Router)              │
│                                                  │
│  Server Components  ──►  Prisma ORM  ──►  PostgreSQL
│  API Route Handlers ──►  NextAuth.js             │
│  Server Actions     ──►  Zod Validation          │
│                                                  │
│  Tailwind CSS  ──  TypeScript  ──  ESLint        │
└─────────────────────────────────────────────────┘
                        │
                        ▼ Deploy
                    Vercel Edge
```

---

## 9. Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Next.js App Router over Pages Router | Server Components reduce client bundle size; Server Actions simplify form handling |
| Prisma over raw SQL | Type-safe queries prevent SQL injection and catch schema drift at compile time |
| Zod for validation | Single schema definition produces both runtime validation and TypeScript types |
| Tailwind CSS over CSS modules | Faster to iterate in a hackathon; no separate stylesheet files to manage |
| NextAuth.js for auth | Battle-tested, zero-cost, and integrates in ~20 lines of code |
| Vercel for deployment | First-class Next.js support; instant preview URLs per PR |

---

## 10. Local Development Checklist

- [ ] Node.js ≥ 20 installed
- [ ] PostgreSQL running locally (or `.env` pointing to a hosted DB)
- [ ] `.env` file created with `DATABASE_URL` and `AUTH_SECRET`
- [ ] `npm install` completed
- [ ] `npx prisma db push` run to create tables
- [ ] `npm run dev` starts server on port 3000
