# Importação de produção e financeiro

1. Fora do checkout, coloque os XLSX/ZIP de origem em uma pasta. Com Python e `openpyxl` disponíveis, execute `python scripts/production-import/extract.py PASTA_ORIGEM PASTA_SAIDA`.
2. No Financeiro, use **Importar produção e equipe**, selecione `importacao.json` e confira os números e pendências. O botão de gravação cria backup no servidor antes dos cadastros e lançamentos.
3. Confira os pagamentos e os vencimentos antes de usar os saldos. O extrator não determina vencimentos contratuais: a data da apresentação é uma referência explicitada na prévia. Pagamentos com data comprovada nas planilhas e meio não informado usam `Outro`.

O código não contém dados reais dos profissionais. Não faça commit dos arquivos gerados, das planilhas nem dos backups. A extração abre as planilhas somente para leitura; nenhum original é alterado.

## Critérios e limites

- Consolida nomes com normalização de acentos, maiúsculas e espaços. Nomes parecidos, apelidos e grafias diferentes não são unidos automaticamente. Pix compartilhado não prova identidade.
- Consolida apresentações por data, evento, pista e nome. Nas agendas visuais, busca primeiro data/pista/nome para complementar horários. Não inventa horários ausentes. As ordens são numeradas dentro de evento/pista segundo a ordem encontrada nas fontes.
- As abas `Dados`, calendários, agenda tabular, agendas semanais e meses antigos alimentam o pacote. Abas auxiliares, reservas, acordos e reembolsos permanecem no registro integral das fontes. Reembolsos ficam em pendência para não repetir a despesa do DJ.
- `Finalizado` no evento não significa pagamento efetuado. Somente situação financeira explícita e, para baixas, data de pagamento permitem lançamento. Sem evidência ou com divergência, a apresentação permanece na lista de pendências e fica fora da importação financeira.
- Funcionários precisam de telefone com DDD, função e dias válidos; o extrator não completa telefones por suposição. A resposta mais recente por nome/telefone é usada; o histórico completo continua no arquivo de fontes. Disponibilidade antiga não confirma presença em escala futura.
- DJs e eventos criados entram inativos, sem abrir formulários públicos. Vínculos existentes, horários e valores anteriores são preservados. Eventos com nome diferente na mesma data exigem vínculo manual; não são unidos por aproximação.
- O cadastro é comparado ao servidor no momento da prévia. Lançamentos usam IDs externos determinísticos e checagem conservadora de contas manuais existentes. O servidor continua aplicando revisões, validação e auditoria.
- A importação usa as APIs existentes em etapas: cadastros/eventos, equipe e lotes financeiros. Não é uma transação única. Em caso de interrupção, gere outra prévia; os IDs permitem retomar sem duplicar lançamentos. O backup antecede a primeira alteração, mas não é uma restauração automática.
- As abas auxiliares não são importadas como despesas independentes. Itens em `pendencias.json` precisam de conciliação; ter uma ocorrência nessa lista não significa dívida.

## Influencers

O valor é **R$ 3 por pessoa/evento**, exclusivamente após confirmação explícita da entrada pela portaria. Inscrição sozinha, compra e presença estimada na Zig não geram evidência neste fluxo.

No Financeiro, busque a inscrição, confira a entrada e confirme. Depois use **Gerar R$ 3 por entrada ainda sem repasse**. Cada entrada gera uma conta a pagar vinculada ao influencer e ao evento, com operador, data e inscrição no histórico. Reinscrições com mesmo nome normalizado e telefone não pagam duas vezes; inscrição atribuída a influencers diferentes fica bloqueada para resolver a atribuição. Este fluxo depende de conferência manual; não é integração automática com catraca ou Zig.

`Chave Pix` e `Beneficiário do Pix` podem ser editados no cadastro de DJs e influencers. O sistema registra contas; não realiza transferências bancárias.

## Verificação

- `npm run build`
- `npm run lint`
- `npm run test:server`
- `npm run test:production-import` (Node 22.18+ ou 24, para executar o planejador TypeScript diretamente)

Os testes cobrem idempotência, vínculos ambíguos, lançamento manual anterior, evidência de entrada, duplicação, múltiplas listas, backup, permissões e gravação dos repasses pela API.
