// Posts XML to the local TallyPrime gateway and interprets the response.
//
// Tally replies with a <RESPONSE> envelope carrying <CREATED>/<ALTERED> counts
// and, on failure, <EXCEPTIONS> plus one or more <LINEERROR> messages. We treat
// any LINEERROR (or a zero created/altered result) as a failure.

function tag(xml, name) {
  const m = xml.match(new RegExp(`<${name}>([^<]*)</${name}>`, "i"))
  return m ? m[1].trim() : null
}

export async function postToTally(url, xml) {
  let res
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/xml; charset=utf-16" },
      body: xml,
    })
  } catch (e) {
    return { ok: false, error: `Cannot reach Tally at ${url} — is TallyPrime running with the XML gateway enabled? (${e.message})` }
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
