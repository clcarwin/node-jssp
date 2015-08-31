module.exports = whileformachine;

function whileformachine(js)
{
	var result = '';

	var s = 'space';//idle space w wh whi whil while 
					//f fo for for1 for1end
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
				if('('==c) { stack.push(s);s='idle'; } else
				if(')'==c) { s=stack.pop(); } else
				{ s='idle'; }
			break;
			case 'space':
				if('w'==c) s='w';  else
				if('f'==c) s='f';  else
				if( (' '==c)||('\t'==c)||('\n'==c)||('\r'==c)||(';'==c) ) s='space'; else
				if('{'==c) { stack.push(s);s='space'; } else
				if('}'==c) { s=stack.pop(); } else
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
			case 'w':
				if('h'==c) s='wh'; else
				s = 'idle';
			break;
			case 'wh':
				if('i'==c) s='whi'; else
				s = 'idle';
			break;
			case 'whi':
				if('l'==c) s='whil'; else
				s = 'idle';
			break;
			case 'whil':
				if('e'==c) s='while'; else
				s = 'idle';
			break;
			case 'while':
				if('('==c) { result+='$$tick(),';stack.push('idle');s='idle'; } else
				if( (' '==c)||('\t'==c)||('\n'==c)||('\r'==c) ) s='while'; else
				s = 'idle';
			break;
			case 'f':
				if('o'==c) s='fo'; else
				s = 'idle';
			break;
			case 'fo':
				if('r'==c) s='for'; else
				s = 'idle';
			break;
			case 'for':
				if( (' '==c)||('\t'==c)||('\n'==c)||('\r'==c) ) s='for'; else
				if('('==c) { stack.push('idle');s='for1'; } else
				s = 'idle';
			break;
			case 'for1':
				if("'"==c) { stack.push(s);s='q1'; } else
				if('"'==c) { stack.push(s);s='q2'; } else
				if('{'==c) { stack.push(s);s='space'; } else
				if('('==c) { stack.push(s);s='idle'; } else
				if(')'==c) { s=stack.pop();  } else				/*for( var key in object)*/
				if(';'==c) { result+='$$tick(),';s='for1end'; } else
				{ /* pass and do nothing */ }
			break;
			case 'for1end':
				if(';'==c) { result=result.slice(0,-1)+'1;'; } else		/*for(;;) -> for(;$$tick(),1;)*/
				s = 'idle';
			break;
		}
	}

	for(var i=0;i<js.length;i++) put(js[i]);
	return result;
}