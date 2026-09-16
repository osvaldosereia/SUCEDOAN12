const PROCEDURAL=new Set(['circle','line','star','confetti','gradient','wave','grid','ray','shadow','label','box','pattern','particle','particles','scribble']);
const ALIASES=Object.freeze({
  confete:'confetti',confetes:'confetti',
  estrela:'star',estrelas:'star',
  gradiente:'gradient',gradientes:'gradient',
  particula:'particles',particulas:'particles',
  raio:'ray',raios:'ray',
  circulo:'circle',circulos:'circle',
  linha:'line',linhas:'line',
  onda:'wave',ondas:'wave',
  grade:'grid',grades:'grid',malha:'grid',malhas:'grid',
  sombra:'shadow',sombras:'shadow',
  etiqueta:'label',etiquetas:'label',
  caixa:'box',caixas:'box',
  padrao:'pattern',padroes:'pattern',
  rabisco:'scribble',rabiscos:'scribble'
});
const fold=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
export function normalizeAssetRequest(r={}){return{need:fold(r.need),keywords:[...new Set((r.keywords??[]).map(fold).filter(Boolean))],role:fold(r.role||'support'),actions:[...new Set((r.actions??[]).map(fold).filter(Boolean))],orientation:r.orientation??null,transparent:r.transparent??null}}
export function proceduralKind(r){const n=normalizeAssetRequest(r);for(const token of [n.need,...n.keywords].join(' ').split(/[^a-z0-9_-]+/).filter(Boolean)){const canonical=ALIASES[token]||token;if(PROCEDURAL.has(canonical))return canonical}return null}
