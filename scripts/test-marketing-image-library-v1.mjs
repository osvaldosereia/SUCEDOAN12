import assert from 'node:assert/strict';
import fs from 'node:fs';
import {BASKET_CATEGORIES_CAROUSEL_PRESET} from '../vitrine/admin/marketing/template-carousel-presets.js';
import {validateTemplateDraft,MetaTemplatesError} from '../supabase/functions/_shared/whatsapp-meta-templates-v1.mjs';

const libraryPath='vitrine/admin/marketing/marketing-image-library.js';
assert.equal(fs.existsSync(libraryPath),true,'banco de imagens de marketing deve existir');
const library=fs.readFileSync(libraryPath,'utf8');
const picker=fs.readFileSync('vitrine/admin/marketing/template-type-picker.js','utf8');
const carousel=fs.readFileSync('vitrine/admin/marketing/template-carousel-editor.js','utf8');
const center=fs.readFileSync('vitrine/admin/marketing/template-center.js','utf8');

const basketImages=[
  '/img/cesta-basica-cuiaba-varzea-grande-economica.avif',
  '/site/img/CESTA-GRANDE-KOBLENZ.webp',
  '/site/img/CESTA-GRANDE-ALVINO.webp',
  '/site/img/CESTA-MEDIA-BONINI.webp',
  '/site/img/CESTA-PEQUENA-BONINI.webp',
  '/site/img/CESTA-PEQUENA-KOBLENZ.webp',
  '/site/img/CESTA-MEDIA-KOBLENZ.webp',
  '/site/img/CESTA-MINI-BONINI.webp',
  '/site/img/CESTA-MINI-KOBLENZ.webp'
];
for(const image of basketImages){
  assert.ok(library.includes(image),`banco deve listar ${image}`);
  assert.equal(fs.existsSync(image.slice(1)),true,`imagem precisa existir: ${image}`);
}
assert.match(library,/openMarketingImageBank/,'deve permitir selecionar imagem');
assert.match(library,/uploadMarketingTemplateMedia/,'mídia deve usar uploader autenticado');
assert.match(library,/meta_media_handle_missing/,'upload sem handle não pode prosseguir');
assert.match(library,/media_size_out_of_range/,'upload deve rejeitar arquivo vazio ou acima do limite da Edge');
assert.doesNotMatch(library,/graph\.facebook\.com|META_WHATSAPP_ACCESS_TOKEN|SERVICE_ROLE_KEY/,'não pode conter segredos ou chamar Meta diretamente');
assert.match(picker,/campaign_image/,'criador deve permitir template com imagem');
assert.match(picker,/header_handle/,'template de mídia deve incluir exemplo para Meta');
assert.match(carousel,/BASKET_CATEGORIES_CAROUSEL_PRESET/,'editor deve oferecer preset de cestas');
assert.match(carousel,/openMarketingImageBank/,'cartão deve abrir banco de imagens');
assert.match(carousel,/createMarketingImageFile/,'imagem escolhida deve virar arquivo para upload');
assert.match(center,/basket_categories/,'tela deve oferecer preset do carrossel de cestas');
assert.match(center,/template-type-picker\.js/,'botão de criação deve abrir os formatos do criador');
assert.equal(BASKET_CATEGORIES_CAROUSEL_PRESET.cards.length,5);
assert.deepEqual(BASKET_CATEGORIES_CAROUSEL_PRESET.cards.map(card=>card.body),['Cesta Econômica','Cesta Mini','Cesta Pequena','Cesta Média','Cesta Grande']);
assert.match(BASKET_CATEGORIES_CAROUSEL_PRESET.body,/responda SAIR/i);
assert.doesNotMatch(BASKET_CATEGORIES_CAROUSEL_PRESET.cards.map(card=>card.body).join(' '),/oferta|desconto|promoção/i);
const textDraft={name:'cesta_marketing',language:'pt_BR',category:'MARKETING',components:[{type:'BODY',text:'Conheça nossas cestas. Para não receber mensagens, responda SAIR.'}]};
assert.equal(validateTemplateDraft(textDraft).components[0].type,'BODY');
for(const format of ['IMAGE','VIDEO']){
  const draft={...textDraft,components:[{type:'HEADER',format,example:{header_handle:['4::sample_handle']}},...textDraft.components]};
  assert.deepEqual(validateTemplateDraft(draft).components[0],draft.components[0]);
}
for(const draft of [
  {...textDraft,components:[{type:'HEADER',format:'IMAGE',example:{}},...textDraft.components]},
  {...textDraft,components:[{type:'HEADER',format:'DOCUMENT',example:{header_handle:['4::handle']}},...textDraft.components]},
  {...textDraft,components:[{type:'HEADER',format:'VIDEO',example:{header_handle:['']}},...textDraft.components]}
])assert.throws(()=>validateTemplateDraft(draft),MetaTemplatesError);
console.log('marketing image library contract: ok');
