import { readFile, writeFile } from "node:fs/promises";

const ADMIN_PATH = "producao/index.html";
let html = await readFile(ADMIN_PATH, "utf8");

if (!html.includes("function productsHomeObject(")) {
  const marker = "  async function saveGithubFiles(";
  if (!html.includes(marker)) throw new Error("Ponto saveGithubFiles não encontrado no admin.");

  const helper = `  function productsHomeObject(source=productsObject()){
    const full=source&&typeof source==="object"&&!Array.isArray(source)?source:{};
    const compact={};
    Object.entries(full).forEach(([key,p])=>{
      p=p||{};
      const active=!['I','INATIVO','INACTIVE','0','FALSE','EXCLUIDO'].includes(String(p.situacao??p.status??'A').trim().toUpperCase());
      const item={
        codigo:String(p.codigo||p.sku||p.id||key||'').trim(),
        nome:String(p.nome||p.name||p.titulo||'').trim(),
        categoria:String(p.categoria||'').trim(),
        subcategoria:String(p.subcategoria||'').trim(),
        subsubcategoria:String(p.subsubcategoria||'').trim(),
        marca:String(p.marca||'').trim(),
        embalagem:String(p.embalagem||'').trim(),
        preco:Math.round(Math.max(0,toNum(p.preco??p.price??p.valor))*100)/100,
        preco_oferta:Math.round(Math.max(0,toNum(p.preco_oferta??p.precoOferta))*100)/100,
        estoque:Math.max(0,Math.floor(toNum(p.estoque))),
        situacao:active?'A':'I',
        url_imagem:String(p.url_imagem||p.imagem_url||p.imagem||p.image||p.img||p.foto||p.foto_url||p.imagem_path||'').trim(),
        descricao_curta:String(p.descricao_curta||p.descricao||'').trim().slice(0,180),
        validade:String(p.validade||p.data_validade||'').trim(),
        validade_oferta:String(p.validade_oferta||p.validadeOferta||'').trim(),
        gtin:String(p.gtin||p.ean||'').trim()
      };
      compact[key]=Object.fromEntries(Object.entries(item).filter(([,value])=>value!==''&&value!==null&&value!==undefined));
    });
    return compact;
  }
`;
  html = html.replace(marker, helper + marker);
}

const saveGithubPattern = /  async function saveGithubFiles\(\{produtos,metaCatalogCsv,adminMeta,cestas,kits\}=\{\}\)\{[^\n]*\}/;
if (saveGithubPattern.test(html)) {
  html = html.replace(saveGithubPattern, `  async function saveGithubFiles({produtosHome,metaCatalogCsv,adminMeta,cestas,kits}={}){readSettingsFromUi(); const ops=[]; if(produtosHome) ops.push(githubUpsert("site/produtos-home.json", produtosHome, "Atualiza produtos-home.json diretamente do catálogo Firebase pelo admin Dona Antônia")); if(metaCatalogCsv) ops.push(githubUpsertText(state.settings.githubMetaPath, metaCatalogCsv, "Atualiza produtos_meta.csv (Meta) pelo admin Dona Antônia")); if(adminMeta) ops.push(githubUpsert(state.settings.githubAdminMetaPath, adminMeta, "Atualiza produtos_admin_meta.json pelo admin Dona Antônia")); if(cestas) ops.push(githubUpsert(state.settings.githubCestasPath, cestas, "Atualiza produtos-cesta-basica.json pelo admin Dona Antônia")); if(kits) ops.push(githubUpsert(state.settings.githubKitsPath, kits, "Atualiza site/kits.json pelo admin Dona Antônia")); await Promise.all(ops)}`);
} else if (!html.includes("async function saveGithubFiles({produtosHome,")) {
  throw new Error("Formato esperado de saveGithubFiles não encontrado.");
}

const oldAutoSave = /if\(state\.settings\.autoGithub\)\s*await saveGithubFiles\(\{\s*produtos:\s*payload\s*\}\);/;
if (oldAutoSave.test(html)) {
  html = html.replace(oldAutoSave, "if(state.settings.autoGithub) await saveGithubFiles({produtosHome:productsHomeObject(payload)});");
} else if (!html.includes("saveGithubFiles({produtosHome:productsHomeObject(payload)})")) {
  throw new Error("Chamada automática de produtos no GitHub não encontrada.");
}

html = html.replace(
  /saveGithubFiles\(\{produtos:productsObject\(\),metaCatalogCsv:/g,
  "saveGithubFiles({produtosHome:productsHomeObject(productsObject()),metaCatalogCsv:"
);
html = html.replace(
  /produtos\.json, produtos_meta\.csv, produtos_admin_meta\.json, produtos-cesta-basica\.json e site\/kits\.json enviados ao GitHub\./g,
  "produtos-home.json, produtos_meta.csv, produtos_admin_meta.json, produtos-cesta-basica.json e site/kits.json enviados ao GitHub."
);

if (html.includes("saveGithubFiles({produtos:productsObject()")) {
  throw new Error("Ainda existe publicação manual do produtos.json inativo.");
}

await writeFile(ADMIN_PATH, html, "utf8");
console.log("Admin atualizado: Firebase continua como fonte completa e site/produtos-home.json passa a ser publicado como catálogo compacto.");
// Alteração intencional para disparar o workflow após sua instalação.
