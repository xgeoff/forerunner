package biz.digitalindustry.workflow.dsl

import biz.digitalindustry.workflow.core.Node
import biz.digitalindustry.workflow.core.NodeOutcome
import biz.digitalindustry.workflow.core.Workflow

class FlowBuilder<C> private constructor(
    private val startNode: String
) {
    companion object {
        fun <C> start(startNode: String): FlowBuilder<C> =
            FlowBuilder(startNode)
    }

    private val nodes = mutableMapOf<String, Node<C>>()
    private val continueTo = mutableMapOf<String, String>()
    private var lastDefinedNodeId: String? = null

    fun node(
        id: String,
        block: (C) -> NodeOutcome<C>
    ): FlowBuilder<C> {
        if (nodes.containsKey(id)) {
            throw IllegalStateException("Duplicate node id: $id")
        }

        nodes[id] = Node { ctx -> block(ctx) }
        lastDefinedNodeId = id
        return this
    }

    fun then(nextId: String): FlowBuilder<C> {
        val from = requireNotNull(lastDefinedNodeId) {
            "No previously defined node to connect from"
        }
        if (continueTo.containsKey(from)) {
            throw IllegalStateException("Default edge already defined from node: $from")
        }

        continueTo[from] = nextId
        return this
    }

    fun build(): Workflow<C> {
        if (!nodes.containsKey(startNode)) {
            throw IllegalStateException("Start node not found: $startNode")
        }

        val missingTargets = continueTo.values.filterNot(nodes::containsKey).distinct()
        if (missingTargets.isNotEmpty()) {
            throw IllegalStateException("Edge target node(s) not found: ${missingTargets.joinToString(", ")}")
        }

        return Workflow(
            startNode = startNode,
            nodes = nodes.toMap(),
            continueTo = continueTo.toMap()
        )
    }
}
