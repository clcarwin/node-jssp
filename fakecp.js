var cp = require('child_process');

module.exports = function(jssp)
{
	function cpstub(key)
	{
		return function()
		{
			var child = cp[key].apply(null,arguments);
			child.jsspclose = child.kill;
			child.on('exit',function(){ jssp.objectdel(child);});
			jssp.objectadd(child);
			return child;
		}
	}

	var obj = {};
	for(var key in cp) obj[key] = cpstub(key);
	return obj;
}