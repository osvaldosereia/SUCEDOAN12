# App Dona Antônia

Projeto separado do `comprar/` atual.

## Estado

**OFF / ISOLADO / NÃO PUBLICADO**

Durante as Rodadas 0–24:

- não modificar `comprar/`;
- não gerar pedidos reais;
- não enviar push/mensagens para clientes reais;
- não usar Bling, Meta, PapoAI ou logística de produção;
- não usar o Supabase operacional para escritas do app;
- não publicar rota pública do app;
- manter todas as flags de efeito real em `false`.

## Desenvolvimento

A Rodada 0 existe apenas para blindagem.

Comandos:

```bash
npm run verify:isolation
npm run test:no-production-effects
npm run test:isolation
npm test
```

O projeto funcional começa somente na Rodada 1.

## Documentos oficiais

- Design: `docs/superpowers/specs/2026-09-18-app-dona-antonia-ios-android-design.md`
- Plano: `docs/superpowers/plans/2026-09-18-app-dona-antonia-rodadas-implementacao.md`
- Estado: `app-dona-antonia/PROJECT-STATUS.md`

A integração com produção só pode ser considerada na Rodada 25 e exige autorização explícita.
