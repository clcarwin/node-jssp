var jsbase = __dirname + '/';
var tplmachine = require(jsbase + 'tpl.js');
var whileformachine = require(jsbase + 'whilefor.js');
var includemachine  = require(jsbase + 'include.js');
var sessionmachine  = require(jsbase + 'session.js');

//*.jssp file to js code
module.exports = complemachine;

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
		result.push('$$arraypush(function(){\n' + str + '\n});\n');
	}

	function pushjs(str)
	{
		if(!str) return;
		str = whileformachine(str);
		if(str.indexOf('include')>=0) str = includemachine(str);

		result.push('$$arraypush(function(){\n' + str + '\n});\n');
	}

	for(var i=0;i<html.length;i++) put(html[i]);
	if(s=='l2') pushjs(str); else pushhtml(str);

	var js = result.join('');
	if(js.indexOf('session_start')>=0)
	if(sessionmachine(js)) js = '$_SESSION=SESSION=session_start();\n\n' + js;

	return js;
}
