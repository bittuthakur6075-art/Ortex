// Microphone capture on the AUDIO thread, posted to the page in fixed blocks.
// A static file (not a blob URL) so a strict CSP can allow it from 'self'.

class PanditMicProcessor extends AudioWorkletProcessor {
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

registerProcessor("pandit-mic", PanditMicProcessor)
