/**
 * The voice engine, as a page loaded into an invisible WebView.
 *
 * WHY A WEBVIEW. A live call needs the microphone streamed out as 16 kHz PCM
 * and the reply played back as 24 kHz PCM chunks the moment they arrive. React
 * Native has no such audio pipeline without a new native module, while a
 * WebView ships a complete one (getUserMedia, Web Audio, WebSocket), is already
 * linked in this app (react-native-webview), and is exactly what the website's
 * Anu runs on. So the ear and the mouth live here, and EVERYTHING ELSE lives in
 * React Native: the token, the prompt, the tools and every database read and
 * write, which happen under the signed-in user's own Supabase session.
 *
 * This page never sees a Supabase key or a row it was not handed. It speaks a
 * tiny message protocol:
 *
 *   RN -> page  window.anu.cmd({ type: "start", url, setup, opening? })
 *               window.anu.cmd({ type: "toolResult", id, name, response })
 *               window.anu.cmd({ type: "text", text })    a typed turn (see below)
 *               window.anu.cmd({ type: "mute", muted })
 *               window.anu.cmd({ type: "hangup" })
 *   page -> RN  { type: "status", status: "connecting"|"live"|"ended"|"error", message? }
 *               { type: "level", mic, out }             ~12 times a second
 *               { type: "speaking", speaking }
 *               { type: "caption", role: "user"|"anu", text, final }
 *               { type: "tool", id, name, args }
 *
 * The Live protocol is spoken raw (the same JSON @google/genai sends), so the
 * page needs no script from a CDN: setup -> setupComplete, realtimeInput audio,
 * serverContent (audio, transcriptions, interrupted, turnComplete), toolCall ->
 * toolResponse.
 *
 * TYPING. A "text" command sends the words as clientContent with turnComplete
 * into the SAME audio session, exactly as the opening line is sent, so Anu
 * answers a typed question out loud and her outputTranscription still arrives
 * as captions. Any half-heard spoken line is DROPPED here, not posted: React
 * Native has already committed its partial to the transcript before it sends
 * the typed turn, so posting it again would land after the typed question.
 *
 * The mic is captured at the device's own rate and DOWNSAMPLED to 16 kHz here,
 * because WebKit refuses to connect a mic into an AudioContext created at a
 * different rate.
 */
