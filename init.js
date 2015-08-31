var url = require('url');
var path = require('path');
var util = require('util');
var vm = require('vm');

module.exports = JSSPCoreInit;


function getenvobj(req)
{
	var urlparse = url.parse(req.url,true);
	var filename = urlparse.pathname;
	if( (!filename)||('/'==filename) ) filename = 'index.jssp';
	filename = path.normalize('/'+filename); //delete .. in filename

	var env = {};
	env['JSSP_SELF']      = filename;
	env['SCRIPT_FILENAME']= filename;
	env['REMOTE_ADDR']    = req.socket.remoteAddress;
	env['REMOTE_PORT']    = req.socket.remotePort;
	env['SERVER_ADDR']    = req.socket.localAddress;
	env['SERVER_PORT']    = req.socket.localPort;
	env['SERVER_PROTOCOL']= req.httpVersion;
	env['REQUEST_METHOD'] = req.method;
	env['QUERY_STRING']   = req.url;

	env['HTTP_HOST']      = req.headers['host'];
	env['HTTP_USER_AGENT']= req.headers['user-agent'];
	env['HTTP_ACCEPT']    = req.headers['accept'];
	env['HTTP_CONNECTION']= req.headers['connection'];
	env['HTTP_REFERER']   = req.headers['referer'];
	env['HTTP_ACCEPT_CHARSET'] = req.headers['accept-charset'];
	env['HTTP_ACCEPT_ENCODING']= req.headers['accept-encoding'];
	env['HTTP_ACCEPT_LANGUAGE']= req.headers['accept-language'];
	env['CONTENT_LENGTH'] = req.headers['content-length'];
	env['CONTENT_TYPE']   = req.headers['content-type'];
	return env;
}

function PHPInit(jssp,req,res,code,codefilename,postobj,fileobj)
{
	var urlobj  = url.parse(req.url,true);
	jssp.$_GET  = urlobj.query;
	jssp.$_POST = postobj;
	jssp.$_FILE = fileobj;
	jssp.$_SERVER = getenvobj(req);
	jssp.$_ENV = jssp.GLOBAL_ENV;

	jssp.echo = function(str)
	{
		if(Buffer.isBuffer(str))
		{
			jssp.output(jssp.echocache); jssp.echocache='';
			jssp.output(str);
		}
		else
		{
			if(typeof str === "function") str = jssp.func2str(str);
			if(typeof str !== "string")   str = ''+str;
			jssp.echocache += str;
		}
	}
	jssp.exit = function(str)
	{
		jssp.internalexit(str);
	}
	jssp.include = function(filename)
	{

	}
	jssp.set_time_limit = function(timeout)
	{
		jssp.setmaxtimer(timeout);
	}
	jssp.header = function(name,value,responsecode)
	{
		jssp.domainobj.run(function()
		{ 
			res.setHeader(name,value);
			if(responsecode) res.statusCode = responsecode;
		});
	}
}

function JSSPInit(jssp,req,res,code,codefilename,postobj,fileobj)
{
	var html = jssp.html;
	jssp.arraypush = function(cb)
	{
		html.push(cb);
	};
	jssp.func2str = function(cb)
	{
		var str = cb.toString();
		var list= str.split('\n');
		
		list.shift();list.pop(); //delete first and last line

		//delete comment flag '//' before every line
		for(var i=0;i<list.length;i++)
			list[i] = list[i].substring(2);

		str = list.join('\n');
		return str;
	};

	jssp.require = function(name)
	{
		var obj;
		if(name==='fs') obj = require('./fakefs.js')(jssp);
		if(name==='net') obj = require('./fakenet.js')(jssp);
		if(name==='http') obj = require('./fakehttp.js')(jssp);

		if( (name==='string_decoder')||(name==='crypto')||(name==='os')||
			(name==='path')||(name==='url')||(name==='util') )
		{
			obj = require(name);
		}
		return obj;
	}
	jssp.setTimeout = function(cb,timeout)
	{
		var newcb = function()
		{
			cb();
			jssp.objectdel(timer);
		}
		var timer = setTimeout(newcb,timeout);
		timer.jsspclose = function(){ clearTimeout(timer); };
		jssp.objectadd(timer);
		return timer;
	}
	jssp.clearTimeout = function(timer)
	{
		jssp.objectdel(timer);
		return clearTimeout(timer);
	}
	jssp.setInterval = function(cb,timeout)
	{
		var newcb = function()
		{
			cb();
			jssp.objectdel(timer);
		}
		var timer = setInterval(newcb,timeout);
		timer.jsspclose = function(){ clearTimeout(timer); };
		jssp.objectadd(timer);
		return timer;
	}
	jssp.clearInterval = function(timer)
	{
		jssp.objectdel(timer);
		return clearInterval(timer);
	}

}

