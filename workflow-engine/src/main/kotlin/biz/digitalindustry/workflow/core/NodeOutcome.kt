package biz.digitalindustry.workflow.core

import biz.digitalindustry.workflow.model.Violation

sealed class NodeOutcome<C> {

    data class Continue<C>(
        val context: C,
        val violations: List<Violation> = emptyList()
    ) : NodeOutcome<C>()

    data class Next<C>(
        val context: C,
        val nextNodeId: String,
        val violations: List<Violation> = emptyList()
    ) : NodeOutcome<C>()

    data class Stop<C>(
        val context: C,
        val violations: List<Violation> = emptyList()
    ) : NodeOutcome<C>()

    data class Fatal<C>(
        val context: C,
        val error: Throwable
    ) : NodeOutcome<C>()
}
