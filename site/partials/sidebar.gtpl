<%
def pageTitle = binding.hasVariable('title') && title ? title : 'Forerunner'
def navItems = binding.hasVariable('navigation') && navigation ? navigation : []
%>
<div class="sidebar">
    <h1>${pageTitle}</h1>
    <ul>
    <% navItems.each { item -> %>
        ${partial('sidebarItem', [item: item])}
    <% } %>
    </ul>
</div>
