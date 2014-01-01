/*
	Global Variable & Function:
	__filename __dirname global $_GET $_POST $_FILE $_SERVER $_ENV
	echo exit wrapper include set_time_limit session_read session_write header headers_sent

	Attention:
	1. All callback function need wrap by wrapper(cb)
	2. while(true) will freeze whole JSSP
*/

var fs = require('fs');
var exec = require('child_process').exec;
var url = require('url');
var http = require('http');
var vm = require('vm');
var path = require('path');
var util = require('util');
var querystring = require('querystring');

module.exports = new JSSPCore();

var BaseDirectory  = './www/';
var MaxExecuteTime = 60*1000;//60 seconds
var MaxPostSize    = 20*1024*1024;//20MB
var ExternalObject = undefined;//set by external code

function JSSPCore()
{
	var thisobj = this;
	var TimerUniqueID = 0;
	var codesavemap = {};

	this.CreateServer = function()
	{
		BaseDirectory = path.resolve(__dirname,BaseDirectory);
		var vmobj = CreateGlobalObject();
		var code = VMStart.toString()+';VMStart();'
		vm.runInNewContext(code,vmobj);

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

		if('POST'==req.method)
		{
			var postobj = {};
			var fileobj = {};
			var contentlength = parseInt(req.headers['content-length']);
			var prefix  = urlparse.query['session_upload_progress_prefix'];
			if(prefix) prefix = 'session_upload_progress_prefix' + prefix;
			
			var chunklist = [];
			var size = 0;
			var progress = 0;
			req.on('data',function(chunk)
			{
				chunklist.push(chunk);
				size += chunk.length;
				if(size>MaxPostSize)
				{
					var str = 'EXCEED MAXPOSTSIZE ERROR: MaxPostSize=' + MaxPostSize;
					res.end(str);req.removeAllListeners('data');
					return;
				}

				var cur_p = Math.floor((size*100)/(contentlength+1));
				if(progress!=cur_p)
				{
					if(prefix) vmobj.session_write(prefix,cur_p,60*1000);
					progress = cur_p;
				}
			});
			req.on('error',function()
			{
				var str = 'RECV REQUEST DATA ERROR';
				res.end(str);
				req.removeAllListeners('end');
				return;
			});
			req.on('end',function()
			{
				var postbuffer = Buffer.concat(chunklist);
				var contenttype = req.headers['content-type'];

				try{
					postparse(contenttype,postbuffer,postobj,fileobj);
				}catch(e){
					var str = 'POST DATA PARSE ERROR: ' + e.stack;
					res.end(str);
					return;
				}
				if(prefix) vmobj.session_write(prefix,100,60*1000);
				ServerFile(filename,req,res,postobj,fileobj);
			});
		}
		else
		{
			ServerFile(filename,req,res,{},{});
		}

		function ServerFile(filename,req,res,postobj,fileobj)
		{
			var cb = function(err)
			{
				if( (''+err).indexOf('ENOENT')>=0 ) res.end('<h1>404 Not Found</h1>')
				else res.end(''+err);
			}

			if('.jssp'!=path.extname(filename))
			{
				fs.readFile(filename,function(err, data)
				{
					if(err) { cb(err); return; }
					res.end(data);
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
			this.jsspGlobalObject = jsspGlobalObject;

			//global function
			this.require = require;
			this.Buffer = Buffer;

			var SESSION = {};
			this.session_write = function(name,value,timeout)
			{
				if(!timeout) timeout = 1440*1000;//24 minutes

				var s = SESSION[name];
				if(!s) s = {};
				s.value = value;
				s.timeout = timeout;

				if(s.timer) clearTimeout(s.timer);
				s.timer = setTimeout(function()
				{
					delete SESSION[name];
				},s.timeout);

				SESSION[name] = s;
			}
			this.session_read = function(name)
			{
				var s = SESSION[name];
				if(!s) return undefined;

				if(s.timer) clearTimeout(s.timer);
				s.timer = setTimeout(function()
				{
					delete SESSION[name];
				},s.timeout);

				return s.value;
			}
		}

		function jsspGlobalObject(req,res,code,codefilename,postobj,fileobj)
		{
			var html = [];
			var wrappercount = 0;

			var jssp = this;
			jssp.__filename = codefilename.slice(0,codefilename.length-3);
			jssp.__dirname  = path.dirname(codefilename);
			jssp.global = {};//communicate between include files

			var maxtimer = setTimeout(function()
			{
				maxtimer = undefined;

				var str = 'EXCEED MAXEXECUTETIME: ' + codefilename;
				jssp.internalexit(jssp.errorformat(str));
			},MaxExecuteTime);

			this.verify = function(arg)
			{
				//call echo/exit in a unwrappered callback, will return a error
				var caller = arg.callee.caller;
				while(caller) {
					if(caller.$$wrapperflag) { return true; }
					caller = caller.caller;
				}

				var str = 'NO WRAPPER IN CALLBACK: ' + codefilename;
				str = str + '\n' + arg.callee.caller.toString();
				jssp.internalexit(jssp.errorformat(str));
				return false;
			}
			this.echo = function(str)
			{
				if(!res) return;
				if(!jssp.verify(arguments) ) return;

				res.write(''+str);
			};
			this.exit = function(str)
			{
				if(!res) return;
				if(!jssp.verify(arguments) ) return;

				jssp.internalexit(str);
			};
			this.internalexit = function(str)
			{
				if(maxtimer) clearTimeout(maxtimer);

				if(str) { res.end(''+str); }
				else { res.end(); }
				res = undefined;
			}

			this.wrapper = function(cb)
			{
				if(!res) return;

				wrappercount++;
				var ret = function()
				{
					if(!ret.$$reentrant) wrappercount--;
					ret.$$reentrant = true;

					try{ cb.apply(this,arguments); }
					catch(e){ jssp.exit(jssp.errorformat(e)); }

					jssp.runnext();
				}
				ret.$$wrapperflag = true;
				ret.$$reentrant   = false;
				return ret;
			}
			this.runnext = function()
			{
				if(!res) return;
				if(wrappercount) return;//wait
				
				if(html.length) { process.nextTick(html.shift()); }
				else 
				{
					if(jssp.includecallback) { jssp.includecallback(); } //included jssp file execute finished
					else { jssp.internalexit(); } //request jssp file execute finished
				}
			}
			this.errorformat = function(e)
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
				str = str + '\n\n' + '------------CODE BEGIN------------\n' + c + '\n------------CODE END------------';

				str = str.replace(/\&/g,'&amp');
				str = str.replace(/\</g,'&lt;');
				return '<br><pre>'+str+'</pre>';
			}

			//tool
			this.arraypush = function(cb)
			{
				var ret = function()
				{
					try{ cb(); }
					catch(e){ jssp.exit(jssp.errorformat(e)); }

					jssp.runnext();
				};
				ret.$$wrapperflag = true;
				html.push(ret);
			};
			this.html2js = function(cb)
			{
				var str = cb.toString();
				var list= str.split('\n');

				//delete first and last line
				list.shift();
				list.pop();

				//delete comment flag '//' before every line
				for(var i=0;i<list.length;i++)
					list[i] = list[i].substring(2);

				str = list.join('\n');

				return str;
			};

			this.include = function(jsspfile,cb)
			{
				//communicate by global
				jsspfile = path.resolve(BaseDirectory,jsspfile);

				if(undefined==cb) cb = function(){};
				var includecallback = jssp.wrapper(cb);

				fs.readFile(jsspfile,{'encoding':'utf8'},function(e, data)
				{
					if(e) { jssp.internalexit(jssp.errorformat(e)); return; }
					var code = jssp2js(data);
					 
					process.emit('include',req,resparam,code,jsspfile+'.js',jssp,includecallback);
				});
			}
			this.setTimeout = function()
			{
				var ret = setTimeout.apply(this,arguments);
				ret.$$timeoutflag = true;
				return ret;
			}
			this.clearTimeout = function(timer)
			{
				if(!timer) return;
				if(timer.$$timeoutflag) wrappercount--;
				delete timer.$$timeoutflag;
				return clearTimeout(timer);
			}
			this.setInterval = function(cb)
			{
				if(cb) if(cb.$$wrapperflag) cb.$$reentrant = true;
				var ret = setInterval.apply(this,arguments);
				ret.$$intervalflag = true;
				return ret;
			}
			this.clearInterval = function(timer)
			{
				if(!timer) return;
				if(timer.$$intervalflag) wrappercount--;
				delete timer.$$intervalflag;
				return clearInterval(timer);
			}

			this.initphp = function()
			{
				var urlobj  = url.parse(req.url,true);
				jssp.$_GET  = urlobj.query;
				jssp.$_POST = postobj;
				jssp.$_FILE = fileobj;

				var $_SERVER = {};
				$_SERVER['JSSP_SELF']      = __filename;
				$_SERVER['SCRIPT_FILENAME']= __filename;
				$_SERVER['REMOTE_ADDR']    = req.socket.remoteAddress;
				$_SERVER['REMOTE_PORT']    = req.socket.remotePort;
				$_SERVER['SERVER_ADDR']    = req.socket.localAddress;
				$_SERVER['SERVER_PORT']    = req.socket.localPort;
				$_SERVER['SERVER_PROTOCOL']= req.httpVersion;
				$_SERVER['REQUEST_METHOD'] = req.method;
				$_SERVER['QUERY_STRING']   = req.url;

				$_SERVER['HTTP_HOST']      = req.headers['host'];
				$_SERVER['HTTP_USER_AGENT']= req.headers['user-agent'];
				$_SERVER['HTTP_ACCEPT']    = req.headers['accept'];
				$_SERVER['HTTP_CONNECTION']= req.headers['connection'];
				$_SERVER['HTTP_REFERER']   = req.headers['referer'];
				$_SERVER['HTTP_ACCEPT_CHARSET'] = req.headers['accept-charset'];
				$_SERVER['HTTP_ACCEPT_ENCODING']= req.headers['accept-encoding'];
				$_SERVER['HTTP_ACCEPT_LANGUAGE']= req.headers['accept-language'];
				$_SERVER['CONTENT_LENGTH'] = req.headers['content-length'];
				$_SERVER['CONTENT_TYPE']   = req.headers['content-type'];
				jssp.$_SERVER = $_SERVER;

				jssp.$_ENV = {};
				for(var key in process.env) jssp.$_ENV[key] = process.env[key];
				jssp.$_ENV['external'] = ExternalObject;

				jssp.set_time_limit = function(timeout)
				{
					var cb = maxtimer._onTimeout;
					clearTimeout(maxtimer);
					maxtimer = setTimeout(cb,timeout);
				}
				jssp.header = function(name,value,responsecode)
				{
					if(!res) return;
					if(jssp.headers_sent()) return;

					res.setHeader(name,value);
					if(responsecode) res.statusCode = responsecode;
				}
				jssp.headers_sent = function()
				{
					if(!res) return true;
					return res.headersSent;
				}
			}
		}

		return new vmObject();
	}
}

function jssp2js(str)
{
	//*.jssp file to js code

	var spliter = '----3141592652718281828----';
	var re = new RegExp(spliter,'g');
	str = str.replace(/\<\?/g,spliter+'/*<?*/');
	str = str.replace(/\?\>/g,'/*?>*/'+spliter);

	var list = str.split(spliter);

	for(var i=0;i<list.length;i++)
	{
		var ss = list[i];
		if(''==ss) continue;

		if('/*<?*/'==ss.substring(0,6))
		{
			ss = '$$arraypush(function(){\n'
				+'  $$domainobj.run(function(){\n'
				+ ss + '\n'
				+'  }.bind(undefined));\n'
				+'});\n';
			list[i] = ss;
		}
		else
		{
			ss = '//'+ss.replace(/\n/g,'\n//');
			ss = '$$arraypush(function(){\n'
				+'    echo($$html2js(function(){\n'
				+ ss + '\n'
				+'    }));\n'
				+'});\n';
			list[i] = ss;
		}
	}

	return list.join('\n');;
}

function postparse(contenttype,postbuffer,postobj,fileobj)
{
	if('application/x-www-form-urlencoded'==contenttype)
	{
		var str = postbuffer.toString();
		var obj = querystring.parse(str);
		for(var key in obj) postobj[key] = obj[key];
	}
	else
	if('multipart/form-data'==contenttype.slice(0,19))
	{
		var index = contenttype.indexOf('boundary=');
		var boundary = '--'+contenttype.slice(index+9);

		boundary = (new Buffer(boundary)).toString('hex');
		postbuffer = postbuffer.toString('hex');

		var list = [];
		list = postbuffer.split(boundary);
		list.shift();//delete first
		list.pop();//delete last

		for(var i=0;i<list.length;i++)
		{
			var sublist = list[i];
			sublist = sublist.slice(4,sublist.length-4);//delete 0d0a at begin and end

			var index = sublist.indexOf('0d0a0d0a');
			var name = sublist.slice(0,index);
			name = (new Buffer(name,'hex')).toString();
			
			sublist = sublist.slice(index+8);
			var data = sublist;                
			data =  new Buffer(data,'hex');

			var type = '';
			index = name.indexOf('\r\n');
			if(index>=0)
			{
				type = name.slice(index+2);
				name = name.slice(0,index);
			}

			var index = name.indexOf('filename=');
			if(index>=0)
			{
				var filename = name.slice(index+9);
				if('"'==filename[0]) filename = filename.slice(1,filename.length-1);
				fileobj[filename] = data;
			}
			else
			{
				index = name.indexOf('name=');
				var valuename = name.slice(index+5);
				if('"'==valuename[0]) valuename = valuename.slice(1,valuename.length-1);
				postobj[valuename] = data.toString();
			}
		}
	}
}

function VMStart()
{
	var require        = this.require;
    var Buffer         = this.Buffer;
	var session_write  = this.session_write;
	var session_read   = this.session_read;

	function EvalCode(code,jssp)
	{

		var global = jssp.global;
		var process = undefined;
		var jsspGlobalObject = undefined;
		var console = undefined;
		var VMStart = undefined;

		var echo      = jssp.echo;
		var exit      = jssp.exit;
		var wrapper   = jssp.wrapper;
		var include   = jssp.include;
		var __filename= jssp.__filename;
		var __FILE__  = jssp.__filename;
		var __dirname = jssp.__dirname;
		var __DIR__   = jssp.__dirname;

		var setTimeout   = jssp.setTimeout;
		var setInterval  = jssp.setInterval;
		var clearTimeout = jssp.clearTimeout;
		var clearInterval= jssp.clearInterval;

		var $$arraypush = jssp.arraypush;
		var $$html2js   = jssp.html2js;
		var $$internalexit = jssp.internalexit;
		var $$errorformat  = jssp.errorformat;

		jssp.initphp();
		var $_GET    = jssp.$_GET;
		var $_POST   = jssp.$_POST;
		var $_FILE   = jssp.$_FILE;
		var $_SERVER = jssp.$_SERVER;
		var $_ENV    = jssp.$_ENV;
		var set_time_limit = jssp.set_time_limit;
		var header         = jssp.header;
		var headers_sent   = jssp.headers_sent;

		var $$domainobj = require('domain').create();
		$$domainobj.on("error",function(e){ $$internalexit($$errorformat(e)); });
		
		try {
		 	eval(code);
		}catch(e)
		{
			$$internalexit($$errorformat(e));
			return;
		}

		jssp.runnext();
		jssp = undefined;
	}
	
	var jsspGlobalObject = this.jsspGlobalObject;
	var process = this.process;
	var console = this.console;
	this.VMStart = undefined;
	for(var key in this) delete this[key];
	Object.freeze(this);

	process.on('newpage',function(req,res,code,codefilename,postobj,fileobj)
	{
		var jssp = new jsspGlobalObject(req,res,code,codefilename,postobj,fileobj);
		EvalCode(code,jssp);
	});

	process.on('include',function(req,res,code,codefilename,jssp,includecallback)
	{
		//the included jssp file return value to parent by jssp.global
		var jsspnewobj = new jsspGlobalObject(req,res,code,codefilename);
		jsspnewobj.global = jssp.global;
		jsspnewobj.includecallback = includecallback; //will be called in jsspnewobj.runnext

		EvalCode(code,jsspnewobj);
	});
}

if(process.argv[1]==__filename)
{
	//run without be required
	var argv = process.argv;
	var port = '80';
	var ip   = '0.0.0.0';
	var base = './www/';

	if(argv[2]) port = argv[2];
	if(argv[3]) ip   = argv[3];
	if(argv[4]) base = argv[4];

	var jsspcore = module.exports;
	var server = jsspcore.CreateServer();
	server.listen(port,ip);
	server.setBase(base);
}