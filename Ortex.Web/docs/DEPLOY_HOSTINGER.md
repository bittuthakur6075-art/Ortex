# Deploying Ortex.Web to Hostinger

The marketing site is a **static Vite build** (`dist/`). It talks to Supabase
directly from the browser (catalogue, leads) and to a **Supabase Edge Function**
(`orty-chat`) for the AI assistant, so it needs **no Node server** and runs on
any Hostinger plan (Shared / Cloud / VPS).

## One-time setup

### 1. Deploy the Orty chat backend (Supabase Edge Function)
From the `Ortex.Admin` folder (that's where `supabase/functions/` lives):

```bash
supabase functions deploy orty-chat
supabase secrets set GEMINI_API_KEY=your-google-ai-studio-key
# optional: supabase secrets set GEMINI_MODEL=gemini-flash-lite-latest
```

(The AI product copywriter in the Admin uses the same key via the
`product-copywriter` function — deploy that too if you haven't.)

### 2. Point your domain at Hostinger
In hPanel, add your domain and let DNS propagate. Enable **Force HTTPS**
(hPanel → Websites → your site → Security), and issue the free SSL certificate.

## Every deploy (build + upload)

1. **Build locally** with your Supabase env set (so the live catalogue is baked
   into SEO). In `Ortex.Web/.env`:

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
   - **File Manager**: hPanel → Files → File Manager → `public_html`. Delete old
     files, then upload a zip of `dist/`'s contents and Extract. Make sure the
     hidden **`.htaccess`** is included (enable "show hidden files").
   - **or FTP** (FileZilla): connect with your hPanel FTP account and upload the
     contents of `dist/` into `public_html`.

3. Visit the site. Deep links (e.g. `/products/keychains`) work because the
   `.htaccess` falls back to `index.html` for the SPA router, and prerendered
   folders are served directly for SEO.

## Notes
- **Updating products/categories**: edits made in the Admin panel show on the
  live site instantly (the browser reads Supabase live). To refresh the
  prerendered SEO HTML, run `npm run build` and re-upload. On Hostinger there's
  no deploy hook, so leave `VITE_DEPLOY_HOOK_URL` blank in the Admin.
- **Admin panel** (`Ortex.Admin`) deploys the same way if you host it on
  Hostinger too — build it and upload its `dist/` to a subdomain (e.g.
  `admin.yourdomain.com`). Add the same SPA `.htaccess` there.
- If Orty ever shows only its short FAQ answers, the `orty-chat` function isn't
  reachable (not deployed, or missing `GEMINI_API_KEY`) — the widget is designed
  to fall back gracefully.
