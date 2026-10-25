package com.phoneagent.system

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.graphics.Path
import android.graphics.Rect
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import kotlinx.coroutines.delay

/** Nodo del árbol de UI ya convertido a dato plano (sin referencias vivas). */
data class UiNodeInfo(
    val text: String,
    val contentDescription: String,
    val className: String,
    val viewId: String,
    val centerX: Int,
    val centerY: Int,
    val clickable: Boolean,
    val editable: Boolean,
    val scrollable: Boolean,
    val visible: Boolean,
)

/**
 * Manos y ojos del agente: wrapper sobre el AccessibilityService.
 * SOLO expone primitivas (tap, swipe, escribir, leer árbol). Qué app puede
 * tocarse lo decide PermissionGate; aquí no hay lógica de negocio.
 */
class AccessibilityController {

    companion object {
        private const val TAG = "[PhoneAgent].[Accessibility]"

        @Volatile internal var service: PhoneAccessibilityService? = null

        /** ¿Activó el usuario el servicio en Ajustes > Accesibilidad? */
        fun isServiceEnabledInSettings(context: Context): Boolean {
            val expected = "${context.packageName}/${PhoneAccessibilityService::class.java.name}"
            val enabled = Settings.Secure.getString(
                context.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES).orEmpty()
            return enabled.split(':').any { it.equals(expected, ignoreCase = true) }
        }
    }

    fun isConnected(): Boolean = service != null
    fun displayWidth(): Int = service?.resources?.displayMetrics?.widthPixels ?: 1080
    fun displayHeight(): Int = service?.resources?.displayMetrics?.heightPixels ?: 2400

    fun currentPackage(): String? = try {
        service?.rootInActiveWindow?.packageName?.toString()
    } catch (e: Exception) { Log.w(TAG, "currentPackage falló: ${e.message}"); null }

    // ── Gestos ─────────────────────────────────────────────────────────────

    fun tap(x: Int, y: Int): Boolean {
        val svc = service ?: return false.also { Log.e(TAG, "tap sin servicio de accesibilidad") }
        val path = Path().apply { moveTo(x.toFloat(), y.toFloat()) }
        val gesture = GestureDescription.Builder()
            .addStroke(GestureDescription.StrokeDescription(path, 0, 90)).build()
        return svc.dispatchGesture(gesture, null, null)
    }

    fun swipe(direction: String, distanceFraction: Float = 0.45f): Boolean {
        val svc = service ?: return false
        val w = displayWidth(); val h = displayHeight()
        val cx = w / 2f; val cy = h / 2f
        val dx = w * distanceFraction; val dy = h * distanceFraction
        val (sx, sy, ex, ey) = when (direction.lowercase()) {
            "up" -> listOf(cx, cy + dy / 2, cx, cy - dy / 2)
            "down" -> listOf(cx, cy - dy / 2, cx, cy + dy / 2)
            "left" -> listOf(cx + dx / 2, cy, cx - dx / 2, cy)
            "right" -> listOf(cx - dx / 2, cy, cx + dx / 2, cy)
            else -> return false.also { Log.w(TAG, "Dirección de swipe desconocida: $direction") }
        }
        val path = Path().apply { moveTo(sx, sy); lineTo(ex, ey) }
        val gesture = GestureDescription.Builder()
            .addStroke(GestureDescription.StrokeDescription(path, 0, 320)).build()
        return svc.dispatchGesture(gesture, null, null)
    }

    /** Scroll real sobre el primer nodo desplazable; si no hay, swipe. */
    fun scroll(direction: String): Boolean {
        val svc = service ?: return false
        val root = svc.rootInActiveWindow ?: return swipe(direction)
        val scrollable = findFirst(root) { it.isScrollable }
        val ok = if (scrollable != null) {
            val action = if (direction.lowercase() in listOf("down", "right"))
                AccessibilityNodeInfo.ACTION_SCROLL_FORWARD else AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD
            scrollable.performAction(action)
        } else false
        return ok || swipe(direction)
    }

    // ── Texto y nodos ──────────────────────────────────────────────────────

    /** Toca el primer nodo cuyo texto o descripción coincida (contiene, sin
     *  distinción de mayúsculas). Si el nodo no es clicable, toca su centro. */
    fun tapOnText(text: String): Boolean {
        val svc = service ?: return false
        val root = svc.rootInActiveWindow ?: return false
        val node = findFirst(root) {
            contains(it.text?.toString(), text) || contains(it.contentDescription?.toString(), text)
        } ?: return false.also { Log.w(TAG, "No se encontró el texto '$text' en pantalla") }
        if (node.isClickable && node.performAction(AccessibilityNodeInfo.ACTION_CLICK)) return true
        val rect = Rect().also { node.getBoundsInScreen(it) }
        return tap(rect.centerX(), rect.centerY())
    }

    fun findNodeByText(text: String): Boolean {
        val svc = service ?: return false
        val root = svc.rootInActiveWindow ?: return false
        return findFirst(root) {
            contains(it.text?.toString(), text) || contains(it.contentDescription?.toString(), text)
        } != null
    }

