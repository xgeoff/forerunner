package biz.digitalindustry.workflow.core

data class Workflow<C>(
    val startNodeId: String,
    val nodes: Map<String, Node<C>>,
    val continueTo: Map<String, String> = emptyMap()
) {
    constructor(
        startNodeId: String,
        nodes: Map<String, Node<C>>
    ) : this(startNodeId, nodes, emptyMap())
}
