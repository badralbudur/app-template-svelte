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

> Device-flow login uses no callback URLs, and logout uses no `returnTo`. Auth0 must allow the device-code and refresh-token grants, and the API must allow offline access; see Authentication below. Production requires HTTPS for Secure cookies. Configure the deployment's public origin correctly behind proxies so same-origin checks see the browser-facing origin.

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

## Customization

Edit `src/lib/app-config.js` for login branding: `appName`, `tagline`,
`description`, `showSlots`, and optional `logoSrc` (for example `/logo.svg`
from `static/`). The existing placeholder appearance is the default.
`LoginDeviceFlow` also accepts optional props with these names, defaulting to the config.

Build your feature UI in `src/routes/+page.svelte`. The root layout's `AuthGate`
restores the server session before mounting feature children or showing login;
cached localStorage user info alone never opens the gate. Keep initialization and
login gating out of feature pages. Branding and feature customization should not
require changes to auth components, the gate, `user.js`, `auth0-device-flow.js`,
or server auth/API routes. Direct sign-out calls can remain in feature UI.

The client gate controls rendering only; it does not authorize or prevent SvelteKit
server loads. Server loads, API routes, and protected server-side fetches must still
enforce authentication and authorization before returning protected data.

## Authentication

This template uses the **Auth0 Device Authorization Flow**. Tokens are exchanged,
renewed, and revoked only on the server. Access and refresh tokens are always
persisted in host-only HTTP-only cookies; neither token nor the ID token is
returned in browser JSON. There is no “keep me signed in” option.

### Session state and restoration

`src/lib/user.js` exposes one reactive, in-memory store with `restoring`,
`authenticated`, `signing-out`, `signed-out`, and `error` states. The root `AuthGate` and feature
pages consume this same state. Initialization is deduplicated. Profiles are not
persisted; the legacy `fulcraUserState` localStorage entry is removed best effort
and never read. Storage being unavailable does not break authentication.

Reloading validates the session through server-proxied Auth0 user info and loads
Fulcra account info before revealing feature children. Cookie presence and cached
profiles are not proof of authentication. A 401 signs out; network/provider failures
show an error instead of pretending the session is absent. Feature requests should
use `user.request()` so a 401 invalidates the shared state and logout waits for
pending responses. The rendering gate is not authorization: every protected server
route must use the shared server helper or otherwise independently authorize.

### Login and server API access

1. The sign-in click opens a popup synchronously (including Safari). It visits
   Auth0 logout briefly, then the verification page; blocked popups have a link fallback.
2. `/api/auth/device/code` requests `openid profile email offline_access`.
3. The browser polls `/api/auth/device/token`; success sets both cookies on the
   server and returns only status. The old browser token-setting endpoint is removed.
4. `/api/auth/user` validates against Auth0. `/api/user/info` POST loads the Fulcra
   account and registers it if missing; GET only reads and never registers.
5. Server routes share `src/lib/server/session.js` (`authorizedFetch`) through
   `src/lib/server/api.js` for Fulcra API calls. Missing access cookies trigger
   renewal from the refresh cookie. An upstream 401 on a safe read triggers one
   renewal and retry, including when an old access cookie is present but expired.
   Rotated refresh tokens replace the cookie; non-rotating responses retain it.
   `invalid_grant` clears cookies and returns 401. Transient renewal/network errors
   preserve cookies and return 503; permission denial returns 403 without refresh.
   Unsafe requests are validated before sending and are never automatically replayed.

Auth0 must enable the device-code and refresh-token grants for this client and
**Allow Offline Access** for the API audience. Merely requesting `offline_access`
is not sufficient. Login fails explicitly if the provider does not issue a refresh
token or a valid access-token lifetime. Provider refresh-token expiration, rotation,
and reuse-detection policies remain authoritative.

### Cookie policy and CSRF

Both cookies use `HttpOnly`, `SameSite=Lax`, `Path=/`, no Domain, and `Secure` in
production (disabled only in development for HTTP localhost/Safari). The access
cookie lasts the provider's `expires_in`, capped at 24 hours. The refresh cookie
lasts 30 days from each successful exchange/renewal (a sliding browser retention
window, **not** a promise of a 30-day authenticated session or a server-enforced
absolute lifetime). Auth0 may expire/revoke tokens sooner. Persistent cookies
survive browser restarts, subject to browser policy; HTTP-only prevents JavaScript
access, not theft through a compromised host/browser.

