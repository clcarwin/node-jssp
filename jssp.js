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

var jsbase = __dirname + '/';
var JSSPCoreInit   = require(jsbase + 'init.js');
var compilemachine = require(jsbase + 'compile.js');

module.exports = new JSSPCore();

var BaseDirectory  = './www/';
var MaxExecuteTime = 60*1000;//60 seconds
var MaxPostSize    = 20*1024*1024;//20MB
var ExternalObject = undefined;//set by external code
var GLOBAL_ENV     = {};
var GLOBAL_SESSIONS= {};
var option = {};
option.BaseDirectory   = BaseDirectory;
option.MaxExecuteTime  = MaxExecuteTime;
option.GLOBAL_ENV      = GLOBAL_ENV;
option.GLOBAL_SESSIONS = GLOBAL_SESSIONS;

function JSSPCore()
{
	this.CreateServer = function()
	{
		BaseDirectory = path.resolve(__dirname,BaseDirectory);
		var vmobj = CreateGlobalObject();
		var code = VMStart.toString()+';VMStart();'
		vm.runInNewContext(code,vmobj);
		Object.freeze(vmobj);	//disable to define global variable

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
					var code = compilemachine(data);

					process.emit('newpage',option,req,res,code,filename+'.js',postobj,fileobj);
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
		var $$T      = jssp.T;        var T = jssp.T;

		var $_GET    = jssp.$_GET;    var GET    = jssp.$_GET;
		var $_POST   = jssp.$_POST;	  var POST   = jssp.$_POST;	
		var $_FILE   = jssp.$_FILE;   var FILE   = jssp.$_FILE;
		var $_SERVER = jssp.$_SERVER; var SERVER = jssp.$_SERVER;
		var $_ENV    = jssp.$_ENV;    var ENV    = jssp.$_ENV;
		var set_time_limit     = jssp.set_time_limit;
		var header             = jssp.header;


		$$domainobj = jssp.domaincreate();
		try{
			new jssp.vm.Script(code,{filename:__filename+'.js'});	//Check Syntax Error 
			eval(code);
		}
		catch(e)
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

	process.on('newpage',function(option,req,res,code,codefilename,postobj,fileobj)
	{
		var jssp = JSSPCoreInit(option,req,res,code,codefilename,postobj,fileobj);
		EvalCode(code,jssp);
	});

	process.on('include',function(option,req,res,code,codefilename,jssp,includecallback)
	{
		var jsspnewobj = JSSPCoreInit(option,req,res,code,codefilename);
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