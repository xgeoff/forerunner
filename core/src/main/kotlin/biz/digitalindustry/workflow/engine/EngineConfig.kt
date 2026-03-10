package biz.digitalindustry.workflow.engine

data class EngineConfig(
    val failFastOnError: Boolean = false,
    val maxSteps: Int = 10_000
) {
    constructor() : this(false, 10_000)
}
