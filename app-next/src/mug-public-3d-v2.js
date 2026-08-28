const BUILD='20260828-mug-public-3d-v4-studio-realism';
const FIREBASE_PRODUCTS='https://cedar-chemist-310801-default-rtdb.firebaseio.com/produtos';
const THREE_URL='https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';
const ROOM_URL='https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/environments/RoomEnvironment.js';

// Mantemos a calibração física já usada pelo fluxo operacional. Esta etapa melhora
// apenas o realismo do objeto/luz; não altera as dimensões industriais de impressão.
const PRINT_WIDTH_MM=235;
const MUG_CIRCUMFERENCE_MM=260;
const PRINT_ARC_RAD=Math.PI*2*(PRINT_WIDTH_MM/MUG_CIRCUMFERENCE_MM);
const HANDLE_GAP_RAD=Math.PI*2-PRINT_ARC_RAD;
const ART_SHELL_THETA_START=3*Math.PI/2+HANDLE_GAP_RAD/2;
const PRINT_CALIBRATION=Object.freeze({
  printWidthMm:PRINT_WIDTH_MM,
  mugCircumferenceMm:MUG_CIRCUMFERENCE_MM,
  printArcRad:PRINT_ARC_RAD,
  handleGapRad:HANDLE_GAP_RAD
});
const VIEWER_LIMITS=Object.freeze({minZoom:6.05,maxZoom:11,defaultZoom:8.7});
const PREVIEW_ROTATION=Object.freeze({left:-0.66,right:0.66});

let routeToken=0;
let depsPromise=null;
let activeViewer=null;
const previewCache=new Map();

