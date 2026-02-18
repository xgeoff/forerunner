package biz.digitalindustry.workflow.dsl

class NodeRef<C>(
    private val id: String,
    private val dsl: WorkflowDsl<C>
) {
    infix fun then(nextId: String): NodeRef<C> {
        dsl.connect(id, nextId)
        return NodeRef(nextId, dsl)
    }
}
