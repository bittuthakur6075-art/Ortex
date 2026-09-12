import { useState, useEffect, useCallback, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { Plus, Users as UsersIcon } from "../components/ui/Icons"
import { Avatar, Button, Card, CardHeader, Badge, PageLoader, EmptyState, SortTh } from "../components/ui/Ui"
import { listProfiles } from "../services/users"
import { useSorting } from "../hooks/useCollection"
import { currentUserId } from "../lib/auth"
import { roleLabel } from "../lib/roles"
import RowActions from "./users/RowActions"
import UserEditor from "./users/UserEditor"

export default function Users() {
  const [rows, setRows] = useState(null)
  const [editing, setEditing] = useState(null) // profile object or "new"
  const navigate = useNavigate()
  const selfId = currentUserId()
  const [sort, onSort] = useSorting("email")

  const sortedUsers = useMemo(() => {
    if (!rows) return []
    const { key, desc } = sort
    // Modules is an array on the row and "All modules" / "N modules" on screen,
    // so comparing a[key] directly handed the comparator two arrays: array minus
    // array is NaN, and a NaN comparator leaves the order untouched. Sort by
    // what the column actually says, with admins (who hold everything) on top.
    const valueOf = (row) => {
      if (key !== "modules") return row[key]
      return row.role === "admin" ? Number.MAX_SAFE_INTEGER : (row.modules || []).length
    }
    const sorted = [...rows].sort((a, b) => {
      let valA = valueOf(a)
      let valB = valueOf(b)
      if (valA === undefined || valA === null) valA = ""
      if (valB === undefined || valB === null) valB = ""
      if (typeof valA === "boolean") return valA === valB ? 0 : valA ? -1 : 1
      if (typeof valA === "string") return valA.localeCompare(valB)
      return valA - valB
    })
    return desc ? sorted.reverse() : sorted
  }, [rows, sort])

  const load = useCallback(async () => {
    try {
      setRows(await listProfiles())
    } catch (e) {
      toast.error(e.message || "Failed to load users")
      setRows([])
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (rows === null) return <PageLoader />

  return (
    <div>
      {rows.length === 0 ? (
        <EmptyState icon={UsersIcon} title="No users yet" description="Add your first team member." action={
          <Button onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> Add user</Button>
        } />
      ) : (
        <Card className="overflow-hidden">
          <CardHeader title="Users" action={<Button onClick={() => setEditing("new")}>Add user</Button>} />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="mt-head">
                <tr className="text-left">
                  <SortTh sortKey="name" sort={sort} onSort={onSort}>Name</SortTh>
                  <SortTh sortKey="email" sort={sort} onSort={onSort}>Email</SortTh>
                  <SortTh sortKey="role" sort={sort} onSort={onSort}>Role</SortTh>
                  <SortTh sortKey="modules" sort={sort} onSort={onSort}>Modules</SortTh>
                  <SortTh sortKey="active" sort={sort} onSort={onSort}>Status</SortTh>
                  <th className="w-12 px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="mt-body">
                {sortedUsers.map((p) => (
                  <tr key={p.id} className="cursor-pointer transition-colors" onClick={() => navigate(`/users/${p.id}`)}>
                    {/* The same photo they uploaded on /profile, so a row is
                        recognised by face before it is read. A profile with no
                        photo falls back to initials, and one with no name falls
                        back to the email those initials come from. */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={p.name || p.email} src={p.avatar_url} className="h-8 w-8" />
                        <span className="font-medium text-foreground">
                          {p.name || "-"} {p.id === selfId && <span className="text-xs text-muted-foreground">(you)</span>}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{p.email}</td>
                    <td className="px-4 py-3">
                      <Badge tone={p.role === "admin" ? "violet" : "blue"}>{roleLabel(p.role)}</Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {p.role === "admin" ? "All modules" : `${(p.modules || []).length} module${(p.modules || []).length === 1 ? "" : "s"}`}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={p.active ? "emerald" : "rose"}>{p.active ? "Active" : "Deactivated"}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <RowActions user={p} selfId={selfId} onEdit={() => setEditing(p)} onChanged={load} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {editing && (
        <UserEditor
          user={editing === "new" ? null : editing}
          selfId={selfId}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            load()
          }}
        />
      )}
    </div>
  )
}
