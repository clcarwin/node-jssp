var net = require('net');

//usage
//var net = require('./fakehnet.js')(jssp);

module.exports = function(jssp)
{
	obj = {};
	obj.connect = function()
	{
		var socket = net.connect.apply(null,arguments);
		socket.on('close',function(){ jssp.objectdel(socket); });

		socket.jsspclose = function(){ socket.destroy(); }
		jssp.objectadd(socket);
		return socket;
	};
	obj.createConnection = function()
	{
		var socket = net.createConnection.apply(null,arguments);
		socket.on('close',function(){ jssp.objectdel(socket); });

		socket.jsspclose = function(){ socket.destroy(); }
		jssp.objectadd(socket);
		return socket;
	};

	return obj;
};