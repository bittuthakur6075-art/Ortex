import useDocumentMetadata from "../hooks/useDocumentMetadata"
import Hero from "../components/ui/Hero"
import { HOME_OG } from "../constants/home"

import StatsBar from "../components/home/StatsBar"
import ProductsPreview from "../components/home/ProductsPreview"
import Capabilities from "../components/home/Capabilities"
import IndustriesPreview from "../components/home/IndustriesPreview"
import WorkStrip from "../components/home/WorkStrip"
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
    "Ortex Industries - Premium Customized Products for Businesses Worldwide",
    "Ortex Industries specializes in manufacturing premium customized products including MDF products, acrylic items, lanyards, badges, and corporate gifts. Serving businesses across India and worldwide.",
    { path: "/", image: HOME_OG }
  )

  return (
    <>
      <Hero />
      <StatsBar />
      <ProductsPreview />
      <Capabilities />
      <IndustriesPreview />
      <WorkStrip />
      <Process />
      <FounderNote />
      <Testimonials />
      <FinalCTA />
    </>
  )
}
