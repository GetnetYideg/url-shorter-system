# URLify — URL Shortener System

A production-grade, full-stack URL Shortener with analytics, QR codes, custom aliases, expiration dates, and admin dashboard.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React + TypeScript + Vite + Tailwind CSS v4 |
| State | TanStack Query + Zustand |
| Backend | Node.js + Express.js + TypeScript |
| ORM | Prisma v5 |
| Database | PostgreSQL 16 |
| Cache | Redis 7 |
| Auth | JWT (access + refresh tokens) |
| QR Code | `qrcode` npm package |
| Charts | Recharts |
| Infra | Docker Compose |

## Getting Started

### Prerequisites
- Node.js 20+
- [Supabase](https://supabase.com) account (free tier is fine)
- Docker (for Redis only) — or install Redis natively

### 1. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) → **New Project**
2. Choose a name, password, and region
3. After creation, go to **Project Settings → Database → Connection string**
4. Copy both URLs:

| URL | Where to find it | Purpose |
|---|---|---|
| `DATABASE_URL` | **Session mode** pooler tab (port **6543**) | Runtime queries |
| `DIRECT_URL` | **Direct connection** tab (port **5432**) | `prisma migrate` |

### 2. Configure Environment

Edit `server/.env` and paste your URLs:

```env
DATABASE_URL="postgresql://postgres.YOUR-REF:[PASSWORD]@aws-0-REGION.pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.YOUR-REF:[PASSWORD]@aws-0-REGION.pooler.supabase.com:5432/postgres"
```

### 3. Start Redis

```bash
docker compose up -d      # starts Redis on port 6379
```

Or natively: `sudo apt install redis-server && sudo systemctl start redis`

### 4. Set up the Server

```bash
cd server
npm install
npx prisma migrate dev --name init   # runs against Supabase via DIRECT_URL
npm run db:seed                       # creates admin@urlshortener.com / Admin@123456
npm run dev                           # starts on http://localhost:3001
```

### 5. Set up the Client

```bash
cd client
npm install
npm run dev              # starts on http://localhost:5173
```

## Default Credentials

| Role | Email | Password |
|---|---|---|
| Admin | `admin@urlshortener.com` | `Admin@123456` |

> Change these in `server/.env` before going to production.

## Features

- 🔗 **URL Shortening** — 6-char base62 short codes with Redis caching (< 100ms redirects)
- 🏷️ **Custom Aliases** — e.g. `localhost:3001/myportfolio`
- ⏰ **Expiration** — set by date or number of days
- 📊 **Analytics** — clicks by day, browser, OS, device, referrer, with Recharts charts
- 📷 **QR Codes** — download as PNG or SVG
- 🔐 **JWT Auth** — access + refresh tokens, token blacklisting in Redis
- 🛡️ **Admin Dashboard** — manage all URLs and users, platform-wide stats
- 🔒 **Security** — Helmet, CORS, rate limiting, Zod validation, bcrypt passwords

## Project Structure

```
url-shorter-system/
├── client/                  # React frontend (Vite)
│   └── src/
│       ├── pages/           # All pages (Landing, Dashboard, Admin, etc.)
│       ├── components/      # Shared components (Sidebar, QrModal)
│       ├── services/        # API service layer
│       ├── stores/          # Zustand auth store
│       └── lib/             # Axios client
├── server/                  # Express backend
│   ├── prisma/              # Schema + migrations
│   └── src/
│       ├── auth/            # Auth routes (register, login, logout, refresh)
│       ├── urls/            # URL CRUD + redirect handler
│       ├── analytics/       # Click analytics + dashboard
│       ├── qr/              # QR code generation
│       ├── admin/           # Admin management routes
│       ├── middleware/       # Auth, validation, error handlers
│       ├── config/          # DB, Redis, logger, JWT config
│       └── utils/           # Helpers, schemas
└── docker-compose.yml       # PostgreSQL + Redis
```

## API Endpoints

| Method | Route | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | Public | Register |
| POST | `/api/auth/login` | Public | Login |
| POST | `/api/auth/logout` | Public | Logout |
| POST | `/api/auth/refresh` | Public | Refresh token |
| GET  | `/api/auth/me` | User | Current user |
| POST | `/api/urls` | Optional | Create short URL |
| GET  | `/api/urls` | User | List user's URLs |
| GET  | `/api/urls/:id` | User | Get URL detail |
| PUT  | `/api/urls/:id` | User | Update URL |
| DELETE | `/api/urls/:id` | User | Delete URL |
| GET  | `/api/urls/:id/qr` | User | Get QR code |
| GET  | `/api/analytics/:urlId` | User | URL analytics |
| GET  | `/api/analytics/dashboard/overview` | Admin | Platform overview |
| GET  | `/api/admin/stats` | Admin | Admin stats |
| GET  | `/api/admin/urls` | Admin | All URLs |
| DELETE | `/api/admin/urls/:id` | Admin | Force delete URL |
| GET  | `/api/admin/users` | Admin | All users |
| PATCH | `/api/admin/users/:id/toggle` | Admin | Enable/disable user |
| GET  | `/:shortCode` | Public | Redirect |
