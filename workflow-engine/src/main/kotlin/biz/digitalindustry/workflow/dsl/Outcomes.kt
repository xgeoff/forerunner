package biz.digitalindustry.workflow.dsl

import biz.digitalindustry.workflow.core.NodeOutcome
import biz.digitalindustry.workflow.model.Violation

fun <C> Continue(
    context: C,
    violations: List<Violation> = emptyList()
): NodeOutcome<C> = NodeOutcome.Continue(context, violations)

fun <C> Stop(
    context: C,
    violations: List<Violation> = emptyList()
): NodeOutcome<C> = NodeOutcome.Stop(context, violations)

fun <C> Next(
    context: C,
    next: String,
    violations: List<Violation> = emptyList()
): NodeOutcome<C> = NodeOutcome.Next(context, next, violations)
