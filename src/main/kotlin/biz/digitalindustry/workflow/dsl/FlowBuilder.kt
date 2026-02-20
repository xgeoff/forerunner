package biz.digitalindustry.workflow.dsl

import biz.digitalindustry.workflow.core.Node
import biz.digitalindustry.workflow.core.NodeOutcome
import biz.digitalindustry.workflow.core.Workflow
import kotlin.OverloadResolutionByLambdaReturnType
import kotlin.experimental.ExperimentalTypeInference
import kotlin.jvm.JvmName

class NodeScope<C>(private val context: C) {

    private var outcome: NodeOutcome<C>? = null

    fun stop(transform: (C) -> C) {
        outcome = NodeOutcome.stop(transform(context))
    }

    fun next(nodeId: String, transform: (C) -> C) {
        outcome = NodeOutcome.next(transform(context), nodeId)
    }

    fun continueWith(transform: (C) -> C) {
        outcome = NodeOutcome.continueWith(transform(context))
    }

    fun fatal(error: Throwable) {
        outcome = NodeOutcome.fatal(context, error)
    }

    internal fun build(): NodeOutcome<C> {
        return outcome
            ?: throw IllegalStateException("Node must define an outcome")
    }
}

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

    @OptIn(ExperimentalTypeInference::class)
    @OverloadResolutionByLambdaReturnType
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

    @OptIn(ExperimentalTypeInference::class)
    @OverloadResolutionByLambdaReturnType
    @JvmName("nodeWithScopeDsl")
    fun node(
        nodeId: String,
        block: NodeScope<C>.() -> Unit
    ): FlowBuilder<C> {
        return node(nodeId) { ctx ->
            val scope = NodeScope(ctx)
            scope.block()
            scope.build()
        }
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

    @OptIn(ExperimentalTypeInference::class)
    @OverloadResolutionByLambdaReturnType
    fun then(
        nodeId: String,
        block: (C) -> NodeOutcome<C>
    ): FlowBuilder<C> {
        then(nodeId)
        node(nodeId, block)
        return this
    }

    @OptIn(ExperimentalTypeInference::class)
    @OverloadResolutionByLambdaReturnType
    @JvmName("thenWithScopeDsl")
    fun then(
        nodeId: String,
        block: NodeScope<C>.() -> Unit
    ): FlowBuilder<C> {
        then(nodeId)
        node(nodeId, block)
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
