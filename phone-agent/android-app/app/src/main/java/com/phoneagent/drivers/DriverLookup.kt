package com.phoneagent.drivers

import com.phoneagent.models.DriverConfig

/**
 * Lo único que PermissionGate necesita saber del mundo exterior.
 *
 * POR QUÉ EXISTE: PermissionGate es el componente de seguridad del sistema y el
 * que más merece tests unitarios. Pero DriverRegistry arrastra DualAppDetector,
 * que necesita PackageManager, y eso no existe en un test de JVM. Separar la
 * consulta en esta interfaz permite probar todas las reglas del guardián con un
 * doble de dos líneas, sin mocks ni framework.
 *
 * DriverRegistry la implementa tal cual, así que en producción no cambia nada.
 */
interface DriverLookup {
    /** Config de un driver por su clave, o null si no existe o está desactivado. */
    fun getByKey(driverKey: String): DriverConfig?

    /** Lista legible de apps autorizadas, para los mensajes de denegación. */
    fun authorizedKeys(): String
}
