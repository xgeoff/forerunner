package biz.digitalindustry.workflow.engine

import biz.digitalindustry.workflow.core.Node
import biz.digitalindustry.workflow.core.NodeOutcome
import biz.digitalindustry.workflow.core.Workflow
import biz.digitalindustry.workflow.model.Severity
import biz.digitalindustry.workflow.model.Violation
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertTrue

class WorkflowEngineTest {

    @Test
    fun continueAndNextWorkAndViolationsAccumulate() {
        val nodeA = object : Node<String> {
            override val id: String = "A"

            override fun execute(context: String): NodeOutcome<String> {
                return NodeOutcome.Continue(
                    context = context + "A",
                    violations = listOf(Violation("W1", "warn", Severity.WARNING))
                )
            }
        }

        val nodeB = object : Node<String> {
            override val id: String = "B"

            override fun execute(context: String): NodeOutcome<String> {
                return NodeOutcome.Next(
                    context = context + "B",
                    nextNodeId = "C",
                    violations = listOf(Violation("W2", "warn", Severity.WARNING))
                )
            }
        }

        val nodeC = object : Node<String> {
            override val id: String = "C"

            override fun execute(context: String): NodeOutcome<String> {
                return NodeOutcome.Stop(
                    context = context + "C",
                    violations = listOf(Violation("E1", "error", Severity.ERROR))
                )
            }
        }

        val workflow = Workflow(
            startNodeId = "A",
            nodes = mapOf("A" to nodeA, "B" to nodeB, "C" to nodeC),
            defaultEdges = mapOf("A" to "B")
        )

        val result = WorkflowEngine(workflow).execute("ctx")

        val completed = assertIs<ExecutionResult.Completed<String>>(result)
        assertEquals("ctxABC", completed.context)
        assertEquals(listOf("W1", "W2", "E1"), completed.violations.map { it.code })
    }

    @Test
    fun failFastStopsExecutionOnErrorViolation() {
        val nodeA = object : Node<String> {
            override val id: String = "A"

            override fun execute(context: String): NodeOutcome<String> {
                return NodeOutcome.Continue(
                    context = context + "A",
                    violations = listOf(Violation("E1", "error", Severity.ERROR))
                )
            }
        }

        val nodeB = object : Node<String> {
            override val id: String = "B"

            override fun execute(context: String): NodeOutcome<String> {
                return NodeOutcome.Stop(context + "B")
            }
        }

        val workflow = Workflow(
            startNodeId = "A",
            nodes = mapOf("A" to nodeA, "B" to nodeB),
            defaultEdges = mapOf("A" to "B")
        )

        val result = WorkflowEngine(
            workflow = workflow,
            config = EngineConfig(failFastOnError = true)
        ).execute("ctx")

        val failed = assertIs<ExecutionResult.ValidationFailed<String>>(result)
        assertEquals("ctxA", failed.context)
        assertEquals(1, failed.violations.size)
        assertEquals("E1", failed.violations.single().code)
    }

    @Test
    fun missingNodeReturnsFatal() {
        val workflow = Workflow<String>(
            startNodeId = "missing",
            nodes = emptyMap()
        )

        val result = WorkflowEngine(workflow).execute("ctx")

        val fatal = assertIs<ExecutionResult.Fatal<String>>(result)
        assertEquals("Node not found: missing", fatal.error.message)
    }

    @Test
    fun maxStepExceededReturnsFatal() {
        val loopNode = object : Node<String> {
            override val id: String = "A"

            override fun execute(context: String): NodeOutcome<String> {
                return NodeOutcome.Continue(context)
            }
        }

        val workflow = Workflow(
            startNodeId = "A",
            nodes = mapOf("A" to loopNode),
            defaultEdges = mapOf("A" to "A")
        )

        val result = WorkflowEngine(
            workflow = workflow,
            config = EngineConfig(maxSteps = 0)
        ).execute("ctx")

        val fatal = assertIs<ExecutionResult.Fatal<String>>(result)
        assertEquals("Max steps exceeded", fatal.error.message)
        assertTrue(fatal.violations.isEmpty())
    }
}
