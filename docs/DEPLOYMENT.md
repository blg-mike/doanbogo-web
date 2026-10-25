# Web deployment

The Cloudflare Pages artifact is built from the repository root with Node.js 24:

```sh
npm ci
npm run build:deploy
npm run preview:site
```

`build:deploy` runs type checking, lint, tests, and design-system checks before producing `site/`. Upload the contents of `site/` as the Pages output. The homepage is `site/index.html`; the HashRouter app and its assets are under `site/app/`.

| Setting | Value |
| --- | --- |
| Git repository | This web repository |
| Root directory | Repository root |
| Framework preset | None |
| Node.js | 24 |
| Production branch | `main` |
| Build command | `npm run build:deploy` |
| Build output directory | `site` |

After connecting GitHub, Cloudflare Pages builds production from `main` and creates preview deployments for other enabled branches. The existing GitHub Pages workflow remains active; connecting Cloudflare does not replace it.

The public routes are `/` for the homepage, `/app/` for the app, and `/app/#/projects` or `/app/#/viewer/<document-id>` for app screens. The homepage forwards older `/#/...` app links to `/app/` and keeps the hash route. Homepage information pages use `#page/...` and remain on the homepage.

HTML and service-worker responses use `Cache-Control: no-cache`. Vite's hashed files under `/app/assets/` are cached as immutable. The PWA manifest and service worker are scoped to `/app/`, so they do not control the homepage.

The app stores work in IndexedDB for its current browser origin. Moving from GitHub Pages to `knitpeek.com` changes the origin and does not move that data; export a `.doanbogo` backup before the move, then import it on the new origin. Deploying a new version on the same `knitpeek.com` origin keeps the existing browser data.

To preview a branch, use its Cloudflare preview URL and verify `/`, `/app/`, and a hash route. If a production release needs to be reverted, select the previous successful production deployment in the Cloudflare Pages Deployments list and roll it back. A rollback changes deployed files, not browser IndexedDB data.

Cloudflare account connection, custom-domain/DNS setup, and production deployment are still manual and are not performed by this repository build.
