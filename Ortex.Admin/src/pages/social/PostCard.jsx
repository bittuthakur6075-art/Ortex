import { ImageIcon, Calendar } from "../../components/ui/Icons"
import { SOCIAL_STATUS } from "../../data/domain/schema"
import { Card, StatusBadge } from "../../components/ui/Ui"
import { PLATFORM_ICON } from "./helpers"

export default function PostCard({ post, onClick }) {
  return (
    <Card
      className="group cursor-pointer overflow-hidden transition-colors hover:border-primary/50"
      onClick={onClick}
    >
      <div className="relative aspect-square bg-muted">
        {post.image ? (
          <img src={post.image} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
            <ImageIcon className="h-8 w-8" />
            <span className="text-xs">No creative yet</span>
          </div>
        )}
        <span className="absolute left-2 top-2">
          <StatusBadge list={SOCIAL_STATUS} status={post.status} />
        </span>
        <span className="absolute right-2 top-2 flex gap-1">
          {(post.platforms || []).map((id) => {
            const Icon = PLATFORM_ICON[id]
            return Icon ? (
              <span key={id} className="rounded-full bg-background/90 p-1">
                <Icon className="h-3.5 w-3.5 text-muted-foreground" />
              </span>
            ) : null
          })}
        </span>
      </div>
      <div className="p-3">
        <div className="truncate text-sm font-medium text-foreground">{post.topic || "Untitled"}</div>
        <div className="line-clamp-2 mt-1 text-xs text-muted-foreground">{post.caption || "No caption yet"}</div>
        {post.scheduledFor && post.status === "scheduled" && (
          <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
            <Calendar className="h-3.5 w-3.5" />
            {new Date(post.scheduledFor).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
          </div>
        )}
      </div>
    </Card>
  )
}
