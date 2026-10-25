import { spawn, execFile } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { loadEpisodeManifest } from './manifest.mjs';
import { interpolateKeyframes } from './keyframes.mjs';
import { drawCharacter } from './character.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const run = (bin, args) => new Promise((resolve, reject) => {
  const child = spawn(bin, args, { windowsHide: true, stdio: ['ignore','ignore','pipe'] }); let err = '';
  child.stderr.on('data', d => { err += d.toString(); });
  child.on('error', e => reject(new Error(`${bin} could not start: ${e.message}`)));
  child.on('close', code => code === 0 ? resolve() : reject(new Error(`${bin} failed (${code}): ${err.slice(-1500)}`)));
});
const srtTime = (s) => { const ms = Math.round(s * 1000), h = Math.floor(ms/3600000), m = Math.floor(ms%3600000/60000), sec = Math.floor(ms%60000/1000), milli = ms%1000; return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')},${String(milli).padStart(3,'0')}`; };

export async function renderEpisode(manifestPath, options = {}) {
  const m = await loadEpisodeManifest(manifestPath);
  if (options.previewSeconds !== undefined && (!Number.isFinite(options.previewSeconds) || options.previewSeconds <= 0)) throw new Error('previewSeconds must be a finite positive number');
  let probe;
  try { probe = JSON.parse((await promisify(execFile)('ffprobe',['-v','error','-show_entries','format=duration:format_name:stream=codec_type,codec_name,sample_rate','-of','json',m.audio.narration])).stdout); }
  catch (e) { throw new Error(`Unable to read narration WAV ${m.audio.narration}: ${e.message}`); }
  const audioDuration = Number(probe.format?.duration);
  if (!probe.format?.format_name?.split(',').includes('wav') || !probe.streams?.some(s => s.codec_type === 'audio' && s.codec_name?.startsWith('pcm_'))) throw new Error(`Narration must be a readable PCM WAV file: ${m.audio.narration}`);
  if (!Number.isFinite(audioDuration) || audioDuration <= 0) throw new Error(`Narration has no readable duration: ${m.audio.narration}`);
  if (Math.abs(audioDuration - m.duration) > 0.15) throw new Error(`Shot duration (${m.duration.toFixed(2)}s) must match narration (${audioDuration.toFixed(2)}s) within 0.15s`);
  const duration = options.previewSeconds ? Math.min(audioDuration, Number(options.previewSeconds)) : audioDuration;
  const episodeFolder = path.dirname(path.resolve(manifestPath));
  const projectsRoot = path.join(root,'projects');
  const projectRelative = path.relative(projectsRoot,episodeFolder);
  const insideProjects = projectRelative !== '..' && !projectRelative.startsWith(`..${path.sep}`) && !path.isAbsolute(projectRelative);
  const uniqueFolder = insideProjects ? projectRelative : path.join(path.basename(path.dirname(episodeFolder)),`${path.basename(episodeFolder)}-${createHash('sha256').update(episodeFolder).digest('hex').slice(0,8)}`);
  const outDir = path.join(root,'output','engine',uniqueFolder);
  await mkdir(outDir,{recursive:true});
  const framesDir = path.join(outDir,`.frames-${Date.now()}`); await mkdir(framesDir,{recursive:true});
  const canvas = createCanvas(m.width,m.height), ctx = canvas.getContext('2d');
  const bgCache = new Map();
  try {
  for (const shot of m.shots) if (!bgCache.has(shot.background)) bgCache.set(shot.background,await loadImage(shot.background));
  const frameCount = Math.ceil(duration*m.fps);
  for (let i=0;i<frameCount;i++) {
    const t=i/m.fps, shot=m.shots.find(s=>t>=s.start && t<s.end) ?? m.shots.at(-1);
    const img=bgCache.get(shot.background), scale=Math.max(m.width/img.width,m.height/img.height), w=img.width*scale,h=img.height*scale;
    ctx.clearRect(0,0,m.width,m.height); ctx.drawImage(img,(m.width-w)/2,(m.height-h)/2,w,h);
    drawCharacter(ctx,m.character,interpolateKeyframes(shot.keyframes,Math.min(t-shot.start,shot.end-shot.start)));
    const cue=(m.captions??[]).find(c=>t>=c.start&&t<c.end);
    if (cue) drawCaption(ctx,cue.text,m.width,m.height);
    await writeFile(path.join(framesDir,`frame_${String(i).padStart(6,'0')}.png`),await canvas.encode('png'));
  }
  const output=path.resolve(options.outputPath??path.join(outDir,'episode.mp4')); await mkdir(path.dirname(output),{recursive:true});
  const srt=output.replace(/\.mp4$/i,'.srt');
  await writeFile(srt,(m.captions??[]).map((c,i)=>`${i+1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text}\n`).join('\n'),'utf8');
  await run('ffmpeg',['-y','-v','error','-framerate',String(m.fps),'-i',path.join(framesDir,'frame_%06d.png'),'-i',m.audio.narration,'-t',String(duration),'-c:v','libx264','-pix_fmt','yuv420p','-r',String(m.fps),'-c:a','aac','-b:a','192k','-movflags','+faststart',output]);
  return {outputPath:output,durationSeconds:duration,width:m.width,height:m.height,fps:m.fps,subtitlePath:srt};
  } finally { await rm(framesDir,{recursive:true,force:true}); }
}

function drawCaption(ctx,text,width,height) {
  const lines=text.split(/\n/);
  if(lines.length>2) throw new Error(`Caption exceeds supported two-line maximum: ${text}`);
  ctx.save(); ctx.font='bold 52px Arial'; ctx.textAlign='center'; ctx.textBaseline='middle';
  const y=height*0.82, lineH=62, max=width*0.86;
  if(lines.some(line=>ctx.measureText(line).width>max)) throw new Error(`Caption exceeds safe width: ${text}`);
  const widest=Math.max(...lines.map(line=>ctx.measureText(line).width)), boxH=lines.length*lineH+28;
  ctx.fillStyle='rgba(0,0,0,0.62)'; ctx.beginPath(); ctx.roundRect((width-widest)/2-24,y-boxH/2,widest+48,boxH,16); ctx.fill();
  ctx.fillStyle='white'; lines.forEach((line,i)=>ctx.fillText(line,width/2,y+(i-(lines.length-1)/2)*lineH)); ctx.restore();
}

if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const manifest=process.argv[2]; if(!manifest){console.error('Usage: node scripts/engine/render-episode.mjs <episode.json> [--preview-seconds N] [--output FILE]');process.exit(2);}
  const args=process.argv.slice(3), val=(flag)=>{const i=args.indexOf(flag);return i<0?undefined:args[i+1];};
  if(args.includes('--preview-seconds')&&!val('--preview-seconds')){console.error('--preview-seconds requires a positive numeric value');process.exit(2);}
  const previewValue=val('--preview-seconds');
  renderEpisode(manifest,{previewSeconds:previewValue===undefined?undefined:Number(previewValue),outputPath:val('--output')}).then(result=>console.log(JSON.stringify(result,null,2))).catch(e=>{console.error(e.message);process.exitCode=1;});
}
