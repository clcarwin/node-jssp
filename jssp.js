/*
	Global Variable & Function:
	__filename __dirname GET POST FILE SERVER ENV TPL
	echo exit include set_time_limit header render

	Attention:
	1. while(true) will freeze whole JSSP
*/

var fs = require('fs');
var exec = require('child_process').exec;
var url = require('url');
var http = require('http');
var vm = require('vm');
var path = require('path');
var util = require('util');
var querystring = require('querystring');

var tplmachine = require('./tpl.js');
var whileformachine = require('./whilefor.js');

module.exports = new JSSPCore();

var BaseDirectory  = './www/';
var MaxExecuteTime = 60*1000;//60 seconds
var MaxPostSize    = 20*1024*1024;//20MB
var ExternalObject = undefined;//set by external code
var GLOBAL_ENV     = {};
var GLOBAL_SESSIONS= {};

function JSSPCore()
{
	this.CreateServer = function()
	{
		BaseDirectory = path.resolve(__dirname,BaseDirectory);
		var vmobj = CreateGlobalObject();
		var code = VMStart.toString()+';VMStart();'
		vm.runInNewContext(code,vmobj);

		for(var key in process.env) GLOBAL_ENV[key] = process.env[key];
		Object.defineProperty(GLOBAL_ENV, 'external', { get:function(){ return ExternalObject; } });
		Object.freeze(GLOBAL_ENV);

		var server = http.createServer(function (req, res) 
		{
			RenderPage(req,res,vmobj);
		});

		server.setBase = function(basepath)
		{
			BaseDirectory = path.resolve(__dirname,basepath);
		}
		server.setPost = function(maxsize)
		{
			MaxPostSize = maxsize;
		}
		server.setExternal = function(obj)
		{
			ExternalObject = obj;
		}
		return server;
	}

	function RenderPage(req,res,vmobj)
	{
		var urlparse = url.parse(req.url,true);
		var filename = urlparse.pathname;
		if( (!filename)||('/'==filename) ) filename = 'index.jssp';
		filename = path.normalize('/'+filename); //delete .. in filename
		filename = path.resolve(BaseDirectory,'./'+filename);

		{
			ServerFile(filename,req,res,{},{});
		}

		function ServerFile(filename,req,res,postobj,fileobj)
		{
			var cb = function(err)
			{
				if( (''+err).indexOf('ENOENT')>=0 ) res.write('<h1>404 Not Found</h1>');
				var str = '<p>'+err+'</p>';
				var dir = path.normalize(__dirname+path.sep+'..');
				res.end(str.replace(dir,'...'));
			}

			if('.jssp'!=path.extname(filename))
			{
				fs.stat(filename,function(err,stats)
				{
					if(err) { cb(err); return; }
					res.setHeader('Content-Length', stats.size);
					fs.createReadStream(filename).on('error',function(){}).pipe(res);
				});
			}
			else
			{
				fs.readFile(filename,{'encoding':'utf8'},function(err, data)
				{
					if(err) { cb(err); return; }
					var code = jssp2js(data);

					process.emit('newpage',req,res,code,filename+'.js',postobj,fileobj);
				});
			}
		}
	}

	function CreateGlobalObject()
	{
		function vmObject()
		{
			this.process = process;//use to emit 'newpage' and 'include'
			this.console = console;//use when debug
			this.JSSPCoreInit = JSSPCoreInit;
		}

		return new vmObject();
	}
}

