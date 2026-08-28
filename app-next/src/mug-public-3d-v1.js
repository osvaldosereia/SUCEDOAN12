const BUILD='20260828-mug-public-3d-v1';
const FIREBASE_PRODUCTS='https://cedar-chemist-310801-default-rtdb.firebaseio.com/produtos';
const THREE_URL='https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';
let routeToken=0;
let threePromise=null;
let activeViewer=null;

const text=v=>String(v??'').trim();
const esc=v=>text(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
const isUrl=v=>/^https?:\/\//i.test(text(v));

function routeKey(){const m=String(location.hash||'').match(/^#\/produto\/([^/?#]+)/i);return m?decodeURIComponent(m[1]):'';}
function truthy(v){return v===true||v===1||['1','true','sim','yes'].includes(text(v).toLowerCase());}
function isMug(raw={}){const cat=text(raw.categoria||raw.category).toLowerCase();return truthy(raw.modelo_caneca)||truthy(raw.produto_sob_encomenda)||cat.includes('caneca');}
function artUrl(raw={}){const print=raw.arte_impressao;const candidates=[raw.arte_horizontal,raw.arte_personalizacao,print&&typeof print==='object'?print.url:print,raw.art_url,raw.arte_url];return candidates.map(text).find(isUrl)||'';}

function installStyles(){
 if(document.getElementById('daMug3dStyles'))return;
 const s=document.createElement('style');s.id='daMug3dStyles';s.textContent=`
 .da-mug-showcase{display:grid;gap:12px}.da-mug-previews{display:grid;grid-template-columns:1fr 1fr;gap:10px}.da-mug-preview{position:relative;margin:0;border-radius:16px;overflow:hidden;background:linear-gradient(145deg,#f7f6f2,#ecebe6);border:1px solid #e2e1db;aspect-ratio:1;display:grid;place-items:center}.da-mug-preview img{width:100%;height:100%;object-fit:cover;display:block}.da-mug-preview figcaption{position:absolute;left:9px;bottom:9px;padding:5px 8px;border-radius:999px;background:rgba(18,20,18,.78);color:#fff;font-size:10px;font-weight:800;backdrop-filter:blur(5px)}
 .da-mug-preview-loading{font-size:12px;color:#73766f;text-align:center;padding:18px}.da-mug-360-button{min-height:50px;border:0;border-radius:13px;background:#1c211d;color:#fff;font:inherit;font-weight:850;cursor:pointer;display:flex;justify-content:center;align-items:center;gap:8px}.da-mug-360-button:disabled{opacity:.5;cursor:wait}.da-mug-360-hint{text-align:center;font-size:11px;color:#6d716b;margin:-4px 0 0}.da-mug-viewer{display:none;position:relative;aspect-ratio:1;border-radius:18px;overflow:hidden;background:radial-gradient(circle at 50% 28%,#fff,#e8e7e1 72%);border:1px solid #deddd7;touch-action:none}.da-mug-viewer.active{display:block}.da-mug-viewer canvas{width:100%!important;height:100%!important;display:block}.da-mug-viewer-badge{position:absolute;left:10px;top:10px;z-index:2;padding:6px 9px;border-radius:999px;background:rgba(255,255,255,.86);font-size:10px;font-weight:850;color:#323630;box-shadow:0 4px 18px rgba(0,0,0,.08)}.da-mug-viewer-reset{position:absolute;right:10px;top:10px;z-index:2;border:0;border-radius:999px;background:rgba(27,30,27,.84);color:white;padding:7px 10px;font-size:11px;font-weight:800;cursor:pointer}.da-mug-preview-error{grid-column:1/-1;padding:14px;border-radius:12px;background:#f4f4f1;color:#656961;font-size:12px;text-align:center}
 .mug-result-mockups{display:none!important}.da-mug-result-showcase{margin-top:10px}
 @media(max-width:560px){.da-mug-previews{gap:7px}.da-mug-preview{border-radius:13px}.da-mug-360-button{min-height:52px}}
 `;document.head.appendChild(s);
}

async function getThree(){if(!threePromise)threePromise=import(THREE_URL);return threePromise;}

async function loadTexture(THREE,url){return new Promise((resolve,reject)=>{const loader=new THREE.TextureLoader();loader.setCrossOrigin('anonymous');loader.load(url,t=>{t.colorSpace=THREE.SRGBColorSpace;t.wrapS=THREE.RepeatWrapping;t.anisotropy=8;resolve(t);},undefined,reject);});}

function buildScene(THREE,texture,width=720,height=720){
 const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));renderer.setSize(width,height,false);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
 const scene=new THREE.Scene();scene.background=new THREE.Color(0xf2f0ea);
 const camera=new THREE.PerspectiveCamera(28,width/height,.1,100);camera.position.set(0,.15,8.6);camera.lookAt(0,0,0);
 const root=new THREE.Group();scene.add(root);
 const ceramic=new THREE.MeshPhysicalMaterial({color:0xffffff,roughness:.16,metalness:0,clearcoat:1,clearcoatRoughness:.12,ior:1.47,specularIntensity:.72});
 const body=new THREE.Mesh(new THREE.CylinderGeometry(1.52,1.47,3.55,96,6,false),ceramic);body.castShadow=true;body.receiveShadow=true;root.add(body);
 const insideMat=new THREE.MeshPhysicalMaterial({color:0xf8f8f6,roughness:.2,clearcoat:.8,side:THREE.DoubleSide});
 const inner=new THREE.Mesh(new THREE.CylinderGeometry(1.34,1.34,.08,96,1,false),insideMat);inner.position.y=1.77;root.add(inner);
 const rim=new THREE.Mesh(new THREE.TorusGeometry(1.515,.075,24,96),ceramic);rim.rotation.x=Math.PI/2;rim.position.y=1.79;rim.castShadow=true;root.add(rim);
 const handle=new THREE.Mesh(new THREE.TorusGeometry(.95,.18,28,72,Math.PI*1.72),ceramic);handle.scale.set(.78,1.05,1);handle.position.set(1.52,.05,0);handle.rotation.z=-Math.PI*.14;handle.castShadow=true;root.add(handle);
 const artMat=new THREE.MeshPhysicalMaterial({map:texture,roughness:.23,metalness:0,clearcoat:.72,clearcoatRoughness:.18,transparent:true});
 const artShell=new THREE.Mesh(new THREE.CylinderGeometry(1.531,1.481,2.78,96,1,true),artMat);artShell.position.y=-.02;artShell.rotation.y=Math.PI;root.add(artShell);
 const floorMat=new THREE.MeshStandardMaterial({color:0xe5e2da,roughness:.94});const floor=new THREE.Mesh(new THREE.PlaneGeometry(20,20),floorMat);floor.rotation.x=-Math.PI/2;floor.position.y=-1.9;floor.receiveShadow=true;scene.add(floor);
 const hemi=new THREE.HemisphereLight(0xffffff,0xb6afa2,2.5);scene.add(hemi);
 const key=new THREE.DirectionalLight(0xffffff,5.1);key.position.set(-4,6,5);key.castShadow=true;key.shadow.mapSize.set(1024,1024);scene.add(key);
 const fill=new THREE.DirectionalLight(0xdfe8ff,2.1);fill.position.set(5,2,4);scene.add(fill);
 const rimLight=new THREE.PointLight(0xffefe0,45,12,2);rimLight.position.set(-4,1,-4);scene.add(rimLight);
 return {renderer,scene,camera,root,texture};
}

function renderFrame(bundle,rotation=0){bundle.root.rotation.y=rotation;bundle.renderer.render(bundle.scene,bundle.camera);}
function disposeBundle(bundle){if(!bundle)return;bundle.scene.traverse(o=>{if(o.geometry)o.geometry.dispose?.();if(o.material){const arr=Array.isArray(o.material)?o.material:[o.material];arr.forEach(m=>m.dispose?.());}});bundle.texture?.dispose?.();bundle.renderer?.dispose?.();}

async function generatePreviews(art){
 const THREE=await getThree();const texture=await loadTexture(THREE,art);const bundle=buildScene(THREE,texture,640,640);
 try{renderFrame(bundle,-.72);const left=bundle.renderer.domElement.toDataURL('image/webp',.9);renderFrame(bundle,.72);const right=bundle.renderer.domElement.toDataURL('image/webp',.9);return{left,right};}finally{disposeBundle(bundle);}
}

function showcaseHtml(){return `<div class="da-mug-showcase" data-da-mug-showcase="1"><div class="da-mug-previews"><figure class="da-mug-preview" data-preview="left"><div class="da-mug-preview-loading">Preparando vista esquerda…</div><figcaption>Lado esquerdo</figcaption></figure><figure class="da-mug-preview" data-preview="right"><div class="da-mug-preview-loading">Preparando vista direita…</div><figcaption>Lado direito</figcaption></figure></div><button class="da-mug-360-button" type="button" data-open-360>↻ Ver caneca em 360°</button><p class="da-mug-360-hint">Arraste para girar · use dois dedos ou a roda para aproximar</p><div class="da-mug-viewer" data-mug-viewer><span class="da-mug-viewer-badge">360°</span><button class="da-mug-viewer-reset" type="button" data-reset-360>Centralizar</button></div></div>`;}

async function startViewer(host,art){
 if(activeViewer){activeViewer.dispose();activeViewer=null;}
 const button=host.querySelector('[data-open-360]');const viewer=host.querySelector('[data-mug-viewer]');button.disabled=true;button.textContent='Carregando 360°…';
 try{
  const THREE=await getThree();const texture=await loadTexture(THREE,art);const size=Math.max(320,Math.min(900,viewer.clientWidth||640));const bundle=buildScene(THREE,texture,size,size);viewer.appendChild(bundle.renderer.domElement);viewer.classList.add('active');button.textContent='360° carregado';button.hidden=true;
  let rotation=0,zoom=8.6,drag=false,lastX=0,raf=0,disposed=false;
  const draw=()=>{raf=0;if(disposed)return;bundle.camera.position.z=zoom;renderFrame(bundle,rotation);};const requestDraw=()=>{if(!raf)raf=requestAnimationFrame(draw);};
  const down=e=>{drag=true;lastX=e.clientX;viewer.setPointerCapture?.(e.pointerId);};const move=e=>{if(!drag)return;rotation+=(e.clientX-lastX)*.012;lastX=e.clientX;requestDraw();};const up=()=>{drag=false;};const wheel=e=>{e.preventDefault();zoom=Math.max(6.1,Math.min(11,zoom+Math.sign(e.deltaY)*.45));requestDraw();};
  viewer.addEventListener('pointerdown',down);viewer.addEventListener('pointermove',move);viewer.addEventListener('pointerup',up);viewer.addEventListener('pointercancel',up);viewer.addEventListener('wheel',wheel,{passive:false});
  host.querySelector('[data-reset-360]')?.addEventListener('click',()=>{rotation=0;zoom=8.6;requestDraw();});
  const ro=new ResizeObserver(()=>{const w=Math.max(280,Math.round(viewer.clientWidth));bundle.renderer.setSize(w,w,false);bundle.camera.aspect=1;bundle.camera.updateProjectionMatrix();requestDraw();});ro.observe(viewer);requestDraw();
  activeViewer={dispose(){disposed=true;ro.disconnect();if(raf)cancelAnimationFrame(raf);viewer.replaceChildren(...[...viewer.children].filter(n=>n.matches?.('.da-mug-viewer-badge,.da-mug-viewer-reset')));disposeBundle(bundle);}};
 }catch(err){console.error('[Mug 360] falha ao abrir:',err);button.disabled=false;button.hidden=false;button.textContent='Não foi possível abrir o 360° · tentar novamente';}
}

async function mountForProduct(raw,token){
 if(token!==routeToken||!isMug(raw))return;const art=artUrl(raw);if(!art)return;
 const media=document.querySelector('.product-detail-media');if(!media)return;
 media.innerHTML=showcaseHtml();const host=media.querySelector('[data-da-mug-showcase]');host.querySelector('[data-open-360]').addEventListener('click',()=>startViewer(host,art));
 try{const previews=await generatePreviews(art);if(token!==routeToken)return;for(const side of ['left','right']){const figure=host.querySelector(`[data-preview="${side}"]`);if(figure){figure.querySelector('.da-mug-preview-loading')?.remove();figure.insertAdjacentHTML('afterbegin',`<img src="${esc(previews[side])}" alt="Caneca personalizada vista pelo lado ${side==='left'?'esquerdo':'direito'}">`);}}}catch(err){console.warn('[Mug previews] falha:',err);host.querySelector('.da-mug-previews').innerHTML='<div class="da-mug-preview-error">A arte está pronta. Abra a visualização 360° para conferir a caneca.</div>';}
}

async function enhanceRoute(){
 const key=routeKey();routeToken++;const token=routeToken;if(activeViewer){activeViewer.dispose();activeViewer=null;}if(!key)return;
 try{const r=await fetch(`${FIREBASE_PRODUCTS}/${encodeURIComponent(key)}.json?_=${Date.now()}`,{cache:'no-store',headers:{Accept:'application/json'}});if(!r.ok)return;const raw=await r.json();if(token!==routeToken||key!==routeKey())return;await mountForProduct(raw||{},token);}catch(err){console.warn('[Mug 3D] produto não pôde ser preparado:',err);}
}

function upgradePersonalizationResult(){
 const result=document.querySelector('.mug-public-result');if(!result||result.querySelector('[data-da-mug-result-showcase]'))return;
 const art=result.querySelector('.mug-result-art img')?.src;if(!isUrl(art)&&!/^data:image\//i.test(text(art)))return;
 const box=document.createElement('div');box.className='da-mug-result-showcase';box.dataset.daMugResultShowcase='1';box.innerHTML=showcaseHtml();result.querySelector('.mug-result-art')?.insertAdjacentElement('afterend',box);box.querySelector('[data-open-360]').addEventListener('click',()=>startViewer(box,art));
 generatePreviews(art).then(previews=>{for(const side of ['left','right']){const figure=box.querySelector(`[data-preview="${side}"]`);figure?.querySelector('.da-mug-preview-loading')?.remove();if(figure)figure.insertAdjacentHTML('afterbegin',`<img src="${esc(previews[side])}" alt="Prévia ${side}">`);}}).catch(()=>{});
}

installStyles();
const observer=new MutationObserver(()=>upgradePersonalizationResult());observer.observe(document.documentElement,{subtree:true,childList:true});
window.addEventListener('da:route-rendered',()=>setTimeout(enhanceRoute,20));window.addEventListener('hashchange',()=>setTimeout(enhanceRoute,20));window.addEventListener('da:mug-personalized-added',()=>setTimeout(upgradePersonalizationResult,50));
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(enhanceRoute,20),{once:true});else setTimeout(enhanceRoute,20);

document.documentElement.dataset.mug3d=BUILD;
export{BUILD,enhanceRoute,generatePreviews,startViewer};