function JSSPCoreInit(option,req,res,code,codefilename,postobj,fileobj)
{
	var jssp = {};
	jssp.vm            = vm;
	jssp.BaseDirectory = option.BaseDirectory;
	jssp.__filename    = codefilename.slice(0,codefilename.length-3);
	jssp.__dirname     = path.dirname(codefilename);
	jssp.GLOBAL_ENV    = option.GLOBAL_ENV;

	var html = []
	jssp.html = html;

	var objectset  = new Set();
	jssp.objectset = objectset;
	jssp.objectadd = function(obj){ objectset.add(obj); }
	jssp.objectdel = function(obj){ objectset.delete(obj); jssp.runnext(); }
	jssp.objecthas = function(obj){ return objectset.has(obj); }
	
	jssp.running = true;
	jssp.runnext = function()
	{
		if(!jssp.running) return;
		ticktime = undefined;
		if(objectset.size>0){ jssp.output(jssp.echocache); jssp.echocache=''; return; }

		if(html.length)
		{
			jssp.domainobj.run(function()
			{
				do{ html.shift().call() }
				while( (0==objectset.size)&&(html.length>0) )				
				process.nextTick(jssp.runnext);
			});
			return;
		}
		else
		{
			jssp.internalexit();
			return;
		}
	}

	jssp.echocache = '';
	jssp.output = function(str,isend)
	{
		jssp.domainobj.run(function(){ 
			if(isend) { if(str) { res.end(str) } else { res.end() } }
			else      { if(str) { res.write(str) } }
		});
	}

	jssp.internalexit = function(str)
	{
		if(!jssp.running) return;
		jssp.running = false;

		if(maxtimer) clearTimeout(maxtimer);
		objectset.forEach(function(obj){ obj.jsspclose() });

		jssp.output(jssp.echocache); jssp.output(str,true); jssp.echocache='';
	}

	var domainobj = require('domain').create();
	domainobj.on("error",function(e){ jssp.internalexit(jssp.errorformat(e)); });
	jssp.domainobj = domainobj;

	var  T = {};
	jssp.T = T;
	jssp.render = function(name,value){ T[name] = value; }

	var tickcount = 0;
	var ticktime  = undefined;
	jssp.tick = function()
	{
		tickcount++;
		if( (tickcount)&&(0==tickcount%102400) )
		{
			if(!ticktime) ticktime=process.hrtime();
			if(process.hrtime(ticktime)[0]>0) throw new Error('EXCEED TICKTIME');
		}
	}

	var maxtimer = undefined;
	jssp.setmaxtimer = function(timeout)
	{
		if(maxtimer) clearTimeout(maxtimer);
		maxtimer = setTimeout(function()
		{
			maxtimer = undefined;
			var str = 'EXCEED MAXEXECUTETIME: ' + codefilename + '\n';
			str += util.inspect(objectset.entries().next().value[0],{depth:0});
			jssp.internalexit(jssp.errorformat(str));
		},timeout);
	}
	jssp.setmaxtimer(option.MaxExecuteTime);

	jssp.errorformat = function(e)
	{
		return codeerrorformat(e,code,codefilename);
	}
	jssp.domaincreate = function()
	{
		var d = require('domain').create();
		d.on("error",function(e){ jssp.internalexit(jssp.errorformat(e)); });
		return d;
	}
	jssp.init = function()
	{
		PHPInit(jssp,req,res,postobj,fileobj,code,codefilename);
		JSSPInit(jssp,req,res,postobj,fileobj,code,codefilename);
	}
	jssp.init();
			
	return jssp;	
}

function codeerrorformat(e,code,codefilename)
{
	var str;
	if(e.stack)
	{ 
		str = e.stack;
		str = 'ERROR IN FILE: ' + codefilename + '\n\n' + str;
	}
	else str = e.toString();

	var re = new RegExp('evalmachine.<anonymous>','g');
	str = str.replace(re,'evalmachine.anonymous');
	var re = new RegExp('<anonymous>','g');
	str = str.replace(re,codefilename);

	//format code
	var c = code;
	var list = c.split('\n');
	for(var i=0;i<list.length;i++)
	{
		var line = ('00000'+(i+1)).slice(-4) + ' ';
		list[i] = line + list[i];
	}
	c = list.join('\n');
	str = str + '\n\n' 
	     +'------------CODE BEGIN------------' 
	     +'\n'+ c + '\n'
	     +'------------CODE END------------';

	str = str.replace(/\&/g,'&amp');
	str = str.replace(/\</g,'&lt;');
	return '<br><pre>\n'+str+'</pre>';
}