const text=v=>String(v??'').trim();
const esc=v=>text(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
const isUrl=v=>/^https?:\/\//i.test(text(v));
const truthy=v=>v===true||v===1||['1','true','sim','yes'].includes(text(v).toLowerCase());

function routeKey(){
  const m=String(location.hash||'').match(/^#\/produto\/([^/?#]+)/i);
  return m?decodeURIComponent(m[1]):'';
}
function isMug(raw={}){
  const cat=text(raw.categoria||raw.category).toLowerCase();
  return truthy(raw.modelo_caneca)||truthy(raw.produto_sob_encomenda)||cat.includes('caneca');
}
function artUrl(raw={}){
  const print=raw.arte_impressao;
  return [raw.arte_horizontal,raw.arte_personalizacao,print&&typeof print==='object'?print.url:print,raw.art_url,raw.arte_url].map(text).find(isUrl)||'';
}
function persistedPreviews(raw={}){
  return {
    left:[raw.preview_esquerda,raw.preview_left,raw.mug_preview_left].map(text).find(isUrl)||'',
    right:[raw.preview_direita,raw.preview_right,raw.mug_preview_right].map(text).find(isUrl)||''
  };
}

function installStyles(){
  if(document.getElementById('daMug3dV2Styles'))return;
  const s=document.createElement('style');
  s.id='daMug3dV2Styles';
  s.textContent=`
.da-mug-showcase{display:grid;gap:12px}.da-mug-previews{display:grid;grid-template-columns:1fr 1fr;gap:10px}.da-mug-preview{position:relative;margin:0;border-radius:16px;overflow:hidden;background:linear-gradient(145deg,#faf9f6,#ece9e1);border:1px solid #e2e1db;aspect-ratio:1;display:grid;place-items:center}.da-mug-preview img{width:100%;height:100%;object-fit:cover;display:block}.da-mug-preview figcaption{position:absolute;left:9px;bottom:9px;padding:5px 8px;border-radius:999px;background:rgba(18,20,18,.78);color:#fff;font-size:10px;font-weight:800;backdrop-filter:blur(5px)}.da-mug-preview-loading{font-size:12px;color:#73766f;text-align:center;padding:18px}.da-mug-360-button{min-height:50px;border:0;border-radius:13px;background:#1c211d;color:#fff;font:inherit;font-weight:850;cursor:pointer;display:flex;justify-content:center;align-items:center;gap:8px}.da-mug-360-button:disabled{opacity:.5;cursor:wait}.da-mug-360-hint{text-align:center;font-size:11px;color:#6d716b;margin:-4px 0 0;line-height:1.4}.da-mug-print-note{text-align:center;font-size:10px;color:#858980;margin:-7px 0 0}.da-mug-viewer{display:none;position:relative;aspect-ratio:1;border-radius:18px;overflow:hidden;background:radial-gradient(circle at 50% 23%,#fff,#e9e5dc 74%);border:1px solid #deddd7;touch-action:none}.da-mug-viewer.active{display:block}.da-mug-viewer canvas{width:100%!important;height:100%!important;display:block}.da-mug-viewer-badge{position:absolute;left:10px;top:10px;z-index:2;padding:6px 9px;border-radius:999px;background:rgba(255,255,255,.9);font-size:10px;font-weight:850;color:#323630;box-shadow:0 4px 18px rgba(0,0,0,.08)}.da-mug-viewer-reset{position:absolute;right:10px;top:10px;z-index:2;border:0;border-radius:999px;background:rgba(27,30,27,.84);color:white;padding:7px 10px;font-size:11px;font-weight:800;cursor:pointer}.da-mug-preview-error{grid-column:1/-1;padding:14px;border-radius:12px;background:#f4f4f1;color:#656961;font-size:12px;text-align:center}.mug-result-mockups{display:none!important}.da-mug-result-showcase{margin-top:10px}@media(max-width:560px){.da-mug-previews{gap:7px}.da-mug-preview{border-radius:13px}.da-mug-360-button{min-height:52px}}
`;
  document.head.appendChild(s);
}

async function getDeps(){
  if(!depsPromise){
    depsPromise=Promise.all([import(THREE_URL),import(ROOM_URL)]).then(([THREE,room])=>({THREE,RoomEnvironment:room.RoomEnvironment}));
  }
  return depsPromise;
}

async function loadTexture(THREE,url){
  return new Promise((resolve,reject)=>{
    const loader=new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    loader.load(url,t=>{
      t.colorSpace=THREE.SRGBColorSpace;
      t.wrapS=THREE.ClampToEdgeWrapping;
      t.wrapT=THREE.ClampToEdgeWrapping;
      resolve(t);
    },undefined,reject);
  });
}

function createHandleGeometry(THREE){
  const outer=new THREE.Shape();
  outer.moveTo(1.34,1.13);
  outer.bezierCurveTo(2.20,1.26,2.76,.88,2.79,.14);
  outer.bezierCurveTo(2.83,-.66,2.31,-1.20,1.38,-1.20);
  outer.lineTo(1.35,-.78);
  outer.bezierCurveTo(1.98,-.78,2.27,-.48,2.25,.10);
  outer.bezierCurveTo(2.23,.57,1.91,.77,1.37,.75);
  outer.closePath();

  const hole=new THREE.Path();
  hole.moveTo(1.57,.66);
  hole.bezierCurveTo(1.96,.69,2.14,.49,2.15,.11);
  hole.bezierCurveTo(2.16,-.30,1.98,-.62,1.55,-.66);
  hole.lineTo(1.52,-.43);
  hole.bezierCurveTo(1.80,-.39,1.91,-.20,1.91,.09);
  hole.bezierCurveTo(1.91,.34,1.80,.46,1.55,.45);
  hole.closePath();
  outer.holes.push(hole);

  const geometry=new THREE.ExtrudeGeometry(outer,{
    depth:.36,
    bevelEnabled:true,
    bevelSegments:5,
    bevelSize:.07,
    bevelThickness:.07,
    curveSegments:20,
    steps:1
  });
  geometry.translate(0,0,-.18);
  return geometry;
}

function buildScene(THREE,RoomEnvironment,texture,width=720,height=720){
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true,powerPreference:'high-performance'});
  const mobile=window.matchMedia?.('(max-width:680px)')?.matches;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,mobile?1.5:1.9));
  renderer.setSize(width,height,false);
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.02;
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  texture.anisotropy=Math.min(16,renderer.capabilities.getMaxAnisotropy?.()||8);
  texture.needsUpdate=true;

  const scene=new THREE.Scene();
  scene.background=new THREE.Color(0xf4f1ea);
  const pmrem=new THREE.PMREMGenerator(renderer);
  const room=new RoomEnvironment();
  scene.environment=pmrem.fromScene(room,.06).texture;
  room.dispose?.();
  pmrem.dispose();

  const camera=new THREE.PerspectiveCamera(27.5,width/height,.1,100);
  camera.position.set(0,.16,VIEWER_LIMITS.defaultZoom);
  camera.lookAt(0,.03,0);

  const root=new THREE.Group();
  root.position.y=.02;
  scene.add(root);

  const ceramic=new THREE.MeshPhysicalMaterial({
    color:0xfffefd,
    roughness:.20,
    metalness:0,
    clearcoat:.96,
    clearcoatRoughness:.085,
    ior:1.48,
    specularIntensity:.86,
    envMapIntensity:1.25
  });

  const profile=[
    [-1.78,1.37],[-1.74,1.43],[-1.61,1.47],[-1.30,1.50],
    [1.31,1.51],[1.58,1.50],[1.73,1.47],[1.80,1.50]
  ].map(([y,r])=>new THREE.Vector2(r,y));
  const body=new THREE.Mesh(new THREE.LatheGeometry(profile,160),ceramic);
  body.castShadow=true;
  body.receiveShadow=true;
  root.add(body);

  const innerMat=new THREE.MeshPhysicalMaterial({
    color:0xf8f8f5,roughness:.29,clearcoat:.68,clearcoatRoughness:.14,
    ior:1.46,side:THREE.DoubleSide,envMapIntensity:.9
  });
  const innerWall=new THREE.Mesh(new THREE.CylinderGeometry(1.34,1.31,.24,112,1,false),innerMat);
  innerWall.position.y=1.69;
  root.add(innerWall);

  const cavity=new THREE.Mesh(
    new THREE.CircleGeometry(1.285,112),
    new THREE.MeshStandardMaterial({color:0xd8d7d2,roughness:.78,side:THREE.DoubleSide,envMapIntensity:.35})
  );
  cavity.rotation.x=-Math.PI/2;
  cavity.position.y=1.565;
  root.add(cavity);

  const rim=new THREE.Mesh(new THREE.TorusGeometry(1.48,.075,28,160),ceramic);
  rim.rotation.x=Math.PI/2;
  rim.position.y=1.81;
  rim.castShadow=true;
  root.add(rim);

  const foot=new THREE.Mesh(new THREE.TorusGeometry(1.36,.045,20,128),ceramic);
  foot.rotation.x=Math.PI/2;
  foot.position.y=-1.74;
  foot.castShadow=true;
  root.add(foot);

  const handle=new THREE.Mesh(createHandleGeometry(THREE),ceramic);
  handle.castShadow=true;
  handle.receiveShadow=true;
  root.add(handle);

  // Pequenos colares arredondados suavizam a união entre a alça extrudada e o corpo.
  // O corpo principal da alça usa ExtrudeGeometry; TubeGeometry fica apenas nas junções.
  const topJointPath=new THREE.LineCurve3(new THREE.Vector3(1.37,.91,0),new THREE.Vector3(1.52,.91,0));
  const bottomJointPath=new THREE.LineCurve3(new THREE.Vector3(1.37,-.91,0),new THREE.Vector3(1.52,-.91,0));
  for(const path of [topJointPath,bottomJointPath]){
    const joint=new THREE.Mesh(new THREE.TubeGeometry(path,10,.19,22,false),ceramic);
    joint.castShadow=true;
    root.add(joint);
  }

  const artMat=new THREE.MeshPhysicalMaterial({
    map:texture,
    roughness:.255,
    metalness:0,
    clearcoat:.72,
    clearcoatRoughness:.14,
    envMapIntensity:1.02,
    transparent:true,
    side:THREE.FrontSide
  });

  const artGeometry=new THREE.CylinderGeometry(
    1.525,
    1.49,
    2.82,
    176,
    1,
    true,
    ART_SHELL_THETA_START,
    PRINT_ARC_RAD
  );
  const artShell=new THREE.Mesh(artGeometry,artMat);
  artShell.position.y=-.03;
  artShell.rotation.y=Math.PI;
  artShell.userData.printCalibration=PRINT_CALIBRATION;
  root.add(artShell);

  const backdrop=new THREE.Mesh(
    new THREE.PlaneGeometry(18,18),
    new THREE.MeshStandardMaterial({color:0xebe7de,roughness:1,metalness:0})
  );
  backdrop.rotation.x=-Math.PI/2;
  backdrop.position.y=-1.84;
  backdrop.receiveShadow=true;
  scene.add(backdrop);

  const contactShadow=new THREE.Mesh(
    new THREE.PlaneGeometry(5.6,4.2),
    new THREE.ShadowMaterial({color:0x000000,opacity:.19})
  );
  contactShadow.rotation.x=-Math.PI/2;
  contactShadow.position.set(.26,-1.825,.18);
  contactShadow.receiveShadow=true;
  scene.add(contactShadow);

  scene.add(new THREE.HemisphereLight(0xffffff,0xa59e93,1.38));

  const key=new THREE.DirectionalLight(0xffffff,4.1);
  key.position.set(-4.6,6.7,5.7);
  key.castShadow=true;
  key.shadow.mapSize.set(1536,1536);
  key.shadow.camera.left=-5;
  key.shadow.camera.right=5;
  key.shadow.camera.top=5;
  key.shadow.camera.bottom=-5;
  key.shadow.bias=-.00025;
  key.shadow.normalBias=.025;
  key.shadow.radius=3;
  scene.add(key);

  const fill=new THREE.DirectionalLight(0xe4edff,1.28);
  fill.position.set(5.2,3.0,4.2);
  scene.add(fill);

  const rimLight=new THREE.PointLight(0xffead9,25,12,2);
  rimLight.position.set(-4.2,2.2,-4.2);
  scene.add(rimLight);

  const frontSoft=new THREE.PointLight(0xffffff,8,10,2);
  frontSoft.position.set(0,3.8,5.6);
  scene.add(frontSoft);

  return{renderer,scene,camera,root,texture};
}