`src/hooks.server.js` rejects every unsafe request with a missing or foreign
Origin, including JSON device-code, token, registration, and logout routes, and
rejects cross-site Fetch Metadata. Browser same-origin fetch supplies Origin on
POST. Non-browser clients must supply the correct Origin too; this check is CSRF
protection, not authentication. API responses are `Cache-Control: no-store`.
Do not add mutations to GET handlers.

### Logout and concurrency limits

Sign Out clears in-memory profiles immediately and opens the Auth0 SSO logout
popup synchronously, before any await. Popup navigation/closure is best effort;
a timed dwell cannot prove that Auth0 cleared SSO. Generation checks cancel stale
initialization/login work. In-flight browser operations settle before the logout
POST so late Set-Cookie responses cannot undo same-tab logout. Polling sleeps are
cancelled, but an in-flight exchange is allowed to settle before cookies are cleared.
The gate shows “Signing out” with no account data or login controls. Each attempt
waits up to 10 seconds for tracked operations, then up to 10 seconds for the revoke
response (including its body). A timeout shows an inability-to-confirm warning and
a retry Sign Out button, not success. Underlying requests are not aborted or removed
from tracking by this timeout; aborting a browser fetch would not prove cancellation
on the server. Retries still wait for old work, including a timed-out revoke, before
sending another revoke. Late completions cannot restore profiles or dismiss the
warning. New login and feature requests remain blocked until a retry confirms
sign-out. If a request never settles, retries remain safe but cannot finish sign-out;
JavaScript cannot force-clear HTTP-only cookies. Reloading loses this in-memory
coordination and can restore a still-active server session.

`/api/auth/revoke` reads the refresh token from its HTTP-only cookie, including
after reload, revokes it server-side, and clears both cookies even if revocation
fails. A revocation failure is reported explicitly; a network failure reaching the
logout route leaves an error with a retry Sign Out button, since JavaScript cannot
clear HTTP-only cookies. Revoking a refresh token does not immediately invalidate
already-issued access tokens at every upstream API.

Concurrent renewal is coalesced **within one server process**, with a five-second
result grace window so overlapping old-cookie requests share a rotated token.
Logout marks matching cached rotations revoked. This is not a distributed session
store: multiple instances, serverless cold starts, other tabs, delayed responses,
or a rotation beyond that window can still race, trigger provider reuse detection,
or overwrite newer cookies. There is no cross-tab reactive synchronization or
server-wide session tombstone. For stronger guarantees, use a shared server session
store and distributed refresh/logout coordination; configure Auth0's rotation reuse
interval appropriately rather than assuming this process-local cache solves it.

Tests exercise mocked provider responses and browser UI/state transitions. Live
Auth0 issuance, rotation/revocation policy, deployed HTTPS cookies, and real Safari
SSO behavior require deployment testing with credentials.

## Fulcra API Client

The template includes a `FulcraAPI` class (`src/lib/api-client.js`) for organized access to the Fulcra REST API:

- **High-level methods** for common operations: `getUserInfo()`, `getUserPreferences()`, etc.
- **Low-level HTTP methods** for flexibility: `get()`, `post()`, `put()`, `delete()`
- **Designed for extension** — add new methods following the existing pattern; server routes obtain the client through `apiFor(cookies)` so they share renewal and authorization

See the [Fulcra REST API documentation](https://docs.fulcradynamics.com/rest-api/) for available endpoints. When you need to call a new endpoint, add a method to `FulcraAPI` and use it from your server routes.

## Project Structure

```
src/
├── app.html                        # HTML template
├── app.d.ts                        # Type declarations
├── lib/
│   ├── auth0-device-flow.js        # Auth0 device authorization flow client
│   ├── user.js                     # User/auth store (login, logout, session)
│   ├── app-config.js               # Login branding customization
│   ├── api-client.js               # FulcraAPI class for calling the Fulcra API
│   └── components/
│       ├── AuthGate.svelte         # Session restoration and login boundary
│       └── LoginDeviceFlow.svelte  # Login screen
└── routes/
    ├── layout.css                  # Global styles with Fulcra colors
    ├── +layout.svelte              # Root layout
    ├── +page.svelte                # Home page
    └── api/                        # Server routes (auth + API proxy)
        ├── auth/                   # device/code, device/token, user, revoke
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
