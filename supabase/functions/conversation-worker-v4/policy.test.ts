import {assert,assertEquals} from "jsr:@std/assert@1";
import {extractProductQuery,isBasketInfoQuestion,isGreetingOnly,isProductInfoQuestion,likelyTransaction,trimIntelligence} from "./policy.ts";

Deno.test("saudação simples fica determinística",()=>assert(isGreetingOnly("Boa tarde!")));

Deno.test("pergunta se existe produto não abre Flow",()=>{
  assert(isProductInfoQuestion("Vocês têm leite?"));
  assertEquals(likelyTransaction("Vocês têm leite?"),false);
  assertEquals(extractProductQuery("Vocês têm leite?"),"leite");
});

Deno.test("pergunta de preço não abre Flow",()=>{
  assert(isProductInfoQuestion("Quanto custa leite Piracanjuba?"));
  assertEquals(likelyTransaction("Quero saber quanto custa o leite"),false);
});

Deno.test("pedido explícito deve abrir Flow",()=>{
  assertEquals(likelyTransaction("Quero comprar 2 leites"),true);
  assertEquals(likelyTransaction("Me manda 3 pacotes de arroz"),true);
  assertEquals(likelyTransaction("Preciso de açúcar"),true);
});

Deno.test("pergunta sobre cesta permanece informativa",()=>{
  assert(isBasketInfoQuestion("Quanto custa a cesta básica?"));
  assertEquals(likelyTransaction("Quanto custa a cesta básica?"),false);
});

Deno.test("personalização é transacional",()=>assertEquals(likelyTransaction("Quero personalizar a cesta"),true));

Deno.test("inteligência enviada ao modelo é aparada",()=>{
  const bundle={enabled:true,knowledge:Array(10).fill({}),guidance:Array(20).fill({}),procedures:Array(8).fill({})};
  const x=trimIntelligence(bundle);
  assertEquals(x.knowledge.length,4);
  assertEquals(x.guidance.length,5);
  assertEquals(x.procedures.length,2);
});
