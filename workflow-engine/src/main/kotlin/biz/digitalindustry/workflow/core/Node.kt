package biz.digitalindustry.workflow.core

interface Node<C> {
    val id: String
    fun execute(context: C): NodeOutcome<C>
}
