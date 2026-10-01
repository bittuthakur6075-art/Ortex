import { describe, expect, it } from "vitest"
import { describeDevice } from "./sessions"

describe("describeDevice", () => {
  it("names browsers and systems", () => {
    expect(describeDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36"))
      .toEqual({ label: "Chrome on Windows", kind: "computer" })
    expect(describeDevice("Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/129.0 Safari/537.36 Edg/129.0"))
      .toEqual({ label: "Edge on Windows", kind: "computer" })
    expect(describeDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 Version/17.5 Safari/605.1.15").label)
      .toBe("Safari on Mac")
    expect(describeDevice("Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 Chrome/129.0 Mobile Safari/537.36"))
      .toEqual({ label: "Chrome on Android", kind: "phone" })
    expect(describeDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 CriOS/129.0 Mobile/15E148 Safari/604.1").label)
      .toBe("Chrome on iPhone")
  })
  it("recognises the phone app", () => {
    expect(describeDevice("okhttp/4.12.0")).toEqual({ label: "Ortex app on Android", kind: "phone" })
    expect(describeDevice("Ortex/12 CFNetwork/1494.0.7 Darwin/23.4.0")).toEqual({ label: "Ortex app on iPhone", kind: "phone" })
  })
  it("never throws on junk", () => {
    expect(describeDevice(null).label).toBe("Unknown device")
    expect(describeDevice("curl/8.4").label).toBe("Unknown device")
  })
})
