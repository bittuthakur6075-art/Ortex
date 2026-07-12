// Optional site rebuild trigger. After a catalogue change (product or category
// create/update/delete), ping a Vercel Deploy Hook so the marketing site
// rebuilds and its prerendered SEO/JSON-LD catches up with the live data.
//
// No-op unless VITE_DEPLOY_HOOK_URL is set (create one in Vercel → Project →
// Settings → Git → Deploy Hooks and paste the URL into Ortex.Admin/.env).
// Fire-and-forget and debounced, so a burst of edits triggers a single build and
// a save is never blocked or failed by this.

let timer = null

export function triggerSiteRebuild() {
  const hook = import.meta.env.VITE_DEPLOY_HOOK_URL
  if (!hook) return
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    fetch(hook, { method: "POST" }).catch(() => {
      /* rebuild is best-effort; the live site already updates instantly */
    })
  }, 5000)
}
