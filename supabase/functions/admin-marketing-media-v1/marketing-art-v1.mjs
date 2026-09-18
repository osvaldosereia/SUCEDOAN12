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

function layout(width,height,hasHeadline){
  const ratio=height/width;
  const tall=ratio>=1.55, medium=!tall&&ratio>=1.25;
  const x=Math.round(width*(tall?.07:.064));
  const badgeY=Math.round(height*(tall?.045:.04));
  const headlineY=Math.round(height*(tall?.11:medium?.105:.12));
  const imageY=Math.round(height*(hasHeadline?(tall?.23:medium?.24:.275):(tall?.13:medium?.14:.19)));
  const imageH=Math.round(height*(hasHeadline?(tall?.39:medium?.39:.39):(tall?.50:medium?.49:.47)));
  return {
    tall,medium,x,badgeY,headlineY,imageY,imageH,
    headlineSize:tall?58:medium?48:50,
    headlineLine:tall?66:medium?56:58,
    headlineChars:tall?27:medium?29:31,
    headlineLines:tall?3:2,
    nameY:Math.round(height*(tall?.665:medium?.69:.69)),
    nameSize:tall?36:medium?31:30,
    nameLine:tall?44:medium?38:36,
    oldY:Math.round(height*(tall?.725:medium?.755:.75)),
    oldSize:tall?31:medium?27:25,
    priceY:Math.round(height*(tall?.795:medium?.83:.82)),
    priceSize:tall?78:medium?66:60,
    ctaY:Math.round(height*(tall?.86:medium?.89:.865)),
    ctaH:Math.round(height*(tall?.055:medium?.063:.065)),
    ctaSize:tall?32:medium?28:26,
    footerY:Math.round(height*(tall?.978:medium?.978:.975))
  };
}
function visualCta(cta){
  const t=clean(cta,140);
  if(/whatsapp/i.test(t))return "Peça pelo WhatsApp";
  if(/site|compre/i.test(t))return "Compre com a Dona Antônia";
  return t.slice(0,34)||"Peça na Dona Antônia";
}

