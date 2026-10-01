import React from "react"
import { BackHandler, Pressable, Share, StyleSheet, Text, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { relativeTime } from "@/domain/format"
import type { Enquiry, Quotation } from "@/domain/schema"
import ChatButton from "@/features/chat/ChatButton"
import ContactIndexBar from "@/features/contacts/ContactIndexBar"
import ContactRow, { CONTACT_ROW_HEIGHT } from "@/features/contacts/ContactRow"
import {
  FAVOURITES,
  activityIndex,
  buildSections,
  displayName,
  passes,
  prefillFromQuery,
  type ContactSection,
  type CustomerRow,
  type Filter,
  type SortMode,
} from "@/features/contacts/directory"
import NotificationBell from "@/features/notifications/NotificationBell"
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
  SkeletonList,
  useToast,
} from "@/ui"
import type { ScrollableList } from "@/ui/AppScreen"
import CountChips from "@/ui/CountChips"
import { TAB_BAR_HEIGHT } from "@/ui/Fab"

/**
 * The directory, built the way Samsung Contacts is built, with the business
 * behind each person on top.
 *
 * A `customers` document holds exactly one person (name, company, one phone, one
 * email) and the console matches records on email-then-phone rather than on
 * company, so one firm legitimately has several rows. Samsung's answer to a long
 * list of people is A-Z sections, a fast-scroll alphabet rail, a pinned
 * Favourites group, and search. That is what this is, with the company and city
 * on the row's second line so a B2B name still reads.
 *
 * What a salesperson needs that Samsung does not: who has an OPEN quotation (the
 * row's tag, and a chip), who was in touch lately (Recent, newest first) and
 * whose record cannot be rung at all (No phone). Every chip carries its count
 * and is shown only when it is not empty. The rules are features/contacts/
 * directory.ts, tested.
 *
 *   · swipe a row right to call, left to WhatsApp (ContactRow)
 *   · long-press for multi-select: the tab bar gives the bottom of the screen to
 *     the selection bar, and Back ends the selection rather than leaving the tab
 *   · Sort by name or company from the overflow menu; the letters follow it
 */

