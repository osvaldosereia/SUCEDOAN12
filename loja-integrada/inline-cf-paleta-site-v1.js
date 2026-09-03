(function(){'use strict';
if(window.__CF_PALETA_SITE_V2__)return;
window.__CF_PALETA_SITE_V2__='20260903-2';
function instalar(){
if(document.getElementById('cfPaletaSiteV2'))return;
var velho=document.getElementById('cfPaletaSiteV1');if(velho)velho.remove();
var s=document.createElement('style');s.id='cfPaletaSiteV2';
s.textContent=[
':root{--cf-orange:#f47621;--cf-orange-dark:#d95d12;--cf-ink:#202329;--cf-navy:#263248;--cf-muted:#74777c;--cf-cream:#f7f5f2;--cf-cream2:#fff9f5;--cf-line:#e9e1db;--cf-green:#2f7d4a}',
'html,body{background:#fff!important;color:var(--cf-ink)!important}',
'body{font-family:Roboto,Arial,sans-serif}',
'header,#cabecalho{background:#fff!important;border-bottom:1px solid #f0ebe7!important;box-shadow:none!important}',
'header a,#cabecalho a{color:var(--cf-ink)}',
'.menu.superior .nivel-um>li>a,.menu.superior .nivel-dois>li>a{color:var(--cf-ink)!important;font-weight:500!important}',
'.menu.superior .nivel-um>li>a:hover,.menu.superior .nivel-dois>li>a:hover{color:var(--cf-orange)!important}',
'.busca,.busca-mobile .busca{background:#fff!important;border:1px solid #ddd7d2!important;border-radius:999px!important;box-shadow:none!important;overflow:hidden!important}',
'.busca input,.busca-mobile input{background:#fff!important;color:#34373c!important;box-shadow:none!important;border:0!important}',
'.busca input::placeholder,.busca-mobile input::placeholder{color:#9b9b9b!important}',
'.botao-busca.fundo-secundario,.busca .botao-busca{background:#fff!important;color:var(--cf-ink)!important;border:0!important;box-shadow:none!important}',
'.botao.principal,.botao-comprar.principal,.acoes-produto .botao-comprar,.tag-comprar.fundo-principal{background:var(--cf-orange)!important;border-color:var(--cf-orange)!important;color:#fff!important;text-shadow:none!important;box-shadow:none!important;border-radius:8px!important}',
'.botao.principal:hover,.botao-comprar.principal:hover,.acoes-produto .botao-comprar:hover,.tag-comprar.fundo-principal:hover{background:var(--cf-orange-dark)!important;border-color:var(--cf-orange-dark)!important;color:#fff!important}',
'.preco-promocional,.preco-produto strong{color:#1f2328!important}',
'.preco-venda{color:#aaa!important}',
'.listagem-item{background:#fff!important;border:1px solid #eee7e1!important;border-radius:14px!important;box-shadow:0 3px 14px rgba(49,38,29,.035)!important;overflow:hidden!important}',
'.listagem-item:hover{border-color:#dfd3ca!important;box-shadow:0 9px 28px rgba(49,38,29,.065)!important}',
'.listagem-item .imagem-produto,.listagem-item .imagem-produto img{background:var(--cf-cream)!important}',
'.listagem-item .nome-produto{color:#3b3e44!important;font-weight:500!important}',
'.listagem-item .bandeiras-produto>span,.listagem-item .bandeira-promocao,.listagem-item .bandeira-oferta,.listagem-item [class*="bandeira-promocao"],.listagem-item [class*="desconto"]{background:var(--cf-orange)!important;border-color:var(--cf-orange)!important;color:#fff!important;text-shadow:none!important;border-radius:6px!important}',
'.listagem-item .adicionado-carrinho,.listagem-item .bandeira-carrinho{background:var(--cf-navy)!important;border-color:var(--cf-navy)!important;color:#fff!important}',
'.pagina-categoria h1.titulo,.pagina-busca h1.titulo,.pagina-categoria .titulo-categoria,.pagina-busca .titulo-categoria{color:var(--cf-ink)!important;font-weight:500!important}',
'.pagina-categoria .ordenar-listagem,.pagina-busca .ordenar-listagem{background:#faf9f8!important;border:1px solid #eee8e3!important;border-radius:12px!important;padding:10px!important;box-sizing:border-box!important}',
'.ordenar-listagem .btn,.ordenar-listagem .botao,.ordenar-listagem select{border-color:#dcd5cf!important;background:#fff!important;color:#45484d!important;box-shadow:none!important;border-radius:7px!important}',
'.pagina-categoria .coluna .filtro,.pagina-busca .coluna .filtro,.pagina-categoria .filtro-coluna,.pagina-busca .filtro-coluna{background:#faf8f6!important;border:1px solid #eee6e0!important;border-radius:12px!important}',
'.pagination>.active>a,.pagination>.active>span,.paginacao .active a,.paginacao .ativo a{background:var(--cf-orange)!important;border-color:var(--cf-orange)!important;color:#fff!important}',
'.pagination>li>a,.pagination>li>span,.paginacao a{color:#484c52!important;border-color:#e5ddd7!important;background:#fff!important}',
'.pagination>li>a:hover,.paginacao a:hover{color:var(--cf-orange)!important;background:var(--cf-cream2)!important;border-color:#efc5aa!important}',
'.cf-home-view-all{color:var(--cf-orange-dark)!important;border-color:#efc3a5!important;background:#fff!important}',
'.cf-home-view-all:hover{background:var(--cf-cream2)!important;border-color:#eca475!important}',
'#cfMyArtsTrigger .cf-count,.carrinho .qtd-carrinho{background:var(--cf-orange)!important;color:#fff!important}',
'#avisoCookies{border-top-color:#eee4dd!important;background:#fff!important}',
'#avisoCookies .cf-cookie-ok{background:var(--cf-navy)!important;color:#fff!important}',
'.secao-banners .newsletter{border:1px solid #efe2d8!important;border-top:3px solid var(--cf-orange)!important;background:linear-gradient(145deg,#fff8f3 0%,#fff 72%)!important;box-shadow:0 8px 24px rgba(48,37,29,.045)!important}',
'.secao-banners .newsletter:before{background:var(--cf-orange)!important}',
'.secao-banners .newsletter .titulo{color:var(--cf-ink)!important}',
'.secao-banners .newsletter .texto-newsletter{color:var(--cf-muted)!important}',
'.secao-banners .newsletter input{border-color:#e4dbd4!important;background:#fff!important;color:#30343a!important}',
'.secao-banners .newsletter button,.secao-banners .newsletter .botao{background:var(--cf-orange)!important;color:#fff!important}',
'.secao-banners .newsletter button:hover,.secao-banners .newsletter .botao:hover{background:var(--cf-orange-dark)!important}',
'.pagina-produto .nome-produto{color:var(--cf-ink)!important;font-weight:500!important}',
'.pagina-produto .codigo-produto,.pagina-produto .codigo-produto span{color:#777b80!important}',
'.pagina-produto .principal{color:var(--cf-ink)!important}',
'.pagina-produto .conteiner-imagem,.pagina-produto #imagemProduto{background:var(--cf-cream)!important}',
'.cf-whatsapp-share-product{background:#f4fbf6!important;border-color:#cce7d3!important;color:#25753e!important}',
'.cf-native-personalizer{background:#faf9f8!important;border-color:#eee7e1!important}',
'.cf-native-personalizer .generate-cta{background:var(--cf-navy)!important;border-color:var(--cf-navy)!important}',
'.cf-native-personalizer .approve-cta{background:var(--cf-green)!important;border-color:var(--cf-green)!important}',
'.cf-native-personalizer input:focus,.cf-native-personalizer textarea:focus,.cf-native-personalizer select:focus{border-color:#efa778!important;box-shadow:0 0 0 3px rgba(244,118,33,.09)!important}',
'@media(max-width:767px){header,#cabecalho{box-shadow:0 2px 10px rgba(33,29,25,.035)!important}.listagem-item{border-radius:12px!important}.pagina-categoria .ordenar-listagem,.pagina-busca .ordenar-listagem{border-radius:9px!important;padding:8px!important}.secao-banners .newsletter{border-radius:12px!important}}'
].join('');
document.head.appendChild(s)
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',instalar,{once:true});else instalar();
setTimeout(instalar,700);
})();