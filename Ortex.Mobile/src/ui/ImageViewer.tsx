import { Image } from "expo-image"
import React from "react"
import {
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { font } from "@/theme/typography"
import Icon from "@/ui/Icon"

/**
 * The full-screen photo viewer, shared by every record that carries pictures.
 *
 * A catalogue photo on a phone is not illustration — it is the thing being
 * sold, held up across a table. So every picture in this app opens: a product's
 * gallery, a category's banner, a photo in the work gallery. They used to
 * differ: the product page had this behaviour written inline, the category page
 * had none at all, and a third copy was about to appear on the work page.
 *
 * Black ground, `contentFit="contain"` so nothing is cropped, a close button
 * clear of the notch, and horizontal paging with a counter when there is more
 * than one. Tapping the photo itself closes it too, which is what people try
 * first.
 */
export default function ImageViewer({
  visible,
  images,
  index = 0,
  onIndexChange,
  onClose,
}: {
  visible: boolean
  /** One or many. An empty list renders nothing rather than a black void. */
  images: string[]
  /** Which photo to open on. */
  index?: number
  /** Paging here can drive the page underneath, so the two stay on the same photo. */
  onIndexChange?: (index: number) => void
  onClose: () => void
}) {
  const insets = useSafeAreaInsets()
  const width = Dimensions.get("window").width
  const scroller = React.useRef<ScrollView>(null)
  const [page, setPage] = React.useState(index)

  // Open on the photo the caller was looking at. `contentOffset` alone is an
  // iOS-only prop — on Android it is ignored, and a viewer opened from the
  // third photo would silently start at the first — so the offset is also set
  // imperatively once the modal is up.
  React.useEffect(() => {
    if (!visible) return
    setPage(index)
    const id = setTimeout(() => scroller.current?.scrollTo({ x: index * width, animated: false }), 0)
    return () => clearTimeout(id)
  }, [visible, index, width])

  if (!images.length) return null

  const single = images.length === 1

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.root}>
        <StatusBar barStyle="light-content" />

        {single ? (
          <Pressable style={styles.page} onPress={onClose} accessibilityLabel="Close photo">
            <Image source={{ uri: images[0] }} style={styles.image} contentFit="contain" />
          </Pressable>
        ) : (
          <ScrollView
            ref={scroller}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            contentOffset={{ x: index * width, y: 0 }}
            onMomentumScrollEnd={(e) => {
              const next = Math.round(e.nativeEvent.contentOffset.x / Math.max(1, width))
              setPage(next)
              onIndexChange?.(next)
            }}
          >
            {images.map((uri) => (
              <Pressable key={uri} style={{ width }} onPress={onClose} accessibilityLabel="Close photo">
                <Image source={{ uri }} style={styles.image} contentFit="contain" />
              </Pressable>
            ))}
          </ScrollView>
        )}

        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={10}
          style={[styles.close, { top: insets.top + 8 }]}
        >
          <Icon name="close" size={30} color="#FFFFFF" variant="Bulk" />
        </Pressable>

        {!single && (
          <View style={[styles.counter, { bottom: insets.bottom + 24 }]}>
            <Text style={styles.counterText}>
              {page + 1}/{images.length}
            </Text>
          </View>
        )}
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000000" },
  page: { flex: 1 },
  image: { width: "100%", height: "100%" },
  close: { position: "absolute", left: 14, padding: 6 },
  counter: {
    position: "absolute",
    alignSelf: "center",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  counterText: { color: "#FFFFFF", fontSize: 13, fontFamily: font.semibold },
})
