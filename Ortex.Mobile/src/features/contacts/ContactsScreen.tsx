import React from "react"
import { Pressable, Share, StyleSheet, Text, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import type { Customer, Row } from "@/domain/schema"
import ContactIndexBar from "@/features/contacts/ContactIndexBar"
import ContactRow, { CONTACT_ROW_HEIGHT } from "@/features/contacts/ContactRow"
import { useCollection } from "@/hooks/useCollection"
import { prettyPhone } from "@/lib/contact"
import { setFavourites, useFavourites } from "@/lib/favourites"
import { feedback } from "@/lib/feedback"
import type { TabScreenProps } from "@/navigation/types"
import { useTheme } from "@/store/ThemeContext"
import { gutter, size as sizes, spacing } from "@/theme/tokens"
import { font, textVariants } from "@/theme/typography"
import {
  AppScreen,
  DataNotice,
  ListRefreshControl,
  EmptyState,
  Fab,
  Icon,
  IconButton,
  PopupMenu,
  ProfileAvatarButton,
  SearchField,
  Skeleton,
  useToast,
} from "@/ui"
import type { ScrollableList } from "@/ui/AppScreen"
import { TAB_BAR_HEIGHT } from "@/ui/Fab"

export type CustomerRow = Customer & Row

/**
 * The directory, built the way Samsung Contacts is built.
 *
 * A `customers` document holds exactly one person — name, company, one phone, one
 * email — and the console matches records on email-then-phone rather than on
 * company, so one firm legitimately has several rows. Samsung's answer to a long
 * list of people is not to group them: it is A–Z sections, a fast-scroll alphabet
 * rail, a pinned Favourites group, and search. That is what this is, with the
 * company carried on the row's second line so a B2B name still reads.
 *
 * The Samsung behaviours that are load-bearing, and are all here:
 *   · a sticky letter header per section, and an index rail you can drag
 *   · Favourites (★) pinned above "A" — local to the phone, see lib/favourites
 *   · swipe a row right to call, left to message (ContactRow)
 *   · long-press for multi-select, with a bottom action bar
 *   · the contact count at the very end of the list
 *
 * Sorting flips between the person and the company from the overflow menu, which
 * is Samsung's "Sort by" — and here it doubles as the old group-by-company view,
 * because the letter headers follow whatever you sort on.
 */

type SortMode = "name" | "company"

type ContactSection = { letter: string; data: CustomerRow[] }

const FAVOURITES = "★"

const displayName = (c: CustomerRow) => c.name || c.company || "Unnamed contact"

/** What a row sorts and letters under, given the current Sort by choice. */
const sortKey = (c: CustomerRow, mode: SortMode) =>
  (mode === "company" ? c.company || c.name : c.name || c.company || "").trim()

/** Letters only; digits and symbols land in "#", exactly as One UI does it. */
function letterFor(value: string): string {
  const first = value.trim().charAt(0).toUpperCase()
  return first >= "A" && first <= "Z" ? first : "#"
}

function matches(c: CustomerRow, needle: string): boolean {
  const haystack = [c.name, c.company, c.email].filter(Boolean).join(" ").toLowerCase()
  if (haystack.includes(needle)) return true
  const digits = needle.replace(/\D/g, "")
  return digits.length >= 3 && String(c.phone || "").replace(/\D/g, "").includes(digits)
}

export default function ContactsScreen({ navigation }: TabScreenProps<"Contacts">) {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const toast = useToast()
  const { items, loading, refreshing, error, fromCache, cachedAt, reload } = useCollection<CustomerRow>("customers")
  const favourites = useFavourites()

  const [query, setQuery] = React.useState("")
  const [sort, setSort] = React.useState<SortMode>("name")
  const [menuOpen, setMenuOpen] = React.useState(false)
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const [selecting, setSelecting] = React.useState(false)
  const listRef = React.useRef<ScrollableList>(null)

  const needle = query.trim().toLowerCase()

  const { sections, total } = React.useMemo(() => {
    const pool = needle ? items.filter((c) => matches(c, needle)) : items
    const byLetter = new Map<string, CustomerRow[]>()
    const starred: CustomerRow[] = []

    const collate = (a: CustomerRow, b: CustomerRow) =>
      sortKey(a, sort).localeCompare(sortKey(b, sort), undefined, { sensitivity: "base" })

    for (const c of pool) {
      // The Favourites group is a COPY of the row, not a move: Samsung shows a
      // starred contact both in ★ and under its own letter, and losing someone
      // from the alphabet the moment you star them is disorienting.
      if (!needle && favourites.has(c.id)) starred.push(c)
      const letter = letterFor(sortKey(c, sort))
      if (!byLetter.has(letter)) byLetter.set(letter, [])
      byLetter.get(letter)!.push(c)
    }

    const lettered = [...byLetter.entries()]
      .map(([letter, data]) => ({ letter, data: data.sort(collate) }))
      // "#" sorts last: a number is not a letter, and putting it at the head of
      // the rail would push A off the first screen.
      .sort((a, b) => (a.letter === "#" ? 1 : b.letter === "#" ? -1 : a.letter.localeCompare(b.letter)))

    const all: ContactSection[] = starred.length
      ? [{ letter: FAVOURITES, data: starred.sort(collate) }, ...lettered]
      : lettered

    return { sections: all, total: pool.length }
  }, [items, needle, sort, favourites])

  const endSelecting = React.useCallback(() => {
    setSelecting(false)
    setSelected(new Set())
  }, [])

  const toggleSelected = React.useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const selectedContacts = React.useMemo(() => items.filter((c) => selected.has(c.id)), [items, selected])
  const allSelected = total > 0 && selected.size === total

  const jumpTo = React.useCallback((index: number) => {
    // itemIndex 0 is the section header, so the LETTER lands under the app bar
    // rather than the first row doing so.
    listRef.current?.scrollToLocation?.({ sectionIndex: index, itemIndex: 0, animated: false })
  }, [])

  const shareSelection = React.useCallback(async () => {
    if (!selectedContacts.length) return
    const body = selectedContacts
      .map((c) =>
        [displayName(c), c.company, c.phone ? prettyPhone(c.phone) : "", c.email].filter(Boolean).join("\n"),
      )
      .join("\n\n")
    try {
      await Share.share({ message: body })
    } catch {
      toast.show({ message: "Could not share", tone: "danger" })
    }
  }, [selectedContacts, toast])

  const starSelection = React.useCallback(() => {
    const ids = [...selected]
    // Mixed selections star rather than unstar — the safer read of an ambiguous
    // tap, and it matches how a "select all then favourite" sweep is meant to go.
    const adding = ids.some((id) => !favourites.has(id))
    setFavourites(ids, adding)
    feedback.toggle(adding)
    toast.show({
      message: adding ? `Added ${ids.length} to favourites` : `Removed ${ids.length} from favourites`,
      tone: "success",
    })
    endSelecting()
  }, [selected, favourites, toast, endSelecting])

  const indexTop = insets.top + sizes.appBar + spacing.sm
  const indexBottom = insets.bottom + TAB_BAR_HEIGHT + spacing.xl

  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      <AppScreen
        title={selecting ? `${selected.size} selected` : "Contacts"}
        headerLeft={
          selecting ? (
            <IconButton name="close" onPress={endSelecting} accessibilityLabel="Cancel selection" />
          ) : (
            <ProfileAvatarButton />
          )
        }
        headerRight={
          selecting ? (
            <IconButton
              name="tick"
              variant={allSelected ? "Bold" : "Linear"}
              color={allSelected ? t.primary : t.text}
              accessibilityLabel={allSelected ? "Deselect all" : "Select all"}
              onPress={() => {
                feedback.select()
                setSelected(allSelected ? new Set() : new Set(sections.flatMap((s) => s.data).map((c) => c.id)))
              }}
            />
          ) : (
            <IconButton name="more" onPress={() => setMenuOpen(true)} accessibilityLabel="More options" />
          )
        }
        listRef={listRef}
        overlay={
          selecting ? (
            <SelectionBar count={selected.size} onShare={() => void shareSelection()} onStar={starSelection} />
          ) : needle ? null : (
            <ContactIndexBar
              letters={sections.map((s) => s.letter)}
              onPick={jumpTo}
              top={indexTop}
              bottom={indexBottom}
            />
          )
        }
        sections={{
          sections: loading ? [] : sections,
          refreshControl: <ListRefreshControl refreshing={refreshing} onRefresh={reload} />,
          keyExtractor: (c: unknown) => (c as CustomerRow).id,
          stickySectionHeadersEnabled: true,
          initialNumToRender: 20,
          // A jump into a stretch of list that has never been measured can miss;
          // the retry lands it once the rows in between have laid out.
          onScrollToIndexFailed: (info: { index: number }) => {
            setTimeout(() => jumpTo(Math.max(0, info.index)), 60)
          },
          renderSectionHeader: ({ section }: { section: unknown }) => (
            <SectionHeader letter={(section as ContactSection).letter} />
          ),
          ListEmptyComponent: loading ? (
            <View style={{ paddingHorizontal: gutter, gap: spacing.sm }}>
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} height={CONTACT_ROW_HEIGHT - 8} radius={12} />
              ))}
            </View>
          ) : error && !items.length ? (
            <EmptyState icon="warning" title="Could not load contacts" hint={error} actionLabel="Try again" onAction={() => void reload()} />
          ) : needle ? (
            <EmptyState
              icon="search"
              title="No matches"
              hint={`Nothing here matches “${query.trim()}”.`}
              actionLabel="Add them as a contact"
              onAction={() => navigation.navigate("ContactEditor", { prefill: { name: query.trim() } })}
            />
          ) : (
            <EmptyState
              icon="customer"
              title="No contacts yet"
              hint="Add someone here, or one appears the first time you quote them."
              actionLabel="Add a contact"
              onAction={() => navigation.navigate("ContactEditor")}
            />
          ),
          ListFooterComponent:
            loading || !total ? null : (
              <Text style={[styles.count, { color: t.textTertiary }]}>
                {total} {total === 1 ? "contact" : "contacts"}
              </Text>
            ),
          renderItem: ({ item }: { item: unknown }) => {
            const customer = item as CustomerRow
            const name = displayName(customer)
            const company = (customer.company || "").trim()
            const secondary =
              sort === "company"
                ? customer.name || prettyPhone(customer.phone)
                : company && company !== name
                  ? company
                  : prettyPhone(customer.phone) || customer.email || ""
            return (
              <ContactRow
                contact={{
                  id: customer.id,
                  name: sort === "company" && company ? company : name,
                  secondary,
                  phone: customer.phone,
                  favourite: favourites.has(customer.id),
                }}
                selecting={selecting}
                selected={selected.has(customer.id)}
                onPress={() => {
                  if (selecting) {
                    toggleSelected(customer.id)
                    return
                  }
                  navigation.navigate("CustomerDetail", { id: customer.id })
                }}
                onLongPress={() => {
                  feedback.longPress()
                  setSelecting(true)
                  toggleSelected(customer.id)
                }}
              />
            )
          },
        }}
      >
        <DataNotice error={error} fromCache={fromCache} cachedAt={cachedAt} onRetry={() => void reload()} />
        {!selecting && <SearchField value={query} onChangeText={setQuery} placeholder="Search contacts" />}
      </AppScreen>

      {/* Samsung's "+" on the directory. Hidden while selecting, where the
          bottom of the screen belongs to the selection bar. */}
      {!selecting && (
        <Fab
          icon="add"
          accessibilityLabel="Add a contact"
          onPress={() =>
            // A search that found nobody is the commonest moment for this: carry
            // what they typed into the name field rather than making them type
            // it twice.
            navigation.navigate("ContactEditor", needle ? { prefill: { name: query.trim() } } : undefined)
          }
        />
      )}

      <PopupMenu
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        top={insets.top + sizes.appBar - 8}
        items={[
          {
            key: "sort",
            label: sort === "name" ? "Sort by company" : "Sort by name",
            icon: "sort",
            onPress: () => {
              feedback.select()
              setSort(sort === "name" ? "company" : "name")
              setMenuOpen(false)
            },
          },
          {
            key: "search",
            label: "Search everything",
            icon: "search",
            onPress: () => {
              setMenuOpen(false)
              navigation.navigate("Search")
            },
          },
        ]}
      />
    </View>
  )
}

