var fs = require('fs');
var path = require('path');

//usage
//var fs = require('./fakehfs.js')(jssp);

module.exports = function(jssp)
{
	function CreateStub(key)
	{
		return function()
		{
			for(var i=0;i<arguments.length;i++)
			{
				if(typeof arguments[i] === 'function')
				{
					arguments[i] = CreateCallback(arguments[i]);
				}
			}

			if(typeof arguments[0] === 'string')
			{ arguments[0] = PathNormal(arguments[0]) }

			if( (key=='rename')||(key=='renameSync')||(key=='link')||(key=='linkSync')||
				(key=='symlink')||(key=='symlinkSync') )
			{ arguments[1] = PathNormal(arguments[1]) }

			fs[key].apply(null,arguments);
		}
	}

	function CreateCallback(cb)
	{
		var flag  = true;
		var newcb = function()
		{
			if(flag)
			{
				cb.apply(null,arguments);
				jssp.objectdel(newcb);
			}
		}
		newcb.jsspclose = function(){ flag = false;};
		jssp.objectadd(newcb);
		return newcb;
	}

	function PathNormal(filename)
	{
		var rel = '';
		if( ('/'==filename[0])||('\\'==filename[0]) )
			filename = path.relative(jssp.BASE,filename);
		else filename = './' + filename;

		filename = path.normalize('/'+filename); //delete .. in filename
		filename = path.resolve(jssp.BASE,'./'+filename);
		return filename;
	}


	var obj = {};
	for(var key in fs)
	{
		obj[key] = CreateStub(key);
	}

	return obj;
};