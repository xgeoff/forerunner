package biz.digitalindustry.workflow.dsltoml

data class TomlWorkflowDefinition(
    val startNode: String,
    val nodes: Map<String, TomlNodeDefinition>,
    val continueRoutes: Map<String, String> = emptyMap(),
    val routing: Map<String, Map<String, TomlRouteDefinition>> = emptyMap()
)

data class TomlNodeDefinition(
    val type: String = "task",
    val description: String? = null,
    val metadata: Map<String, String> = emptyMap()
)

data class TomlRouteDefinition(
    val to: String
)
