package com.phoneagent.core

import com.phoneagent.models.AgentActionType
import com.phoneagent.models.AgentStep
import com.phoneagent.models.DriverConfig
import org.json.JSONObject
import java.text.Normalizer
import java.util.Locale

/**
 * Elige de forma determinista la instalación normal o dual que pidió la persona.
 * El plan del modelo no debe decidir por su cuenta entre dos cuentas de la misma app.
 */
object DriverVariantSelector {
    data class Selection(val step: AgentStep?, val error: String? = null)

    /**
     * Si la frase no dice «dual» (o un sinónimo claro), exige la instalación
     * normal. Nunca cambia en silencio a la otra cuenta si falta la solicitada.
     */
    fun select(
        step: AgentStep,
        voiceCommand: String,
        drivers: List<DriverConfig>,
    ): Selection {
        if (step.actionType != AgentActionType.OPEN_APP) return Selection(step)
        val requestedKey = step.paramString("driver_key")
        val requested = drivers.firstOrNull { it.driverKey == requestedKey } ?: return Selection(step)
        val familyKey = requested.baseDriverKey?.takeIf { it.isNotBlank() } ?: requested.driverKey
        val family = drivers.filter {
            (it.baseDriverKey?.takeIf(String::isNotBlank) ?: it.driverKey) == familyKey
        }
        if (family.none { it.isDualVariant }) return Selection(step)

        val wantsDual = requestsDualVariant(voiceCommand)
        val preferred = family.firstOrNull {
            it.isDualVariant == wantsDual && it.enabled && it.authorized && it.installed
        } ?: run {
            val appName = family.firstOrNull { !it.isDualVariant }?.displayName ?: requested.displayName
            val variant = if (wantsDual) "dual" else "normal"
            return Selection(null,
                "No encuentro la versión $variant de $appName habilitada e instalada. Ábrela en «Apps autorizadas» y actívala.")
        }
        if (preferred.driverKey == requestedKey) return Selection(step)

        val params = runCatching { JSONObject(step.paramsJson) }.getOrDefault(JSONObject())
        params.put("driver_key", preferred.driverKey)
        return Selection(step.copy(paramsJson = params.toString()))
    }

    private fun requestsDualVariant(command: String): Boolean {
        val normalized = Normalizer.normalize(command.lowercase(Locale.ROOT), Normalizer.Form.NFD)
            .replace(Regex("\\p{Mn}+"), "")
        return listOf("dual", "clon", "segunda cuenta", "perfil secundario", "app paralela")
            .any(normalized::contains)
    }
}
