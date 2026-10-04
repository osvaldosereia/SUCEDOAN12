# Cache-bust deferido — PR #733

O plano previa trocar o query-string de `attendance-audio-recorder.js` no `index.html` para `audio-webcodecs-v1`. Durante a execução, `vitrine/admin/atendimento/index.html` avançou em paralelo na `main` com a aba Ofertas. O conector GitHub disponível nesta sessão não expõe operação de patch de escrita; substituir o arquivo inteiro apenas para um query-string aumentaria desnecessariamente o risco de perder mudanças paralelas.

Decisão: deferir somente o cache-bust explícito. O gravador WebCodecs continua funcional; no primeiro canário humano, usar Ctrl+F5 antes do teste. Esse item é de rollout/cache, não altera codec, Ogg, canário, idempotência, segurança ou transporte Meta.
