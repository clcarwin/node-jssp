module.exports = whileformachine;

function whileformachine(js)
{
	var result = '';

	var s = 'space';//idle space w wh whi whil while 
					//f fo for for1 for1q1 for1q2 for1q1s for1q2s 
					//q1 q2 q1s q2s
	var bracecount = 0;
	function put(c)
	{
		result += c;
		switch(s)
		{
			case 'idle':
				if( (' '==c)||('\t'==c)||('\n'==c)||('\r'==c)||(';'==c)||('}'==c) ) s='space'; else
				if("'"==c) s='q1'; else
				if('"'==c) s='q2'; else
				s = 'idle';
			break;
			case 'space':
				if('w'==c) s='w';  else
				if('f'==c) s='f';  else
				if( (' '==c)||('\t'==c)||('\n'==c)||('\r'==c)||(';'==c)||('}'==c) ) s='space'; else
				s = 'idle';
			break;
			case 'q1':
				if('\\'==c) s='q1s'; else
				if("'"==c) s='idle';
			break;
			case 'q1s':
				s = 'q1';
			break;
			case 'q2':
				if('\\'==c) s='q2s'; else
				if('"'==c) s='idle';
			break;
			case 'q2s':
				s = 'q2';
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
				if('('==c)
				{
					result += '$$tick(),';
					s = 'idle';
				} else
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
				if('('==c) { s='for1'; bracecount=0; } else
				s = 'idle';
			break;
			case 'for1':
				if("'"==c) s='for1q1'; else
				if('"'==c) s='for1q2'; else
				if('{'==c) bracecount++; else
				if('}'==c) bracecount--; else
				if( (';'==c)&&(bracecount==0) )
				{
					result += '$$tick(),';
					s = 'idle';
				}
			break;
			case 'for1q1':
				if('\\'==c) s='for1q1s'; else
				if("'"==c) s='for1';
			break;
			case 'for1q2':
				if('\\'==c) s='for1q2s'; else
				if('"'==c) s='for1';
			break;
			case 'for1q1s':
				s = 'for1q1';
			break;
			case 'for1q2s':
				s = 'for1q2';
			break;
			case 'q1':
				if("'"==c) s='idle';
			break;
			case 'q2':
				if('"'==c) s='idle';
			break;
		}
	}

	for(var i=0;i<js.length;i++) put(js[i]);
	return result;
}