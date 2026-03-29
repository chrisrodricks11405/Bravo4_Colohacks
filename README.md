# Bravo4 – ColoHacks

Team Bravo 4's full-stack web application built for the ColoHacks hackathon.

---

## Tech Stack

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| **Framework** | [Next.js](https://nextjs.org/) | 16.x | Full-stack React framework (App Router) |
| **Language** | [TypeScript](https://www.typescriptlang.org/) | 5.x | Type-safe JavaScript |
| **UI** | [React](https://react.dev/) | 19.x | Component-based UI library |
| **Styling** | [Tailwind CSS](https://tailwindcss.com/) | 4.x | Utility-first CSS framework |
| **Database** | [PostgreSQL](https://www.postgresql.org/) | – | Relational database |
| **ORM** | [Prisma](https://www.prisma.io/) | 7.x | Type-safe database access |
| **Authentication** | [NextAuth.js](https://authjs.dev/) | 5.x (beta) | Session-based auth |
| **Validation** | [Zod](https://zod.dev/) | 4.x | Schema validation |
| **Testing** | [Jest](https://jestjs.io/) + [Testing Library](https://testing-library.com/) | 30.x / 16.x | Unit & integration tests |
| **Linting** | [ESLint](https://eslint.org/) | 9.x | Code quality |
| **Deployment** | [Vercel](https://vercel.com/) | – | Hosting & CI/CD |

> See [TECH_STACK.md](./TECH_STACK.md) for a detailed breakdown of every technology and architectural decision.

---

## Project Structure

```
.
├── app/                    # Next.js App Router pages & layouts
│   ├── layout.tsx          # Root layout with fonts & metadata
│   ├── page.tsx            # Landing page
│   └── globals.css         # Global Tailwind styles
├── prisma/
│   └── schema.prisma       # Database schema (PostgreSQL)
├── public/                 # Static assets (SVGs, images)
├── next.config.ts          # Next.js configuration
├── tsconfig.json           # TypeScript configuration
└── package.json            # Dependencies & scripts
```

---

## Getting Started

### Prerequisites

- **Node.js** ≥ 20
- **npm** ≥ 10
- **PostgreSQL** database (local or hosted)

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/chrisrodricks11405/Bravo4_Colohacks.git
cd Bravo4_Colohacks

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp .env.example .env
# Edit .env and fill in your DATABASE_URL and AUTH_SECRET

# 4. Push the database schema
npx prisma db push

# 5. Start the development server
npm run dev
```

The app will be running at [http://localhost:3000](http://localhost:3000).

### Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `AUTH_SECRET` | NextAuth.js secret (generate with `npx auth secret`) |

### Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm test` | Run Jest test suite |

---

## Deployment

This project is configured for one-click deployment to **Vercel**:

1. Push your code to GitHub
2. Import the repository at [vercel.com/new](https://vercel.com/new)
3. Add the required environment variables
4. Deploy

---

## Team

**Team Bravo 4** – ColoHacks Hackathon
