/**
 * "Is there a face in this selfie?" (attendance plan §2.4, level b).
 *
 * On-device ML Kit face DETECTION on the captured photo, never recognition: it
 * finds a face, it never says whose, so the selfie stays ordinary personal data
 * rather than biometric processing. It stops blank, pocket and ceiling shots,
 * and a second face in frame.
 *
 * The native module is required lazily and every failure is soft: an APK built
 * before @infinitered/react-native-mlkit-face-detection was added has no native
 * side, and requiring the JS then throws. A clock-in is never blocked by the
 * check itself: "unavailable" lets it through, and the punch's device info
 * records that the check did not run so an admin can see it.
 */

export type FaceCheck = { result: "ok" | "no_face" | "many_faces" | "unavailable"; faces: number }

type Detector = {
  status: string
  initialize: (options?: { performanceMode: string }) => Promise<void>
  detectFaces: (uri: string) => Promise<{ faces?: unknown[]; success?: boolean } | undefined>
}

let detector: Detector | null = null
let loading: Promise<Detector | null> | null = null

async function getDetector(): Promise<Detector | null> {
  if (detector && detector.status !== "error") return detector
  if (!loading) {
    loading = (async () => {
      try {
        // A lazy require, on purpose: a static import would throw at app start
        // on an APK that predates the native module.
        const mod = require("@infinitered/react-native-mlkit-face-detection") as {
          RNMLKitFaceDetector: new (o?: { performanceMode: string }, defer?: boolean) => Detector
        }
        const d = new mod.RNMLKitFaceDetector({ performanceMode: "fast" }, true)
        await d.initialize({ performanceMode: "fast" })
        if (d.status === "error") return null
        detector = d
        return d
      } catch {
        return null
      } finally {
        loading = null
      }
    })()
  }
  return loading
}

/** Detect faces in a local photo (file:// uri). Never throws. */
export async function checkFace(uri: string): Promise<FaceCheck> {
  try {
    const d = await getDetector()
    if (!d) return { result: "unavailable", faces: 0 }
    const out = await d.detectFaces(uri)
    if (!out || out.success === false || !Array.isArray(out.faces)) return { result: "unavailable", faces: 0 }
    const n = out.faces.length
    return { result: n === 0 ? "no_face" : n > 1 ? "many_faces" : "ok", faces: n }
  } catch {
    return { result: "unavailable", faces: 0 }
  }
}

export const FACE_MESSAGE: Record<Exclude<FaceCheck["result"], "ok" | "unavailable">, string> = {
  no_face: "We could not see a face. Hold the phone at eye level, in good light, and try again.",
  many_faces: "Only you should be in the selfie.",
}
