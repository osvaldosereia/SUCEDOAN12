const score=v=>Math.max(0,Math.min(1,Number(v||0)));
const upper=v=>String(v??'').trim().toUpperCase();

export const PIPELINE_VERSION='grid18-studio-v2-high-clean';
export const POLICY={
  sourceIdentityMin:0.92,
  sourceQualityMin:0.80,
  fidelityMin:0.90,
  compositionMin:0.90,
  cutoutMin:0.90,
  backgroundMin:0.90,
};

export function firebaseProductActive(record){
  if(!record||typeof record!=='object'||Array.isArray(record))return false;
  if(typeof record.ativo==='boolean')return record.ativo;
  if(typeof record.is_active==='boolean')return record.is_active;
  if(record.visivel===false)return false;
  const raw=upper(record.situacao??record.status);
  if(['I','INATIVO','INACTIVE','0','FALSE'].includes(raw))return false;
  if(['A','ATIVO','ACTIVE','1','TRUE'].includes(raw))return true;
  // Legacy Firebase products commonly have no explicit status; presence in
  // /produtos with no inactive marker has historically meant active.
  return true;
}

export function sourceInspectionAccepted(v){
  return Boolean(v)
    && score(v.same_product_confidence)>=POLICY.sourceIdentityMin
    && v.product_complete===true
    && v.bad_crop===false
    && v.bad_cutout===false
    && v.extra_elements===false
    && v.front_or_usable_view===true
    && score(v.source_quality_score)>=POLICY.sourceQualityMin;
}

export function finalValidationAccepted(v){
  return Boolean(v)
    && v.same_product===true
    && v.packaging_color_match===true
    && v.shape_match===true
    && v.product_complete===true
    && v.bad_crop===false
    && v.bad_cutout===false
    && v.extra_elements===false
    && v.professional_photo===true
    && v.natural_contact_shadow===true
    && score(v.fidelity_score)>=POLICY.fidelityMin
    && score(v.composition_score)>=POLICY.compositionMin
    && score(v.cutout_score)>=POLICY.cutoutMin
    && score(v.background_score)>=POLICY.backgroundMin;
}
