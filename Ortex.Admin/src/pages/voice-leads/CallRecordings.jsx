import { useEffect, useState } from "react"
import { Mic } from "../../components/ui/Icons"
import { formatDateTime } from "../../lib/format"
import { voiceRecordingUrl } from "../../services/voiceRecordings"

// The website records each voice call and files it at `doc.call.recording` on
// every lead row that call produced (Ortex.Web live-orty/recording.js). A folded
// call can hold more than one website call when the same person rang back
// inside the fold window, so every distinct recording is listed, newest first.
function recordingsOf(call) {
  const seen = new Map()
  for (const r of call.rows || []) {
    const path = r.call?.recording
    if (path && !seen.has(path)) seen.set(path, r.createdAt)
  }
  return [...seen.entries()].map(([path, at]) => ({ path, at }))
}

export default function CallRecordings({ call }) {
  const list = recordingsOf(call)
  if (!list.length) return null
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {list.length > 1 ? `Recordings (${list.length})` : "Recording"}
      </h4>
      {list.map((r) => <Player key={r.path} path={r.path} at={list.length > 1 ? r.at : null} />)}
    </div>
  )
}

function Player({ path, at }) {
  // Keyed by path so a stale answer for a previous call never plays here.
  const [result, setResult] = useState({ path: null, url: null })
  useEffect(() => {
    let alive = true
    voiceRecordingUrl(path).then((url) => { if (alive) setResult({ path, url }) })
    return () => { alive = false }
  }, [path])

  const loading = result.path !== path
  return (
    <div className="space-y-1">
      {at && <p className="text-xs text-muted-foreground">{formatDateTime(at)}</p>}
      {loading ? (
        <div className="h-10 animate-pulse rounded-lg bg-muted" />
      ) : result.url ? (
        <audio controls preload="none" src={result.url} className="w-full" />
      ) : (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Mic className="h-4 w-4 flex-none" />
          Recording not available. The caller may have closed the page before the call ended.
        </p>
      )}
    </div>
  )
}
