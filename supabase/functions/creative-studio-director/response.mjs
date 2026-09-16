export function extractOutputText(payload={}){
  if(typeof payload?.output_text==='string'&&payload.output_text.trim())return payload.output_text.trim();
  const output=Array.isArray(payload?.output)?payload.output:[];
  for(const item of output){
    const content=Array.isArray(item?.content)?item.content:[];
    for(const part of content){
      if(typeof part?.text==='string'&&part.text.trim())return part.text.trim();
    }
  }
  return '';
}
