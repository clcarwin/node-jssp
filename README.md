node-jssp
=========

JavaScript Server Page on nodejs. The syntax looks like PHP.

## Features

 Implement dynamic html page by embed nodejs code.

  - nodejs code place between <? ?> in html
  - echo exit $\_GET $\_POST and other PHP-like function and variables
  - syntax error and runtime error will be caught
  - while(true) and for(;;) can not block JSSP
  - Support \{\{name\}\} and \{\{\<li\>\{\{items[]\}\}\</li\>\}\} style template

## Usage

Run as simple web server:

```bash
node jssp.js 8080 0.0.0.0 ./www/ cluster
```

Run with other nodejs code:

```js
var jssp = require('jssp.js');
var server = jssp.CreateServer();
server.listen(8080,'0.0.0.0');
server.setBase('./www/');
server.setPost(20*1024*1024);//MaxPostSize
server.setExternal({...});//this obj can be access by $_ENV['external']
```

## Examples
```html
<!DOCTYPE html>
<html>
<body>
<?  var os = require('os');
    echo('System Uptime: '+Math.floor(os.uptime())); ?>
</body>
</html>
```

```js
<?  var http = require('http');
    http.get({hostname:'google.com', path:'/', agent:false}, function (res) {
        echo(res.statusCode);
    });
?>
```

```js
<?  session_start();
    if(!$_SESSION['time']) $_SESSION['time'] = ''+(new Date());
?>
```

