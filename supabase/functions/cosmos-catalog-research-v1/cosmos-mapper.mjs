// Pure mapper: external data becomes a review-only candidate, never a fiscal truth.
export const digits = (v) => String(v ?? "").replace(/\D/g, "");
const clean = (v, n=250) => String(v ?? "").replace(/[\x00-\x1f\x7f]/g, " ").trim().slice(0,n);
const num = (v) => v === null || v === undefined || v === ""
  ? null : Number.isFinite(Number(v)) && Number(v)>0 ? Number(v) : null;
export const allowedKeys = ["description","gtin","brand","gpc","ncm","net_weight","gross_weight","height","width","length","thumbnail"];
export function proposal(item, requestedGtin) {
  const exact=digits(item?.gtin)===requestedGtin;
  const dims=["height","width","length"].map(k=>num(item?.[k]));
  // Units are not guaranteed by the API. Never publish unverified measures.
  return {exact,normalized:{
    description:clean(item?.description,250)||null,
    brand:clean(item?.brand?.name,100)||null,
    gpc:clean(item?.gpc?.code,30)||null,
    ncm_candidate:clean(item?.ncm?.code,12)||null,
    net_weight_raw:num(item?.net_weight),
    gross_weight_raw:num(item?.gross_weight),
    dimensions_raw:dims.every(Boolean) ? {height:dims[0],width:dims[1],length:dims[2]}:null,
    thumbnail_source:typeof item?.thumbnail==="string" && item.thumbnail.startsWith("https://")
      ? clean(item.thumbnail,500):null
  }};
}