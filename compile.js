var jsbase = __dirname + '/';
var tplmachine = require(jsbase + 'tpl.js');
var whileformachine = require(jsbase + 'whilefor.js');
var sessionmachine  = require(jsbase + 'session.js');

//*.jssp file to js code
module.exports = complemachine;

function htmlpageheader()
{
// var $$htmlpage = function(jssp)
// {
// 	var console   = undefined;

// 	var __filename= __FILE__  = jssp.__filename;
// 	var __dirname = __DIR__   = jssp.__dirname;
// 	var __code    = __CODE__  = jssp.__code;

// 	var require        = jssp.require;
// 	var Buffer         = jssp.Buffer;
// 	var setTimeout     = jssp.setTimeout;
// 	var setInterval    = jssp.setInterval;
// 	var clearTimeout   = jssp.clearTimeout;
// 	var clearInterval  = jssp.clearInterval;
// 	var render         = jssp.render;
// 	var module         = jssp.module;
// 	var exports        = jssp.module.exports;

// 	var $$arraypush    = jssp.arraypush;
// 	var $$tick         = jssp.tick;
// 	var $$T     = $_T  = T     = jssp.T;
// 	var $_EXT   = EXT  = jssp.EXT;

// 	var $_SESSION   = SESSION   = undefined;
// 	var $_GET       = GET       = jssp.$_GET;
// 	var $_POST      = POST      = jssp.$_POST;
// 	var $_FILE      = FILE      = jssp.$_FILE;
// 	var $_SERVER    = SERVER    = jssp.$_SERVER;
// 	var $_ENV       = ENV       = jssp.$_ENV;
// 	var echo               = jssp.echo;
// 	var exit               = jssp.exit;
// 	var include            = jssp.include;
// 	var set_time_limit     = jssp.set_time_limit;
// 	var header             = jssp.header;
// 	var headers_sent       = jssp.headers_sent;
// 	var session_start      = jssp.session_start;
// 	var session_id         = jssp.session_id;
// 	var session_destroy    = jssp.session_destroy;
// 	var session_unset      = jssp.session_unset;

// 	$$domainobj = jssp.domaincreate();
//
//
}

function func2str(cb)
{
	var str = cb.toString();
	var list= str.split('\n');
	
	list.shift();list.pop(); //delete first and last line

	//delete comment flag '//' before every line
	for(var i=0;i<list.length;i++) list[i]=list[i].substring(2);

	str = list.join('\n');
	return str;
}

function complemachine(html)
{
	var str    = '';
	var result = [];

	var s = 'idle';	//idle l1 l2 r2 r1 //l1=< l2=<? r2=? r1=?>
					//l2q1 l2q2 slash
	var stack = [];

	function put(c)
	{
		switch(s)
		{
			case 'idle':
				if('<'==c) s='l1'; else
				if('\\'==c) { stack.push(s);str+=c;s='slash'; } else
				{ str+=c;s='idle'; }
			break;
			case 'slash':
				s=stack.pop();
				str+=c;
			break;
			case 'l1':
				if('?'==c) { pushhtml(str);str='/*<?*/';s='l2'; } else
				if('\\'==c) { stack.push('idle');str+=c;s='slash'; } else
				{ str+='<'+c;s='idle'; }
			break;
			case 'l2':
				if("'"==c) { str+=c;s='l2q1'; } else
				if('"'==c) { str+=c;s='l2q2'; } else
				if('\\'==c) { stack.push(s);str+=c;s='slash'; } else
				if('?'==c) { s='r2'; } else
				{ str+=c; }
			break;
			case 'l2q1':
				if('\\'==c) { stack.push(s);str+=c;s='slash'; } else
				if("'"==c) { str+=c;s='l2'; } else
				{ str+=c; }
			break;
			case 'l2q2':
				if('\\'==c) { stack.push(s);str+=c;s='slash'; } else
				if('"'==c) { str+=c;s='l2'; } else
				{ str+=c; }
			break;
			case 'r2':
				if('>'==c) { str+='/*?>*/';pushjs(str);str='';s='idle'; } else
				if('\\'==c) { stack.push('l2');str+=c;s='slash'; } else
				{ str+='%'+c; s='l2'; }
			break;
		}
	}

	function pushhtml(str)
	{
		if(!str) return;
		str = tplmachine(str);
		result.push('function(){\n' + str + '\n},\n');
	}

	function pushjs(str)
	{
		if(!str) return;
		str = whileformachine(str);

		result.push('function(){\n' + str + '\n},\n');
	}

	for(var i=0;i<html.length;i++) put(html[i]);
	if(s=='l2') pushjs(str); else pushhtml(str);

	var js = result.join('');
	js = '$$arraypush([' + js + ']);'

	if(js.indexOf('session_start')>=0)
	if(sessionmachine(js)) js = '$_SESSION=SESSION=session_start();\n\n' + js;

	js = func2str(htmlpageheader) + js + '\n\n};\n\n$$htmlpage;';

	return js;
}
