package biz.digitalindustry.workflow.dsl

import biz.digitalindustry.workflow.core.NodeOutcome
import biz.digitalindustry.workflow.engine.ExecutionResult
import biz.digitalindustry.workflow.engine.WorkflowEngine
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs

class FlowBuilderBranchingTest {

    private data class RouteContext(val useBranchA: Boolean, val visited: List<String> = emptyList())

    @Test
    fun runtimeNextOverridesDefaultEdge() {
        val flow = FlowBuilder.start<RouteContext>("router")
            .node("router") { ctx ->
                if (ctx.useBranchA) {
                    NodeOutcome.Next(
                        context = ctx.copy(visited = ctx.visited + "router"),
                        nextNodeId = "branchA"
                    )
                } else {
                    NodeOutcome.Continue(ctx.copy(visited = ctx.visited + "router"))
                }
            }
            .then("fallback")
            .node("branchA") { ctx -> NodeOutcome.Stop(ctx.copy(visited = ctx.visited + "A")) }
            .node("fallback") { ctx -> NodeOutcome.Stop(ctx.copy(visited = ctx.visited + "fallback")) }
            .build()

        val branched = WorkflowEngine(flow).execute(RouteContext(useBranchA = true))
        val branchedCompleted = assertIs<ExecutionResult.Completed<RouteContext>>(branched)
        assertEquals(listOf("router", "A"), branchedCompleted.context.visited)

        val defaulted = WorkflowEngine(flow).execute(RouteContext(useBranchA = false))
        val defaultCompleted = assertIs<ExecutionResult.Completed<RouteContext>>(defaulted)
        assertEquals(listOf("router", "fallback"), defaultCompleted.context.visited)
    }
}
