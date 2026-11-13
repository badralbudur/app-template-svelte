# Fulcra App Template - Svelte

A SvelteKit web application template for building on the Fulcra platform. This template includes:

- **SvelteKit** with Svelte 5
- **Auth0 authentication** via the device flow, with server-side API proxying
- **Tailwind CSS 4** with DaisyUI
- **Fulcra brand colors** and styling
- **ESLint** and **Prettier** configured
- **Vitest** for testing

## Getting Started

1. Install dependencies:
```bash
npm install
```

2. Configure environment variables:
```bash
cp .env.example .env
```
Then edit `.env` with your Auth0 credentials and Fulcra API endpoint.

3. Run the development server:
```bash
npm run dev
```
The app will be available at http://localhost:6173/

4. Build for production:
```bash
npm run build
```

## Deployment

This template uses `@sveltejs/adapter-auto`, which detects the host at build time — no config change is needed for Vercel, Netlify, Cloudflare Pages, or Azure Static Web Apps.

**Environment variables** — wherever you deploy, set the same three vars from your `.env` in the platform's project settings:

- `PUBLIC_AUTH0_DOMAIN`
- `PUBLIC_AUTH0_CLIENT_ID`
- `PUBLIC_FULCRA_API_ENDPOINT` (point this at a reachable API — not `localhost`)

> No extra Auth0 setup is required for deployed environments: the device-flow login uses no callback URLs, and logout uses no `returnTo`, so nothing needs adding to Auth0's allowlists.

### Local

```bash
npm run dev                  # dev server at http://localhost:6173
npm run build && npm run preview   # preview the production build locally
```

For a **self-hosted Node server or Docker** (not covered by `adapter-auto`), swap the adapter in `svelte.config.js` to `@sveltejs/adapter-node` (already in `devDependencies`), then:

```bash
npm run build
node build
```

### Vercel

**Git integration (recommended):**

1. Import the repo at [vercel.com](https://vercel.com) — SvelteKit is auto-detected.
2. Add the three env vars under Project Settings → Environment Variables.
3. Every push deploys automatically.

**CLI:**

```bash
vercel login
vercel link                  # create/link the project
vercel env add PUBLIC_AUTH0_DOMAIN        # repeat for each var
vercel deploy                # preview deploy
vercel deploy --prod         # production deploy
```

## Authentication

This template includes Auth0 authentication out of the box, using the **Auth0 Device Authorization Flow** with server-side API proxying:

- **Device-flow login**: No callback URLs or Auth0 SPA SDK required; the flow is proxied through server routes to avoid CORS
- **Access tokens**: Stored in HTTP-only cookies (more secure than localStorage)
- **API calls**: Proxied through SvelteKit server routes, so calls to the Fulcra API are server-to-server
- **Full logout**: Revokes the refresh token and clears the Auth0 SSO session, not just local state
- **Portable**: No CORS issues and no domain allowlisting — works on any platform (Vercel, Netlify, Cloudflare Pages)

### How login works

1. User clicks **Sign In** → the app requests a device code from `/api/auth/device/code`
2. A popup opens Auth0's verification page; the user confirms the displayed code
3. The app polls `/api/auth/device/token` until Auth0 returns an access token
4. The token is stored in an HTTP-only cookie via `/api/auth/token`
5. Client requests hit `/api/*` server routes, which use the cookie to call the Fulcra API server-to-server

While authorization is pending, the app displays a QR code, user code, and a visible sign-in URL with **Copy link** and **Open sign-in page in new tab** controls. Paste the link into your main browser or scan the QR code on another device, and keep the original app open while it waits for approval. The new-tab link does not guarantee opening the system browser. If clipboard access is denied, select and copy the displayed URL manually.

### How logout works

**Sign Out** fully ends the session: it revokes the refresh token (`/api/auth/revoke`), clears the access-token cookie, wipes local state, and opens Auth0's `/v2/logout` to clear the SSO session so the next sign-in requires re-authentication.

The auth logic lives in `src/lib/user.js` and `src/lib/auth0-device-flow.js`. This approach is more secure and doesn't require adding your domain to the Fulcra API CORS allowlist.

## Fulcra API Client

The template includes a `FulcraAPI` class (`src/lib/api-client.js`) for organized access to the Fulcra REST API:

- **High-level methods** for common operations: `getUserInfo()`, `getUserPreferences()`, etc.
- **Low-level HTTP methods** for flexibility: `get()`, `post()`, `put()`, `delete()`
- **Designed for extension** — add new methods following the existing pattern

See the [Fulcra REST API documentation](https://docs.fulcradynamics.com/rest-api/) for available endpoints. When you need to call a new endpoint, add a method to `FulcraAPI` and use it from your server routes.

## Project Structure

```
src/
├── app.html                        # HTML template
├── app.d.ts                        # Type declarations
├── lib/
│   ├── auth0-device-flow.js        # Auth0 device authorization flow client
│   ├── user.js                     # User/auth store (login, logout, session)
│   ├── api-client.js               # FulcraAPI class for calling the Fulcra API
│   └── components/
│       └── LoginDeviceFlow.svelte  # Login screen
└── routes/
    ├── layout.css                  # Global styles with Fulcra colors
    ├── +layout.svelte              # Root layout
    ├── +page.svelte                # Home page
    └── api/                        # Server routes (auth + API proxy)
        ├── auth/                   # device/code, device/token, token, revoke
        └── user/                   # info, preferences
```

## Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run check` - Run type checking
- `npm run format` - Format code with Prettier
- `npm run lint` - Lint code with ESLint
- `npm test` - Run tests