export function artSvg(opts={}){
  const width=num(opts.width,1080),height=num(opts.height,1080),p=opts.product||{};
  const headline=clean(opts.headline||"",140),name=clean(p.name||"",180),cta=visualCta(opts.cta);
  const imageDataUri=opts.imageDataUri||"",offer=Boolean(p.is_offer)&&num(p.effective_price)<num(p.price);
  const price=brl(p.effective_price||p.price),old=offer?brl(p.price):"";
  const l=layout(width,height,Boolean(headline));
  const head=wrapText(headline,l.headlineChars,l.headlineLines),names=wrapText(name,l.tall?31:l.medium?34:36,2);
  const badgeW=l.tall?180:165,badgeH=l.tall?52:46;
  const badge=offer?`<rect x="${l.x}" y="${l.badgeY}" width="${badgeW}" height="${badgeH}" rx="${badgeH/2}" fill="#D9773D"/><text x="${l.x+badgeW/2}" y="${l.badgeY+badgeH*.68}" text-anchor="middle" font-family="Arial,DejaVu Sans,sans-serif" font-size="${l.tall?25:22}" font-weight="800" fill="#fff">OFERTA</text>`:"";
  const oldPrice=offer?`<text x="${l.x}" y="${l.oldY}" font-family="Arial,DejaVu Sans,sans-serif" font-size="${l.oldSize}" fill="#74746E">de ${xml(old)}</text>`:"";
  const imageX=l.x,imageW=width-l.x*2;
  const imageInset=Math.max(30,Math.round(width*.035));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#F6F3EA"/>
  <circle cx="${width-65}" cy="${Math.round(height*.075)}" r="${Math.round(width*(l.tall?.18:.16))}" fill="#E7E1D3"/>
  <circle cx="${Math.round(width*.03)}" cy="${Math.round(height*.91)}" r="${Math.round(width*(l.tall?.22:.19))}" fill="#E4EEE8"/>
  ${badge}
  ${headline?`<text x="${l.x}" y="${l.headlineY}" font-family="Arial,DejaVu Sans,sans-serif" font-size="${l.headlineSize}" font-weight="800" fill="#173F2A">${tspans(head,l.x,l.headlineY,l.headlineLine)}</text>`:""}
  <rect x="${imageX}" y="${l.imageY}" width="${imageW}" height="${l.imageH}" rx="${l.tall?44:36}" fill="#FFFFFF"/>
  <image href="${imageDataUri}" x="${imageX+imageInset}" y="${l.imageY+imageInset}" width="${imageW-imageInset*2}" height="${l.imageH-imageInset*2}" preserveAspectRatio="xMidYMid meet"/>
  <text x="${l.x}" y="${l.nameY}" font-family="Arial,DejaVu Sans,sans-serif" font-size="${l.nameSize}" font-weight="700" fill="#37433C">${tspans(names,l.x,l.nameY,l.nameLine)}</text>
  ${oldPrice}
  <text x="${l.x}" y="${l.priceY}" font-family="Arial,DejaVu Sans,sans-serif" font-size="${l.priceSize}" font-weight="900" fill="#111827">${xml(price)}</text>
  <rect x="${l.x}" y="${l.ctaY}" width="${width-l.x*2}" height="${l.ctaH}" rx="${l.ctaH/2}" fill="#173F2A"/>
  <text x="${width/2}" y="${l.ctaY+l.ctaH*.65}" text-anchor="middle" font-family="Arial,DejaVu Sans,sans-serif" font-size="${l.ctaSize}" font-weight="800" fill="#fff">${xml(cta)}</text>
  <text x="${l.x}" y="${l.footerY}" font-family="Arial,DejaVu Sans,sans-serif" font-size="${l.tall?25:22}" font-weight="800" fill="#173F2A">Dona Antônia</text>
  <text x="${width-l.x}" y="${l.footerY}" text-anchor="end" font-family="Arial,DejaVu Sans,sans-serif" font-size="${l.tall?22:19}" fill="#59655E">donaantonia.com.br</text>
  </svg>`;
}

export function textSlideSvg(width,height,headline,cta){
  const x=Math.round(width*.07),lines=wrapText(headline,height/width>=1.2?24:28,4),button=visualCta(cta);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#173F2A"/>
  <circle cx="${width-70}" cy="${Math.round(height*.09)}" r="${Math.round(width*.22)}" fill="#24523A"/>
  <circle cx="${Math.round(width*.02)}" cy="${Math.round(height*.93)}" r="${Math.round(width*.26)}" fill="#24523A"/>
  <text x="${x}" y="${Math.round(height*.20)}" font-family="Arial,DejaVu Sans,sans-serif" font-size="${Math.round(width*.065)}" font-weight="900" fill="#fff">${tspans(lines,x,Math.round(height*.20),Math.round(width*.078))}</text>
  <rect x="${x}" y="${Math.round(height*.80)}" width="${width-x*2}" height="${Math.round(height*.07)}" rx="${Math.round(height*.035)}" fill="#F6F3EA"/>
  <text x="${width/2}" y="${Math.round(height*.845)}" text-anchor="middle" font-family="Arial,DejaVu Sans,sans-serif" font-size="${Math.round(width*.028)}" font-weight="800" fill="#173F2A">${xml(button)}</text>
  <text x="${x}" y="${Math.round(height*.95)}" font-family="Arial,DejaVu Sans,sans-serif" font-size="${Math.round(width*.025)}" font-weight="800" fill="#fff">Dona Antônia</text>
  <text x="${width-x}" y="${Math.round(height*.95)}" text-anchor="end" font-family="Arial,DejaVu Sans,sans-serif" font-size="${Math.round(width*.021)}" fill="#DDE8E1">donaantonia.com.br</text>
  </svg>`;
}
