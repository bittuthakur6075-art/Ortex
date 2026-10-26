import { useLocation, useNavigate } from "react-router-dom"
import { Button, EmptyState } from "../components/ui/Ui"

// An address the console does not know, said in words. It used to send the
// person to the Dashboard silently, which read as a broken link.
export default function NotFound() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  return (
    <EmptyState
      className="mx-auto mt-10 max-w-lg"
      title="Page not found"
      description={`There is no page at ${pathname}. It may have moved, or the link may be wrong.`}
      action={
        <Button size="sm" onClick={() => navigate("/")}>
          Go to Dashboard
        </Button>
      }
    />
  )
}
