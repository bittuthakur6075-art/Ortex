import { Card, CardHeader } from "./Ui"

// A Card with a standard header row (title, optional description, optional
// right-aligned action) and a padded body. Shared by the analytics pages.
export default function SectionCard({ title, description, action, children, className = "", bodyClassName = "px-5 pb-5" }) {
  return (
    <Card className={className}>
      <CardHeader title={title} description={description} action={action} />
      <div className={bodyClassName}>{children}</div>
    </Card>
  )
}
