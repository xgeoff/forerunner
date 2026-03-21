<%
def pageTitle = binding.hasVariable('title') && title ? title : 'Forerunner'
def navItems = binding.hasVariable('navigation') && navigation ? navigation : []
def homeItems = navItems.findAll { (it?.name ?: '') == 'index' }
def otherItems = navItems.findAll { (it?.name ?: '') != 'index' }
%>
<aside class="sidebar">
    <div class="sidebar-eyebrow">Documentation</div>
    <h1>${pageTitle}</h1>
    <p class="sidebar-summary">
        Deterministic workflow execution, text-based definitions, and a visual editor.
    </p>
    <nav class="sidebar-nav">
        <ul>
        <% homeItems.each { item -> %>
            ${partial('sidebarItem', [item: item])}
        <% } %>
        <% otherItems.each { item -> %>
            ${partial('sidebarItem', [item: item])}
        <% } %>
        </ul>
    </nav>
    <a class="sidebar-repo" href="https://github.com/xgeoff/forerunner">
        <span class="sidebar-repo-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
                <path d="M9 5H5v14h14v-4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"></path>
                <path d="M14 5h5v5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"></path>
                <path d="M19 5l-8 8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"></path>
            </svg>
        </span>
        Repository
    </a>
</aside>
