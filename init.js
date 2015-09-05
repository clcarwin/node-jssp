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
	jssp.$_ENV = jssp.ENV;

	jssp.echo = function(str)
	{
		if(typeof str === "function") str = jssp.func2str(str); else
		if(typeof str === "undefined") str = ''; else
		if(Buffer.isBuffer(str)) str = str; else
		if(typeof str !== "string")   str = ''+str;
		jssp.output(str);
	}
	jssp.exit = function(str)
	{
		jssp.internalexit(str);
	}

	jssp.includecache = false;
	jssp.include = function(filename,cb)
	{
		filename = path.normalize('/'+filename); //delete .. in filename
		filename = path.resolve(jssp.__dirname,'./'+filename);

		var code = jssp.codebyname(filename);
		if(code.stack) throw code;

		var oldfilename;
		var oldcode;
		function push()
		{
			oldfilename      = jssp.__filename;
			oldcode          = jssp.__code;
			jssp.__filename  = filename;
			jssp.__dirname   = path.dirname(filename);
			jssp.__code      = code;
			jssp.__codename  = filename+'.js';
		}
		function pop()
		{
			jssp.__filename  = oldfilename;
			jssp.__dirname   = path.dirname(oldfilename);
			jssp.__code      = oldcode;
			jssp.__codename  = oldfilename+'.js';
		}

		var flag = jssp.includecache;
		var htmlpop;
		if(flag) { htmlpop = jssp.html.pop() }
		else { jssp.htmlstack.push(jssp.html); jssp.html=[]; }

		jssp.arraypush(push);
		var module    = {"exports":{}};
		var oldmodule = jssp.module;
		jssp.module   = module;

		var oldrunnext = jssp.runnext;
		jssp.runnext = function(){};
		push();jssp.EvalCode(jssp,code);pop();
		jssp.runnext = oldrunnext;

		jssp.arraypush(pop);
		jssp.arraypush(function(){ if(cb) cb(module.exports); jssp.module=oldmodule; });

		if(flag) { jssp.arraypush(htmlpop) }
		else { jssp.arraypush(function(){ jssp.html = jssp.htmlstack.pop() }) }

		jssp.includecache = true;
	}
	jssp.set_time_limit = function(timeout)
	{
		jssp.setmaxtimer(timeout);
	}
	jssp.header = function(name,value,responsecode)
	{
		res.setHeader(name,value);
		if(responsecode) res.statusCode = responsecode;
	}
	jssp.headers_sent = function()
	{
		return res.headersSent;
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

		jssp.SESSIONS[obj.ssesid] = obj;
		return obj.ssesid;
	}
	jssp.session_start = function()
	{
		if(!ssesid) ssesid = splitsessionid(req.headers['cookie']);
		if(!ssesid) ssesid = jssp.internal_session_newid();

		obj = jssp.SESSIONS[ssesid];
		if(!obj) ssesid  = jssp.internal_session_newid();	//ssesid invalid
		if(!obj) obj = jssp.SESSIONS[ssesid];

		obj.time = process.hrtime();
		return obj.sessobj;
	}
	jssp.session_id = function()
	{
		return ssesid;
	}
	jssp.session_destroy = function()
	{
		var obj = jssp.SESSIONS[ssesid];
		if(!obj) return;
		clearInterval(obj.id);
		jssp.session_unset();
		delete jssp.SESSIONS[ssesid];
		ssesid = undefined;
	}
	jssp.session_unset = function()
	{
		var obj = jssp.SESSIONS[ssesid];
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
	}
	jssp.func2str = function(cb)
	{
		var str = cb.toString();
		var list= str.split('\n');
		
		list.shift();list.pop(); //delete first and last line

		//delete comment flag '//' before every line
		for(var i=0;i<list.length;i++) list[i]=list[i].substring(2);

		str = list.join('\n');
		return str;
	}

	jssp.require = function(name)
	{
		var obj;

		if(name==='fs') obj = require('./fakefs.js')(jssp); else
		if(name==='net') obj = require('./fakenet.js')(jssp); else
		if(name==='http') obj = require('./fakehttp.js')(jssp); else
		if(name==='child_process') obj = require('./fakecp.js')(jssp); else

		if( (name==='string_decoder')||(name==='crypto')||(name==='os')||
			(name==='path')||(name==='url')||(name==='util')||(name==='querystring') )
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

function JSSPCoreInit(options,req,res,postobj,fileobj,code,filename)
{
	var jssp = {};
	jssp.vm              = vm;
	jssp.EvalCode        = undefined;
	jssp.BASE            = options.BASE;
	jssp.ENV             = options.ENV;
	jssp.EXT             = options.EXT;
	jssp.SESSIONS        = options.SESSIONS;
	jssp.codebyname      = options.codebyname;

	jssp.html = [];
	jssp.htmlstack = [];

	jssp.__filename    = filename;
	jssp.__dirname     = path.dirname(filename);
	jssp.__code        = code;
	jssp.__codename    = filename+'.js';
	jssp.module        = {"exports":{}};
	jssp.Buffer        = Buffer;

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
		if(objectset.size>0){ return; }

		if(jssp.html.length)
		{
			jssp.domainobj.run(function()
			{
				do{ jssp.html.shift().call(); jssp.includecache=false; }
				while( (0==objectset.size)&&(jssp.html.length>0) )
				jssp.output();	//flush cache
				process.nextTick(jssp.runnext);
			});
		}
		else
		{
			jssp.internalexit();
		}
	}

	jssp.outputcache = '';
	jssp.output = function(str,isend)
	{
		if(!str) str = '';
		if(jssp.includecache)
		{
			var last = jssp.html.pop();
			var fn = function(){ jssp.output(str) }
			jssp.html.push(fn);
			jssp.html.push(last);
		}
		else
		{
			if( (str)&&(!isend) ) { jssp.outputcache += str;return; }

			str+=jssp.outputcache; jssp.outputcache='';
			jssp.domainobj.run(function()
			{ 
				if(isend) { if(str) { res.end(str) } else { res.end() } }
				else      { if(str) { res.write(str) } }
			});
		}
	}

	jssp.internalexit = function(str)
	{
		if(!jssp.running) return;
		jssp.running = false;

		if(maxtimer) clearTimeout(maxtimer);
		objectset.forEach(function(obj){ obj.jsspclose() });

		jssp.output(str,true);
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
			if(process.hrtime(ticktime)[0]*1000>=options.TICKTIME) 
			throw new Error('EXCEED TICKTIME');
		}
	}

	var maxtimer = undefined;
	jssp.setmaxtimer = function(timeout)
	{
		if(maxtimer) clearTimeout(maxtimer);
		maxtimer = setTimeout(function()
		{
			maxtimer = undefined;
			var str = 'EXCEED EXECTIME: ' + jssp.__codename + '\n';
			objectset.forEach(function(obj){ str+=util.inspect(obj,{depth:0}) });
			jssp.internalexit(jssp.errorformat(str));
		},timeout);
	}
	jssp.setmaxtimer(options.EXECTIME);

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
