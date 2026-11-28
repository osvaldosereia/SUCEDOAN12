// NF-e source-of-truth catalog extractor; NO product, fiscal, price or stock writes.
import { XMLParser, XMLValidator } from "npm:fast-xml-parser@5.11.2";

const digits=v=>String(v??"").replace(/\D/g,"");
const str=(v,n=500)=>String(v??"").trim().slice(0,n)||null;
const decimal=v=>{
 if(v===null||v===undefined||v==="")return null;
 const s=String(v).trim();
 if(!/^-?\d+(?:[.,]\d+)?$/.test(s))return null;
 const n=Number(s.replace(",","."));return Number.isFinite(n)?n:null;
};
const list=v=>v==null?[]:Array.isArray(v)?v:[v];
const object=v=>v&&typeof v==="object"&&!Array.isArray(v)?v:{};
export function extractCatalogFromNfe(xml,expectedKey) {
 if(typeof xml!=="string"||!xml.trim()||xml.length>10*1024*1024)
   throw new Error("xml_size_invalid");
 // Do not allow DTD, external entities or expansive entity replacement.
 if(/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml))throw new Error("xml_dtd_forbidden");
 const valid=XMLValidator.validate(xml);
 if(valid!==true)throw new Error("xml_malformed");
 const root=new XMLParser({
   ignoreAttributes:false,attributeNamePrefix:"@_",
   removeNSPrefix:true,parseTagValue:false,parseAttributeValue:false,
   processEntities:false,trimValues:true,
   isArray:(tag)=>tag==="det"||tag==="rastro"
 }).parse(xml);
 const nfe=object(root?.nfeProc?.NFe||root?.NFe||root?.enviNFe?.NFe);
 const inf=object(nfe.infNFe);
 const key=digits(String(inf["@_Id"]||"").replace(/^NFe/i,"")||
    root?.nfeProc?.protNFe?.infProt?.chNFe||"");
 if(key.length!==44||key!==digits(expectedKey))
   throw new Error("xml_document_key_mismatch");
 const emit=object(inf.emit),dest=object(inf.dest);
 const extractedItems=[];
 const itemNos=new Set();
 for(const det of list(inf.det)){
   const d=object(det),prod=object(d.prod),imposto=object(d.imposto);
   const num=Number(d["@_nItem"]);
   if(!Number.isInteger(num)||num<1||num>99999||itemNos.has(num))
      throw new Error("xml_item_number_invalid");
   itemNos.add(num);
   const icms=object(imposto.ICMS);
   const icmsType=object(Object.values(icms)[0]);
   const ncm=digits(prod.NCM),cest=digits(prod.CEST);
   const orig=digits(icmsType.orig);
   const cst=digits(icmsType.CST),csosn=digits(icmsType.CSOSN);
   const rastros=list(prod.rastro).map(x=>object(x));
   const purchaseQty=decimal(prod.qCom),unitPrice=decimal(prod.vUnCom);
   const gross=decimal(prod.vProd),discount=decimal(prod.vDesc)||0,
         freight=decimal(prod.vFrete)||0,insurance=decimal(prod.vSeg)||0,
         other=decimal(prod.vOutro)||0;
   extractedItems.push({
     item_number:num,supplier_item_code:str(prod.cProd,120),
     description:str(prod.xProd,500),
     commercial_gtin:str(prod.cEAN,30),tax_gtin:str(prod.cEANTrib,30),
     ncm:ncm.length===8?ncm:null,cest:cest.length===7?cest:null,
     cfop:str(prod.CFOP,4),tax_code:cst?"CST:"+cst:csosn?"CSOSN:"+csosn:null,
     origin_code:orig.length===1?Number(orig):null,
     purchase_unit:str(prod.uCom,15),purchase_quantity:purchaseQty,
     purchase_unit_price:unitPrice,tax_unit:str(prod.uTrib,15),
     tax_quantity:decimal(prod.qTrib),line_total:gross,
     net_line_total:gross===null?null:gross-discount+freight+insurance+other,
     lot_traces:rastros,tax_detail:imposto,
     raw_item:{prod,imposto}
   });
 }
 if(!extractedItems.length)throw new Error("xml_without_products");
 return {
   key,
   invoice_number:str(inf?.ide?.nNF,30),
   supplier_document:digits(emit.CNPJ||emit.CPF),
   recipient_document:digits(dest.CNPJ||dest.CPF),
   items:extractedItems
 };
}
