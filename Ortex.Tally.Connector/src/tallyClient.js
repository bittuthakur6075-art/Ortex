// Posts XML to the local TallyPrime gateway and interprets the response.
//
// Tally replies with a <RESPONSE> envelope carrying <CREATED>/<ALTERED> counts
// and, on failure, <EXCEPTIONS> plus one or more <LINEERROR> messages. We treat
// any LINEERROR (or a zero created/altered result) as a failure.

function tag(xml, name) {
  const m = xml.match(new RegExp(`<${name}>([^<]*)</${name}>`, "i"))
  return m ? m[1].trim() : null
}

export async function postToTally(url, xml, { timeoutMs = 30000 } = {}) {
  let res
  try {
    res = await fetch(url, {
      method: "POST",
      // fetch serializes a JS string body as UTF-8, so the charset must say
      // utf-8 — the old "utf-16" header garbled Unicode names / the ₹ sign.
      headers: { "Content-Type": "text/xml; charset=utf-8" },
      body: xml,
      // Without a timeout a hung gateway (company not open, port stuck) blocks
      // the whole poll loop indefinitely.
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (e) {
    const reason = e.name === "TimeoutError" ? `no response within ${timeoutMs}ms` : e.message
    return { ok: false, error: `Cannot reach Tally at ${url} — is TallyPrime running with the XML gateway enabled? (${reason})` }
  }
  const text = await res.text()
  if (!res.ok) return { ok: false, error: `Tally HTTP ${res.status}`, raw: text }

  const lineError = text.match(/<LINEERROR>([\s\S]*?)<\/LINEERROR>/i)
  if (lineError) return { ok: false, error: lineError[1].trim(), raw: text }

  const created = Number(tag(text, "CREATED") || 0)
  const altered = Number(tag(text, "ALTERED") || 0)
  const errors = Number(tag(text, "ERRORS") || 0)
  if (errors > 0) return { ok: false, error: `Tally reported ${errors} error(s)`, raw: text }
  if (created + altered === 0) return { ok: false, error: "Tally created/altered nothing (duplicate or rejected)", raw: text }

  return { ok: true, created, altered, raw: text }
}