    /**
     * Escribe en el campo editable: primero el que tiene el foco, si no el que
     * coincide con el hint (placeholder del ui_map del driver), si no el
     * primero visible. Estrategia: ACTION_SET_TEXT; respaldo: portapapeles +
     * pegar (hay apps que ignoran SET_TEXT en campos ricos).
     */
    fun typeText(text: String, hint: String = ""): Boolean {
        val svc = service ?: return false
        val root = svc.rootInActiveWindow ?: return false
        val editables = mutableListOf<AccessibilityNodeInfo>()
        collect(root) { if (it.isEditable && it.isVisibleToUser) editables.add(it) }
        val target = editables.firstOrNull { it.isFocused }
            ?: editables.firstOrNull { n ->
                hint.isNotBlank() && (contains(n.text?.toString(), hint) ||
                    contains(n.contentDescription?.toString(), hint) || contains(n.hintText?.toString(), hint))
            }
            ?: editables.firstOrNull()
            ?: return false.also { Log.w(TAG, "No hay ningún campo editable visible para escribir") }

        target.performAction(AccessibilityNodeInfo.ACTION_FOCUS)
        val args = Bundle().apply {
            putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text)
        }
        if (target.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)) return true

        // Respaldo: portapapeles + ACTION_PASTE.
        return try {
            val clipboard = svc.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            clipboard.setPrimaryClip(ClipData.newPlainText("phoneagent", text))
            target.performAction(AccessibilityNodeInfo.ACTION_PASTE)
        } catch (e: Exception) { Log.e(TAG, "typeText (pegar) falló: ${e.message}"); false }
    }

    /** Árbol de UI aplanado a texto para dárselo al LLM junto al screenshot. */
    fun getUiTreeText(maxChars: Int = 6000): String {
        val nodes = getUiNodes()
        val sb = StringBuilder()
        for (n in nodes) {
            val label = n.text.ifBlank { n.contentDescription }
            if (label.isBlank() && !n.editable && !n.clickable) continue
            val kind = when { n.editable -> "input"; n.clickable -> "botón"; else -> "texto" }
            sb.append("[$kind] \"$label\" @(${n.centerX},${n.centerY}) clase=${n.className.substringAfterLast('.')}\n")
            if (sb.length > maxChars) break
        }
        return sb.toString().take(maxChars)
    }

    fun getUiNodes(): List<UiNodeInfo> {
        val svc = service ?: return emptyList()
        val root = svc.rootInActiveWindow ?: return emptyList()
        val out = mutableListOf<UiNodeInfo>()
        flatten(root, out)
        return out
    }

    fun goBack(): Boolean = service?.performGlobalAction(AccessibilityService.GLOBAL_ACTION_BACK) ?: false
    fun goHome(): Boolean = service?.performGlobalAction(AccessibilityService.GLOBAL_ACTION_HOME) ?: false

    // ── Gestos finos ───────────────────────────────────────────────────────

    /** Pulsación larga sobre un texto visible, o en coordenadas si no se da texto. */
    fun longPressOnText(text: String, durationMs: Long = 650L): Boolean {
        val svc = service ?: return false
        val root = svc.rootInActiveWindow ?: return false
        val node = findFirst(root) {
            contains(it.text?.toString(), text) || contains(it.contentDescription?.toString(), text)
        } ?: return false.also { Log.w(TAG, "long_press: no se encontró «$text»") }
        if (node.isLongClickable && node.performAction(AccessibilityNodeInfo.ACTION_LONG_CLICK)) return true
        val rect = Rect().also { node.getBoundsInScreen(it) }
        return longPressAt(rect.centerX(), rect.centerY(), durationMs)
    }

    fun longPressAt(x: Int, y: Int, durationMs: Long = 650L): Boolean {
        val svc = service ?: return false
        val path = Path().apply { moveTo(x.toFloat(), y.toFloat()) }
        val gesture = GestureDescription.Builder()
            .addStroke(GestureDescription.StrokeDescription(path, 0, durationMs)).build()
        return svc.dispatchGesture(gesture, null, null)
    }

    /** Vacía el campo editable (con foco, o el que coincida con el hint). */
    fun clearText(hint: String = ""): Boolean {
        val svc = service ?: return false
        val root = svc.rootInActiveWindow ?: return false
        val editables = mutableListOf<AccessibilityNodeInfo>()
        collect(root) { if (it.isEditable && it.isVisibleToUser) editables.add(it) }
        val target = editables.firstOrNull { it.isFocused }
            ?: editables.firstOrNull { n ->
                hint.isNotBlank() && (contains(n.text?.toString(), hint) ||
                    contains(n.contentDescription?.toString(), hint) || contains(n.hintText?.toString(), hint))
            }
            ?: editables.firstOrNull()
            ?: return false.also { Log.w(TAG, "clear_text: no hay campo editable visible") }
        val args = Bundle().apply {
            putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, "")
        }
        return target.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
    }

    /**
     * Pulsa ENTER/IR del teclado sobre el campo con foco. Muchísimos flujos
     * (buscar un contacto, enviar una búsqueda) solo avanzan con esta acción de
     * IME, no con un botón visible: sin ella el agente se queda atascado.
     */
    fun pressEnter(): Boolean {
        val svc = service ?: return false
        val root = svc.rootInActiveWindow ?: return false
        val focused = findFirst(root) { it.isFocused && it.isEditable }
            ?: findFirst(root) { it.isEditable }
            ?: return false.also { Log.w(TAG, "press_enter: no hay campo editable con foco") }
        // ACTION_IME_ENTER es API 30 y nuestro minSdk es 29: se usa solo donde
        // existe y se cae al siguiente movimiento en versiones anteriores.
        if (Build.VERSION.SDK_INT >= 30) {
            if (focused.performAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_IME_ENTER.id)) return true
        }
        return focused.performAction(AccessibilityNodeInfo.ACTION_NEXT_AT_MOVEMENT_GRANULARITY)
    }

    // ── Estabilización de pantalla ─────────────────────────────────────────
    /**
     * Espera a que la pantalla DEJE de cambiar antes de leerla o capturarla.
     *
     * Las esperas fijas son la causa número uno de pasos mal verificados: en un
     * feed o una búsqueda que carga en dos tiempos, el agente leía la pantalla a
     * medias y el LLM concluía que la acción había fallado. Aquí se sondea el
     * árbol cada [pollMs] hasta que el número de nodos se repite, con un tope
     * de [timeoutMs] para no bloquear nunca el bucle.
     *
     * @return true si la pantalla se estabilizó; false si se agotó el tiempo.
     */
    suspend fun awaitStable(timeoutMs: Long = 2200L, pollMs: Long = 280L, minPolls: Int = 2): Boolean {
        if (service == null) return false
        var lastCount = -1
        var stablePolls = 0
        var waited = 0L
        while (waited < timeoutMs) {
            val count = runCatching { getUiNodes().size }.getOrDefault(-1)
            if (count == lastCount && count >= 0) {
                stablePolls++
                if (stablePolls >= minPolls) {
                    Log.d(TAG, "Pantalla estable tras ${waited} ms ($count nodos)")
                    return true
                }
            } else {
                stablePolls = 0
            }
            lastCount = count
            delay(pollMs)
            waited += pollMs
        }
        Log.w(TAG, "La pantalla no se estabilizó en ${timeoutMs} ms; se lee igual")
        return false
    }

    // ── Recorrido del árbol ────────────────────────────────────────────────
    private fun contains(value: String?, needle: String): Boolean =
        value?.contains(needle, ignoreCase = true) == true

    private fun findFirst(node: AccessibilityNodeInfo, depth: Int = 0, match: (AccessibilityNodeInfo) -> Boolean): AccessibilityNodeInfo? {
        if (depth > 30) return null
        if (match(node)) return node
        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            val found = findFirst(child, depth + 1, match)
            if (found != null) return found
        }
        return null
    }

    private fun collect(node: AccessibilityNodeInfo, depth: Int = 0, keep: (AccessibilityNodeInfo) -> Unit) {
        if (depth > 30) return
        keep(node)
        for (i in 0 until node.childCount) node.getChild(i)?.let { collect(it, depth + 1, keep) }
    }

    private fun flatten(node: AccessibilityNodeInfo, out: MutableList<UiNodeInfo>, depth: Int = 0) {
        if (depth > 30 || out.size > 400) return
        val rect = Rect().also { node.getBoundsInScreen(it) }
        out.add(UiNodeInfo(
            text = node.text?.toString().orEmpty(),
            contentDescription = node.contentDescription?.toString().orEmpty(),
            className = node.className?.toString().orEmpty(),
            viewId = node.viewIdResourceName.orEmpty(),
            centerX = rect.centerX(), centerY = rect.centerY(),
            clickable = node.isClickable, editable = node.isEditable,
            scrollable = node.isScrollable, visible = node.isVisibleToUser,
        ))
        for (i in 0 until node.childCount) node.getChild(i)?.let { flatten(it, out, depth + 1) }
    }
}

/** El servicio real que Android enlaza (BIND_ACCESSIBILITY_SERVICE). */
class PhoneAccessibilityService : AccessibilityService() {
    override fun onServiceConnected() {
        super.onServiceConnected()
        AccessibilityController.service = this
        Log.i("[PhoneAgent].[Accessibility]", "Servicio de accesibilidad conectado")
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        // No procesamos eventos en continuo: el agente lee la pantalla bajo
        // demanda en cada paso. Esto ahorra batería y CPU.
        if (event?.eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) {
            Log.d("[PhoneAgent].[Accessibility]", "Ventana: ${event.packageName}")
        }
    }

    override fun onInterrupt() { Log.w("[PhoneAgent].[Accessibility]", "Servicio interrumpido") }

    override fun onDestroy() {
        if (AccessibilityController.service === this) AccessibilityController.service = null
        super.onDestroy()
    }
}
