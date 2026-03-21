<%
def navItem = item ?: [:]
def rawBase = binding.hasVariable('baseUrl') && baseUrl ? baseUrl : ''
def normalizedBase = rawBase.length() > 1 && rawBase.endsWith('/') ? rawBase[0..-2] : rawBase

def originalName = navItem.name ?: ''
def displayName = originalName
def labelMap = [
    'index': 'Home',
    'SCHEMA': 'Schema',
    'DSL_TOML': 'TOML DSL',
    'EDITOR': 'Editor',
    'EXAMPLES': 'Examples'
]
displayName = labelMap.get(displayName, displayName)
if (!labelMap.containsKey(originalName)) {
    displayName = displayName
        .replace('_', ' ')
        .toLowerCase()
        .split(/\s+/)
        .findAll { it }
        .collect { it.substring(0, 1).toUpperCase() + it.substring(1) }
        .join(' ')
}

def iconMap = [
    'index': '<svg viewBox="0 0 24 24"><path d="M5.5 10.8L12 5.8l6.5 5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"></path><path d="M7.5 10.8V18h9v-7.2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"></path><path d="M10.5 18v-3.8h3V18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"></path></svg>',
    'SCHEMA': '<svg viewBox="0 0 24 24"><path d="M7 4.5h8l3 3V19.5H7z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"></path><path d="M10 10h4M10 14h5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"></path></svg>',
    'DSL_TOML': '<svg viewBox="0 0 24 24"><path d="M8 5H6.8C5.81 5 5 5.81 5 6.8v2.1c0 .73-.41 1.4-1.06 1.73L3 11l.94.37c.65.33 1.06 1 1.06 1.73v2.1c0 .99.81 1.8 1.8 1.8H8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"></path><path d="M16 5h1.2c.99 0 1.8.81 1.8 1.8v2.1c0 .73.41 1.4 1.06 1.73L21 11l-.94.37c-.65.33-1.06 1-1.06 1.73v2.1c0 .99-.81 1.8-1.8 1.8H16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"></path><path d="M10 15l4-8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path></svg>',
    'EDITOR': '<svg viewBox="0 0 24 24"><rect x="4.5" y="4.5" width="5" height="5" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.7"></rect><rect x="14.5" y="4.5" width="5" height="5" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.7"></rect><rect x="9.5" y="14.5" width="5" height="5" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.7"></rect><path d="M9.5 7h5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"></path><path d="M12 9.5v5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"></path></svg>',
    'EXAMPLES': '<svg viewBox="0 0 24 24"><path d="M7 4.5h10v15H7z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"></path><path d="M9.5 8h5M9.5 12h5M9.5 16h3.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"></path></svg>'
]
def icon = iconMap.get(originalName, '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.7"></circle></svg>')
%>
<% if (navItem.type == 'directory') { %>
<li class="sidebar__group">
    <span>${displayName}</span>
    <ul>
    <% (navItem.children ?: []).each { child -> %>
        ${partial('sidebarItem', [item: child])}
    <% } %>
    </ul>
</li>
<% } else if (navItem.type == 'file') { %>
<% def href = normalizedBase ? "${normalizedBase}/${navItem.path}.html" : "/${navItem.path}.html" %>
<li class="file file-${originalName.toLowerCase().replace("_", "-")}"><a href="${href}"><span class="nav-icon" aria-hidden="true">${icon}</span><span class="nav-label">${displayName}</span></a></li>
<% } %>