function renderFrame(bundle,rotation=0){
  bundle.root.rotation.y=rotation;
  bundle.renderer.render(bundle.scene,bundle.camera);
}

function disposeBundle(bundle){
  if(!bundle)return;
  bundle.scene.traverse(o=>{
    o.geometry?.dispose?.();
    if(o.material){
      (Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m.dispose?.());
    }
  });
  bundle.texture?.dispose?.();
  bundle.scene.environment?.dispose?.();
  bundle.renderer?.dispose?.();
}

async function generatePreviews(art){
  if(previewCache.has(art))return previewCache.get(art);
  const promise=(async()=>{
    const{THREE,RoomEnvironment}=await getDeps();
    const texture=await loadTexture(THREE,art);
    const bundle=buildScene(THREE,RoomEnvironment,texture,720,720);
    try{
      renderFrame(bundle,PREVIEW_ROTATION.left);
      const left=bundle.renderer.domElement.toDataURL('image/webp',.91);
      renderFrame(bundle,PREVIEW_ROTATION.right);
      const right=bundle.renderer.domElement.toDataURL('image/webp',.91);
      return{left,right};
    }finally{
      disposeBundle(bundle);
    }
  })();
  previewCache.set(art,promise);
  try{return await promise;}catch(e){previewCache.delete(art);throw e;}
}

