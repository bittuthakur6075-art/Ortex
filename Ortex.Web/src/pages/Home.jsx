import useDocumentMetadata from "../hooks/useDocumentMetadata"
import Hero from "../components/ui/Hero"
import { HOME_OG } from "../constants/home"

import StatsBar from "../components/home/StatsBar"
import Welcome from "../components/home/Welcome"
import ProductsPreview from "../components/home/ProductsPreview"
import Capabilities from "../components/home/Capabilities"
import IndustriesPreview from "../components/home/IndustriesPreview"
import Process from "../components/home/Process"
import FounderNote from "../components/home/FounderNote"
import Testimonials from "../components/home/Testimonials"
import FinalCTA from "../components/home/FinalCTA"

/**
 * Section order follows the questions a procurement buyer asks, in the order
 * they ask them: what do you make → can you make it at my volume → for firms
 * like mine → show me → how does it run → who am I trusting → who vouches →
 * ask. Process sits below the proof sections because nobody cares about the
 * pipeline before they believe you can make the part.
 */
export default function Home() {
  useDocumentMetadata(
    "Custom Lanyards, Badges & Corporate Gifts, Delhi | Ortex",
    "Delhi manufacturer of customised lanyards, ID card holders, badges, momentos, MDF, acrylic and corporate gifts, shipped PAN India and exported worldwide.",
    { path: "/", image: HOME_OG }
  )

  return (
    <>
      <Hero />
      <StatsBar />
      <Welcome />
      <ProductsPreview />
      <Capabilities />
      <IndustriesPreview />
      <Process />
      <FounderNote />
      <Testimonials />
      <FinalCTA />
    </>
  )
}
