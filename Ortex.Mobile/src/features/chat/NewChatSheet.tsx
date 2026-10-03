import React from "react"
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native"

import { roleLabel } from "@/domain/modules"
import { PersonFace } from "@/features/chat/chatUi"
import { chat, type Person } from "@/lib/chat"
import { feedback } from "@/lib/feedback"
import { useTheme } from "@/store/ThemeContext"
import { gutter, radius, spacing } from "@/theme/tokens"
import { fontFamily, textVariants } from "@/theme/typography"
import { Button, Checkbox, SearchField, SegmentedControl, Sheet, Spinner, useToast } from "@/ui"

/**
 * Start a chat: one tap on a colleague opens (or creates) the direct chat;
 * "New group" picks several and a name. The console's NewChatModal.jsx as a
 * bottom sheet, the phone's shape for a short choice.
 */

type Mode = "direct" | "group"

export default function NewChatSheet({ visible, onClose, onOpened }: { visible: boolean; onClose: () => void; onOpened: (id: string) => void }) {
  const t = useTheme()
  const toast = useToast()
  const [mode, setMode] = React.useState<Mode>("direct")
  const [people, setPeople] = React.useState<Person[]>([])
  const [loading, setLoading] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const [picked, setPicked] = React.useState<string[]>([])
  const [title, setTitle] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    if (!visible) return
    setMode("direct")
    setQuery("")
    setPicked([])
    setTitle("")
    setLoading(true)
    chat
      .people()
      .then((rows) => setPeople(rows || []))
      .catch((e: Error) => toast.show({ message: e.message, tone: "danger" }))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible])

  const shown = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    return people.filter((p) => !q || `${p.name} ${roleLabel(p.role)}`.toLowerCase().includes(q))
  }, [people, query])

  const openDirect = async (id: string) => {
    setBusy(true)
    try {
      onOpened(await chat.openDirect(id))
    } catch (e) {
      toast.show({ message: (e as Error).message, tone: "danger" })
    } finally {
      setBusy(false)
    }
  }

  const createGroup = async () => {
    if (!title.trim() || !picked.length) return
    setBusy(true)
    try {
      onOpened(await chat.createGroup(title.trim(), picked))
    } catch (e) {
      toast.show({ message: (e as Error).message, tone: "danger" })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet visible={visible} onClose={onClose} title="New chat">
      <View style={styles.body}>
        <SegmentedControl
          options={[
            { key: "direct", label: "Message someone" },
            { key: "group", label: "New group" },
          ]}
          value={mode}
          onChange={(m) => {
            setMode(m)
            setPicked([])
          }}
        />
        {mode === "group" ? (
          <TextInput
            value={title}
            onChangeText={setTitle}
            maxLength={80}
            placeholder="Group name, for example Dispatch team"
            placeholderTextColor={t.textTertiary}
            style={[styles.input, { backgroundColor: t.fieldBg, color: t.text, borderColor: t.border }]}
          />
        ) : null}
        <SearchField value={query} onChangeText={setQuery} placeholder="Search colleagues" />
      </View>

      {loading ? (
        <View style={styles.center}>
          <Spinner label="Loading colleagues" />
        </View>
      ) : (
        <FlatList
          style={styles.list}
          data={shown}
          keyExtractor={(p) => p.id}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          initialNumToRender={12}
          ListEmptyComponent={<Text style={[textVariants.small, styles.empty, { color: t.textTertiary }]}>No colleagues found.</Text>}
          renderItem={({ item: p }) => {
            const on = picked.includes(p.id)
            const toggle = () => setPicked((list) => (on ? list.filter((x) => x !== p.id) : [...list, p.id]))
            return (
              <Pressable
                disabled={busy}
                onPress={() => {
                  feedback.select()
                  if (mode === "direct") void openDirect(p.id)
                  else toggle()
                }}
                accessibilityRole={mode === "group" ? "checkbox" : "button"}
                accessibilityState={mode === "group" ? { checked: on, disabled: busy } : { disabled: busy }}
                accessibilityLabel={`${p.name || "Unnamed"}, ${roleLabel(p.role)}`}
                style={({ pressed }) => [styles.person, { backgroundColor: pressed ? t.surfacePressed : on ? t.primary10 : "transparent" }]}
              >
                <PersonFace name={p.name || "?"} uri={p.avatar_url || undefined} />
                <View style={styles.personBody}>
                  <Text numberOfLines={1} style={[textVariants.listTitle, { color: t.text }]}>{p.name || "Unnamed"}</Text>
                  <Text style={[textVariants.caption, { color: t.textTertiary }]}>{roleLabel(p.role)}</Text>
                </View>
                {mode === "group" ? <Checkbox checked={on} onChange={toggle} disabled={busy} /> : null}
              </Pressable>
            )
          }}
        />
      )}

      {mode === "group" ? (
        <View style={styles.footer}>
          <Button
            label={picked.length ? `Create group (${picked.length + 1})` : "Pick people for the group"}
            onPress={() => void createGroup()}
            disabled={busy || !picked.length || !title.trim()}
            loading={busy}
            fullWidth
          />
        </View>
      ) : null}
    </Sheet>
  )
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: gutter, gap: spacing.md, paddingBottom: spacing.sm },
  input: { height: 48, borderRadius: radius.sm, borderWidth: 1, paddingHorizontal: spacing.md, fontFamily: fontFamily.regular, fontSize: 15 },
  list: { maxHeight: 380 },
  center: { paddingVertical: spacing.xxl, alignItems: "center" },
  empty: { textAlign: "center", paddingVertical: spacing.xxl },
  person: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: gutter, paddingVertical: spacing.sm + 2 },
  personBody: { flex: 1, minWidth: 0 },
  footer: { paddingHorizontal: gutter, paddingTop: spacing.md },
})
