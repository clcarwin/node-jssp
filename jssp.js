var fs = require('fs');
var exec = require('child_process').exec;
var url = require('url');
var http = require('http');
var vm = require('vm');
var path = require('path');
var util = require('util');
var querystring = require('querystring');

var jsbase = __dirname + '/';
var JSSPCoreInit   = require(jsbase + 'core.js');
var compilemachine = require(jsbase + 'compile.js');

module.exports = new JSSPCore();



function JSSPCore()
{
	this.CreateServer = function()
	{
		var options = {};
		options.BASE      = path.resolve(__dirname,'www');
		options.EXECTIME  = 60*1000;
		options.TICKTIME  = 1*1000;
		options.POSTSIZE  = 128*1024*1024;
		options.ENV       = {};
		options.EXT       = {};
		options.SESSIONS  = {};
		options.CODECACHE = {};
		options.CODEFUNC  = {};

		for(var key in process.env) options.ENV[key] = process.env[key];
		options.codebyname = function(filename)
		{
			var watchcb = function(error_event,undefined_filename)
			{
				delete options.CODECACHE[filename];
				delete options.CODEFUNC[filename];
				watcher.close();
			};

			var code = options.CODECACHE[filename];
			if(!code)
			{
				var stats;
				try{ code = fs.readFileSync(filename,{'encoding':'utf8'}) }catch(e){ return e; }
				try{ stats = fs.statSync(filename) }catch(e){ return e; }
				code = compilemachine(code);
				options.CODECACHE[filename] = code;
				var watcher = fs.watch(filename);
				watcher.on('error',watchcb);
				watcher.on('change',watchcb);
			}

			//fs.writeFileSync(filename+'.js',code);//debug
			return code;
		}

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

		var ext = path.extname(filename);
		if('.jssp'===ext)
		{
			var code = options.codebyname(filename);
			if(code.stack) { return cb(code); }	//code is an Error

			var jssp = JSSPCoreInit(options,req,res,postobj,fileobj,code,filename);
			try{
				var htmlpagecache = options.CODEFUNC[filename];
				var htmlpage;
				if(htmlpagecache) htmlpage = htmlpagecache;
				else htmlpage = new vm.runInNewContext(code,{"console":console},{filename:filename+'.js'});
				htmlpage(jssp);

				if(!htmlpagecache) options.CODEFUNC[filename] = htmlpage;
			}
			catch(e)
			{ jssp.errorformat(e,jssp.internalexit); jssp=undefined; };

			if(jssp) jssp.runnext();
		}
		else
		{
			var defaultname = path.resolve(options.BASE,'./_default.jssp');
			postobj['REQUEST']=path.relative(options.BASE,filename);
			ServerFile(defaultname,options,req,res,postobj,fileobj);
		}
	}
}

function postparse(req,postbuffer,postobj,fileobj)
{
	var contenttype = req.headers['content-type'];

	if('application/x-www-form-urlencoded'==contenttype.slice(0,33))
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