function jssp2js(str)
{
	//*.jssp file to js code

	var spliter = '----3141592652718281828----'+Math.random()+'----';
	var re = new RegExp(spliter,'g');
	str = str.replace(/\<\?/g,spliter+'/*<?*/');
	str = str.replace(/\?\>/g,'/*?>*/'+spliter);
	str = str.replace(/session_start\( *\)/,'($_SESSION=session_start())');

	var list = str.split(spliter);

	for(var i=0;i<list.length;i++)
	{
		var ss = list[i];
		if(''==ss) continue;

		if('/*<?*/'==ss.substring(0,6))
		{
			var r=[ss,0];
			do{ r = whileformachine(r[0],spliter) }
			while(r[1]>0)	//nest for
			ss = r[0].replace(re, '');

			ss = '$$arraypush(function(){\n'
				+ ss + '\n'
				+'});\n';
			list[i] = ss;
		}
		else{ list[i] = tplmachine(ss); }
	}

	return list.join('\n');;
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
	jssp.$_ENV = GLOBAL_ENV;

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

function JSSPCoreInit(req,res,code,codefilename,postobj,fileobj)
{
	var jssp = {};
	jssp.vm            = vm;
	jssp.BaseDirectory = BaseDirectory;
	jssp.__filename    = codefilename.slice(0,codefilename.length-3);
	jssp.__dirname     = path.dirname(codefilename);

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

	var TPL = {};
	jssp.TPL = TPL;
	jssp.render = function(name,value){ TPL[name] = value; }

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
	jssp.setmaxtimer(MaxExecuteTime);

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

function VMStart()
{
	function EvalCode(code,jssp)
	{
		var process   = undefined;
		var JSSPCoreInit = undefined;
		var console   = undefined;
		var VMStart   = undefined;
		var EvalCode  = undefined;

		var echo      = jssp.echo;
		var exit      = jssp.exit;
		var include   = jssp.include;
		var __filename= jssp.__filename;
		var __FILE__  = jssp.__filename;
		var __dirname = jssp.__dirname;
		var __DIR__   = jssp.__dirname;

		var require        = jssp.require;
		var Buffer         = jssp.Buffer;
		var setTimeout     = jssp.setTimeout;
		var setInterval    = jssp.setInterval;
		var clearTimeout   = jssp.clearTimeout;
		var clearInterval  = jssp.clearInterval;
		var render         = jssp.render;

		var $$arraypush    = jssp.arraypush;
		var $$tick         = jssp.tick;
		var $$TPL     = TPL    = jssp.TPL;

		var $_GET     = GET    = jssp.$_GET;
		var $_POST    = POST   = jssp.$_POST;
		var $_FILE    = FILE   = jssp.$_FILE;
		var $_SERVER  = SERVER = jssp.$_SERVER;
		var $_ENV     = ENV    = jssp.$_ENV;
		var set_time_limit     = jssp.set_time_limit;
		var header             = jssp.header;


		$$domainobj = jssp.domaincreate();
		try{ eval(code); }catch(e)
		{ jssp.internalexit(jssp.errorformat(e)) };

		jssp.runnext();
		jssp = undefined;
	}
	
	var JSSPCoreInit = this.JSSPCoreInit;
	var process      = this.process;
	var console      = this.console;
	this.VMStart     = undefined;
	for(var key in this) delete this[key];
	Object.freeze(this);

	process.on('newpage',function(req,res,code,codefilename,postobj,fileobj)
	{
		var jssp = JSSPCoreInit(req,res,code,codefilename,postobj,fileobj);
		EvalCode(code,jssp);
	});

	process.on('include',function(req,res,code,codefilename,jssp,includecallback)
	{
		var jsspnewobj = JSSPCoreInit(req,res,code,codefilename);
		jsspnewobj.includecallback = includecallback; //will be called in jsspnewobj.runnext

		EvalCode(code,jsspnewobj);
	});
}


if(require.main === module)
{
	//run without be required
	var argv = process.argv;
	var port = '80';
	var ip   = '0.0.0.0';
	var base = './www/';
	var multi= false;

	if(argv[2]) port = argv[2];
	if(argv[3]) ip   = argv[3];
	if(argv[4]) base = argv[4];
	if(argv[5]) multi= argv[5]=='cluster';

	var cluster = require('cluster');
	if(cluster.isMaster && multi)
	{
		for(var i=0;i<require('os').cpus().length;i++) cluster.fork();
	}
	else
	{
		var jsspcore = module.exports;
		var server = jsspcore.CreateServer();
		server.listen(port,ip);
		server.setBase(base);
	}
}