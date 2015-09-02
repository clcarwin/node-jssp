var fs = require('fs');
var path = require('path');

//usage
//var fs = require('./fakehfs.js')(jssp);

module.exports = function(jssp)
{
	function fsstub(key)
	{
		return function()
		{
			var a = arguments;
			for(var i=0;i<a.length;i++)
			if(typeof a[i] === 'function') { a[i]=fscb(a[i]) }

			if(typeof a[0] === 'string') { a[0]=PathNormal(a[0]) }

			if( (key=='rename')||(key=='renameSync')||(key=='link')||(key=='linkSync')||
				(key=='symlink')||(key=='symlinkSync') )
			{ a[1] = PathNormal(a[1]) }

			fs[key].apply(null,a);
		}
	}

	function fscb(cb)
	{
		var flag  = true;
		var newcb = function()
		{
			if(flag) cb.apply(null,arguments);
			jssp.objectdel(newcb);
		}
		newcb.jsspclose = function(){ flag=false };
		jssp.objectadd(newcb);
		return newcb;
	}

	function PathNormal(filename)
	{
		if(filename[0]==='/') return filename;
		else return path.resolve(jssp.BASE,'./'+filename);
	}


	var obj = {};
	for(var key in fs)
	{
		obj[key] = fsstub(key);
	}

	return obj;
};