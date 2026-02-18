package biz.digitalindustry.workflow.dsl

import biz.digitalindustry.workflow.core.Node
import biz.digitalindustry.workflow.core.NodeOutcome
import biz.digitalindustry.workflow.core.Workflow

fun <C> workflow(
    start: String,
    block: WorkflowDsl<C>.() -> Unit
): Workflow<C> {
    val dsl = WorkflowDsl<C>(start)
    dsl.block()
    return dsl.build()
}

class WorkflowDsl<C>(
    private val startNodeId: String
) {
    private val nodes: MutableMap<String, Node<C>> = mutableMapOf()
    private val edges: MutableMap<String, String> = mutableMapOf()

    fun node(id: String, block: (C) -> NodeOutcome<C>): NodeRef<C> {
        val node = object : Node<C> {
            override val id: String = id

            override fun execute(context: C): NodeOutcome<C> = block(context)
        }
        nodes[id] = node
        return NodeRef(id, this)
    }

    internal fun connect(from: String, to: String) {
        edges[from] = to
    }

    fun build(): Workflow<C> {
        if (!nodes.containsKey(startNodeId)) {
            throw IllegalStateException("Start node not found: $startNodeId")
        }

        val missingTargets = edges.values.filterNot(nodes::containsKey).distinct()
        if (missingTargets.isNotEmpty()) {
            throw IllegalStateException("Edge target node(s) not found: ${missingTargets.joinToString(", ")}")
        }

        return Workflow(startNodeId, nodes.toMap(), edges.toMap())
    }
}
