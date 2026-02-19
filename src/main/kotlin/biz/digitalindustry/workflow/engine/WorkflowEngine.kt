package biz.digitalindustry.workflow.engine

import biz.digitalindustry.workflow.core.NodeOutcome
import biz.digitalindustry.workflow.core.Workflow
import biz.digitalindustry.workflow.model.Severity
import biz.digitalindustry.workflow.model.Violation

class WorkflowEngine<C>(
    private val workflow: Workflow<C>,
    private val config: EngineConfig = EngineConfig()
) {
    constructor(workflow: Workflow<C>) : this(workflow, EngineConfig())

    fun execute(initialContext: C): ExecutionResult<C> {
        var currentContext = initialContext
        var currentNodeId = workflow.startNode
        val violations = mutableListOf<Violation>()
        var hasError = false
        var steps = 0

        while (true) {
            if (steps++ > config.maxSteps) {
                return ExecutionResult.Fatal(
                    currentContext,
                    IllegalStateException("Max steps exceeded"),
                    violations.toList()
                )
            }

            val node = workflow.nodes[currentNodeId]
                ?: return ExecutionResult.Fatal(
                    currentContext,
                    IllegalStateException("Node not found: $currentNodeId"),
                    violations.toList()
                )

            val outcome = try {
                node.execute(currentContext)
            } catch (ex: Throwable) {
                return ExecutionResult.Fatal(currentContext, ex, violations.toList())
            }

            when (outcome) {
                is NodeOutcome.Fatal -> {
                    return ExecutionResult.Fatal(outcome.context, outcome.error, violations.toList())
                }

                is NodeOutcome.Stop -> {
                    if (outcome.violations.isNotEmpty()) {
                        violations += outcome.violations
                        if (!hasError) {
                            hasError = outcome.violations.any { it.severity == Severity.ERROR }
                        }
                    }
                    return ExecutionResult.Completed(outcome.context, violations.toList())
                }

                is NodeOutcome.Continue -> {
                    if (outcome.violations.isNotEmpty()) {
                        violations += outcome.violations
                        if (!hasError) {
                            hasError = outcome.violations.any { it.severity == Severity.ERROR }
                        }
                    }
                    if (config.failFastOnError && hasError) {
                        return ExecutionResult.ValidationFailed(outcome.context, violations.toList())
                    }

                    currentContext = outcome.context
                    val defaultNext = workflow.continueTo[currentNodeId]
                        ?: return ExecutionResult.Completed(currentContext, violations.toList())
                    currentNodeId = defaultNext
                }

                is NodeOutcome.Next -> {
                    if (outcome.violations.isNotEmpty()) {
                        violations += outcome.violations
                        if (!hasError) {
                            hasError = outcome.violations.any { it.severity == Severity.ERROR }
                        }
                    }
                    if (config.failFastOnError && hasError) {
                        return ExecutionResult.ValidationFailed(outcome.context, violations.toList())
                    }

                    currentContext = outcome.context
                    currentNodeId = outcome.nextNodeId
                }
            }
        }
    }
}
