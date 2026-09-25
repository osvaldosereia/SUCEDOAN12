# Dona Antônia Operations 2.0 — Readiness para Projeto Final

> Atualização: 2026-09-25.

## Avaliação
A análise de arquitetura está madura o suficiente para consolidar o Projeto Final.

O que ainda falta não é descobrir novos módulos; são homologações.

## Homologações obrigatórias

### Fiscal/contador
- NF-e antes da saída + pagamento domiciliar;
- grupo pagamento NF-e;
- cesta/rateio;
- devolução/retorno;
- CFOP 5.927/perdas;
- compra CPF;
- regime/CST/CSOSN;
- crédito ICMS quando aplicável;
- reforma tributária/IBS/CBS se atingir o regime no período.

### Bling
- escopo Situações/Módulos;
- usuários/perfis;
- reserva;
- webhooks;
- Checkout;
- Check-in;
- lotes;
- Geral/Quarentena;
- notas de devolução;
- formas de pagamento.

### Hardware
- leitor Bluetooth;
- leitor USB;
- tablets;
- impressora térmica;
- POS.

### PapoAI
- payload real;
- templates;
- localização;
- confirmação;
- cancelamento;
- handoff.

## Novas observações incorporadas
- CDC/e-commerce exige fluxo claro de cancelamento/arrependimento;
- recall por lote deve ser suportado;
- Check-in Bling elimina boa parte da lógica custom de divergência de compra;
- saldo virtual Bling é candidato natural ao estoque vendável do site;
- DANFE Simplificado Tipo 2 do Bling, lançado em setembro/2026, aceita bobina térmica a partir de 56 mm e combina com a infraestrutura de impressão local.

Fonte DANFE:
https://ajuda.bling.com.br/hc/pt-br/articles/43215614302487--Atualiza%C3%A7%C3%B5es-da-vers%C3%A3o-Emiss%C3%A3o-de-DANFE-Simplificado-Tipo-2-para-NF-e

## Conclusão
Próximo passo adequado:
consolidar `PROJECT-MASTER.md` com tudo que já foi aprovado em análise.

Ainda não implementar.
