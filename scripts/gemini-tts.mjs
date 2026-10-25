import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const endpoint='https://generativelanguage.googleapis.com/v1beta/interactions';
const allowed=new Set(['gemini-3.8-flash-tts','gemini-3.8-flash-lite-tts']);
function usage(){return 'Usage: node scripts/gemini-tts.mjs --request <request.json> --output <audio.wav> --allow-network';}
function safeError(message){throw new Error(message);}

export async function generateSpeech({requestPath,outputPath,allowNetwork=false}) {
  if(!allowNetwork) safeError('Gemini TTS makes a billable network request. Re-run with --allow-network after checking model access, price, quota, billing, voice, transcript, and delivery.');
  const key=process.env.GEMINI_API_KEY;
  if(!key) safeError('GEMINI_API_KEY is not set in this process environment.');
  const request=JSON.parse(await readFile(requestPath,'utf8'));
  if(!allowed.has(request.model)) safeError(`Unsupported model. Choose: ${[...allowed].join(', ')}.`);
  if(typeof request.voice!=='string'||!request.voice.trim()) safeError('request.voice must name the approved TTS voice.');
  if(!Array.isArray(request.turns)||!request.turns.length) safeError('request.turns must contain at least one approved transcript turn.');
  const input=request.turns.map((turn,index)=>{
    if(typeof turn.text!=='string'||!turn.text.trim()) safeError(`turns[${index}].text must contain the exact spoken words.`);
    const part={type:'text',text:turn.text};
    if(turn.style!==undefined){if(typeof turn.style!=='string'||!turn.style.trim()) safeError(`turns[${index}].style must be a nonempty sustained delivery description.`);part.annotations=[{type:'speech_metadata',style:turn.style}];}
    return {type:'user_input',content:[part]};
  });
  const output=path.resolve(outputPath), receipt=`${output}.receipt.json`;
  if(!output.toLowerCase().endsWith('.wav')) safeError('Output path must end in .wav.');
  await mkdir(path.dirname(output),{recursive:true});
  for(const file of [output,receipt]) { try { await access(file); safeError(`Output already exists: ${file}`); } catch(e) { if(e.code!=='ENOENT') throw e; } }
  const payload={model:request.model,input,generation_config:{speech_config:[{voice:request.voice}]},response_format:{type:'audio'}};
  let response;
  try { response=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json','x-goog-api-key':key},body:JSON.stringify(payload)}); }
  catch { safeError('Gemini TTS request failed before a response was received. Check network access; no automatic retry was made.'); }
  if(!response.ok) { const status=response.status; await response.body?.cancel(); safeError(`Gemini TTS rejected the request (HTTP ${status}). Provider details were withheld; no automatic retry was made.`); }
  let body;
  try { body=await response.json(); } catch { safeError('Gemini TTS returned an unreadable response; no output was written.'); }
  const encoded=body?.output_audio?.data;
  if(typeof encoded!=='string'||!encoded.length) safeError('Gemini TTS response did not contain output_audio.data; no output was written.');
  const wav=Buffer.from(encoded,'base64');
  if(wav.length<44||wav.toString('ascii',0,4)!=='RIFF'||wav.toString('ascii',8,12)!=='WAVE') safeError('Gemini TTS response was not a valid WAV payload; no output was written.');
  await writeFile(output,wav,{flag:'wx'});
  await writeFile(receipt,JSON.stringify({model:request.model,voice:request.voice,requestedAt:new Date().toISOString(),outputPath:output},null,2)+'\n',{flag:'wx'});
  return {outputPath:output,receiptPath:receipt,bytes:wav.length};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),value=(flag)=>{const i=args.indexOf(flag);return i<0?undefined:args[i+1];};
 if(args.includes('--help')){console.log(usage());process.exit(0);}
 const requestPath=value('--request'),outputPath=value('--output');
 if(!requestPath||!outputPath){console.error(usage());process.exit(2);}
 generateSpeech({requestPath,outputPath,allowNetwork:args.includes('--allow-network')}).then(x=>console.log(JSON.stringify(x,null,2))).catch(e=>{console.error(e.message);process.exitCode=1;});
}
