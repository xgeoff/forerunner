package biz.digitalindustry.workflow.core

data class Workflow<C>(
    val startNode: String,
    val nodes: Map<String, Node<C>>,
    val continueTo: Map<String, String> = emptyMap()
) {
    constructor(
        startNode: String,
        nodes: Map<String, Node<C>>
    ) : this(startNode, nodes, emptyMap())
}