/**
 * The sticky letter. A filled band rather than a floating label, so a row
 * scrolling under it is covered instead of showing through.
 */
function SectionHeader({ letter }: { letter: string }) {
  const t = useTheme()
  return (
    <View style={[styles.sectionHead, { backgroundColor: t.background }]}>
      <Text style={[styles.sectionLetter, { color: letter === FAVOURITES ? t.warning : t.primary }]}>
        {letter}
      </Text>
    </View>
  )
}

/** The bar that takes over the bottom of the screen while rows are selected. */
function SelectionBar({
  count,
  onShare,
  onStar,
}: {
  count: number
  onShare: () => void
  onStar: () => void
}) {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const disabled = count === 0

  return (
    <View
      style={[
        styles.selectionBar,
        {
          backgroundColor: t.surface,
          borderTopColor: t.border,
          paddingBottom: insets.bottom + spacing.sm,
        },
      ]}
    >
      <SelectionAction icon="star" label="Favourite" onPress={onStar} disabled={disabled} />
      <SelectionAction icon="share" label="Share" onPress={onShare} disabled={disabled} />
    </View>
  )
}

function SelectionAction({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: "star" | "share"
  label: string
  onPress: () => void
  disabled?: boolean
}) {
  const t = useTheme()
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.selectionAction, { opacity: disabled ? 0.35 : pressed ? 0.6 : 1 }]}
    >
      <Icon name={icon} size={22} color={t.text} variant="Bulk" />
      <Text style={[textVariants.microLabel, { color: t.textSecondary, marginTop: 5 }]}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  sectionHead: {
    paddingHorizontal: gutter,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  sectionLetter: { fontSize: 13, lineHeight: 18, letterSpacing: 0.4, fontFamily: font.bold },
  count: {
    textAlign: "center",
    paddingVertical: spacing.xl,
    fontSize: 13,
    fontFamily: font.medium,
  },
  selectionBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    justifyContent: "space-evenly",
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.sm,
  },
  selectionAction: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    minWidth: 88,
  },
})
