var url = require('url');
var path = require('path');
var util = require('util');
var vm = require('vm');
var fs = require('fs');

var jsbase = __dirname + '/';
var compilemachine = require(jsbase + 'compile.js');

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

function PHPInit(jssp,req,res,postobj,fileobj,code,filename)
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
	jssp.include = function(filename,fn)
	{
		filename = path.normalize('/'+filename); //delete .. in filename
		filename = path.resolve(jssp.BaseDirectory,'./'+filename);

		var code;
		var stats = fs.statSync(filename);
		var time = jssp.CODEMTIME[filename];
		if(time!==stats.mtime.getTime())
		{
			try{ code = fs.readFileSync(filename,{'encoding':'utf8'}) }
			catch(e){ cb(e);return; }
			code = compilemachine(code);
			jssp.CODECACHE[filename] = code;
			jssp.CODEMTIME[filename] = stats.mtime.getTime();
		}
		else { code = jssp.CODECACHE[filename]; }
		
		var oldfilename;
		var oldcode;
		function push()
		{
			jssp.htmlstack.push(jssp.html); jssp.html=[];

			oldfilename = jssp.__filename;
			jssp.__filename = filename;
			jssp.__dirname  = path.dirname(filename);
			oldcode     = jssp.__code;
			jssp.__code     = code;
			jssp.__codename = filename+'.js';
		}
		function pop()
		{
			jssp.html = jssp.htmlstack.pop();

			jssp.__filename = oldfilename;
			jssp.__dirname  = path.dirname(oldfilename);
			jssp.__code     = code;
			jssp.__codename = oldfilename+'.js';

			fn();
			jssp.runnext();
		}

		push();
		jssp.EvalCode(code,jssp);
		jssp.arraypush(pop);

		jssp.runnext();
		return jssp.module.exports;
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

	var ssesid;
	jssp.internal_session_newid = function()
	{
		var obj = {};
		obj.sessobj = {};
		obj.ssesid  = process.hrtime().join('-')+'-'+Math.random()*1000000000000000000;
		obj.time    = process.hrtime();
		obj.id      = setInterval(function()
		{
			if(process.hrtime(obj.time)[0]>24*60) jssp.session_destroy();
		},5*60*1000);

		res.setHeader('Set-Cookie','JSSPSESSID='+obj.ssesid);

		jssp.GLOBAL_SESSIONS[obj.ssesid] = obj;
		return obj.ssesid;
	}
	jssp.session_start = function()
	{
		if(!ssesid) ssesid = splitsessionid(req.headers['cookie']);
		if(!ssesid) ssesid = jssp.internal_session_newid();

		obj = jssp.GLOBAL_SESSIONS[ssesid];
		if(!obj) ssesid  = jssp.internal_session_newid();	//ssesid invalid
		if(!obj) obj = jssp.GLOBAL_SESSIONS[ssesid];

		obj.time = process.hrtime();
		return obj.sessobj;
	}
	jssp.session_id = function()
	{
		return ssesid;
	}
	jssp.session_destroy = function()
	{
		var obj = jssp.GLOBAL_SESSIONS[ssesid];
		if(!obj) return;
		clearInterval(obj.id);
		jssp.session_unset();
		delete jssp.GLOBAL_SESSIONS[ssesid];
		ssesid = undefined;
	}
	jssp.session_unset = function()
	{
		var obj = jssp.GLOBAL_SESSIONS[ssesid];
		if(!obj) return;
		var sessobj = obj.sessobj;
		for(var key in sessobj) delete sessobj[key];
	}
}

function JSSPInit(jssp,req,res,postobj,fileobj,code,filename)
{
	jssp.arraypush = function(cb)
	{
		jssp.html.push(cb);
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

function JSSPCoreInit(option,req,res,postobj,fileobj,code,filename)
{
	var jssp = {};
	jssp.vm              = vm;
	jssp.EvalCode        = undefined;
	jssp.BaseDirectory   = option.BaseDirectory;
	jssp.GLOBAL_ENV      = option.GLOBAL_ENV;
	jssp.GLOBAL_SESSIONS = option.GLOBAL_SESSIONS;
	jssp.CODECACHE       = option.CODECACHE;
	jssp.CODEMTIME       = option.CODEMTIME;

	jssp.html = [];
	jssp.htmlstack = [];

	jssp.__filename    = filename;
	jssp.__dirname     = path.dirname(filename);
	jssp.__code        = code;
	jssp.__codename    = filename+'.js';
	jssp.module = {"exports":{}};

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

		if(jssp.html.length)
		{
			jssp.domainobj.run(function()
			{
				do{ jssp.html.shift().call() }
				while( (0==objectset.size)&&(jssp.html.length>0) )
				process.nextTick(jssp.runnext);
			});
		}
		else
		{
			jssp.internalexit();
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
			var str = 'EXCEED MAXEXECUTETIME: ' + jssp.__codename + '\n';
			objectset.forEach(function(obj){ str+=util.inspect(obj,{depth:0}) });
			jssp.internalexit(jssp.errorformat(str));
		},timeout);
	}
	jssp.setmaxtimer(option.MaxExecuteTime);

	jssp.errorformat = function(e)
	{
		return codeerrorformat(e,jssp.__code,jssp.__codename);
	}
	jssp.domaincreate = function()
	{
		var d = require('domain').create();
		d.on("error",function(e){ jssp.internalexit(jssp.errorformat(e)); });
		return d;
	}
	jssp.init = function()
	{
		PHPInit(jssp,req,res,postobj,fileobj,code,filename);
		JSSPInit(jssp,req,res,postobj,fileobj,code,filename);
	}
	jssp.init();
			
	return jssp;	
}

function codeerrorformat(e,code,codename)
{
	var str;
	if(e.stack)
	{ 
		str = e.stack;
		str = 'ERROR IN FILE: ' + codename + '\n\n' + str;
	}
	else str = e.toString();

	var re = new RegExp('evalmachine.<anonymous>','g');
	str = str.replace(re,'evalmachine.anonymous');
	var re = new RegExp('<anonymous>','g');
	str = str.replace(re,codename);

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

function splitsessionid(cookie)
{
	cookie = cookie + ';';
	var id  = undefined;
	var index  = cookie.indexOf('JSSPSESSID=');
	if(index>=0) 
	{
		id = cookie.slice(index+11);
		index  = id.indexOf(';');
		id = id.slice(0,index);
	}
	return id;
}
