node-jssp
=========

JavaScript Server Page on nodejs. Template engine and embedding nodejs code in html.

## Features

 Implement dynamic html page by embed nodejs code.

  - nodejs code place between <? ?> in html
  - echo exit GET POST and other PHP-like functions and variables
  - syntax error and runtime error will be caught
  - while(true) and for(;;) can not block JSSP
  - Support \{\{name\}\} and \{\{\<li\>\{\{items[]\}\}\</li\>\}\} style template

## Usage

Run as simple web server:

```bash
node jssp.js 8080
```

Run with other nodejs code:

```js
var jssp = require('jssp.js');
var server = jssp.CreateServer();
server.listen(8080,'0.0.0.0');
server.setopt({"BASE":base,"POSTSIZE":128*1024*1024});
server.setext(name,obj);//this obj can be accessed by EXT[name]
```

## Examples
```html
<!DOCTYPE html>
<html>
<body>
<?  var os = require('os');
    var cpulist = os.cpus();
    echo('<p>System Uptime: '+Math.floor(os.uptime())+'</p>');

    render('name','CPU');
    T.os = os;  //equal to render('os',os);
    render('cpulist',cpulist);
?>
<p>hostname is {{os.hostname()}}</p>
{{<p>{{name}} Core{{INDEX}} user time is {{cpulist[].times.user}}</p>}}
</body>
</html>
```

```js
<?
    header('Location','http://www.google.com',302);
?>
```

```js
<html>
<?  var http = require('http');
    http.get({hostname:'google.com', path:'/', agent:false}, function (res) {
        echo(res.statusCode);
    });
    setTimeout(function(){ echo('<br>wait') },4000);
?>
</html>
```

```js
<?
    session_start();
    if(!SESSION['time']) SESSION['time'] = ''+(new Date());
    echo(SESSION['time']);
?>
```

