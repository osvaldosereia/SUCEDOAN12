// Minimal DOM fixture for controller rendering and event contracts; no external effects.
export function adminDomFixture(){
  const nodes=new Map();
  const dataMatches=(node,selector)=>{
    const match=selector.match(/^\[([\w-]+)(?:="([^"]*)")?\]$/);
    return match&&match[1] in node.attributes&&(match[2]===undefined||node.attributes[match[1]]===match[2]);
  };
  function node(id=''){
    let html='',dataChildren=[];const children=new Set();
    const value={id,value:'',disabled:false,textContent:'',dataset:{},attributes:{},open:false,firstElementChild:null,focus(){},close(){this.open=false},showModal(){this.open=true}};
    value.querySelectorAll=selector=>dataChildren.filter(child=>dataMatches(child,selector));
    value.querySelector=selector=>value.querySelectorAll(selector)[0]||null;
    Object.defineProperty(value,'innerHTML',{get:()=>html,set:text=>{
      for(const child of children)nodes.delete(child);children.clear();html=text;dataChildren=[];
      value.firstElementChild=text?{}:null;
      for(const [,key] of String(text).matchAll(/\bid="([^"]+)"/g)){const selector='#'+key;nodes.set(selector,node(key));children.add(selector)}
      for(const [tag] of String(text).matchAll(/<[^>]+\bdata-[^>]*>/g)){
        const child=node();
        for(const [,attribute,entry] of tag.matchAll(/\b(data-[\w-]+)="([^"]*)"/g)){
          child.attributes[attribute]=entry;
          child.dataset[attribute.slice(5).replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase())]=entry;
        }
        dataChildren.push(child);
      }
    }});
    return value;
  }
  nodes.set('#content',node('content'));
  for(const id of ['editor','editorTitle','editorBody','editorActions'])nodes.set('#'+id,node(id));
  const document={
    querySelector:selector=>nodes.get(selector)||document.querySelectorAll(selector)[0]||null,
    querySelectorAll:selector=>[...nodes.values()].flatMap(value=>value.querySelectorAll(selector))
  };
  return {nodes,document,query:selector=>document.querySelector(selector)};
}
