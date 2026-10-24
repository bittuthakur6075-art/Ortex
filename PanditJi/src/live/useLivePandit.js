import { useCallback, useEffect, useRef, useState } from "react"
import { PanditCall } from "./PanditCall"

const MAX_CAPTIONS = 40

// React state for one PanditCall: status, current step, captions, controls.
export function useLivePandit(pooja) {
  const [status, setStatus] = useState("idle") // idle | connecting | live | reconnecting | ended | error
  const [error, setError] = useState("")
  const [step, setStep] = useState(0)
  const [captions, setCaptions] = useState([]) // [{ who: "pandit" | "you", text, done }]
  const [speaking, setSpeaking] = useState(false)
  const [muted, setMuted] = useState(false)
  const [cameraOn, setCameraOn] = useState(true)
  const callRef = useRef(null)

  useEffect(() => () => callRef.current?.release(), [])

  const start = useCallback((videoEl) => {
    callRef.current?.release()
    setCaptions([])
    setStep(0)
    setError("")
    setMuted(false)
    setCameraOn(true)
    const call = new PanditCall(pooja, {
      status: (s, message) => {
        if (callRef.current !== call) return
        setStatus(s)
        setError(message || "")
      },
      step: (i) => callRef.current === call && setStep(i),
      speaking: (b) => callRef.current === call && setSpeaking(b),
      caption: (who, text) => {
        if (callRef.current !== call) return
        setCaptions((prev) => {
          const last = prev.at(-1)
          if (last && last.who === who && !last.done) return [...prev.slice(0, -1), { ...last, text: last.text + text }]
          return [...prev.slice(-MAX_CAPTIONS), { who, text, done: false }]
        })
      },
      turnDone: () => {
        if (callRef.current !== call) return
        setCaptions((prev) => prev.map((c) => (c.done ? c : { ...c, done: true })))
      },
    })
    callRef.current = call
    call.start(videoEl)
  }, [pooja])

  const end = useCallback(() => callRef.current?.end(), [])

  // Outside a call the card is just a preview; inside one, Pandit Ji is told.
  const goToStep = useCallback((i) => {
    if (callRef.current?.session) callRef.current.userStep(i)
    else setStep(i)
  }, [])

  const toggleMute = useCallback(() => {
    const next = !muted
    setMuted(next)
    callRef.current?.setMuted(next)
  }, [muted])

  const toggleCamera = useCallback(() => {
    const next = !cameraOn
    setCameraOn(next)
    callRef.current?.setCamera(next)
  }, [cameraOn])

  const unlockAudio = useCallback(() => callRef.current?.unlockAudio(), [])
  const readLevel = useCallback(() => callRef.current?.readLevel() || 0, [])

  return { status, error, step, goToStep, captions, speaking, muted, cameraOn, start, end, toggleMute, toggleCamera, unlockAudio, readLevel }
}
