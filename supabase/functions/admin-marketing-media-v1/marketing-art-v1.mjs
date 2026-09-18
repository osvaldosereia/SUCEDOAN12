export const clean=(v,max=1000)=>String(v??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
export const num=(v,f=0)=>Number.isFinite(Number(v))?Number(v):f;
const xml=(v)=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"}[c]||c));
const wrapText=(input,maxChars,maxLines)=>{
  const words=clean(input,500).split(" ").filter(Boolean),lines=[];let line="";
  for(const w of words){const next=line?line+" "+w:w;if(next.length>maxChars&&line){lines.push(line);line=w}else line=next;if(lines.length>=maxLines)break}
  if(lines.length<maxLines&&line)lines.push(line);
  if(lines.length===maxLines&&lines.join(" ").length<input.length-3)lines[maxLines-1]=lines[maxLines-1].replace(/[.,;:!?]*$/,"")+"…";
  return lines.slice(0,maxLines);
};
const tspans=(lines,x,y,lineHeight)=>lines.map((l,i)=>`<tspan x="${x}" y="${y+i*lineHeight}">${xml(l)}</tspan>`).join("");
const brl=(v)=>num(v).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});

export function artSvg(opts={}){
  const width=num(opts.width,1080),height=num(opts.height,1080),p=opts.product||{};
  const headline=clean(opts.headline||"Oferta Dona Antônia",140),name=clean(p.name||"",180),cta=clean(opts.cta||"Peça na Dona Antônia",120);
  const imageDataUri=opts.imageDataUri||"",offer=Boolean(p.is_offer)&&num(p.effective_price)<num(p.price);
  const price=brl(p.effective_price||p.price),old=offer?brl(p.price):"";
  const tall=height>width*1.25,top=tall?160:90,imgTop=tall?470:330,imgH=tall?760:470,x=tall?76:68,bottom=height-(tall?300:220);
  const head=wrapText(headline,tall?27:31,3),names=wrapText(name,tall?31:36,2);
  const badge=offer?`<rect x="${x}" y="${top-54}" width="170" height="48" rx="24" fill="#D9773D"/><text x="${x+85}" y="${top-21}" text-anchor="middle" font-family="Arial,DejaVu Sans,sans-serif" font-size="24" font-weight="700" fill="#fff">OFERTA</text>`:"";
  const oldPrice=offer?`<text x="${x}" y="${bottom+105}" font-family="Arial,DejaVu Sans,sans-serif" font-size="${tall?30:25}" fill="#7A7A72" text-decoration="line-through">${xml(old)}</text>`:"";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#F5F2EA"/>
  <circle cx="${width-100}" cy="80" r="${tall?220:160}" fill="#E8E2D4"/><circle cx="40" cy="${height-80}" r="${tall?260:190}" fill="#E7EEE9"/>
  ${badge}
  <text x="${x}" y="${top}" font-family="Arial,DejaVu Sans,sans-serif" font-size="${tall?58:50}" font-weight="700" fill="#173F2A">${tspans(head,x,top,tall?68:58)}</text>
  <rect x="${x}" y="${imgTop}" width="${width-x*2}" height="${imgH}" rx="42" fill="#fff"/>
  <image href="${imageDataUri}" x="${x+38}" y="${imgTop+34}" width="${width-x*2-76}" height="${imgH-68}" preserveAspectRatio="xMidYMid meet"/>
  <text x="${x}" y="${bottom}" font-family="Arial,DejaVu Sans,sans-serif" font-size="${tall?34:30}" font-weight="600" fill="#3A443E">${tspans(names,x,bottom,tall?42:36)}</text>
  ${oldPrice}
  <text x="${x}" y="${bottom+(offer?175:115)}" font-family="Arial,DejaVu Sans,sans-serif" font-size="${tall?72:60}" font-weight="800" fill="#111827">${xml(price)}</text>
  <rect x="${x}" y="${height-155}" width="${width-x*2}" height="78" rx="39" fill="#173F2A"/>
  <text x="${width/2}" y="${height-105}" text-anchor="middle" font-family="Arial,DejaVu Sans,sans-serif" font-size="${tall?30:26}" font-weight="700" fill="#fff">${xml(cta.slice(0,56))}</text>
  <text x="${x}" y="${height-28}" font-family="Arial,DejaVu Sans,sans-serif" font-size="24" font-weight="700" fill="#173F2A">Dona Antônia</text>
  </svg>`;
}
export function textSlideSvg(width,height,headline,cta){
  const lines=wrapText(headline,25,4);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#173F2A"/><circle cx="${width-70}" cy="120" r="240" fill="#244F38"/><circle cx="80" cy="${height-80}" r="300" fill="#244F38"/>
  <text x="74" y="260" font-family="Arial,DejaVu Sans,sans-serif" font-size="70" font-weight="800" fill="#fff">${tspans(lines,74,260,84)}</text>
  <text x="74" y="${height-180}" font-family="Arial,DejaVu Sans,sans-serif" font-size="35" font-weight="700" fill="#F5F2EA">${xml(cta)}</text>
  <text x="74" y="${height-75}" font-family="Arial,DejaVu Sans,sans-serif" font-size="30" font-weight="700" fill="#fff">Dona Antônia</text></svg>`;
}
