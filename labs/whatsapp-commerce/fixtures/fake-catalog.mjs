/**
 * Fully synthetic demo catalog. Nothing here was copied from private tables.
 * This is NOT a quote or an offer from Dona Antônia.
 */
export function makeFakeCatalog(){
  const sizes=[
    ['Econômica',14,9200],['Mini Completa',23,17500],
    ['Pequena Completa',27,23000],['Média Completa',27,34000],
    ['Grande Completa',27,41000]
  ];
  return {
    version:'lab-fake-1',
    models:sizes.flatMap(([name,size,base],i)=>
      [1,2,3].map(composition=>{
        const conditionalProductId='lab-conditional-'+(i+1);
        const positions=Array.from({length:size},(_,j)=>{
          const id='pos-'+j,price=150+(j%7)*130+(i*50),key=(i+1)+'-'+composition+'-'+j;
          const options=[
            {id:j===0&&composition===2?conditionalProductId:key+'-a',name:'Marca A • '+(j+1),price_cents:price,active:true,image_url:''},
            {id:key+'-b',name:'Marca B • '+(j+1),price_cents:price+125,active:true,image_url:''},
            {id:key+'-c',name:'Marca C • '+(j+1),price_cents:price+250,active:true,image_url:''}
          ];
          if(j===0&&composition!==2)options.push({id:conditionalProductId,name:'Marca condicional',price_cents:price,active:true,image_url:''});
          return {id,label:['Arroz','Feijão','Café','Óleo','Açúcar','Macarrão','Higiene'][j%7],
            quantity:1,removable:true,default_id:options[0].id,options};
        });
        const productSum=positions.reduce((t,p)=>t+p.options.find(o=>o.id===p.default_id).price_cents*p.quantity,0);
        const target=base+(composition-1)*350;
        return {
          id:'lab-'+(i+1), name,composition,
          pricing:{
            fixed_hidden_cents:target-productSum-(composition===2?275:0),
            conditional_enabled:true,
            conditional_product_id:conditionalProductId,
            conditional_cents:275
          },
          positions
        };
      })
    )
  };
}
export function makeFakeStock(catalog,amount=50){
  const s={};for(const m of catalog.models)for(const p of m.positions)
    for(const o of p.options)s[o.id]=amount;
  return s;
}
export const fakeExtraCatalog={
  'lab-extra-oleo':{id:'lab-extra-oleo',name:'Óleo 900 ml (fictício)',price_cents:799,active:true},
  'lab-extra-leite':{id:'lab-extra-leite',name:'Leite 1 L (fictício)',price_cents:450,active:true}
};
