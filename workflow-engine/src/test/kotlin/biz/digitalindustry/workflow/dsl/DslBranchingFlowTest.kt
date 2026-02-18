package biz.digitalindustry.workflow.dsl

import biz.digitalindustry.workflow.engine.ExecutionResult
import biz.digitalindustry.workflow.engine.WorkflowEngine
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs

class DslBranchingFlowTest {

    private data class RouteContext(val route: String, val visited: List<String> = emptyList())

    @Test
    fun nextRoutesToCorrectBranch() {
        val flow = workflow<RouteContext>(start = "router") {
            node("router") { ctx ->
                if (ctx.route == "A") {
                    Next(ctx.copy(visited = ctx.visited + "router"), next = "branchA")
                } else {
                    Next(ctx.copy(visited = ctx.visited + "router"), next = "branchB")
                }
            }
            node("branchA") { ctx -> Stop(ctx.copy(visited = ctx.visited + "A")) }
            node("branchB") { ctx -> Stop(ctx.copy(visited = ctx.visited + "B")) }
        }

        val routeA = WorkflowEngine(flow).execute(RouteContext(route = "A"))
        val aCompleted = assertIs<ExecutionResult.Completed<RouteContext>>(routeA)
        assertEquals(listOf("router", "A"), aCompleted.context.visited)

        val routeB = WorkflowEngine(flow).execute(RouteContext(route = "B"))
        val bCompleted = assertIs<ExecutionResult.Completed<RouteContext>>(routeB)
        assertEquals(listOf("router", "B"), bCompleted.context.visited)
    }
}
