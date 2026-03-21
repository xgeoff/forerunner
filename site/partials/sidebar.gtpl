<%
def pageTitle = binding.hasVariable('title') && title ? title : 'Forerunner'
def navItems = binding.hasVariable('navigation') && navigation ? navigation : []
%>
<aside class="sidebar">
    <div class="sidebar-eyebrow">Documentation</div>
    <h1>${pageTitle}</h1>
    <p class="sidebar-summary">
        Deterministic workflow execution, text-based definitions, and a visual editor.
    </p>
    <a class="sidebar-repo" href="https://github.com/xgeoff/forerunner">Repository</a>
    <nav class="sidebar-nav">
        <ul>
        <% navItems.each { item -> %>
            ${partial('sidebarItem', [item: item])}
        <% } %>
        </ul>
    </nav>
</aside>
