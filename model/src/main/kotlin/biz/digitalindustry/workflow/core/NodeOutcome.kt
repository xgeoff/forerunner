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

    companion object {

        @JvmStatic
        fun <C> continueWith(context: C): NodeOutcome<C> =
            Continue(context)

        @JvmStatic
        fun <C> continueWith(context: C, violations: List<Violation>): NodeOutcome<C> =
            Continue(context, violations)

        @JvmStatic
        fun <C> next(context: C, nextNodeId: String): NodeOutcome<C> =
            Next(context, nextNodeId)

        @JvmStatic
        fun <C> next(context: C, nextNodeId: String, violations: List<Violation>): NodeOutcome<C> =
            Next(context, nextNodeId, violations)

        @JvmStatic
        fun <C> stop(context: C): NodeOutcome<C> =
            Stop(context)

        @JvmStatic
        fun <C> stop(context: C, violations: List<Violation>): NodeOutcome<C> =
            Stop(context, violations)

        @JvmStatic
        fun <C> fatal(context: C, error: Throwable): NodeOutcome<C> =
            Fatal(context, error)
    }
}
