import {base64ToBytes,clean} from './source.mjs';
import {POLICY} from './policy.mjs';

export const MODEL='gpt-image-2.5-sunburst',VALIDATOR_MODEL='disabled';
export const GRID={width:2400,height:1200,rows:3,cols:6,cellWidth:400,cellHeight:400};
export const VALIDATION_POLICY={...POLICY,maxAttempts:1};
const IMAGE_URL='https://api.openai.com/v1/images/edits';
let magickPromise=null;
async function magick(){if(!magickPromise)magickPromise=(async()=>{const m=await import('npm:@imagemagick/magick-wasm@0.0.30');const wasm=await Deno.readFile(new URL('magick.wasm',import.meta.resolve('npm:@imagemagick/magick-wasm@0.0.30')));await m.initializeImageMagick(wasm);return m;})();return magickPromise;}
const copy=d=>new Uint8Array(d);

export async function prepareCell(source){const m=await magick(),bg=new m.MagickColor('#ECECEC');return m.ImageMagick.read(source.bytes,img=>{img.resize(new m.MagickGeometry(360,360));img.extent(400,400,m.Gravity.Center,bg);return img.write(m.MagickFormat.Png,d=>copy(d));});}
export async function composeSheet(cells){if(!Array.isArray(cells)||cells.length!==18)throw new Error('grid18_requires_18_cells');const [{PNG},{Buffer}]=await Promise.all([import('npm:pngjs@7.0.0'),import('node:buffer')]);const canvas=new PNG({width:GRID.width,height:GRID.height});for(let i=0;i<18;i++){const src=PNG.sync.read(Buffer.from(cells[i]));if(src.width!==400||src.height!==400)throw new Error(`grid18_cell_dimensions_${i+1}_${src.width}x${src.height}`);const row=Math.floor(i/6),col=i%6;for(let y=0;y<400;y++){const srcStart=y*400*4,srcEnd=srcStart+400*4,dstStart=((row*400+y)*GRID.width+col*400)*4;canvas.data.set(src.data.subarray(srcStart,srcEnd),dstStart);}}return new Uint8Array(PNG.sync.write(canvas,{colorType:6,inputColorType:6}));}
export async function cropCell(gridBytes,position){const m=await magick(),p=Number(position)-1,x=(p%6)*400,y=Math.floor(p/6)*400;let q=90;let out=m.ImageMagick.read(gridBytes,img=>{img.crop(new m.MagickGeometry(x,y,400,400));img.quality=q;return img.write(m.MagickFormat.WebP,d=>copy(d));});if(out.length>650000){q=82;out=m.ImageMagick.read(gridBytes,img=>{img.crop(new m.MagickGeometry(x,y,400,400));img.quality=q;return img.write(m.MagickFormat.WebP,d=>copy(d));});}return out;}

const GRID_PROMPT=`Edite a ÚNICA folha de referência enviada. Ela contém EXATAMENTE 18 células fixas em 3 linhas por 6 colunas. Cada célula deve continuar contendo exatamente o MESMO produto da referência daquela célula, sem trocar, misturar ou duplicar produtos. A referência visual é a verdade SOMENTE para identidade do produto: variante, embalagem, marca, logotipo, tampa, formato, proporções, cores e arte do rótulo. NÃO use a referência como verdade para ambiente, fundo, piso, parede, mesa, iluminação ambiente ou cenário.

Objetivo visual: fotografia comercial de produto ultrarrealista, limpa e profissional. Preserve textura real, bordas nítidas, impressão e logotipo visualmente fiéis, iluminação suave de estúdio, contraste natural e nitidez sem aparência artificial de render 3D.

REGRA ABSOLUTA EM CADA CÉLULA: mostre SOMENTE UM produto, inteiro da base ao topo e de uma lateral à outra, centralizado e com margem de segurança. Não corte tampa, alça, bico, cantos, base ou laterais. Não crie nem preserve mãos, objetos, alimentos decorativos, mesa, cenário, preço, texto promocional, segundo produto ou acessórios que não façam parte física do produto.

FUNDO OBRIGATÓRIO: remova completamente o fundo original e qualquer vestígio de parede, mesa, prateleira, piso, textura, gradiente, halo ou cenário. Substitua tudo ao redor do produto por fundo sólido, chapado e uniforme #ECECEC até os quatro cantos. Não usar fundo branco, degradê, vinheta, transparência, moldura ou borda branca. O único elemento adicional permitido é uma sombra de contato muito discreta e natural diretamente na base. Sem horizonte, pedestal ou reflexo espelhado.

Se a referência tiver fundo ruim ou elementos extras, use-a apenas para reconhecer o produto e reconstrua uma foto limpa de estúdio. Não invente detalhes nem mude variante. Preserve rigorosamente a posição das 18 células.`;

async function imageCall(key,form,prefix,max=14_000_000){const r=await fetch(IMAGE_URL,{method:'POST',headers:{Authorization:`Bearer ${key}`},body:form,signal:AbortSignal.timeout(115000)}),d=await r.json().catch(()=>({})),requestId=r.headers.get('x-request-id')||null;if(!r.ok)throw new Error(`${prefix}_http_${r.status}_${clean(d?.error?.code||d?.error?.message||'error',180)}`);const b64=clean(d?.data?.[0]?.b64_json,80_000_000);if(!b64)throw new Error(`${prefix}_empty_image`);const bytes=base64ToBytes(b64);if(!bytes.length||bytes.length>max)throw new Error(`${prefix}_output_size_${bytes.length}`);return{bytes,usage:d?.usage||{},requestId};}
export async function generateGrid(key,sheet){const f=new FormData();f.append('model',MODEL);f.append('prompt',GRID_PROMPT);f.append('size','2400x1200');f.append('quality','low');f.append('output_format','webp');f.append('output_compression','86');f.append('background','opaque');f.append('image[]',new Blob([sheet],{type:'image/png'}),'referencias-18.png');return imageCall(key,f,'openai_grid18');}

// Validação por IA desativada. A referência disponível segue diretamente para geração.
export async function inspectSource(_key,_product,source){return{accepted:true,inspection:{validator_disabled:true,manual_review:true},usage:{}};}

// Validação final por IA desativada. O resultado deve seguir para revisão/aprovação manual no Admin.
export async function validateGenerated(_key,_source,_candidate){return{accepted:true,validation:{validator_disabled:true,manual_review_required:true},usage:{}};}

export function generationCost(u){const ii=Number(u?.input_tokens_details?.image_tokens||0),ti=Number(u?.input_tokens_details?.text_tokens||0),io=Number(u?.output_tokens_details?.image_tokens||0);return Math.round((((ii*8)+(ti*5)+(io*30))/1e6)*1e6)/1e6;}
export function proratedGenerationUsage(u,d=18){return{input_tokens_details:{image_tokens:Number(u?.input_tokens_details?.image_tokens||0)/d,text_tokens:Number(u?.input_tokens_details?.text_tokens||0)/d},output_tokens_details:{image_tokens:Number(u?.output_tokens_details?.image_tokens||0)/d}};}
