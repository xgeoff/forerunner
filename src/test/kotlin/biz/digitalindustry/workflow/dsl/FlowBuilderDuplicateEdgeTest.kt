package biz.digitalindustry.workflow.dsl

import biz.digitalindustry.workflow.core.NodeOutcome
import kotlin.test.Test
import kotlin.test.assertFailsWith

class FlowBuilderDuplicateEdgeTest {

    @Test
    fun duplicateEdgeFromSameNodeThrows() {
        val builder = FlowBuilder.start<Int>("a")
            .node("a") { value -> NodeOutcome.Continue(value) }
            .then("b")

        assertFailsWith<IllegalStateException> {
            builder.then("c")
        }
    }
}
