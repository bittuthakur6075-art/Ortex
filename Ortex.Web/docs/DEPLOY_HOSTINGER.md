# Deploying Ortex.Web to Hostinger

The marketing site is a **static Vite build** (`dist/`). It talks to Supabase
directly from the browser (catalogue, leads) and to a **Supabase Edge Function**
(`orty-live-token`) for the voice assistant, so it needs **no Node server** and runs on
any Hostinger plan (Shared / Cloud / VPS).

## One-time setup

### 1. Deploy the voice assistant backend (Supabase Edge Function)
From the `Ortex.Admin` folder (that's where `supabase/functions/` lives):

```bash
supabase functions deploy orty-live-token
supabase secrets set GEMINI_API_KEY=your-google-ai-studio-key
# optional: supabase secrets set GEMINI_MODEL=gemini-flash-lite-latest
```

(The AI product copywriter in the Admin uses the same key via the
`product-copywriter` function, deploy that too if you haven't.)

### 2. Point your domain at Hostinger
In hPanel, add your domain and let DNS propagate. Enable **Force HTTPS**
(hPanel → Websites → your site → Security), and issue the free SSL certificate.

### 3. Google Search Console
The URL-prefix property `https://bizgift.ortexindustries.in/` is verified by
**HTML file**: `public/googled41e542536c1f8f5.html` (copied into `dist/` by every
build). Never delete it: Google re-checks and un-verifies the property if it
disappears. After verifying, **Sitemaps** → submit `sitemap.xml`.

Alternative (not in use): the **HTML tag** method. Put the tag or its code in
`.env.production` as `GOOGLE_SITE_VERIFICATION=…`; `scripts/prerender.mjs`
writes it into every page and fails the build on a malformed value.

## Every deploy (build + upload)

1. **Build locally** with your Supabase env set (so the live catalogue is baked
   into SEO). In `Ortex.Web/.env.production` (gitignored; the same URL and anon
   key as `Ortex.Admin/.env.production`):

   ```
   VITE_SUPABASE_URL=...
   VITE_SUPABASE_ANON_KEY=...
   ```

   Then:

   ```bash
   npm install
   npm run build
   ```

   This produces `dist/` with prerendered per-route HTML, `sitemap.xml`, and the
   `.htaccess` (copied from `public/`). You'll see `[live catalogue]` in the
   prerender log when it fetched live data.

2. **Upload the CONTENTS of `dist/`** into `public_html`:
   - **File Manager**: hPanel → Files → File Manager → `public_html`. Upload a
     zip of `dist/`'s contents and Extract it **over the old files** (overwrite).
     **Do not delete the old `assets/` files first**: a visitor who opened a page
     before the deploy, or whose browser or Hostinger's CDN still holds the old
     HTML, asks for the previous build's chunk names, and a deleted chunk made
     pages and inner pages fail to load. Keep old `assets/` files for at least
     a few days; when tidying, delete only files from builds OLDER than the
     previous one (sort `assets/` by date). Page folders and `404.html` are
     overwritten by the new build anyway. Make sure the hidden **`.htaccess`**
     files are included, the root one and `assets/.htaccess` (enable "show
     hidden files").
     **Do not zip with Windows' own "Send to → Compressed folder" or PowerShell 5's
     `Compress-Archive`**: they store paths with backslashes, and Hostinger's Linux
     extractor then creates files literally named `assetsindex.js` instead of
     folders (the site loads with no styles or scripts). Use 7-Zip, `tar -a -cf
     site.zip -C dist .`, or any zip tool that writes forward slashes.
   - **or FTP** (FileZilla): connect with your hPanel FTP account and upload the
     contents of `dist/` into `public_html`.

3. Visit the site. Every prerendered page is a real folder with its own
   `index.html`; any other URL gets `404.html`, which still boots the app, so a
   product added in the console since the build renders for a visitor (with a
   404 status for crawlers until the next build). A trailing slash 301s to the
   address without it. HTML is sent `no-cache` so a deploy shows at once; the
   hashed files in `assets/` are cached for a year, other static files for a
   day. If a tab still asks for a chunk that is gone, it reloads itself once
   onto the new build (`src/lib/lazyWithRetry.js`).

## Notes
- **Updating products/categories**: edits made in the Admin panel show on the
  live site instantly (the browser reads Supabase live). To refresh the
  prerendered SEO HTML, run `npm run build` and re-upload. On Hostinger there's
  no deploy hook, so leave `VITE_DEPLOY_HOOK_URL` blank in the Admin.
- **Admin panel** (`Ortex.Admin`) deploys the same way if you host it on
  Hostinger too, build it and upload its `dist/` to a subdomain (e.g.
  `admin.yourdomain.com`). Add the same SPA `.htaccess` there.
- If the voice assistant will not start, the `orty-live-token` function isn't
  reachable (not deployed, or missing `GEMINI_API_KEY`), or a visitor hit its
  rate limit (6 sessions per 10 minutes, 400 a day across the site).
