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



function JSSPCore()
{
	this.CreateServer = function()
	{
		var options = {};
		options.BASE      = path.resolve(__dirname,'www');
		options.EXECTIME  = 60*1000;
		options.POSTSIZE  = 128*1024*1024;
		options.ENV       = {};
		options.EXT       = {};
		options.SESSIONS  = {};
		options.CODECACHE = {};
		options.CODEMTIME = {};

		var vmobj = CreateGlobalObject();
		var code = VMStart.toString()+';VMStart();'
		vm.runInNewContext(code,vmobj);
		Object.freeze(vmobj);	//disable to define global variable

		for(var key in process.env) options.ENV[key] = process.env[key];

		var server = http.createServer(function (req, res) 
		{
			RenderPage(options,req,res);
		});

		server.setopt = function(op)
		{
			for(var key in op) options[key] = op[key];
			options.BASE   = path.resolve(__dirname,options.BASE);
		}
		server.setext = function(name,value)
		{
			options.EXT[name] = value;
		}
		server.command = function(filename)
		{
			server.close();
			filename = path.resolve(filename);

			var res=process.stdout;
			res.setHeader = function(){};
			var req={};
			req.url     = 'file://'+filename;
			req.socket  = {};
			req.headers = {};

			ServerFile(filename,options,req,res,{},{});
		}
		return server;
	}

	function RenderPage(options,req,res)
	{
		var urlparse = url.parse(req.url,true);
		var filename = urlparse.pathname;
		if( (!filename)||('/'==filename) ) filename = 'index.jssp';
		filename = path.normalize('/'+filename); //delete .. in filename
		filename = path.resolve(options.BASE,'./'+filename);

		if('POST'==req.method)
		{
			var chunklist = [];
			var size = 0;
			req.on('data',function(chunk)
			{
				chunklist.push(chunk);
				size += chunk.length;
				if(size>options.POSTSIZE)
				{ chunklist=[];return res.end('EXCEED POSTSIZE') }
			});
			req.on('error',function(){});
			req.on('end',function()
			{
				var postobj={}, fileobj={};
				try{ postparse(req,Buffer.concat(chunklist),postobj,fileobj);
				}catch(e){ return res.end('POST DATA PARSE ERROR') }

				ServerFile(filename,options,req,res,postobj,fileobj);
			});
		}
		else
		{
			ServerFile(filename,options,req,res,{},{});
		}
	}

	function ServerFile(filename,options,req,res,postobj,fileobj)
	{
		var cb = function(err)
		{
			if( (''+err).indexOf('ENOENT')>=0 ) res.write('<h1>404 Not Found</h1>');
			var str = '<p>'+err+'</p>';
			var dir = path.normalize(__dirname+path.sep+'..');
			res.end(str.replace(dir,'...'));
		}

		var stats;
		try{ stats = fs.statSync(filename) }catch(e){ cb(e);return; }
		if('.jssp'!=path.extname(filename))
		{
			res.setHeader('Content-Length', stats.size);
			fs.createReadStream(filename).on('error',function(){}).pipe(res);
		}
		else
		{
			var code;
			var time = options.CODEMTIME[filename];
			if(time!==stats.mtime.getTime())
			{
				try{ code = fs.readFileSync(filename,{'encoding':'utf8'}) }
				catch(e){ cb(e);return; }
				code = compilemachine(code);
				options.CODECACHE[filename] = code;
				options.CODEMTIME[filename] = stats.mtime.getTime();
			}
			else { code = options.CODECACHE[filename]; }
			process.emit('newpage',options,req,res,postobj,fileobj,code,filename);
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

function postparse(req,postbuffer,postobj,fileobj)
{
	var contenttype = req.headers['content-type'];

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
	function EvalCode(code,jssp)
	{
		var process   = undefined;
		var JSSPCoreInit = undefined;
		var console   = undefined;
		var VMStart   = undefined;
		var EvalCode  = undefined;

		var __filename= jssp.__filename;
		var __FILE__  = jssp.__filename;
		var __dirname = jssp.__dirname;
		var __DIR__   = jssp.__dirname;
		var __code    = jssp.__code;
		var __CODE__  = jssp.__code;

		var require        = jssp.require;
		var Buffer         = jssp.Buffer;
		var setTimeout     = jssp.setTimeout;
		var setInterval    = jssp.setInterval;
		var clearTimeout   = jssp.clearTimeout;
		var clearInterval  = jssp.clearInterval;
		var render         = jssp.render;
		var module         = jssp.module;
		var exports        = jssp.module.exports;

		var $$arraypush    = jssp.arraypush;
		var $$tick         = jssp.tick;
		var $$T      = jssp.T;        var T      = jssp.T;
		var $_EXT    = jssp.EXT;      var EXT    = jssp.EXT;

		var $_SESSION=undefined;      var SESSION=undefined;
		var $_GET    = jssp.$_GET;    var GET    = jssp.$_GET;
		var $_POST   = jssp.$_POST;	  var POST   = jssp.$_POST;	
		var $_FILE   = jssp.$_FILE;   var FILE   = jssp.$_FILE;
		var $_SERVER = jssp.$_SERVER; var SERVER = jssp.$_SERVER;
		var $_ENV    = jssp.$_ENV;    var ENV    = jssp.$_ENV;
		var echo               = jssp.echo;
		var exit               = jssp.exit;
		var include            = jssp.include;
		var set_time_limit     = jssp.set_time_limit;
		var header             = jssp.header;
		var headers_sent       = jssp.headers_sent;
		var session_start      = jssp.session_start;
		var session_id         = jssp.session_id;
		var session_destroy    = jssp.session_destroy;
		var session_unset      = jssp.session_unset;


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

	process.on('newpage',function(options,req,res,postobj,fileobj,code,filename)
	{
		var jssp = JSSPCoreInit(options,req,res,postobj,fileobj,code,filename);
		jssp.EvalCode = EvalCode;
		EvalCode(code,jssp);
	});
}


if(require.main === module)
{
	//run without be required
	var argv = process.argv;
	var port = '8080';
	var ip   = '0.0.0.0';
	var base = 'www';
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
		if(isNaN(parseInt(port))) { server.command(port) }
		else{ server.listen(port,ip); server.setopt({"BASE":base}) }
	}
}