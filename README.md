# Help Desk Ticketing System (Angular + Supabase)

A production-grade, multi-tab help desk workspace modeled after Zendesk. Built with modern Angular using zoneless change detection and Signals, backed by PostgreSQL with Row Level Security (RLS), Supabase Auth, and an offline-first resilient data architecture.

- **Live Demo:** [angular-supabase-helpdesk-system.vercel.app](https://angular-supabase-helpdesk-system.vercel.app)
- **Repository:** [github.com/mmy-lana/angular-supabase-helpdesk-system](https://github.com/mmy-lana/angular-supabase-helpdesk-system/tree/main)

---

## Overview

This project implements an agent workspace with strict role-based access control (Agent, Admin, Customer). It supports public customer replies, confidential internal notes, ticket queues with keyset pagination, multi-tab task switching with unsaved draft retention, and optimistic concurrency.

The application features a hybrid data layer: it runs against a local Docker Supabase container or hosted instance, while automatically falling back to an in-memory and `sessionStorage` mock repository if the backend is unreachable or when deployed as a standalone static frontend.

---

## Key Features

- **Multi-Tab Workspace:** Persistent tab bar allowing agents to keep multiple tickets, views, search results, and creation forms open simultaneously with dirty-state change detection.
- **Dual-Mode Reply Composer:** Toggle between Public Replies (notifies requester) and Internal Notes (distinct yellow styling, visible only to agents and admins).
- **Resilient Data Architecture:** Seamless runtime delegation via `ResilientDataRepository`. The frontend automatically falls back to an offline mock dataset if Supabase is offline or not configured.
- **Optimistic Concurrency Control:** Ticket mutations track an integer `version` column to prevent lost updates across concurrent agent edits.
- **PostgreSQL RLS & Hardened Functions:** Row level security restricts customer data access; `SECURITY DEFINER` functions with fixed `search_path` prevent privilege escalation.
- **Responsive Layout (360px to 1440px+):** Adapts across mobile (bottom dock navigation and modal sheets), tablet (collapsed navigation rail), and desktop (three-pane Zendesk layout).
- **Zoneless Reactive Core:** Uses Angular's `provideZonelessChangeDetection()` and Signal-driven state for minimal change-detection overhead.
- **Custom Design Tokens:** Pure CSS with scoped custom properties matching the Zendesk aesthetic (zero Tailwind CSS dependencies).

---

## Tech Stack

| Layer | Technology |
| :--- | :--- |
| **Frontend Framework** | Angular (Standalone Components, Signals, Zoneless) |
| **State Management** | Angular Signals (`signal`, `computed`, `effect`) |
| **Routing & Layout** | Angular Router, Angular CDK (`BreakpointObserver`) |
| **Styling** | Scoped Pure CSS with custom design tokens |
| **Backend / DB** | Supabase (PostgreSQL 15+, Auth, Realtime, Storage) |
| **Package Manager** | `pnpm` (Strict) |
| **Unit Testing** | Vitest, `@analogjs/vite-plugin-angular`, JSDOM |
| **E2E & Viewport Tests** | Playwright (Headless Chromium) |

---

## Architecture

### Resilient Data Layer

```
[UI Components & Feature Stores]
                 |
        [TicketService]
                 |
     [DataRepository (Token)]
                 |
   [ResilientDataRepository (Proxy)]
        /                  \
[SupabaseDataRepository]   [MockDataRepository]
(PostgreSQL + RLS)         (In-memory / SessionStorage)
```

1. **Docker / Production Mode:** When Supabase is reachable, queries execute against PostgreSQL tables and the `create_ticket_atomic` RPC.
2. **Offline / Showcase Mode:** If transport errors or connection refusals occur, `ResilientDataRepository` redirects operations to `MockDataRepository` with zero red network errors displayed to users.

### Custom Database Error Handling (SQLSTATE Namespace)

The database enforces business invariants through custom SQLSTATE exceptions caught and typed in the frontend:

- `HD001`: Closed ticket modification or reopening rejected.
- `HD002`: Assignment to a non-agent user rejected.
- `HD003`: Invalid attachment path (file upload outside caller directory).
- `HD004`: Customer forbidden from assigning ticket or modifying tags at creation.
- `HD005`: Comments rejected on closed tickets.

---

## Pre-Configured Demo Accounts

When running offline or exploring the demo showcase, use the quick-login buttons on the login screen or enter the credentials below:

| Role | Email | Password | Permissions |
| :--- | :--- | :--- | :--- |
| **Support Agent** | `agent@example.com` | `DevPassword123!` | View all queues, assign tickets, internal notes, edit properties |
| **Customer** | `customer@example.com` | `DevPassword123!` | Submit tickets, view own tickets, post public replies |
| **Administrator** | `admin@example.org` | `DevPassword123!` | Full workspace access and user directory management |

---

## Getting Started

### Prerequisites

- Node.js (v20+ recommended)
- `pnpm` installed globally: `npm install -g pnpm`
- Optional (for local database): Docker Desktop and Supabase CLI (`supabase`)

### Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/mmy-lana/angular-supabase-helpdesk-system.git
cd angular-supabase-helpdesk-system
pnpm install
```

### Running Locally

Choose one of three modes depending on your workflow:

#### 1. Resilient Mode (Default)
Runs with auto-detection. Connects to local Supabase if available; automatically degrades to mock data if Docker is stopped:

```bash
pnpm start
```
Navigate to `http://localhost:4200`.

#### 2. Pure Offline Showcase Mode
Runs entirely in the browser using pre-seeded fixtures and `sessionStorage`. Zero Docker or network requirements:

```bash
pnpm run start:demo
```

#### 3. Full-Stack Docker Workflow
Starts the local Supabase container stack, runs migrations and seeds, then launches the frontend:

```bash
pnpm run start:docker
```

---

## Available Scripts

| Command | Description |
| :--- | :--- |
| `pnpm start` | Serve application with automatic Docker/offline detection |
| `pnpm run start:demo` | Serve static offline showcase using mock data |
| `pnpm run start:dev` | Serve against local Docker Supabase configuration |
| `pnpm run start:docker` | Start Supabase containers in Docker and serve app |
| `pnpm run docker:start` | Start local Supabase Docker containers (`supabase start`) |
| `pnpm run docker:stop` | Stop local Supabase Docker containers (`supabase stop`) |
| `pnpm run docker:reset` | Reset and re-seed the local PostgreSQL database |
| `pnpm run build` | Build production bundle for deployment with live Supabase |
| `pnpm run build:demo` | Build static standalone showcase bundle (used for Vercel demo) |
| `pnpm test` | Run unit test suite via Vitest |
| `pnpm run verify:offline` | Execute headless test validating offline fallback behavior |
| `pnpm run verify:viewports` | Run headless Playwright layout checks (360px to 1440px) |

---

## Project Structure

```
angular-supabase-helpdesk-system/
├── src/
│   ├── app/
│   │   ├── core/
│   │   │   ├── guards/          # Functional route guards (auth, role)
│   │   │   ├── mappers/         # Database row to domain entity mappers
│   │   │   ├── models/          # TypeScript domain interfaces and DB types
│   │   │   └── services/        # Repositories, auth, tabs, and realtime services
│   │   ├── features/
│   │   │   ├── auth/            # Sign in and registration components
│   │   │   ├── ticket-workspace/# Detail view, sidebar, composer, customer pane
│   │   │   ├── views/           # Saved ticket views, queue table, and cards
│   │   │   └── workspace/       # App shell, tab bar, header, and navigation rails
│   │   └── shared/
│   │       ├── pipes/           # Pure formatting pipes (e.g., timeAgo)
│   │       ├── ui/              # Atomic UI primitives (badge, button, dropdown, icon)
│   │       └── utils/           # Ephemeral storage utilities
│   ├── environments/            # Production, development, and demo configs
│   ├── index.html
│   ├── main.ts
│   └── styles.css               # Design tokens, CSS variables, and layout resets
├── supabase/
│   ├── migrations/              # SQL schema, RLS policies, triggers, and RPCs
│   ├── tests/                   # Backend SQL integration tests
│   └── seed.sql                 # Docker development seed fixtures
├── tools/                       # Headless verification and viewport test runners
├── angular.json
├── package.json
└── vite.config.ts
```

---

## Deployment

### Deploying as a Static Showcase (e.g., Vercel, Netlify, GitHub Pages)

To deploy the application as an offline-first interactive demo without hosting a database:

1. Configure the build command in your hosting provider:
   ```bash
   pnpm run build:demo
   ```
2. Set the output directory:
   ```
   dist/angular-supabase-helpdesk-system/browser
   ```

### Deploying with a Live Supabase Backend

1. Push the database schema to your Supabase project:
   ```bash
   supabase link --project-ref your-project-ref
   supabase db push
   ```
2. Populate `src/environments/environment.ts` with your project URL and public Anon Key:
   ```typescript
   export const environment = {
     production: true,
     useMockData: false,
     supabaseUrl: 'https://your-project.supabase.co',
     supabaseAnonKey: 'your-anon-key',
     demoAccounts: [],
     demoIdentities: [],
     demoTicketSeeds: []
   };
   ```
3. Run the standard production build:
   ```bash
   pnpm run build
   ```

---

## Verification & Testing

The repository includes a headless Playwright test suite to verify layout integrity and fallback logic:

- **Viewport Validation:** Validates zero horizontal overflow and minimum 44x44px touch targets across 360px, 390px, 430px, 768px, 1024px, and 1440px viewports.
- **Offline Resilience:** Confirms that when port 54321 is down, authentication gracefully degrades without console errors or unhandled rejections.

```bash
# Run unit tests
pnpm test

# Run offline fallback assertion
pnpm run verify:offline

# Run multi-viewport headless browser assertions
pnpm run build:demo
pnpm run verify:viewports
```

---

## License

This project is licensed under the MIT License.
