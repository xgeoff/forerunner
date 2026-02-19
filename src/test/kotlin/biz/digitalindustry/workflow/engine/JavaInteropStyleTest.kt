package biz.digitalindustry.workflow.engine

import biz.digitalindustry.workflow.core.Node
import biz.digitalindustry.workflow.core.NodeOutcome
import biz.digitalindustry.workflow.core.Workflow
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs

class JavaInteropStyleTest {

    @Test
    fun workflowCanBeBuiltUsingJavaFriendlyFactories() {
        val workflow = Workflow(
            "start",
            mapOf(
                "start" to Node<String> { ctx -> NodeOutcome.next(ctx, "end") },
                "end" to Node<String> { ctx -> NodeOutcome.stop(ctx + "-done") }
            )
        )

        val result = WorkflowEngine(workflow).execute("ctx")

        val completed = assertIs<ExecutionResult.Completed<String>>(result)
        assertEquals("ctx-done", completed.context)
    }
}