function showcaseHtml(){
  return `<div class="da-mug-showcase" data-da-mug-showcase="1"><div class="da-mug-previews"><figure class="da-mug-preview" data-preview="left"><div class="da-mug-preview-loading">Preparando vista esquerda…</div><figcaption>Lado esquerdo</figcaption></figure><figure class="da-mug-preview" data-preview="right"><div class="da-mug-preview-loading">Preparando vista direita…</div><figcaption>Lado direito</figcaption></figure></div><button class="da-mug-360-button" type="button" data-open-360 aria-label="Abrir visualização 360 graus da caneca">↻ Ver caneca em 360°</button><p class="da-mug-360-hint">Arraste para girar · use dois dedos ou a roda para aproximar</p><p class="da-mug-print-note">A prévia considera a pequena faixa sem impressão próxima à alça.</p><div class="da-mug-viewer" data-mug-viewer role="region" aria-label="Visualização interativa da caneca em 360 graus"><span class="da-mug-viewer-badge">360°</span><button class="da-mug-viewer-reset" type="button" data-reset-360>Centralizar</button></div></div>`;
}

function fillPreview(host,side,url,label){
  const figure=host.querySelector(`[data-preview="${side}"]`);
  if(!figure||!url)return;
  figure.querySelector('.da-mug-preview-loading')?.remove();
  figure.querySelector('img')?.remove();
  figure.insertAdjacentHTML('afterbegin',`<img src="${esc(url)}" alt="Caneca personalizada vista pelo lado ${label}">`);
}

