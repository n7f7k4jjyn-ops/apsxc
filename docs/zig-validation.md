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

## Integridade de faturamento e presença

A importação financeira consulta `GET /erp/faturamento` e usa `value`, em centavos inteiros, por `eventId` e `paymentId`. A saída de produtos permanece como detalhamento de consumo, sem ser somada ao faturamento, à adquirência ou ao repasse bancário. O contrato foi conferido na documentação Zig fornecida pelo usuário.

- Horários sem offset são interpretados como horários operacionais de Curitiba (UTC−03). Horários com offset são preservados. A seleção de eventos usa o dia local, inclusive na virada da madrugada.
- Compras podem complementar o cadastro, mas não aumentam público ou conversão sem um check-in associado ao evento. A associação por janela continua provisória; não se declara contagem oficial de portaria.
- Uma loja precisa pertencer à rede configurada antes da consulta. Faturamento de outra loja, pagamentos repetidos e valores ausentes/inválidos são recusados.
- A gravação exige a impressão digital da prévia completa; mudar valor, evento, loja, período ou plano exige nova confirmação. O teste altera o valor mantendo a quantidade de lançamentos e verifica HTTP 409 sem gravação.
- Lançamentos antigos `zig:sales:*` não são sobrescritos nem somados a uma nova importação: a divergência bloqueia a gravação para conferência. Os novos usam `zig:billing:*`.
- Resumos anteriores ao contrato corrigido não entram nos totais; o painel informa a necessidade de consultar novamente. O histórico é preservado e a leitura separa cada loja.

Regressão de ponta a ponta: consumo de R$55,00 e faturamento de R$30.693,74 permanecem separados. São respostas simuladas para testar o cálculo, não uma consulta ao fechamento em produção. `ZIG_SALES_BROWSER=1 node --test tests/zig-sales.integration.test.mjs` também confere a apresentação no Chromium após o build.
