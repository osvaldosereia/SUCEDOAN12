import type {AdminCatalogSnapshot,CatalogRepository} from '../catalog';
import {CatalogConflict} from '../catalog';
const clone=(s:AdminCatalogSnapshot):AdminCatalogSnapshot=>structuredClone(s);
/** Test-only store. Replace by authenticated database adapter in isolated staging. */
export class MemoryCatalogStore implements CatalogRepository{
 private current:AdminCatalogSnapshot;
 constructor(initial:AdminCatalogSnapshot){this.current=clone(initial);}
 async loadAdmin(){return clone(this.current);}
 async saveIfRevision(expectedRevision:number,next:AdminCatalogSnapshot){
   if(this.current.revision!==expectedRevision)throw new CatalogConflict();
   if(next.revision!==expectedRevision+1)throw Error('Revisão inconsistente');
   this.current=clone(next);
   return clone(this.current);
 }
}
