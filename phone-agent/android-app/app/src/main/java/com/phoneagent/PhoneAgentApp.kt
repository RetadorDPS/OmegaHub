package com.phoneagent

import android.app.Application
import android.content.Context
import android.util.Log
import com.phoneagent.capabilities.MemoryCapability
import com.phoneagent.capabilities.VisionCapability
import com.phoneagent.capabilities.VoiceCapability
import com.phoneagent.core.AgentEngine
import com.phoneagent.core.ConfigManager
import com.phoneagent.capabilities.StepVerifier
import com.phoneagent.core.MacroEngine
import com.phoneagent.core.PermissionGate
import com.phoneagent.core.SessionManager
import com.phoneagent.core.StepExecutor
import com.phoneagent.drivers.DriverRegistry
import com.phoneagent.network.LLMRouter
import com.phoneagent.network.SupabaseClient
import com.phoneagent.system.AccessibilityController
import com.phoneagent.system.DualAppDetector
import com.phoneagent.system.IntentLauncher
import com.phoneagent.system.TaskScheduler

/**
 * Application + contenedor de dependencias manual (sin frameworks de DI).
 * Un solo grafo de objetos para toda la app: así cada Activity y servicio
 * comparte el MISMO SessionManager, EventBus y DriverRegistry.
 */
class PhoneAgentApp : Application() {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
        // Rearmar aquí además de en BOOT_COMPLETED: varios fabricantes filtran
        // el broadcast de arranque, y sin esto las tareas programadas se
        // perderían en silencio tras un reinicio. Rearmar es idempotente.
        TaskScheduler.rescheduleAll(this)
        Log.i("[PhoneAgent].[App]", "Phone Agent arrancado. Supabase configurado: ${container.supabase.isConfigured()}")
    }
}

/** Grafo de dependencias. El orden importa: red → config → sistema → core. */
class AppContainer(context: Context) {
    private val appContext: Context = context.applicationContext

    val supabase: SupabaseClient = SupabaseClient(appContext)
    val configManager: ConfigManager = ConfigManager(appContext, supabase)
    val accessibility: AccessibilityController = AccessibilityController()
    val intentLauncher: IntentLauncher = IntentLauncher(appContext)
    val dualAppDetector: DualAppDetector = DualAppDetector(appContext)
    val driverRegistry: DriverRegistry = DriverRegistry(dualAppDetector)
    val permissionGate: PermissionGate = PermissionGate(driverRegistry)
    val sessionManager: SessionManager = SessionManager()
    val stepExecutor: StepExecutor = StepExecutor(accessibility, intentLauncher, driverRegistry)
    val macroEngine: MacroEngine = MacroEngine(driverRegistry, permissionGate, stepExecutor, accessibility)
    val stepVerifier: StepVerifier = StepVerifier(accessibility, driverRegistry)
    val vision: VisionCapability = VisionCapability(accessibility)
    val voice: VoiceCapability = VoiceCapability(appContext)
    val memory: MemoryCapability = MemoryCapability(supabase)
    val llmRouter: LLMRouter = LLMRouter(appContext, supabase)

    val agentEngine: AgentEngine = AgentEngine(
        supabase = supabase,
        llmRouter = llmRouter,
        registry = driverRegistry,
        gate = permissionGate,
        sessions = sessionManager,
        configManager = configManager,
        vision = vision,
        voice = voice,
        memory = memory,
        accessibility = accessibility,
        executor = stepExecutor,
        macroEngine = macroEngine,
        stepVerifier = stepVerifier,
    )
}
