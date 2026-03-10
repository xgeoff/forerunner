import dagre from "dagre"
import { nodes, edges } from "./graph-store.js"

export function computeLayout() {
  const g = new dagre.graphlib.Graph()
  g.setGraph({
    rankdir: "TB",
    ranksep: 60,
    nodesep: 40,
    marginx: 32,
    marginy: 32
  })
  g.setDefaultEdgeLabel(() => ({}))

  Object.values(nodes.get()).forEach((node) => {
    g.setNode(node.id, { width: 220, height: 60 })
  })

  edges.get().forEach((edge) => {
    g.setEdge(edge.from, edge.to)
  })

  dagre.layout(g)
  return g
}
