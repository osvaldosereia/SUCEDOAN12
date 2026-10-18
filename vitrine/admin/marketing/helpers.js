// Constantes e funções puras de segmentação comercial, sem mudança de regras.
(function(global){
  function createMarketingHelpers(normalize){
    const MARKETING_BRANDS=[
      {key:'nivea',label:'NIVEA'},
      {key:'elseve',label:'Elseve'}
    ];
    const MARKETING_SEGMENTS=[
      {key:'bebe',label:'Bebê'},
      {key:'cabelos',label:'Cabelos'},
      {key:'beleza',label:'Beleza e cuidados'},
      {key:'higiene',label:'Higiene pessoal'},
      {key:'limpeza',label:'Limpeza'},
      {key:'lavanderia',label:'Lavanderia'},
      {key:'pet',label:'Pet'},
      {key:'casa',label:'Casa'},
      {key:'doces-lanches',label:'Doces e lanches'}
    ];
    function marketingSegmentOf(p){
      const sub=normalize(p?.subcategory||'');
      const leaf=normalize(p?.subsubcategory||'');
      if(sub.includes('bebe')||leaf.includes('fralda')||leaf.includes('bebe'))return 'Bebê';
      if(sub==='cabelos')return 'Cabelos';
      if(sub.includes('beleza'))return 'Beleza e cuidados';
      if(sub.includes('higiene pessoal'))return 'Higiene pessoal';
      if(sub==='limpeza')return 'Limpeza';
      if(sub==='lavanderia')return 'Lavanderia';
      if(sub==='pets'||leaf.includes('pet')||leaf==='caes'||leaf==='gatos')return 'Pet';
      if(sub.includes('casa e utilidades'))return 'Casa';
      if(['biscoitos','chocolates e doces','balas e chicletes','salgadinhos e petiscos','bebidas','cereais e barras'].includes(leaf))return 'Doces e lanches';
      return 'Outros';
    }
    function marketingCampaignSlug(v){
      return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim()
        .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60);
    }
    return {MARKETING_BRANDS,MARKETING_SEGMENTS,marketingSegmentOf,marketingCampaignSlug};
  }
  global.DonaAntoniaAdminMarketingHelpers=Object.freeze({createMarketingHelpers});
})(window);
