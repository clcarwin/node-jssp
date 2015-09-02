module.exports = sessionmachine;

function sessionmachine(js)
{
	var s = 'space';//idle space s sr srt stok
					//q1 q2 slash
	var stack = [];
	function put(c,index)
	{
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
				if('s'==c) s='s';  else
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
			case 's':
				if('r'==c) s='sr'; else
				if( ('_'==c)||( (c>='a')&&(c<='z') )) {} else
				{ s='idle'; }
			break;
			case 'sr':
				if('t'==c)
				{
					if('session_start'==js.slice(index+1-13,index+1)) s='srt';
					else s='idle';
				} else
				if( ('_'==c)||( (c>='a')&&(c<='z') )) {} else
				{ s='idle'; }
			break;
			case 'srt':
				if( (' '==c)||('\t'==c)||('\n'==c)||('\r'==c) ) {} else
				if('('==c) s='stok'; else
				{ s='idle'; }
			break;
			case 'stok':
			break;
		}
	}

	for(var i=0;i<js.length;i++) put(js[i],i);
	return s=='stok';
}
