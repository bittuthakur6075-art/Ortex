package com.ortexmobile

import android.content.ActivityNotFoundException
import android.content.ComponentName
import android.content.ClipData
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import android.net.Uri
import androidx.core.content.FileProvider
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File

/**
 * Send ONE document straight into ONE WhatsApp conversation.
 *
 * Why this exists rather than react-native-share's `shareSingle`: that option
 * fires TWO intents about 10ms apart (WhatsAppShare.java) — the first targets
 * `com.whatsapp.Conversation` so the chat exists even for a number that is not
 * a saved contact, the second carries the attachment. On a handset that freezes
 * or defers background starts (Samsung's "Freecess"/MARS, seen in logcat on the
 * device this was written for) the second intent never lands: the salesperson
 * gets the right chat with nothing in it, which looks like a successful send.
 *
 * One intent does the whole job. WhatsApp reads the `jid` extra to pick the
 * conversation and EXTRA_STREAM for the file, so both arrive together or the
 * send visibly fails — no half state.
 *
 * The content:// URI is minted from react-native-share's OWN FileProvider,
 * already declared in the merged manifest (authority `${applicationId}
 * .rnshare.fileprovider`, cache-path "/"), so this adds no provider and no
 * paths.xml of its own. The file therefore has to live in the app's cacheDir —
 * which is where `Print.printToFileAsync` writes and where `lib/pdf.ts` keeps
 * the renamed copy.
 *
 * EXTRA_TEXT is set as well and WhatsApp is expected to ignore it: a caption is
 * honoured for an image and dropped for a document. It costs nothing to send
 * and would start working the day WhatsApp changes its mind.
 */
class WhatsAppDocModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName() = "WhatsAppDoc"

  @ReactMethod
  fun send(filePath: String, mimeType: String, number: String, message: String, promise: Promise) {
    try {
      val path = filePath.removePrefix("file://")
      val file = File(Uri.decode(path))
      if (!file.exists()) {
        promise.reject("ENOENT", "The document no longer exists at $path")
        return
      }

      val authority = "${reactContext.packageName}.rnshare.fileprovider"
      val uri = FileProvider.getUriForFile(reactContext, authority, file)

      val intent = Intent(Intent.ACTION_SEND).apply {
        type = mimeType
        putExtra(Intent.EXTRA_STREAM, uri)
        // THE ATTACHMENT ARRIVES BECAUSE OF THIS LINE. FLAG_GRANT_READ_URI_PERMISSION
        // grants the URIs Android can SEE on the intent, and it does not look
        // inside extras — only at the data URI and the ClipData. With the file
        // only in EXTRA_STREAM the receiver gets a URI it is not allowed to
        // read, which is how you end up in the right conversation with nothing
        // attached and no error: WhatsApp opens the chat, fails to read the
        // document, and says nothing. react-native-share sets this for the same
        // reason (ShareIntent.java).
        clipData = ClipData.newUri(reactContext.contentResolver, "Quotation", uri)
        // The conversation to open. WhatsApp's own format; a number with no
        // country code opens the wrong chat or none, so the caller normalises.
        putExtra("jid", "$number@s.whatsapp.net")
        if (message.isNotEmpty()) putExtra(Intent.EXTRA_TEXT, message)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }

      // NAMING THE ACTIVITY IS THE WHOLE TRICK, and the name is not ours to
      // hardcode. With `setPackage` alone the `jid` is ignored and WhatsApp
      // merely comes to the front on whatever tab it was last on — observed on
      // this device: chat not opened, file not attached, no error at all. The
      // activity that reads `jid` is WhatsApp's own ACTION_SEND handler, and
      // WhatsApp renames it between releases (com.whatsapp.ContactPicker,
      // com.whatsapp.contact.picker.ContactPicker, and on the build this was
      // written against com.whatsapp.contact.ui.picker.ExternalShareAlias). So
      // ask the package manager which activity handles this exact share today
      // rather than guessing, and let an upgrade rename it freely.
      val target = reactContext.packageManager
        .queryIntentActivities(intent, 0)
        .firstOrNull { it.activityInfo?.packageName == WHATSAPP && it.activityInfo?.exported == true }
        ?.activityInfo

      if (target != null) {
        intent.component = ComponentName(target.packageName, target.name)
      } else {
        // WhatsApp is absent, or package visibility hid it. The <queries> block
        // in AndroidManifest.xml declares com.whatsapp, so this is the former.
        promise.reject("ENOWHATSAPP", "WhatsApp is not installed")
        return
      }

      // Belt and braces for the alias hop: the intent is addressed to
      // ExternalShareAlias, which forwards to its target activity, and an
      // explicit package grant survives that hand-off whatever the alias does
      // with the flags. Revoked by the system once WhatsApp is done with it.
      reactContext.grantUriPermission(WHATSAPP, uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)

      try {
        reactContext.startActivity(intent)
      } catch (notFound: ActivityNotFoundException) {
        // The alias resolved but would not start. Package-level is worse (the
        // picker, or the front screen) but still puts the document in front of
        // the salesperson rather than failing silently.
        intent.component = null
        intent.setPackage(WHATSAPP)
        reactContext.startActivity(intent)
      }
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("ESHARE", e.message ?: "Could not open WhatsApp", e)
    }
  }

  /**
   * Rasterise the FIRST page of a PDF to a PNG beside it, and return the path.
   *
   * This exists because of one WhatsApp rule: a caption is kept on an IMAGE and
   * dropped on a DOCUMENT. Sending the quotation as a picture is therefore the
   * only way the covering message and the quotation arrive as ONE message. The
   * real PDF still follows as a second attachment — the picture is for reading
   * in the chat, the document is for downloading and forwarding.
   *
   * Rendered at 150dpi (A4 -> 1240x1754). Lower and the line items blur on a
   * phone screen, higher and WhatsApp recompresses a file nobody needed.
   * PdfRenderer paints only what is drawn, so the page is filled white first:
   * without it the transparent background turns black in WhatsApp's viewer.
   */
  @ReactMethod
  fun firstPageAsImage(pdfPath: String, promise: Promise) {
    var descriptor: ParcelFileDescriptor? = null
    var renderer: PdfRenderer? = null
    try {
      val file = File(Uri.decode(pdfPath.removePrefix("file://")))
      if (!file.exists()) {
        promise.reject("ENOENT", "The document no longer exists at ${file.path}")
        return
      }

      descriptor = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
      renderer = PdfRenderer(descriptor)
      if (renderer.pageCount < 1) {
        promise.reject("EEMPTY", "That PDF has no pages")
        return
      }

      renderer.openPage(0).use { page ->
        // The page reports points (1/72in); 150dpi is that times 150/72.
        val scale = DPI / 72f
        val width = (page.width * scale).toInt()
        val height = (page.height * scale).toInt()
        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        bitmap.eraseColor(Color.WHITE)
        page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)

        val out = File(file.parentFile, file.nameWithoutExtension + ".png")
        if (out.exists()) out.delete()
        out.outputStream().use { stream -> bitmap.compress(Bitmap.CompressFormat.PNG, 100, stream) }
        bitmap.recycle()
        promise.resolve("file://" + out.absolutePath)
      }
    } catch (e: Exception) {
      promise.reject("ERENDER", e.message ?: "Could not turn the quotation into a picture", e)
    } finally {
      try { renderer?.close() } catch (_: Exception) {}
      try { descriptor?.close() } catch (_: Exception) {}
    }
  }

  companion object {
    /** Render density for the chat picture. */
    private const val DPI = 150f

    private const val WHATSAPP = "com.whatsapp"
  }
}
