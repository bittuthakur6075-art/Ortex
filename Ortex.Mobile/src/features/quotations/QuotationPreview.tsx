import React from "react"
import { Modal, StyleSheet, Text, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { WebView } from "react-native-webview"

import { quotationHtml } from "@/documents/quotationHtml"
import type { Quotation } from "@/domain/schema"
import type { Settings } from "@/domain/settings"
import { useTheme } from "@/store/ThemeContext"
import { gutter, size as sizes } from "@/theme/tokens"
import { font } from "@/theme/typography"
import { IconButton, Spinner } from "@/ui"

/**
 * The quotation as the customer will receive it.
 *
 * It renders `quotationHtml` — THE SAME STRING handed to expo-print — inside a
 * WebView, so this is a true preview rather than a second drawing of the
 * document. Building an RN mirror of the A4 layout was the alternative and was
 * rejected: it would be a second copy of the console's geometry to keep in step,
 * and the first time the two drifted the preview would start lying about what
 * gets sent.
 *
 * The page is scaled to the viewport by a `<meta viewport>` injected around the
 * document, not by a transform: expo-print measures in points at A4 width and the
 * HTML has no meta tag of its own (a print renderer does not need one).
 */

/**
 * The sheet's width in CSS PIXELS — 210mm at 96dpi — which is what the viewport
 * has to be told so the page fills the screen.
 *
 * NOT the 595 points `lib/pdf.ts` renders the PDF at: a print renderer measures
 * in points at 72dpi, a browser lays out in pixels at 96dpi, and the same A4
 * sheet is 595 in one unit and 794 in the other. Passing 595 here made the
 * WebView fit 794px of content into a 595px viewport and the document rendered
 * at three quarters size, adrift in white space.
 */
const SHEET_WIDTH = Math.round(210 * (96 / 25.4))
/**
 * Grey around the page, the way every PDF viewer frames one — and the app's own
 * gutter, so the sheet sits off the header by the same 20dp everything else on
 * every page is inset by. At 14 it read as a sheet that had not quite finished
 * scrolling up under the bar.
 */
const PAGE_MARGIN = gutter
/** Matches VIEWER_CSS so the RN backdrop and the page ground are one colour. */
const PAGE_GROUND = "#EDEFF2"

/**
 * Preview-only chrome, injected into the document rather than written into
 * quotationHtml: the PRINTED file must stay a bare sheet with no grey ground and
 * no shadow, so this styling has to live here and nowhere near the thing
 * expo-print renders.
 */
const VIEWER_CSS = `
  html { background: #EDEFF2; }
  body { background: #EDEFF2; padding: ${PAGE_MARGIN}px 0; }
  .doc-sheet {
    background: #fff;
    box-shadow: 0 1px 3px rgba(16,24,40,0.16), 0 8px 24px rgba(16,24,40,0.12);
    margin: 0 auto;
  }
`

export default function QuotationPreview({
  visible,
  onClose,
  doc,
  settings,
}: {
  visible: boolean
  onClose: () => void
  doc: Quotation
  settings: Settings
}) {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const [loading, setLoading] = React.useState(true)

  // Re-armed on every open. Without this the spinner is shown exactly once per
  // mounted screen: the second preview swaps in a new document with the old one
  // still painted, and there is nothing on screen to say it is re-rendering.
  React.useEffect(() => {
    if (visible) setLoading(true)
  }, [visible, doc.id])

  // Re-rendered only when the document or the company details actually change —
  // the HTML embeds a base64 font and the logo, so it is not a cheap string.
  const html = React.useMemo(
    () =>
      visible
        ? quotationHtml(doc, settings).replace(
            "<head>",
            `<head><meta name="viewport" content="width=${SHEET_WIDTH + PAGE_MARGIN * 2}, initial-scale=1, maximum-scale=4" /><style>${VIEWER_CSS}</style>`,
          )
        : "",
    [visible, doc, settings],
  )

  return (
    <Modal visible={visible} onRequestClose={onClose} animationType="slide" statusBarTranslucent>
      <View style={[styles.root, { backgroundColor: t.surface }]}>
        <View
          style={[
            styles.head,
            { paddingTop: insets.top, height: insets.top + sizes.appBar, borderBottomColor: t.divider },
          ]}
        >
          <IconButton name="close" onPress={onClose} accessibilityLabel="Close preview" />
          <Text numberOfLines={1} style={[styles.title, { color: t.text }]}>
            {doc.number || "Preview"}
          </Text>
        </View>

        <View style={[styles.page, { backgroundColor: PAGE_GROUND }]}>
          <WebView
            source={{ html }}
            originWhitelist={["*"]}
            // The document is a self-contained string with an embedded font and
            // logo; nothing in it should ever reach the network.
            javaScriptEnabled={false}
            onLoadEnd={() => setLoading(false)}
            style={styles.web}
            containerStyle={styles.web}
          />
          {loading && (
            <View style={styles.loading} pointerEvents="none">
              <Spinner label="Rendering" />
            </View>
          )}
        </View>
      </View>
    </Modal>
  )
}

/** The header's bottom rule: 1dp of `divider` (#F4F6F8). */
const HEADER_RULE = 1

const styles = StyleSheet.create({
  root: { flex: 1 },
  head: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    gap: 2,
    borderBottomWidth: HEADER_RULE,
  },
  title: { flex: 1, marginHorizontal: 6, fontSize: 17, fontFamily: font.semibold },
  page: { flex: 1 },
  web: { flex: 1, backgroundColor: "transparent" },
  loading: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, alignItems: "center", justifyContent: "center" },
})
