node-jssp
=========

JavaScript Server Page on nodejs. The syntax looks like PHP.

## Features

 Implement dynamic html page by embed nodejs code.

  - nodejs code place between <? ?> in html
  - echo exit $\_GET $\_POST and other PHP-like function and variables
  - syntax error and runtime error will be caught
  - while(true); and (new Buffer(1000000000000...)) will kill JSSP

## Usage

Run as simple web server:

```bash
node jssp.js 8080 0.0.0.0 ./jssp/
```

Run with other nodejs code:

```js
var jssp = require('jssp.js');
var server = jssp.CreateServer();
server.listen(8080,'0.0.0.0');
server.setBase('./jssp/');
server.setPost(20*1024*1024);//MaxPostSize
```
