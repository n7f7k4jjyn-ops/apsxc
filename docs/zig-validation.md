# Validação Zig (Gravar e Pendências) em navegador

Executada com `npm run build && npm run test:e2e:zig` (`scripts/zig-e2e.mjs`): Chromium (Playwright) contra o servidor real, base de teste temporária e Zig simulada (somente GET). Nenhum banco ou token real é usado.

| # | Verificação | Resultado |
|---|-------------|-----------|
| 1 | Prévia não grava; Gravar → confirmação → relatório → Pendências; preenche só campos vazios, preserva clientes só do destino, sem CPF duplicado, Financeiro intocado | OK |
| 2 | Repetir a mesma importação: sem duplicar clientes, vínculos ou pendências | OK |
| 3 | Base alterada após a prévia: gravação recusada (409), nada escrito | OK |
| 4 | Backup completo e recuperável antes de gravar; falha no backup: nada gravado | OK |
| 5 | Vincular, criar (CPF já usado não duplica) e ignorar; resolver de novo = 409; chave inexistente = 404; outros usuários = 403, anônimo = 401 | OK |
| 6 | Decisões salvas não escondem pendências de outros clientes/eventos | OK |
| 7 | `/apps`: Meta Pixel e Zig começam fechados; rolagem real no desktop (1280x720) e celular (390x700) | OK |
