import {useCallback,useEffect,useState} from 'react';
import {isActiveAdminSection} from '../navigation';
import type {AvailableAdminSection} from '../navigation';

/** Urls leves e compartilháveis, sem necessidade de configurar rewrite no servidor. */
function currentSection():AvailableAdminSection{
  const value=new URLSearchParams(window.location.search).get('secao')??'inicio';
  return isActiveAdminSection(value)?value:'inicio';
}
export function useAdminSectionRoute():[AvailableAdminSection,(section:AvailableAdminSection)=>void] {
  const [section,setSection]=useState<AvailableAdminSection>(currentSection);
  useEffect(()=>{
    const onHistory=()=>setSection(currentSection());
    window.addEventListener('popstate',onHistory);
    return ()=>window.removeEventListener('popstate',onHistory);
  },[]);
  const navigate=useCallback((next:AvailableAdminSection)=>{
    if(next===currentSection()){setSection(next);return;}
    const url=new URL(window.location.href);
    if(next==='inicio')url.searchParams.delete('secao');
    else url.searchParams.set('secao',next);
    window.history.pushState({section:next},'',url);
    setSection(next);
    window.scrollTo({top:0,behavior:'auto'});
  },[]);
  return [section,navigate];
}
