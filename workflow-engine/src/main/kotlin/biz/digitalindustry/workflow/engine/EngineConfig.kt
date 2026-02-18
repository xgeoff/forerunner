package biz.digitalindustry.workflow.engine

data class EngineConfig(
    val failFastOnError: Boolean = false,
    val maxSteps: Int = 10_000
)
