module.exports = tplmachine;

function tplmachine(html)
{
	var l  = 0;	//{ count
	var ll = 0;	//{{ count
	var r  = 0;
	var rr = 0;

	var str = '';
	var tpllist = [];
	var arrlist = [];
	var result  = '';

	function put(c)
	{
		if('{'==c) { if(ll<2) l++; } else
		if('}'==c) { if(ll>0) r++; }
		else
		{
			if(l) {l=0;str+='{';}
			if(r) {r=0;str+='}';}
			str += c;
		}

		if(2==l)
		{
			l=0;ll++;
			if(1==ll){ tplpushtxt(str); str=''; tplend(); }		//0->1
			if(2==ll){ tplpushtxt(str); str=''; }				//1->2
		}
		if(2==r)
		{
			r=0;ll--;
			if(0==ll)
			{
				if(tpllist.length){ tplpushtxt(str) }	//2->1->0
				else{ tplpushname(str) }				//1->0
				str='';
				tplend();
			}
			if(1==ll){ tplpushname(str); str=''; }		//2->1
		}
	}


	function tplpushtxt(str)
	{
		if(str.length>0)
		{
			str =  '//'+str.replace(/\n/g,'\n//');
			str = 'echo(function(){\n'+str+'\n});\n';
			tpllist.push(str);
		}
	}
	function tplpushname(str)
	{
		if( (str.indexOf('[')>=0)&&(str.indexOf(']')>=0) )
		{
			var arr = str.replace('[]','');
			arr = arr.replace('[i]','');
			arrlist.push('$$TPL.'+arr);
			str = arr + '[i]';
		}

		str = 'echo($$TPL.'+str+');\n';
		tpllist.push(str);
	}
	function tplend()
	{
		var js = '';
		if(tpllist.length==0) { js = ''; }
		else if(tpllist.length>1)
		{
			if(arrlist.length) arrlist.push(arrlist[0]+'.length');
			else arrlist.push('1');
			js += 'for(var i=0;i<Math.min('+arrlist.join('.length,')+');i++)\n{\n';
			js += tpllist.join('');
			js += '\n}\n';
		}
		else { js = tpllist[0]; }
		tpllist.splice(0, tpllist.length);
		arrlist.splice(0, arrlist.length);

		result += js;
	}

	for(var i=0;i<html.length;i++) put(html[i]);
	tplpushtxt(str); tplend();

	result = '$$arraypush(function(){\n'+result+'});\n';
	return result;
}