node-jssp
=========

JavaScript Server Page on nodejs. The syntax looks like PHP.

## Features

 Implement dynamic html page by embed nodejs code.

  - nodejs code place between <? ?> in html
  - echo exit $\_GET $\_POST and other PHP-like function and variables
  - syntax error and runtime error will be caught
  - while(true); and (new Buffer(1000000000000...)) will kill JSSP
