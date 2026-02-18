package biz.digitalindustry.workflow.core

data class Workflow<C>(
    val startNodeId: String,
    val nodes: Map<String, Node<C>>,
    val defaultEdges: Map<String, String> = emptyMap()
)
