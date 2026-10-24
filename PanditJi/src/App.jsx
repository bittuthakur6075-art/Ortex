import { lazy, Suspense, useEffect, useState } from "react"
import Header from "./components/Header"
import Footer from "./components/Footer"
import Home from "./pages/Home"
import PoojaPage from "./pages/PoojaPage"
import { poojaById } from "./data/poojas"

// The live room carries the Gemini SDK; load it only when a pooja starts.
const LiveRoom = lazy(() => import("./pages/LiveRoom"))

// Hash routes: #/  ·  #/pooja/<id>  ·  #/pooja/<id>/live
function parse(hash) {
  const [, page, id, sub] = hash.replace(/^#/, "").split("/")
  if (page === "pooja" && poojaById(id)?.available) return { page: sub === "live" ? "live" : "pooja", pooja: poojaById(id) }
  return { page: "home" }
}

export default function App() {
  const [route, setRoute] = useState(() => parse(window.location.hash))

  useEffect(() => {
    const onHash = () => {
      setRoute(parse(window.location.hash))
      window.scrollTo(0, 0)
    }
    window.addEventListener("hashchange", onHash)
    return () => window.removeEventListener("hashchange", onHash)
  }, [])

  if (route.page === "live") {
    return (
      <Suspense fallback={<div className="min-h-screen bg-ink" />}>
        <LiveRoom key={route.pooja.id} pooja={route.pooja} />
      </Suspense>
    )
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        {route.page === "pooja" ? <PoojaPage key={route.pooja.id} pooja={route.pooja} /> : <Home />}
      </main>
      <Footer />
    </div>
  )
}
