// SI5: output is internal evidence to review, NEVER a tax or logistics master.
export const gtinText = (v) => String(v ?? "").trim();
const stripControl = (v, max=400) =>
  typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g," ").trim().slice(0,max) : "";
const code = (v, digits) => {
  const s=gtinText(v);
  return new RegExp("^\\d{"+digits+"}$").test(s) ? s : null;
};
const posNum = (v) => {
  if(v===null || v===undefined || v==="" || typeof v==="boolean")return null;
  const n=Number(String(v).replace(",","."));return Number.isFinite(n)&&n>0?n:null;
};
const nutritionKeys=new Set(["energia_kcal","proteinas_g","carboidratos_g","acucares_g",
  "gorduras_g","gorduras_saturadas_g","fibras_g","sodio_mg"]);
export const observedKeys=["produto","marca","categoria","ncm","cest_codigo","peso",
  "embalagem","quantidade_embalagem","imagem_url","ingredientes","alergenos",
  "pode_conter","porcao","nutrientes"];
export function si5Proposal(payload, requestedGtin) {
  // Never numerically coerce GTIN; leading zeros are significant.
  const exact = gtinText(payload?.codbar)===requestedGtin;
  const nutrients={};
  const sourceNutrition=payload?.nutrientes;
  if(sourceNutrition && typeof sourceNutrition==="object" && !Array.isArray(sourceNutrition)){
    for(const [key,value] of Object.entries(sourceNutrition)){
      if(nutritionKeys.has(key)) {
        const n=posNum(value);
        if(n!==null && n<100000)nutrients[key]=n;
      }
    }
  }
  const image=stripControl(payload?.imagem_url,500);
  return {exact,observedFields:observedKeys.filter(k=>payload?.[k]!=null),
    proposed:{
      product_name_candidate:stripControl(payload?.produto,250)||null,
      brand_candidate:stripControl(payload?.marca,120)||null,
      category_candidate:stripControl(payload?.categoria,150)||null,
      ncm_candidate:code(payload?.ncm,8),
      cest_candidate:code(payload?.cest_codigo,7),
      // The sample contract does not confirm which measurement the weight means.
      reported_weight_raw:posNum(payload?.peso),
      weight_unit_unverified:true,
      packaging_candidate:stripControl(payload?.embalagem,120)||null,
      units_per_pack_candidate:posNum(payload?.quantidade_embalagem),
      ingredients_candidate:stripControl(payload?.ingredientes,1500)||null,
      allergens_candidate:stripControl(payload?.alergenos,500)||null,
      may_contain_candidate:stripControl(payload?.pode_conter,500)||null,
      serving_candidate:stripControl(payload?.porcao,80)||null,
      nutrition_candidate:Object.keys(nutrients).length?nutrients:null,
      image_reference:image.startsWith("https://global.si5.com.br/img/")?image:null
    }};
}