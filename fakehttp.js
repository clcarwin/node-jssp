var http = require('http');

//usage
//var http = require('./fakehttp.js')(jssp);

module.exports = function(jssp)
{
	obj = {};
	obj.request = function()
	{
		var req = http.request.apply(this,arguments);
		var resobj = undefined;
		req.on('socket',function(socket)
		{
			socket.on('close',function(){ jssp.objectdel(req); });
		});
		req.on('response',function(res)
		{
			resobj = res;
			res.on('end',function(){ if(resobj)jssp.objectdel(req); resobj=undefined; });
		});

		req.jsspclose = function(){ req.abort(); if(resobj)resobj.emit('end'); }
		jssp.objectadd(req);
	}
	obj.get = function()
	{
		var req = http.get.apply(this,arguments);
		var resobj = undefined;
		req.on('socket',function(socket)
		{
			socket.on('close',function(){ jssp.objectdel(req); });
		});
		req.on('response',function(res)
		{
			resobj = res;
			res.on('end',function(){ if(resobj)jssp.objectdel(req); resobj=undefined; });
		});

		req.jsspclose = function(){ req.abort(); if(resobj)resobj.emit('end'); }
		jssp.objectadd(req);
	}

	return obj;
};