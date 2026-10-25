# Carregamento mobile

Validação em Chromium, viewport 390 × 844, sessão autenticada, cache novo,
mesma base de teste e relógio fixo. Foram contabilizados os arquivos JavaScript
solicitados até 2,2 segundos depois de aparecer o gráfico do Resumo.

| Medida | Antes (f0fa614b) | Depois |
| --- | ---: | ---: |
| JavaScript solicitado, sem compressão | 1.601.092 bytes | 965.827 bytes |
| Módulo do Resumo, minificado | 385,24 KB | 25,48 KB |

A redução de JavaScript solicitado foi de 39,7%. Essa medida inclui dependências
compartilhadas e a antiga pré-carga da agenda e inscrições. Não representa uma
nota Lighthouse nem um tempo de carregamento medido em produção.

- O gráfico do Resumo usa SVG responsivo, sem a biblioteca completa de gráficos.
- Resumo financeiro, busca, financeiro, cadastros, escalas e relatório de repasses
  carregam quando necessários. Os relatórios têm uma espera dentro do próprio
  pop-up para manter a tela disponível enquanto o módulo é baixado.
- A pré-carga automática de agenda e inscrições fica restrita ao desktop,
  respeitando também economia de dados e conexões 2G.
- O build gera Brotli e Gzip uma vez. O servidor negocia a variante, preserva o
  tipo do arquivo, informa `Vary: Accept-Encoding` e mantém o cache dos arquivos
  com hash. Builds antigos continuam funcionando sem arquivos compactados.
- O HTML personalizado de formulários permanece dinâmico e sem cache.

O teste `tests/mobile-performance.browser.test.mjs`, incluído no CI, verifica o
limite de 1 MB de JavaScript sem compressão, ausência de pré-carga de módulos
opcionais, largura do Resumo e abertura da busca. Os testes de servidor verificam
descompressão idêntica ao original, negociação, HEAD e formulários personalizados.

Após o deploy, repetir o teste mobile da Hostinger para obter a nota atual.