export default function ContactsScreen({ navigation }: TabScreenProps<"Contacts">) {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const toast = useToast()
  const { items, loading, refreshing, error, fromCache, cachedAt, reload } = useCollection<CustomerRow>("customers")
  const { items: quotations } = useCollection<Quotation>("quotations")
  const { items: enquiries } = useCollection<Enquiry>("enquiries")
  const favourites = useFavourites()

  const [query, setQuery] = React.useState("")
  const [sort, setSort] = React.useState<SortMode>("name")
  const [filter, setFilter] = React.useState<Filter>("all")
  const [menuOpen, setMenuOpen] = React.useState(false)
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const [selecting, setSelecting] = React.useState(false)
  const listRef = React.useRef<ScrollableList>(null)
  /** Where the list header (title, search, chips) ends: section 0 starts here. */
  const headerEnd = React.useRef(0)
  // "Recent" is judged against when the tab opened, not a clock read mid-render.
  const [now] = React.useState(Date.now)

  const needle = query.trim().toLowerCase()

  const activity = React.useMemo(() => activityIndex(items, quotations, enquiries), [items, quotations, enquiries])

  const counts = React.useMemo(() => {
    const n = (f: Filter) => items.filter((c) => passes(c, f, favourites, activity, now)).length
    return { all: items.length, favourites: n("favourites"), open: n("open"), recent: n("recent"), nophone: n("nophone") }
  }, [items, favourites, activity, now])

  // A chip that empties (the last favourite unstarred) must not strand the list
  // on a filter that is no longer offered.
  const active: Filter = filter !== "all" && !counts[filter] ? "all" : filter

  const { sections, total } = React.useMemo(
    () => buildSections(items, { needle, sort, filter: active, favourites, activity, now }),
    [items, needle, sort, active, favourites, activity, now],
  )

  const chips = (
    [
      { key: "all", label: "All", count: counts.all },
      { key: "favourites", label: "Favourites", count: counts.favourites },
      { key: "open", label: "Open quotes", count: counts.open },
      { key: "recent", label: "Recent", count: counts.recent },
      { key: "nophone", label: "No phone", count: counts.nophone },
    ] as { key: Filter; label: string; count: number }[]
  ).filter((c) => c.key === "all" || c.count > 0)

  const endSelecting = React.useCallback(() => {
    setSelecting(false)
    setSelected(new Set())
  }, [])

  // While selecting, the bottom of the screen belongs to the selection bar, and
  // Back means "stop selecting", as it does in Samsung Contacts.
  React.useEffect(() => {
    navigation.setOptions({ tabBarStyle: selecting ? { display: "none" } : undefined })
    if (!selecting) return
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      endSelecting()
      return true
    })
    return () => sub.remove()
  }, [selecting, navigation, endSelecting])

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
  // Mixed selections star rather than unstar: the safer read of an ambiguous tap.
  const starring = selectedContacts.length === 0 || selectedContacts.some((c) => !favourites.has(c.id))

  // An exact offset, not scrollToLocation: every row is CONTACT_ROW_HEIGHT and
  // every letter band SECTION_HEAD_HEIGHT, so the arithmetic is the truth, and
  // it lands on rows the list has never measured, first time, every time. No
  // animation, as in One UI: the list is where the thumb is, the moment it is.
  const jumpTo = React.useCallback(
    (index: number) => {
      let y = headerEnd.current
      for (let i = 0; i < index && i < sections.length; i++)
        y += SECTION_HEAD_HEIGHT + sections[i].data.length * CONTACT_ROW_HEIGHT
      listRef.current?.scrollToOffset?.({ offset: y, animated: false })
    },
    [sections],
  )

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
    setFavourites(ids, starring)
    feedback.toggle(starring)
    toast.show({
      message: starring ? `Added ${ids.length} to favourites` : `Removed ${ids.length} from favourites`,
      tone: "success",
    })
    endSelecting()
  }, [selected, starring, toast, endSelecting])

  const addCustomer = () =>
    // A search that found nobody is the commonest moment for this: carry what
    // they typed into the field it looks like (name, phone or email).
    navigation.navigate("ContactEditor", needle ? { prefill: prefillFromQuery(query) } : undefined)

  const indexTop = insets.top + sizes.appBar + spacing.sm
  const indexBottom = insets.bottom + TAB_BAR_HEIGHT + spacing.xl
  const showRail = !selecting && !needle && active !== "recent" && sections.length > 1

  const people = `${counts.all} ${counts.all === 1 ? "customer" : "customers"}`
  const subtitle = loading ? "Loading…" : counts.open ? `${people} · ${counts.open} with open quotes` : people

  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      <AppScreen
        title={selecting ? `${selected.size} selected` : "Customers"}
        subtitle={selecting ? undefined : subtitle}
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
            <>
              <IconButton name="more" onPress={() => setMenuOpen(true)} accessibilityLabel="More options" />
              <ChatButton />
              <NotificationBell />
            </>
          )
        }
        listRef={listRef}
        overlay={
          selecting ? (
            <SelectionBar
              count={selected.size}
              starring={starring}
              onShare={() => void shareSelection()}
              onStar={starSelection}
            />
          ) : showRail ? (
            <ContactIndexBar
              letters={sections.map((s) => s.letter)}
              onPick={jumpTo}
              top={indexTop}
              bottom={indexBottom}
            />
          ) : null
        }
        sections={{
          sections: loading ? [] : sections,
          refreshControl: <ListRefreshControl refreshing={refreshing} onRefresh={reload} />,
          keyExtractor: (c: unknown) => (c as CustomerRow).id,
          stickySectionHeadersEnabled: true,
          initialNumToRender: 20,
          // Fixed heights, so a rail jump far down renders its rows at once
          // instead of estimating. Flattened per section: header, rows, footer.
          getItemLayout: (data: unknown, index: number) => {
            const list = (data as ContactSection[]) || []
            let offset = headerEnd.current
            let i = index
            for (const section of list) {
              const cells = section.data.length + 2
              if (i < cells) {
                const length = i === 0 ? SECTION_HEAD_HEIGHT : i === cells - 1 ? 0 : CONTACT_ROW_HEIGHT
                return { length, offset: offset + (i === 0 ? 0 : SECTION_HEAD_HEIGHT + (i - 1) * CONTACT_ROW_HEIGHT), index }
              }
              offset += SECTION_HEAD_HEIGHT + section.data.length * CONTACT_ROW_HEIGHT
              i -= cells
            }
            return { length: 0, offset, index }
          },
          renderSectionHeader: ({ section }: { section: unknown }) => (
            <SectionHeader letter={(section as ContactSection).letter} />
          ),
          ListEmptyComponent: loading ? (
            <SkeletonList count={8} leading="avatar" leadingSize={38} />
          ) : error && !items.length ? (
            <EmptyState icon="warning" title="Could not load customers" hint={error} actionLabel="Try again" onAction={() => void reload()} />
          ) : needle ? (
            <EmptyState
              icon="search"
              title="No matches"
              hint={
                active === "all"
                  ? `Nothing here matches “${query.trim()}”.`
                  : `No one in this filter matches “${query.trim()}”.`
              }
              actionLabel={active === "all" ? "Add them as a customer" : "Search all customers"}
              onAction={() => (active === "all" ? addCustomer() : setFilter("all"))}
            />
          ) : (
            <EmptyState
              icon="customer"
              title="No customers yet"
              hint="Add someone here, or one appears the first time you quote them."
              actionLabel="Add a customer"
              onAction={addCustomer}
            />
          ),
          ListFooterComponent:
            loading || !total ? null : (
              <Text style={[styles.count, { color: t.textTertiary }]}>
                {total} {total === 1 ? "customer" : "customers"}
                {active === "all" && !needle ? "" : ` of ${counts.all}`}
              </Text>
            ),
          renderItem: ({ item }: { item: unknown }) => {
            const customer = item as CustomerRow
            const name = displayName(customer)
            const company = (customer.company || "").trim()
            const city = (customer.city || "").trim()
            const did = activity.get(customer.id)
            const byCompany = sort === "company" && !!company
            // The second line says who they are: the other half of name and
            // company, then the city. A bare name falls back to how to reach them.
            const other = byCompany ? (customer.name || "").trim() : company !== name ? company : ""
            const secondary =
              [other, city].filter(Boolean).join(" · ") || prettyPhone(customer.phone) || customer.email || ""
            return (
              <ContactRow
                contact={{
                  id: customer.id,
                  name: byCompany ? company : name,
                  secondary,
                  phone: customer.phone,
                  favourite: favourites.has(customer.id),
                  tag: did?.open ? (did.open === 1 ? "Open quote" : `${did.open} open`) : undefined,
                  meta: active === "recent" && did?.lastAt ? relativeTime(did.lastAt) : undefined,
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
        {!selecting && (
          <>
            <SearchField value={query} onChangeText={setQuery} placeholder="Search name, company, city or phone" />
            {!loading && items.length > 0 && chips.length > 1 && (
              <View style={styles.chips}>
                <CountChips options={chips} value={active} onChange={setFilter} />
              </View>
            )}
          </>
        )}
        {/* Measures where the header ends, so the rail can land on a letter exactly. */}
        <View onLayout={(e) => (headerEnd.current = e.nativeEvent.layout.y)} />
      </AppScreen>

      {/* Samsung's "+" on the directory. Hidden while selecting, where the
          bottom of the screen belongs to the selection bar. */}
      {!selecting && <Fab icon="add" accessibilityLabel="Add a customer" onPress={addCustomer} />}

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
            key: "select",
            label: "Select customers",
            icon: "tick",
            onPress: () => {
              setMenuOpen(false)
              setSelecting(true)
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

/** Fixed, because the rail computes its jumps from it (see jumpTo). */
const SECTION_HEAD_HEIGHT = 30

/**
 * The sticky letter. A filled band rather than a floating label, so a row
 * scrolling under it is covered instead of showing through. The ★ group says
 * its name in words; a bare star read as a stray glyph.
 */
function SectionHeader({ letter }: { letter: string }) {
  const t = useTheme()
  const star = letter === FAVOURITES
  return (
    <View style={[styles.sectionHead, { backgroundColor: t.background }]}>
      {star && <Icon name="star" size={13} color={t.warning} variant="Bold" />}
      <Text style={[styles.sectionLetter, { color: star ? t.warningText : t.primary }]}>
        {star ? "Favourites" : letter}
      </Text>
    </View>
  )
}

/** The bar that takes over the bottom of the screen while rows are selected. */
function SelectionBar({
  count,
  starring,
  onShare,
  onStar,
}: {
  count: number
  starring: boolean
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
      <SelectionAction icon="star" label={starring ? "Favourite" : "Unfavourite"} onPress={onStar} disabled={disabled} />
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
  chips: { paddingTop: spacing.md },
  sectionHead: {
    height: SECTION_HEAD_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: gutter,
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
