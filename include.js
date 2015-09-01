module.exports = includemachine;

function includemachine(js)
{
	var result = '';
	var includecount = 0;

	var s = 'space';//idle space i in inc incl inclu includ include include1
					//q1 q2 slash
	var stack = [];
	function put(c)
	{
		result += c;
		switch(s)
		{
			case 'idle':
				if( (' '==c)||('\t'==c)||('\n'==c)||('\r'==c)||(';'==c) ) s='space'; else
				if("'"==c) { stack.push(s);s='q1'; } else
				if('"'==c) { stack.push(s);s='q2'; } else
				if('{'==c) { stack.push('space');s='space'; } else
				if('}'==c) { s=stack.pop(); } else
				if('('==c) { stack.push(s);s='space'; } else
				if(')'==c) { s=stack.pop(); } else
				{ s='idle'; }
			break;
			case 'space':
				if('i'==c) s='i';  else
				if( (' '==c)||('\t'==c)||('\n'==c)||('\r'==c)||(';'==c) ) s='space'; else
				if("'"==c) { stack.push(s);s='q1'; } else
				if('"'==c) { stack.push(s);s='q2'; } else
				if('{'==c) { stack.push('space');s='space'; } else
				if('}'==c) { s=stack.pop(); } else
				if('('==c) { stack.push(s);s='space'; } else
				if(')'==c) { s=stack.pop(); } else
				{ s='idle'; }
			break;
			case 'q1':
				if('\\'==c) { stack.push(s);s='slash'; } else
				if("'"==c) s=stack.pop();
			break;
			case 'q2':
				if('\\'==c) { stack.push(s);s='slash'; } else
				if('"'==c) s=stack.pop();
			break;
			case 'slash':
				s=stack.pop();
			break;
			case 'i':
				if('n'==c) s='in'; else
				s = 'idle';
			break;
			case 'in':
				if('c'==c) s='inc'; else
				s = 'idle';
			break;
			case 'inc':
				if('l'==c) s='incl'; else
				s = 'idle';
			break;
			case 'incl':
				if('u'==c) s='inclu'; else
				s = 'idle';
			break;
			case 'inclu':
				if('d'==c) s='includ'; else
				s = 'idle';
			break;
			case 'includ':
				if('e'==c) s='include'; else
				s = 'idle';
			break;
			case 'include':
				if( (' '==c)||('\t'==c)||('\n'==c)||('\r'==c) ) s='include'; else
				if('('==c) s='include1'; else
				s = 'idle';
			break;
			case 'include1':
				if("'"==c) { stack.push(s);s='q1'; } else
				if('"'==c) { stack.push(s);s='q2'; } else
				if('{'==c) { stack.push(s);s='space'; } else
				if('('==c) { stack.push(s);s='idle'; } else
				if(')'==c)
				{
					result=result.slice(0,-1)+',function(){\n\t'; includecount++;
					s='idle';
				} else
				{ /* pass and do nothing */ }
			break;
		}
		//console.log(c,s);
	}

	for(var i=0;i<js.length;i++) put(js[i]);
	for(var i=0;i<includecount;i++) result+='\n\t});'
	return result;
}