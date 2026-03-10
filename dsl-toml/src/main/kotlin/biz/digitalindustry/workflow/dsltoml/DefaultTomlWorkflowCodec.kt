package biz.digitalindustry.workflow.dsltoml

import org.tomlj.Toml
import org.tomlj.TomlParseResult
import org.tomlj.TomlTable

class DefaultTomlWorkflowCodec : TomlWorkflowCodec {

    override fun decode(tomlText: String): TomlWorkflowDefinition {
        val parsed = Toml.parse(tomlText)
        throwIfParseErrors(parsed)

        val startNode = parsed.getString(TomlSchema.START_NODE)
            ?: throw IllegalArgumentException("Missing required field: ${TomlSchema.START_NODE}")

        val nodesTable = parsed.getTable(TomlSchema.NODES)
            ?: throw IllegalArgumentException("Missing required table: ${TomlSchema.NODES}")

        val nodes = decodeNodes(nodesTable)
        val continueRoutes = decodeContinue(parsed.getTable(TomlSchema.CONTINUE))
        val routing = decodeRouting(parsed.getTable(TomlSchema.ROUTING))

        validateGraph(startNode, nodes.keys, continueRoutes, routing)

        return TomlWorkflowDefinition(
            startNode = startNode,
            nodes = nodes,
            continueRoutes = continueRoutes,
            routing = routing
        )
    }

    override fun encode(definition: TomlWorkflowDefinition): String {
        val sb = StringBuilder()

        sb.append("${TomlSchema.START_NODE} = ${quote(definition.startNode)}\n\n")
        sb.append("[${TomlSchema.NODES}]\n")

        definition.nodes.toSortedMap().forEach { (nodeId, node) ->
            sb.append("[${TomlSchema.NODES}.$nodeId]\n")
            sb.append("type = ${quote(node.type)}\n")
            node.description?.let { sb.append("description = ${quote(it)}\n") }

            if (node.metadata.isNotEmpty()) {
                sb.append("[${TomlSchema.NODES}.$nodeId.metadata]\n")
                node.metadata.toSortedMap().forEach { (k, v) ->
                    sb.append("$k = ${quote(v)}\n")
                }
            }
            sb.append("\n")
        }

        if (definition.continueRoutes.isNotEmpty()) {
            sb.append("[${TomlSchema.CONTINUE}]\n")
            definition.continueRoutes.toSortedMap().forEach { (from, to) ->
                sb.append("$from = ${quote(to)}\n")
            }
            sb.append("\n")
        }

        if (definition.routing.isNotEmpty()) {
            definition.routing.toSortedMap().forEach { (from, routes) ->
                routes.toSortedMap().forEach { (routeName, routeDef) ->
                    sb.append("[${TomlSchema.ROUTING}.$from.$routeName]\n")
                    sb.append("to = ${quote(routeDef.to)}\n\n")
                }
            }
        }

        return sb.toString().trimEnd() + "\n"
    }

    private fun decodeNodes(nodesTable: TomlTable): Map<String, TomlNodeDefinition> {
        val out = linkedMapOf<String, TomlNodeDefinition>()

        nodesTable.keySet().forEach { nodeId ->
            val nodeTable = nodesTable.getTable(nodeId)
                ?: throw IllegalArgumentException("nodes.$nodeId must be a table")

            val type = nodeTable.getString("type") ?: "task"
            val description = nodeTable.getString("description")
            val metadata = decodeStringMap(nodeTable.getTable("metadata"), "nodes.$nodeId.metadata")

            out[nodeId] = TomlNodeDefinition(type = type, description = description, metadata = metadata)
        }

        return out
    }

    private fun decodeContinue(continueTable: TomlTable?): Map<String, String> =
        decodeStringMap(continueTable, TomlSchema.CONTINUE)

    private fun decodeRouting(routingTable: TomlTable?): Map<String, Map<String, TomlRouteDefinition>> {
        if (routingTable == null) return emptyMap()

        val out = linkedMapOf<String, Map<String, TomlRouteDefinition>>()
        routingTable.keySet().forEach { from ->
            val routesTable = routingTable.getTable(from)
                ?: throw IllegalArgumentException("routing.$from must be a table")

            val routeMap = linkedMapOf<String, TomlRouteDefinition>()
            routesTable.keySet().forEach { routeName ->
                val routeDefTable = routesTable.getTable(routeName)
                    ?: throw IllegalArgumentException("routing.$from.$routeName must be a table")

                val to = routeDefTable.getString("to")
                    ?: throw IllegalArgumentException("routing.$from.$routeName.to is required")

                routeMap[routeName] = TomlRouteDefinition(to)
            }
            out[from] = routeMap
        }

        return out
    }

    private fun decodeStringMap(table: TomlTable?, path: String): Map<String, String> {
        if (table == null) return emptyMap()

        val out = linkedMapOf<String, String>()
        table.keySet().forEach { key ->
            val value = table.getString(key)
                ?: throw IllegalArgumentException("$path.$key must be a string")
            out[key] = value
        }
        return out
    }

    private fun validateGraph(
        startNode: String,
        nodeIds: Set<String>,
        continueRoutes: Map<String, String>,
        routing: Map<String, Map<String, TomlRouteDefinition>>
    ) {
        if (!nodeIds.contains(startNode)) {
            throw IllegalArgumentException("startNode '$startNode' not found in nodes")
        }

        continueRoutes.forEach { (from, to) ->
            if (!nodeIds.contains(from)) {
                throw IllegalArgumentException("continue source '$from' not found in nodes")
            }
            if (!nodeIds.contains(to)) {
                throw IllegalArgumentException("continue target '$to' not found in nodes")
            }
        }

        routing.forEach { (from, routes) ->
            if (!nodeIds.contains(from)) {
                throw IllegalArgumentException("routing source '$from' not found in nodes")
            }

            routes.forEach { (routeName, routeDef) ->
                if (!nodeIds.contains(routeDef.to)) {
                    throw IllegalArgumentException(
                        "routing target '${routeDef.to}' for route '$routeName' from '$from' not found in nodes"
                    )
                }
            }
        }
    }

    private fun throwIfParseErrors(parsed: TomlParseResult) {
        if (parsed.hasErrors()) {
            val msg = parsed.errors().joinToString(separator = "; ") { it.toString() }
            throw IllegalArgumentException("Invalid TOML: $msg")
        }
    }

    private fun quote(value: String): String =
        buildString {
            append('"')
            value.forEach { c ->
                when (c) {
                    '\\' -> append("\\\\")
                    '"' -> append("\\\"")
                    '\n' -> append("\\n")
                    '\r' -> append("\\r")
                    '\t' -> append("\\t")
                    else -> append(c)
                }
            }
            append('"')
        }
}
