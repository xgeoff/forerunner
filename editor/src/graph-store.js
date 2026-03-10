import { signal } from "atomica"

export const nodes = signal({})
export const edges = signal([])
export const selectedNodeId = signal(null)
export const selectedEdgeId = signal(null)
export const mode = signal("select")
export const edgeKind = signal("continue")
export const pendingConnectionFrom = signal(null)
export const workflowStartNodeId = signal(null)

let nodeCounter = 1
let edgeCounter = 1

export function nextNodeId() {
  while (nodes.get()[`node${nodeCounter}`]) {
    nodeCounter += 1
  }
  const id = `node${nodeCounter}`
  nodeCounter += 1
  return id
}

export function addNode(id, x = 100, y = 100, type = "task") {
  if (!id || !id.trim()) throw new Error("Node id is required")
  if (nodes.get()[id]) throw new Error(`Node already exists: ${id}`)

  nodes.set({
    ...nodes.get(),
    [id]: { id, type, x, y }
  })
}

export function moveNode(id, x, y) {
  const current = nodes.get()
  if (!current[id]) return

  nodes.set({
    ...current,
    [id]: {
      ...current[id],
      x,
      y
    }
  })
}

export function setNodeType(id, type) {
  const current = nodes.get()
  if (!current[id]) return

  nodes.set({
    ...current,
    [id]: {
      ...current[id],
      type
    }
  })
}

export function setNodeField(id, field, value) {
  const current = nodes.get()
  if (!current[id]) return

  nodes.set({
    ...current,
    [id]: {
      ...current[id],
      [field]: value
    }
  })
}

export function setStartNode(id) {
  if (id != null && !nodes.get()[id]) return
  workflowStartNodeId.set(id)
}

function hasContinueEdge(from) {
  return edges.get().some((e) => e.type === "continue" && e.from === from)
}

function hasSameRoute(from, routeName) {
  return edges.get().some((e) => e.type === "route" && e.from === from && e.route === routeName)
}

export function connectNodes(from, to, type = "continue", route = null) {
  if (!nodes.get()[from]) throw new Error(`Missing source node: ${from}`)
  if (!nodes.get()[to]) throw new Error(`Missing target node: ${to}`)
  if (from === to) throw new Error("Self-loop is not allowed in editor prototype")

  if (type === "continue" && hasContinueEdge(from)) {
    throw new Error(`Node '${from}' already has a continue edge`)
  }

  if (type === "route") {
    if (!route || !route.trim()) {
      throw new Error("Route edges require a route name")
    }
    if (hasSameRoute(from, route)) {
      throw new Error(`Route '${route}' already exists for '${from}'`)
    }
  }

  const edge = {
    id: `e${edgeCounter++}`,
    from,
    to,
    type,
    route: type === "route" ? route : null
  }

  edges.set([...edges.get(), edge])
}

export function updateEdge(edgeId, updates) {
  const currentEdges = edges.get()
  const existing = currentEdges.find((edge) => edge.id === edgeId)
  if (!existing) return

  const next = {
    ...existing,
    ...updates
  }

  if (!nodes.get()[next.from]) throw new Error(`Missing source node: ${next.from}`)
  if (!nodes.get()[next.to]) throw new Error(`Missing target node: ${next.to}`)
  if (next.from === next.to) throw new Error("Self-loop is not allowed in editor prototype")

  if (next.type === "continue") {
    const duplicateContinue = currentEdges.some((edge) =>
      edge.id !== edgeId &&
      edge.from === next.from &&
      edge.type === "continue"
    )
    if (duplicateContinue) {
      throw new Error(`Node '${next.from}' already has a continue edge`)
    }
    next.route = null
  }

  if (next.type === "route") {
    if (!next.route || !next.route.trim()) {
      throw new Error("Route edges require a route name")
    }
    const duplicateRoute = currentEdges.some((edge) =>
      edge.id !== edgeId &&
      edge.from === next.from &&
      edge.type === "route" &&
      edge.route === next.route
    )
    if (duplicateRoute) {
      throw new Error(`Route '${next.route}' already exists for '${next.from}'`)
    }
  }

  edges.set(currentEdges.map((edge) => edge.id === edgeId ? next : edge))
}

export function deleteEdge(edgeId) {
  edges.set(edges.get().filter((edge) => edge.id !== edgeId))
  if (selectedEdgeId.get() === edgeId) {
    selectedEdgeId.set(null)
  }
}

export function setMode(value) {
  mode.set(value)
  if (value !== "connect") {
    pendingConnectionFrom.set(null)
  }
}

export function setEdgeKind(value) {
  edgeKind.set(value)
}

export function selectNode(id) {
  selectedNodeId.set(id)
  selectedEdgeId.set(null)
}

export function selectEdge(id) {
  selectedEdgeId.set(id)
  selectedNodeId.set(null)
}

export function clearSelection() {
  selectedNodeId.set(null)
  selectedEdgeId.set(null)
}

export function startConnection(fromNodeId) {
  pendingConnectionFrom.set(fromNodeId)
}

export function completeConnection(targetNodeId) {
  const from = pendingConnectionFrom.get()
  if (!from) return

  const type = edgeKind.get()
  let routeName = null
  if (type === "route") {
    routeName = window.prompt("Route name", "condition")
    if (routeName == null) {
      pendingConnectionFrom.set(null)
      return
    }
    routeName = routeName.trim()
  }

  connectNodes(from, targetNodeId, type, routeName)
  pendingConnectionFrom.set(null)
}

export function renameNode(oldId, newId) {
  if (!nodes.get()[oldId]) throw new Error(`Node not found: ${oldId}`)
  if (!newId || !newId.trim()) throw new Error("Node id is required")
  if (oldId !== newId && nodes.get()[newId]) throw new Error(`Node already exists: ${newId}`)

  const current = nodes.get()
  const { [oldId]: node, ...rest } = current

  const renamed = {
    ...rest,
    [newId]: {
      ...node,
      id: newId
    }
  }

  nodes.set(renamed)

  const rewrittenEdges = edges.get().map((edge) => ({
    ...edge,
    from: edge.from === oldId ? newId : edge.from,
    to: edge.to === oldId ? newId : edge.to
  }))
  edges.set(rewrittenEdges)

  if (selectedNodeId.get() === oldId) {
    selectedNodeId.set(newId)
  }
  if (pendingConnectionFrom.get() === oldId) {
    pendingConnectionFrom.set(newId)
  }
  if (workflowStartNodeId.get() === oldId) {
    workflowStartNodeId.set(newId)
  }
}

export function deleteSelected() {
  const nodeId = selectedNodeId.get()
  const edgeId = selectedEdgeId.get()

  if (nodeId) {
    const current = nodes.get()
    const { [nodeId]: _, ...rest } = current
    nodes.set(rest)
    edges.set(edges.get().filter((e) => e.from !== nodeId && e.to !== nodeId))
    if (workflowStartNodeId.get() === nodeId) {
      workflowStartNodeId.set(Object.keys(rest)[0] ?? null)
    }
    selectedNodeId.set(null)
    pendingConnectionFrom.set(null)
    return
  }

  if (edgeId) {
    edges.set(edges.get().filter((e) => e.id !== edgeId))
    selectedEdgeId.set(null)
  }
}

export function getSelectedNode() {
  const id = selectedNodeId.get()
  return id ? nodes.get()[id] : null
}

export function getSelectedEdge() {
  const id = selectedEdgeId.get()
  return id ? edges.get().find((e) => e.id === id) ?? null : null
}
