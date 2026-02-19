package biz.digitalindustry.workflow.dsl

import biz.digitalindustry.workflow.core.Node
import biz.digitalindustry.workflow.core.NodeOutcome
import biz.digitalindustry.workflow.core.Workflow

class FlowBuilder<C> private constructor(
    private val startNodeId: String
) {
    companion object {
        fun <C> start(startNodeId: String): FlowBuilder<C> =
            FlowBuilder(startNodeId)
    }

    private val nodes = mutableMapOf<String, Node<C>>()
    private val edges = mutableMapOf<String, String>()
    private var lastDefinedNodeId: String? = null

    fun node(
        id: String,
        block: (C) -> NodeOutcome<C>
    ): FlowBuilder<C> {
        if (nodes.containsKey(id)) {
            throw IllegalStateException("Duplicate node id: $id")
        }

        val node = object : Node<C> {
            override val id: String = id

            override fun execute(context: C): NodeOutcome<C> = block(context)
        }

        nodes[id] = node
        lastDefinedNodeId = id
        return this
    }

    fun then(nextId: String): FlowBuilder<C> {
        val from = requireNotNull(lastDefinedNodeId) {
            "No previously defined node to connect from"
        }
        if (edges.containsKey(from)) {
            throw IllegalStateException("Default edge already defined from node: $from")
        }

        edges[from] = nextId
        return this
    }

    fun build(): Workflow<C> {
        if (!nodes.containsKey(startNodeId)) {
            throw IllegalStateException("Start node not found: $startNodeId")
        }

        val missingTargets = edges.values.filterNot(nodes::containsKey).distinct()
        if (missingTargets.isNotEmpty()) {
            throw IllegalStateException("Edge target node(s) not found: ${missingTargets.joinToString(", ")}")
        }

        return Workflow(
            startNodeId = startNodeId,
            nodes = nodes.toMap(),
            defaultEdges = edges.toMap()
        )
    }
}
