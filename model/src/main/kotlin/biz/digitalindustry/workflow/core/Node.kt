package biz.digitalindustry.workflow.core

fun interface Node<C> {
    fun execute(context: C): NodeOutcome<C>
}
