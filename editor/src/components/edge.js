export function EdgeView(edge) {
  const label = edge.route ? `<span class="edge-label">${edge.route}</span>` : ""
  return `<div class="edge">${edge.from} -> ${edge.to}${label}</div>`
}