export const ENGINE_HTML = String.raw`<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:transparent">
<script>
(function () {
  var IN_RATE = 16000, OUT_RATE = 24000;
  var ws = null, micCtx = null, outCtx = null, stream = null, proc = null, sink = null, analyser = null;
  var nextTime = 0, sources = [], muted = false, levelTimer = 0, micLevel = 0, closedByUs = false;
  var userText = "", anuText = "";

  function post(m) { try { window.ReactNativeWebView.postMessage(JSON.stringify(m)); } catch (e) {} }
  function send(obj) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); }

  function b64FromInt16(int16) {
    var bytes = new Uint8Array(int16.buffer), bin = "", CH = 0x8000;
    for (var i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    return btoa(bin);
  }
  function int16FromB64(b64) {
    var bin = atob(b64), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Int16Array(bytes.buffer, 0, bytes.length >> 1);
  }

  // Linear-interpolating resample of one Float32 block to 16 kHz Int16.
  function downsample(input, fromRate) {
    var ratio = fromRate / IN_RATE, len = Math.floor(input.length / ratio), out = new Int16Array(len);
    for (var i = 0; i < len; i++) {
      var pos = i * ratio, i0 = Math.floor(pos), i1 = Math.min(i0 + 1, input.length - 1), f = pos - i0;
      var s = input[i0] * (1 - f) + input[i1] * f;
      s = Math.max(-1, Math.min(1, s));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return out;
  }

  function play(int16) {
    if (!outCtx) return;
    var f = new Float32Array(int16.length);
    for (var i = 0; i < int16.length; i++) f[i] = int16[i] / 0x8000;
    var buf = outCtx.createBuffer(1, f.length, OUT_RATE);
    buf.copyToChannel(f, 0);
    var src = outCtx.createBufferSource();
    src.buffer = buf;
    src.connect(analyser);
    var at = Math.max(outCtx.currentTime, nextTime);
    src.start(at);
    nextTime = at + buf.duration;
    if (!sources.length) post({ type: "speaking", speaking: true });
    sources.push(src);
    src.onended = function () {
      sources = sources.filter(function (s) { return s !== src; });
      if (!sources.length) post({ type: "speaking", speaking: false });
    };
  }

  function clearPlayback() {
    sources.forEach(function (s) { try { s.stop(); } catch (e) {} });
    sources = []; nextTime = 0;
    post({ type: "speaking", speaking: false });
  }

  function flush(role) {
    if (role === "user" && userText.trim()) { post({ type: "caption", role: "user", text: userText.trim(), final: true }); userText = ""; }
    if (role === "anu" && anuText.trim()) { post({ type: "caption", role: "anu", text: anuText.trim(), final: true }); anuText = ""; }
  }

  function onServer(msg) {
    if (msg.setupComplete) { post({ type: "status", status: "live" }); return; }
    if (msg.toolCall && msg.toolCall.functionCalls) {
      // Settle what was said so far, so the transcript reads: words, then the lookup.
      flush("user"); flush("anu");
      msg.toolCall.functionCalls.forEach(function (fc) { post({ type: "tool", id: fc.id, name: fc.name, args: fc.args || {} }); });
    }
    var sc = msg.serverContent;
    if (!sc) return;
    if (sc.interrupted) { clearPlayback(); flush("anu"); }
    if (sc.inputTranscription && sc.inputTranscription.text) {
      userText += sc.inputTranscription.text;
      post({ type: "caption", role: "user", text: userText, final: false });
    }
    if (sc.outputTranscription && sc.outputTranscription.text) {
      if (userText) flush("user");
      anuText += sc.outputTranscription.text;
      post({ type: "caption", role: "anu", text: anuText, final: false });
    }
    var parts = (sc.modelTurn && sc.modelTurn.parts) || [];
    parts.forEach(function (p) {
      if (p.inlineData && p.inlineData.data && String(p.inlineData.mimeType || "").indexOf("audio/pcm") === 0) play(int16FromB64(p.inlineData.data));
    });
    if (sc.turnComplete) { flush("user"); flush("anu"); }
  }

  function teardown() {
    clearInterval(levelTimer);
    try { proc && proc.disconnect(); } catch (e) {}
    try { stream && stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
    try { micCtx && micCtx.close(); } catch (e) {}
    try { outCtx && outCtx.close(); } catch (e) {}
    sources = []; nextTime = 0; proc = sink = analyser = stream = micCtx = outCtx = null;
  }

  function fail(message) {
    closedByUs = true;
    try { ws && ws.close(); } catch (e) {}
    ws = null;
    teardown();
    post({ type: "status", status: "error", message: message });
  }

  async function start(c) {
    closedByUs = false; muted = false; userText = ""; anuText = "";
    post({ type: "status", status: "connecting" });
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      outCtx = new AC({ sampleRate: OUT_RATE });
      micCtx = new AC();
      try { await outCtx.resume(); await micCtx.resume(); } catch (e) {}
      analyser = outCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.connect(outCtx.destination);

      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      });
    } catch (e) {
      var denied = e && (e.name === "NotAllowedError" || e.name === "SecurityError");
      fail(denied ? "mic-denied" : "mic-failed");
      return;
    }

    ws = new WebSocket(c.url);
    ws.binaryType = "arraybuffer";
    ws.onopen = function () {
      send({ setup: c.setup });
      if (c.opening) send({ clientContent: { turns: [{ role: "user", parts: [{ text: c.opening }] }], turnComplete: true } });

      var src = micCtx.createMediaStreamSource(stream);
      proc = micCtx.createScriptProcessor(4096, 1, 1);
      proc.onaudioprocess = function (ev) {
        var input = ev.inputBuffer.getChannelData(0), sum = 0;
        for (var i = 0; i < input.length; i += 8) sum += input[i] * input[i];
        micLevel = Math.min(1, Math.sqrt(sum / (input.length / 8)) * 4);
        if (muted || !ws || ws.readyState !== 1) return;
        send({ realtimeInput: { audio: { data: b64FromInt16(downsample(input, micCtx.sampleRate)), mimeType: "audio/pcm;rate=16000" } } });
      };
      src.connect(proc);
      // A ScriptProcessor only runs while connected to a destination; a zero
      // gain sink keeps it running without playing the mic out of the speaker.
      sink = micCtx.createGain();
      sink.gain.value = 0;
      proc.connect(sink);
      sink.connect(micCtx.destination);

      var bins = new Uint8Array(analyser.frequencyBinCount);
      levelTimer = setInterval(function () {
        if (!analyser) return;
        analyser.getByteTimeDomainData(bins);
        var s = 0;
        for (var i = 0; i < bins.length; i++) { var v = (bins[i] - 128) / 128; s += v * v; }
        post({ type: "level", mic: muted ? 0 : micLevel, out: Math.min(1, Math.sqrt(s / bins.length) * 3) });
      }, 80);
    };
    ws.onmessage = function (ev) {
      try {
        var text = typeof ev.data === "string" ? ev.data : new TextDecoder().decode(ev.data);
        onServer(JSON.parse(text));
      } catch (e) {}
    };
    ws.onerror = function () { if (!closedByUs) fail("network"); };
    ws.onclose = function (ev) {
      if (closedByUs) return;
      ws = null;
      teardown();
      flush("user"); flush("anu");
      post({ type: "status", status: ev && ev.code !== 1000 && ev.code !== 1005 ? "error" : "ended", message: ev && ev.reason ? "closed:" + ev.reason : "closed" });
    };
  }

  window.anu = {
    cmd: function (c) {
      if (!c) return;
      if (c.type === "start") start(c);
      else if (c.type === "toolResult") send({ toolResponse: { functionResponses: [{ id: c.id, name: c.name, response: c.response }] } });
      else if (c.type === "text") {
        if (!ws || ws.readyState !== 1 || !c.text) return;
        // A new question supersedes whatever she was still saying.
        userText = ""; anuText = ""; clearPlayback();
        send({ clientContent: { turns: [{ role: "user", parts: [{ text: String(c.text) }] }], turnComplete: true } });
      }
      else if (c.type === "mute") { muted = !!c.muted; }
      else if (c.type === "hangup") {
        closedByUs = true;
        try { ws && ws.close(1000); } catch (e) {}
        ws = null;
        flush("user"); flush("anu");
        teardown();
        post({ type: "status", status: "ended" });
      }
    },
  };
  post({ type: "ready" });
})();
</script></body></html>`
