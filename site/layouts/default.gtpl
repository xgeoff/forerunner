<%
def pageTitle = binding.hasVariable('title') && title ? title : 'Forerunner'
def pageDescription = binding.hasVariable('description') && description ? description : ''
def pageAuthor = binding.hasVariable('author') && author?.name ? author.name : ''
%>
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>${pageTitle}</title>
    <meta name="description" content="${pageDescription}">
    <meta name="author" content="${pageAuthor}">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link href="//fonts.googleapis.com/css?family=Raleway:400,300,600" rel="stylesheet" type="text/css">
    <link rel="stylesheet" href="css/normalize.css">
    <link rel="stylesheet" href="css/skeleton.css">
    <link rel="stylesheet" href="css/style.css">
    <link rel="icon" type="image/png" href="images/favicon-32.png">
</head>
<body>
<div class="shell">
    ${partial('sidebar')}
    <main class="container prose">
${content}
    </main>
</div>
</body>
</html>