async function hydratePreviews(host,raw,art){
  const saved=persistedPreviews(raw);
  if(saved.left&&saved.right){
    fillPreview(host,'left',saved.left,'esquerdo');
    fillPreview(host,'right',saved.right,'direito');
    return;
  }
  const generated=await generatePreviews(art);
  fillPreview(host,'left',saved.left||generated.left,'esquerdo');
  fillPreview(host,'right',saved.right||generated.right,'direito');
}

async function startViewer(host,art){
  if(activeViewer){activeViewer.dispose();activeViewer=null;}
  const button=host.querySelector('[data-open-360]');
  const viewer=host.querySelector('[data-mug-viewer]');
  if(!button||!viewer)return;
  button.disabled=true;
  button.textContent='Carregando 360°…';
  try{
    const{THREE,RoomEnvironment}=await getDeps();
    const texture=await loadTexture(THREE,art);
    const size=Math.max(320,Math.min(900,viewer.clientWidth||640));
    const bundle=buildScene(THREE,RoomEnvironment,texture,size,size);
    viewer.appendChild(bundle.renderer.domElement);
    viewer.classList.add('active');
    button.hidden=true;

    let rotation=0,zoom=VIEWER_LIMITS.defaultZoom,raf=0,disposed=false,lastX=0,lastPinch=0;
    const pointers=new Map();
    const clampZoom=value=>Math.max(6.05,Math.min(11,value));
    const draw=()=>{
      raf=0;
      if(disposed)return;
      bundle.camera.position.z=zoom;
      renderFrame(bundle,rotation);
    };
    const requestDraw=()=>{if(!raf)raf=requestAnimationFrame(draw);};
    const distance=()=>{
      const pts=[...pointers.values()];
      if(pts.length<2)return 0;
      return Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y);
    };
    const down=e=>{
      pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
      viewer.setPointerCapture?.(e.pointerId);
      if(pointers.size===1)lastX=e.clientX;
      else lastPinch=distance();
    };
    const move=e=>{
      if(!pointers.has(e.pointerId))return;
      pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
      if(pointers.size===1){
        rotation+=(e.clientX-lastX)*.012;
        lastX=e.clientX;
      }else{
        const d=distance();
        if(lastPinch&&d)zoom=clampZoom(zoom+(lastPinch-d)*.012);
        lastPinch=d;
      }
      requestDraw();
    };
    const up=e=>{
      pointers.delete(e.pointerId);
      lastPinch=pointers.size>1?distance():0;
      if(pointers.size===1)lastX=[...pointers.values()][0].x;
    };
    const wheel=e=>{
      e.preventDefault();
      zoom=clampZoom(zoom+Math.sign(e.deltaY)*.42);
      requestDraw();
    };

    viewer.addEventListener('pointerdown',down);
    viewer.addEventListener('pointermove',move);
    viewer.addEventListener('pointerup',up);
    viewer.addEventListener('pointercancel',up);
    viewer.addEventListener('wheel',wheel,{passive:false});
    const resetButton=host.querySelector('[data-reset-360]');
    const reset=()=>{
      rotation=0;
      zoom=VIEWER_LIMITS.defaultZoom;
      requestDraw();
    };
    resetButton?.addEventListener('click',reset);

    const ro=new ResizeObserver(()=>{
      const w=Math.max(280,Math.round(viewer.clientWidth));
      bundle.renderer.setSize(w,w,false);
      bundle.camera.aspect=1;
      bundle.camera.updateProjectionMatrix();
      requestDraw();
    });
    ro.observe(viewer);
    requestDraw();

    activeViewer={
      dispose(){
        disposed=true;
        ro.disconnect();
        if(raf)cancelAnimationFrame(raf);
        viewer.removeEventListener('pointerdown',down);
        viewer.removeEventListener('pointermove',move);
        viewer.removeEventListener('pointerup',up);
        viewer.removeEventListener('pointercancel',up);
        viewer.removeEventListener('wheel',wheel);
        resetButton?.removeEventListener('click',reset);
        viewer.querySelector('canvas')?.remove();
        disposeBundle(bundle);
      }
    };
  }catch(err){
    console.error('[Mug 360] falha ao abrir:',err);
    button.disabled=false;
    button.hidden=false;
    button.textContent='Não foi possível abrir o 360° · tentar novamente';
  }
}

