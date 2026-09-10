import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const MAX_DIMENSION = 2160;
const MAX_LAYERS = 24;
const SAFE_FONTS = new Set(['Arial','Helvetica','sans-serif','Georgia','serif']);

function fail(message){ throw new Error(message); }
function clamp(n,min,max){ return Math.min(max,Math.max(min,n)); }
function escXml(v=''){ return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c])); }
function num(v,fallback){ const n=Number(v); return Number.isFinite(n)?n:fallback; }
function safeColor(v,fallback='#ffffff'){ const s=String(v||'').trim(); return /^(#[0-9a-fA-F]{3,8}|rgba?\([0-9.,% ]+\)|[a-zA-Z]{3,20})$/.test(s)?s:fallback; }
function safeFont(v){ const s=String(v||'Arial'); return SAFE_FONTS.has(s)?s:'Arial'; }
function localPath(p,base){
  const raw=String(p||'').trim();
  if(!raw) fail('source path required');
  if(/^https?:\/\//i.test(raw)||raw.includes('\0')) fail('remote or unsafe source path blocked');
  const resolved=path.resolve(base,raw);
  const root=path.resolve(base)+path.sep;
  if(resolved!==path.resolve(base)&&!resolved.startsWith(root)) fail('source path escapes working directory');
  return resolved;
}
function validateSpec(spec){
  if(!spec||typeof spec!=='object') fail('invalid spec');
  const width=Math.round(num(spec.width,1080)),height=Math.round(num(spec.height,1080));
  if(width<320||height<320||width>MAX_DIMENSION||height>MAX_DIMENSION) fail('canvas out of bounds');
  const layers=Array.isArray(spec.layers)?spec.layers:[];
  if(layers.length>MAX_LAYERS) fail('too many layers');
  return {...spec,width,height,layers};
}
function textSvg(layer,canvas){
  const x=clamp(num(layer.x,0),0,canvas.width),y=clamp(num(layer.y,0),0,canvas.height);
  const width=clamp(num(layer.width,canvas.width-x),1,canvas.width-x||1);
  const size=clamp(num(layer.fontSize,48),10,240);
  const weight=String(layer.fontWeight||'700').replace(/[^0-9a-z-]/gi,'');
  const anchor=layer.align==='center'?'middle':layer.align==='right'?'end':'start';
  const tx=anchor==='middle'?x+width/2:anchor==='end'?x+width:x;
  const lines=String(layer.text||'').slice(0,600).split(/\n/).slice(0,8);
  const lineHeight=clamp(num(layer.lineHeight,1.12),0.8,2)*size;
  const tspans=lines.map((line,i)=>`<tspan x="${tx}" dy="${i?lineHeight:0}">${escXml(line)}</tspan>`).join('');
  return Buffer.from(`<svg width="${canvas.width}" height="${canvas.height}" xmlns="http://www.w3.org/2000/svg"><text x="${tx}" y="${y+size}" text-anchor="${anchor}" font-family="${escXml(safeFont(layer.fontFamily))}" font-size="${size}" font-weight="${escXml(weight)}" fill="${escXml(safeColor(layer.color,'#111827'))}">${tspans}</text></svg>`);
}
function rectSvg(layer,canvas){
  const x=clamp(num(layer.x,0),0,canvas.width),y=clamp(num(layer.y,0),0,canvas.height);
  const width=clamp(num(layer.width,canvas.width-x),1,canvas.width-x||1),height=clamp(num(layer.height,canvas.height-y),1,canvas.height-y||1);
  const radius=clamp(num(layer.radius,0),0,Math.min(width,height)/2);
  return Buffer.from(`<svg width="${canvas.width}" height="${canvas.height}" xmlns="http://www.w3.org/2000/svg"><rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="${escXml(safeColor(layer.fill,'#ffffff'))}"/></svg>`);
}
async function render(specInput,{baseDir=process.cwd(),outputPath}={}){
  const spec=validateSpec(specInput);
  const background=safeColor(spec.background,'#f2f2f2');
  let canvas=sharp({create:{width:spec.width,height:spec.height,channels:4,background}});
  const composites=[];
  for(const layer of spec.layers){
    if(!layer||layer.hidden) continue;
    if(layer.type==='image'){
      const source=localPath(layer.src,baseDir);
      const width=Math.round(clamp(num(layer.width,spec.width),1,spec.width));
      const height=Math.round(clamp(num(layer.height,spec.height),1,spec.height));
      const fit=['contain','cover','fill','inside','outside'].includes(layer.fit)?layer.fit:'contain';
      const buf=await sharp(source).rotate().resize({width,height,fit,background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();
      composites.push({input:buf,left:Math.round(clamp(num(layer.x,0),0,Math.max(0,spec.width-width))),top:Math.round(clamp(num(layer.y,0),0,Math.max(0,spec.height-height))),blend:'over'});
    }else if(layer.type==='text') composites.push({input:textSvg(layer,spec),left:0,top:0,blend:'over'});
    else if(layer.type==='rect') composites.push({input:rectSvg(layer,spec),left:0,top:0,blend:'over'});
    else fail(`unsupported layer type: ${layer.type}`);
  }
  canvas=canvas.composite(composites);
  const quality=Math.round(clamp(num(spec.quality,82),50,95));
  const effort=Math.round(clamp(num(spec.effort,5),0,6));
  const out=outputPath||path.resolve(baseDir,String(spec.output||'marketing-output.webp'));
  await fs.mkdir(path.dirname(out),{recursive:true});
  const info=await canvas.webp({quality,effort,smartSubsample:true}).toFile(out);
  return {ok:true,output:out,width:info.width,height:info.height,size:info.size,format:info.format,external_side_effect:false,ai_used:false};
}

async function cli(){
  const args=process.argv.slice(2); const specIdx=args.indexOf('--spec'),outIdx=args.indexOf('--out');
  if(specIdx<0||!args[specIdx+1]) fail('usage: node scripts/marketing-render-deterministic-v1.mjs --spec file.json [--out file.webp]');
  const specPath=path.resolve(args[specIdx+1]); const raw=JSON.parse(await fs.readFile(specPath,'utf8'));
  const result=await render(raw,{baseDir:path.dirname(specPath),outputPath:outIdx>=0&&args[outIdx+1]?path.resolve(args[outIdx+1]):undefined});
  process.stdout.write(JSON.stringify(result)+'\n');
}
if(import.meta.url===`file://${process.argv[1]}`) cli().catch(e=>{console.error(e.message);process.exit(1)});
export {render,validateSpec};
