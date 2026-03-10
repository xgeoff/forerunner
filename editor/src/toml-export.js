import { nodes, edges } from "./graph-store.js"

export function exportWorkflow(startNode) {
  const continueRoutes = {}
  const routing = {}

  edges.get().forEach((edge) => {
    if (edge.type === "continue") {
      continueRoutes[edge.from] = edge.to
      return
    }

    routing[edge.from] ??= {}
    routing[edge.from][edge.route] = { to: edge.to }
  })

  const doc = {
    startNode,
    nodes: nodes.get(),
    continue: continueRoutes,
    routing
  }

  return serializeWorkflow(doc)
}

function serializeWorkflow(doc) {
  const lines = []
  lines.push(`startNode = ${quote(doc.startNode)}`)
  lines.push("")
  lines.push("[nodes]")

  Object.entries(doc.nodes)
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([id, node]) => {
      lines.push(`[nodes.${id}]`)
      if (node.type && node.type !== "task") {
        lines.push(`type = ${quote(node.type)}`)
      }
      if (node.handler) lines.push(`handler = ${quote(node.handler)}`)
      if (node.description) lines.push(`description = ${quote(node.description)}`)
      lines.push("")
    })

  if (Object.keys(doc.continue).length > 0) {
    lines.push("[continue]")
    Object.entries(doc.continue)
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([from, to]) => lines.push(`${from} = ${quote(to)}`))
    lines.push("")
  }

  if (Object.keys(doc.routing).length > 0) {
    Object.entries(doc.routing)
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([from, routes]) => {
        Object.entries(routes)
          .sort(([a], [b]) => a.localeCompare(b))
          .forEach(([routeName, def]) => {
            lines.push(`[routing.${from}.${routeName}]`)
            lines.push(`to = ${quote(def.to)}`)
            lines.push("")
          })
      })
  }

  return `${lines.join("\n").trimEnd()}\n`
}

function quote(value) {
  return `"${String(value).replaceAll("\\", "\\\\").replaceAll("\"", "\\\"")}"`
}
