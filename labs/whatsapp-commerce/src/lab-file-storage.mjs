/**
 * LAB-ONLY single-process local snapshot persistence.
 *
 * This stores SYNTHETIC customer data only. DO NOT deploy as durable customer
 * storage: multi-worker locks, transactional database, encryption-at-rest,
 * access-control and retention policy are required for production.
 *
 * Node local filesystem, no database keys, no network operations.
 */
import {readFileSync,writeFileSync,renameSync,unlinkSync,mkdirSync,statSync} from 'node:fs';
import {dirname,resolve,isAbsolute} from 'node:path';
import {randomUUID} from 'node:crypto';

const MAX_BYTES=4*1024*1024;
export function createSingleProcessLabFileStorage(file){
  if(typeof file!=='string'||!isAbsolute(file)||file.includes('\0'))throw Error('lab_storage_absolute_path_required');
  const target=resolve(file);
  if(!target.endsWith('.lab.json'))throw Error('lab_storage_extension_required');
  mkdirSync(dirname(target),{recursive:true,mode:0o700});
  function load(){
    let value;
    try{
      if(statSync(target).size>MAX_BYTES)throw Error('lab_snapshot_too_large');
      value=readFileSync(target,'utf8');
    }catch(error){
      if(error?.code==='ENOENT')return null;
      throw error;
    }
    let data;
    try{data=JSON.parse(value)}catch{throw Error('lab_snapshot_corrupt')}
    if(!data||typeof data!=='object'||data.version!==1)
      throw Error('lab_snapshot_schema_invalid');
    return data;
  }
  function save(snapshot){
    if(!snapshot||snapshot.version!==1||!Array.isArray(snapshot.sessions)||!Array.isArray(snapshot.orders))
      throw Error('lab_snapshot_invalid');
    const json=JSON.stringify(snapshot);
    if(Buffer.byteLength(json)>MAX_BYTES)throw Error('lab_snapshot_too_large');
    const temp=target+'.'+randomUUID()+'.tmp';
    try{
      writeFileSync(temp,json,{mode:0o600,flag:'wx'});
      renameSync(temp,target);
    }finally{
      try{unlinkSync(temp)}catch(e){if(e?.code!=='ENOENT')throw e}
    }
  }
  return {load,save};
}
