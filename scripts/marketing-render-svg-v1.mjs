import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const MAX_DIMENSION=2160;
const MAX_LAYERS=24;
const MAX_TEXT_LENGTH=600;
const SAFE_IMAGE_MIME=Object.freeze({'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp'});
const SAFE_FONTS=new Set(['Arial','Helvetica','Georgia','serif','sans-serif']);

function fail(message){throw new Error(message)}
function number(value,fallback){const n=Number(value);return Number.isFinite(n)?n:fallback}
function clamp(value,min,max){return Math.min(max,Math.max(min,value))}
function xml(value=''){return String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[ch]))}
function safeColor(value,fallback='#ffffff'){const v=String(value??'').trim();return /^(#[0-9a-fA-F]{3,8}|rgba?\([0-9.,% ]+\)|[a-zA-Z]{3,20})$/.test(v)?v:fallback}
function safeFont(value){const v=String(value||'Arial');return SAFE_FONTS.has(v)?v:'Arial'}
function safeWeight(value){const n=Math.round(number(value,700));return clamp(n,100,900)}
function stable(value){if(Array.isArray(value))return value.map(stable);if(!value||typeof value!=='object')return value;return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])]))}
function digest(value){return createHash('sha256').update(JSON.stringify(stable(value))).digest('hex').slice(0,32)}
function localSource(source,baseDir){
  const raw=String(source??'').trim();
  if(!raw)fail('source_required');
  if(/^https?:\/\//i.test(raw))fail('remote_source_forbidden');
  if(raw.includes('\0'))fail('unsafe_source_path');
  const root=path.resolve(baseDir);
  const resolved=path.resolve(root,raw);
  if(resolved!==root&&!resolved.startsWith(root+path.sep))fail('source_path_escape');
  const mime=SAFE_IMAGE_MIME[path.extname(resolved).toLowerCase()];
  if(!mime)fail('unsupported_image_format');
  return {resolved,mime};
}
function localOutput(outputPath,baseDir){
  const root=path.resolve(baseDir);
  const resolved=path.resolve(outputPath||path.join(root,'marketing-output.svg'));
  if(resolved!==root&&!resolved.startsWith(root+path.sep))fail('output_path_escape');
  return resolved;
}

export function validateMarketingSvgSpec(input){
  if(!input||typeof input!=='object'||Array.isArray(input))fail('invalid_spec');
  const width=Math.round(number(input.width,1080));
  const height=Math.round(number(input.height,1080));
  if(width<320||height<320||width>MAX_DIMENSION||height>MAX_DIMENSION)fail('canvas_out_of_bounds');
  const layers=Array.isArray(input.layers)?input.layers:[];
  if(layers.length>MAX_LAYERS)fail('too_many_layers');
  for(const layer of layers){
    if(!layer||typeof layer!=='object')fail('invalid_layer');
    if(!['rect','text','image'].includes(layer.type))fail('unsupported_layer_type');
  }
  return {...input,width,height,layers};
}

function rectMarkup(layer,canvas){
  const x=clamp(number(layer.x,0),0,canvas.width);
  const y=clamp(number(layer.y,0),0,canvas.height);
  const width=clamp(number(layer.width,canvas.width-x),1,Math.max(1,canvas.width-x));
  const height=clamp(number(layer.height,canvas.height-y),1,Math.max(1,canvas.height-y));
  const radius=clamp(number(layer.radius,0),0,Math.min(width,height)/2);
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="${xml(safeColor(layer.fill,'#ffffff'))}"/>`;
}
function textMarkup(layer,canvas){
  const x=clamp(number(layer.x,0),0,canvas.width);
  const y=clamp(number(layer.y,0),0,canvas.height);
  const width=clamp(number(layer.width,canvas.width-x),1,Math.max(1,canvas.width-x));
  const size=clamp(number(layer.fontSize,48),10,240);
  const align=layer.align==='center'?'middle':layer.align==='right'?'end':'start';
  const tx=align==='middle'?x+width/2:align==='end'?x+width:x;
  const lines=String(layer.text??'').slice(0,MAX_TEXT_LENGTH).split(/\n/).slice(0,8);
  const lineHeight=clamp(number(layer.lineHeight,1.12),0.8,2)*size;
  const spans=lines.map((line,index)=>`<tspan x="${tx}" dy="${index?lineHeight:0}">${xml(line)}</tspan>`).join('');
  return `<text x="${tx}" y="${y+size}" text-anchor="${align}" font-family="${xml(safeFont(layer.fontFamily))}" font-size="${size}" font-weight="${safeWeight(layer.fontWeight)}" fill="${xml(safeColor(layer.color,'#111827'))}">${spans}</text>`;
}
async function imageMarkup(layer,canvas,baseDir){
  const {resolved,mime}=localSource(layer.src,baseDir);
  const bytes=await fs.readFile(resolved);
  const x=clamp(number(layer.x,0),0,canvas.width);
  const y=clamp(number(layer.y,0),0,canvas.height);
  const width=clamp(number(layer.width,canvas.width-x),1,Math.max(1,canvas.width-x));
  const height=clamp(number(layer.height,canvas.height-y),1,Math.max(1,canvas.height-y));
  const fit=layer.fit==='cover'?'xMidYMid slice':'xMidYMid meet';
  const alt=String(layer.alt??'').slice(0,160);
  return `<image x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="${fit}" href="data:${mime};base64,${bytes.toString('base64')}"${alt?` aria-label="${xml(alt)}"`:''}/>`;
}

export async function renderMarketingSvg(input,{baseDir=process.cwd(),outputPath}={}){
  const spec=validateMarketingSvgSpec(input);
  const pieces=[`<svg width="${spec.width}" height="${spec.height}" viewBox="0 0 ${spec.width} ${spec.height}" role="img">`,`<rect width="${spec.width}" height="${spec.height}" fill="${xml(safeColor(spec.background,'#f2f2f2'))}"/>`];
  for(const layer of spec.layers){
    if(layer.hidden)continue;
    if(layer.type==='rect')pieces.push(rectMarkup(layer,spec));
    else if(layer.type==='text')pieces.push(textMarkup(layer,spec));
    else pieces.push(await imageMarkup(layer,spec,baseDir));
  }
  pieces.push('</svg>');
  const svg=pieces.join('');
  const output=localOutput(outputPath,baseDir);
  await fs.mkdir(path.dirname(output),{recursive:true});
  await fs.writeFile(output,svg,'utf8');
  return {
    ok:true,
    output,
    width:spec.width,
    height:spec.height,
    size:Buffer.byteLength(svg),
    format:'svg',
    ai_used:false,
    external_side_effect:false,
    network_allowed:false,
    idempotency_key:`marketing-render-svg-v1:${digest({width:spec.width,height:spec.height,background:safeColor(spec.background,'#f2f2f2'),layers:spec.layers,svg})}`
  };
}

async function cli(){
  const args=process.argv.slice(2);
  const specIndex=args.indexOf('--spec');
  const outIndex=args.indexOf('--out');
  if(specIndex<0||!args[specIndex+1])fail('usage: node scripts/marketing-render-svg-v1.mjs --spec file.json [--out file.svg]');
  const specPath=path.resolve(args[specIndex+1]);
  const baseDir=path.dirname(specPath);
  const spec=JSON.parse(await fs.readFile(specPath,'utf8'));
  const outputPath=outIndex>=0&&args[outIndex+1]?path.resolve(args[outIndex+1]):undefined;
  const result=await renderMarketingSvg(spec,{baseDir,outputPath});
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if(import.meta.url===`file://${process.argv[1]}`)cli().catch(error=>{console.error(error.message);process.exit(1)});
