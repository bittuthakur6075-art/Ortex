// Anu's microphone capture, on the AUDIO thread.
//
// Loaded by Ortex.Web/src/components/ui/live-orty/useLiveSession.js through
// audioWorklet.addModule. It is a static file rather than a blob: URL because
// the site's CSP (vercel.json) allows worklet scripts from 'self' only.
//
// The old ScriptProcessorNode ran its callback on the page's main thread, so
// every React render and caption animation delayed or dropped mic blocks: the
// model heard gaps in the customer's speech, judged the turn finished (or not)
// at the wrong moment, and she answered late or talked over them. Here the
// samples are gathered off the main thread and posted in fixed blocks.

class AnuMicProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super()
    const size = options?.processorOptions?.blockSize || 1024
    this.block = new Float32Array(size)
    this.filled = 0
  }

  process(inputs) {
    const channel = inputs[0]?.[0]
    if (!channel) return true
    let i = 0
    while (i < channel.length) {
      const take = Math.min(channel.length - i, this.block.length - this.filled)
      this.block.set(channel.subarray(i, i + take), this.filled)
      this.filled += take
      i += take
      if (this.filled === this.block.length) {
        // Transfer a copy; the working block is reused.
        const out = this.block.slice(0)
        this.port.postMessage(out, [out.buffer])
        this.filled = 0
      }
    }
    return true
  }
}

registerProcessor("anu-mic", AnuMicProcessor)