async function mountForProduct(raw,token){
  if(token!==routeToken||!isMug(raw))return;
  const art=artUrl(raw);
  if(!art)return;
  const media=document.querySelector('.product-detail-media');
  if(!media)return;
  media.innerHTML=showcaseHtml();
  const host=media.querySelector('[data-da-mug-showcase]');
  host.querySelector('[data-open-360]').addEventListener('click',()=>startViewer(host,art));
  try{
    await hydratePreviews(host,raw,art);
  }catch(err){
    console.warn('[Mug previews] falha:',err);
    host.querySelector('.da-mug-previews').innerHTML='<div class="da-mug-preview-error">A arte está pronta. Abra a visualização 360° para conferir a caneca.</div>';
  }
}

async function enhanceRoute(){
  const key=routeKey();
  routeToken++;
  const token=routeToken;
  if(activeViewer){activeViewer.dispose();activeViewer=null;}
  if(!key)return;
  try{
    const r=await fetch(`${FIREBASE_PRODUCTS}/${encodeURIComponent(key)}.json?_=${Date.now()}`,{cache:'no-store',headers:{Accept:'application/json'}});
    if(!r.ok)return;
    const raw=await r.json();
    if(token!==routeToken||key!==routeKey())return;
    await mountForProduct(raw||{},token);
  }catch(err){
    console.warn('[Mug 3D] produto não pôde ser preparado:',err);
  }
}

function upgradePersonalizationResult(){
  const result=document.querySelector('.mug-public-result');
  if(!result||result.querySelector('[data-da-mug-result-showcase]'))return;
  const art=result.querySelector('.mug-result-art img')?.src;
  if(!isUrl(art)&&!/^data:image\//i.test(text(art)))return;
  const box=document.createElement('div');
  box.className='da-mug-result-showcase';
  box.dataset.daMugResultShowcase='1';
  box.innerHTML=showcaseHtml();
  result.querySelector('.mug-result-art')?.insertAdjacentElement('afterend',box);
  box.querySelector('[data-open-360]').addEventListener('click',()=>startViewer(box,art));
  generatePreviews(art).then(previews=>{
    fillPreview(box,'left',previews.left,'esquerdo');
    fillPreview(box,'right',previews.right,'direito');
  }).catch(()=>{});
}

installStyles();
const observer=new MutationObserver(()=>upgradePersonalizationResult());
observer.observe(document.documentElement,{subtree:true,childList:true});
window.addEventListener('da:route-rendered',()=>setTimeout(enhanceRoute,20));
window.addEventListener('hashchange',()=>setTimeout(enhanceRoute,20));
window.addEventListener('da:mug-personalized-added',()=>setTimeout(upgradePersonalizationResult,50));
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(enhanceRoute,20),{once:true});
else setTimeout(enhanceRoute,20);
document.documentElement.dataset.mug3d=BUILD;
document.documentElement.dataset.mugPrintArc=`${PRINT_WIDTH_MM}/${MUG_CIRCUMFERENCE_MM}mm`;

export{BUILD,PRINT_CALIBRATION,VIEWER_LIMITS,enhanceRoute,generatePreviews,startViewer,persistedPreviews};
