module.exports = tplmachine;

function tplmachine(html)
{
	var str = '';
	var tpllist = [];
	var arrlist = [];
	var result  = '';

	var s = 'idle';//idle slash
		//lb lbb lbbb lbbbb rbbbb rbbb rbb rb
	var stack = [];
	var lbbbbflag =false;

	function put(c)
	{
		switch(s)
		{
			case 'idle':
				if('\\'==c) { stack.push(s);s='slash';return; } else
				if('{'==c) { s='lb';return; } else
				{ s='idle'; str+=c; }
			break;
			case 'slash':
				s=stack.pop(s);
				str+='\\'+c;
			break;
			case 'lb':
				if('{'==c) { tplpushtxt(str);str='';tplend();s='lbb'; } else
				if('\\'==c) { stack.push('idle');s='slash';return; } else
				{ s='idle'; str+='{'+c; }
			break;
			case 'lbb':
				if('{'==c) s='lbbb'; else
				if('}'==c) s='rbb'; else
				if('\\'==c) { stack.push(s);s='slash';return; } else
				str += c;
			break;
			case 'lbbb':
				if('{'==c) { tplpushtxt(str);str='';s='lbbbb';lbbbbflag=true; } else
				if('\\'==c) { stack.push('lbb');s='slash';return; } else
				{ s='lbb'; str+='{'+c; }
			break;
			case 'lbbbb':
				if('}'==c) s='rbbbb'; else
				if('\\'==c) { stack.push(s);s='slash';return; } else
				str += c;
			break;
			case 'rbb':
				if('}'==c)
				{
					if(lbbbbflag) tplpushtxt(str); else tplpushname(str);
					lbbbbflag = false;
					str = '';
					tplend();
					s = 'rb';
					s = 'idle';
				} else
				if('\\'==c)
				{
					if(lbbbbflag) stack.push('rbbb'); else stack.push('lbb');
					s='slash';
				} else
				{
					if(lbbbbflag) s='rbbb'; else s='lbb';
					str += '}'+c;
				}
			break;
			case 'rbbb':
				if('}'==c) s='rbb'; else
				if('{'==c) s='lbbb'; else
				str += c;
			break;
			case 'rbbbb':
				if('}'==c) { tplpushname(str);str='';s='rbbb';} else
				if('\\'==c) { stack.push('lbbbb');s='slash';return; } else
				{ s='lbbbb'; str+='}'+c; }
			break;
		}
	}

	function tplpushtxt(str)
	{
		if(!str) return;
		if( (str.indexOf('\\')<0)&&(str.indexOf("'")<0)&&(str.indexOf('\n')<0) )
		{
			str = "echo('"+str+"');";
		}
		else
		{
			str =  '//'+str.replace(/\n/g,'\n//');
			str = 'echo(function(){\n'+str+'\n});\n';
		}
		tpllist.push(str);
	}

	function tplpushname(str)
	{
		str = str.replace('[]','[i]');
		var index = str.indexOf('[i]');
		if(index>=0) arrlist.push('$$TPL.'+str.slice(0,index));

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









