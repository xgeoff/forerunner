<%
def navItem = item ?: [:]
def rawBase = binding.hasVariable('baseUrl') && baseUrl ? baseUrl : ''
def normalizedBase = rawBase.length() > 1 && rawBase.endsWith('/') ? rawBase[0..-2] : rawBase

def displayName = navItem.name ?: ''
def labelMap = [
    'index': 'Documentation Home',
    'SCHEMA': 'Schema',
    'DSL_TOML': 'TOML DSL',
    'EDITOR': 'Editor',
    'EXAMPLES': 'Examples'
]
displayName = labelMap.get(displayName, displayName)
if (!labelMap.containsKey(navItem.name ?: '')) {
    displayName = displayName
        .replace('_', ' ')
        .toLowerCase()
        .split(/\s+/)
        .findAll { it }
        .collect { it.substring(0, 1).toUpperCase() + it.substring(1) }
        .join(' ')
}
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
<li class="file"><a href="${href}">${displayName}</a></li>
<% } %>
