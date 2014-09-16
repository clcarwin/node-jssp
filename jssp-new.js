/*
	Global Variable & Function:
	__filename __dirname $_GET $_POST $_FILE $_SERVER $_ENV $_SESSION
	echo exit include set_time_limit session_read session_write header headers_sent

	Attention:
	1. while(true) will freeze whole JSSP
*/

/*
	process.call & process.apply to get function run from production logic
	call('func',arg1,arg2,...) apply('func',[arg1,arg2,...])
*/

var fs = require('fs');
var child_process = require('child_process');
var exec = require('child_process').exec;
var url = require('url');
var http = require('http');
var path = require('path');
var util = require('util');
var querystring = require('querystring');

module.exports = new JSSPCore();

var BaseDirectory  = __dirname+'/www/';
var MaxExecuteTime = 60*1000;//60 seconds
var MaxPostSize    = 20*1024*1024;//20MB

function JSSPCore()
{
	this.CreateServer = function()
	{
		BaseDirectory = path.resolve(__dirname,BaseDirectory);

		var server = http.createServer(function (req, res) 
		{
			var opt = {};
			opt.env = getenvobj(req);
			opt.env.JSSP_FLAG = true;
			opt.cwd = BaseDirectory;
			opt.silent = true;

			var child = child_process.fork(__filename,[],opt);
			child.stdout.on('data',function(data)
			{
				res.write(data);
			});
			child.stderr.on('data',function(data)
			{
				//console.log(data.toString());
				res.write(data);
			});
			child.on('close',function()
			{
				res.end();
			});
			child.on('message',function(m)
			{
				/* m = 'func(arg1,arg2..)' */
				if(m.func)
				{
					try {
						var ret = eval(m.func.toString());
						if(undefined==ret) ret='';
						child.send({"result":ret.toString()});
					}catch(e){ console.log(e); }
				}
			});
		});

		server.setOptions = function(basepath,maxpostsize)
		{
			if(basepath) BaseDirectory = path.resolve(__dirname,basepath);
			if(maxpostsize) MaxPostSize = maxsize;
		}

		return server;
	}

	this.CreateChild = function()
	{
		var exit = process.exit;
		var headerssent = false;
		process.on('uncaughtException', function(e)
		{
			process.echo(e);
			process.exit();
		});
		process.on('message',function(m)
		{
			if(undefined !== m.result)
			{
				var cb = process.callcb.shift();
				if(cb) cb(m.result);
			}
		});
		process.callcb = [];
		process.call = function(f,cb)	//cb = function(result)
		{
			process.callcb.push(cb);
			process.send({func:f.toString()});
		}
		process.echo = function(str)
		{
			headerssent = true;
			if(!Buffer.isBuffer(str)) str=''+str;
			process.stdout.write(str);
		}
		process.exit = function()
		{
			process.nextTick(exit);
		}

		var filename = path.resolve(BaseDirectory,'./'+process.env.JSSP_SELF);
		ServerFile(filename);

		function SetHeader(name,value,responsecode,cb)//cb use to check if finished
		{
			var func = 'res.setHeader("{0}","{1}");'
			func = func.replace('{0}',''+name).replace('{1}',''+value);

			if(responsecode) func += 'res.statusCode={2};';
			func = func.replace('{2}',''+responsecode);

			process.call(func,cb);
		}

		function ServerFile(filename)
		{
			var cb = function(err)
			{
				if( (''+err).indexOf('ENOENT')>=0 ) process.echo('<h1>404 Not Found</h1>');
				var str = '<p>'+err+'</p>';
				var dir = path.normalize(__dirname+path.sep+'..');
				process.echo(str.replace(dir,'...'));
				process.exit();
			}

			if('.jssp'!=path.extname(filename))
			{
				fs.stat(filename,function(err,stats)
				{
					if(err) { cb(err); return; }
					SetHeader('Content-Length', stats.size, undefined,function()
					{
						fs.createReadStream(filename).on('error',function(e)
						{
							process.exit();
						}).on('end',function()
						{
							process.exit();
						}).on('data',function(data)
						{
							process.echo(data);
						})
					});
				});
			}
			else
			{
				fs.readFile(filename,{'encoding':'utf8'},function(err, data)
				{
					if(err) { cb(err); return; }
					var code = jssp2js(data);

					JSSPInit();
					PHPInit();
					renderjssp(code,filename);
				});
			}
		}

		function JSSPInit()
		{
			var html = [];
			global._includecallback = undefined;
			global._exports = undefined;
			global.echo = process.echo;
			global.exit = process.exit;

			global._runnext = function()
			{
				count = process._getActiveHandles().length + process._getActiveRequests().length;
				if(undefined==_runnext._count) _runnext._count=count;

				if(count>_runnext._count) { setTimeout(function(){ _runnext(); },5); return; }
				else _runnext._count=count;

				if(html.length) { process.nextTick(html.shift()); }
				else
				{
					if(_includecallback) _includecallback(_exports);
					else global.exit();
				}
			}
			global._arraypush = function(cb)
			{
				html.push(function(){ cb(); _runnext(); });
			}
			global._html2js = function(cb)
			{
				var str = cb.toString();
				var list= str.split('\n');

				list.shift(); list.pop();

				for(var i=0;i<list.length;i++) list[i] = list[i].substring(2);
				return list.join('\n');
			}
		}

		function PHPInit()
		{
			var urlobj  = url.parse(process.env['QUERY_STRING'],true);
			global.GET = global._GET = global.$_GET = urlobj.query;
			global.SERVER = global._SERVER = global.$_SERVER = process.env;
			global.ENV = global._ENV = global.$_ENV = process.env;

			global.header = function(name,value,responsecode)
			{
				SetHeader(name,value,responsecode,function(){});
			}
			global.headers_sent = function()
			{
				return headerssent;
			}
		}
	}
}

if(process.env.JSSP_FLAG)	//jssp child process
{
	var jsspcore = module.exports;
	var child = jsspcore.CreateChild();
}
else	//server
{
	var jsspcore = module.exports;
	var server = jsspcore.CreateServer();
	server.listen(8080,'0.0.0.0');
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

function jssp2js(str)
{
	var spliter = '----3141592652718281828----';
	var re = new RegExp(spliter,'g');
	str = str.replace(/\<\?/g,spliter+'/*<?*/');
	str = str.replace(/\?\>/g,'/*?>*/'+spliter);
	//str = str.replace(/session_start\( *\)/,'($_SESSION=session_start())');

	var list = str.split(spliter);
	for(var i=0;i<list.length;i++)
	{
		var ss = list[i];
		if(''==ss) continue;

		if('/*<?*/'==ss.substring(0,6))
		{
			ss = '_arraypush(function(){\n' + ss + '\n' + '});\n';
			list[i] = ss;
		}
		else
		{
			ss = '//'+ss.replace(/\n/g,'\n//');
			ss = '_arraypush(function(){\n'
				+'    echo(_html2js(function(){\n' + ss + '\n' +' }));\n'
				+'});\n';
			list[i] = ss;
		}
	}

	return list.join('\n');;
}


function renderjssp(code,filename)
{
	var __filename = filename;
	var __dirname = path.dirname(filename);

	eval(code);
	global._runnext();
}




