# Central Verdant

<!-- persistence redeploy check: 2026-10-19 #2 -->

Painel interno e formulários públicos da Verdant CWB. A interface usa React, TypeScript, Vite e TanStack Router. O servidor Node.js fornece autenticação, API, persistência e páginas dos formulários.

## Desenvolvimento local

Requisitos: Node.js 22 e npm.

```bash
npm ci
npm run dev
```

O Vite serve a interface durante o desenvolvimento. Para testar a API e a autenticação, configure as variáveis abaixo e execute o servidor Node depois de gerar o build:

```bash
npm run build
npm start
```

O servidor escuta a porta `PORT` (padrão `3000`) e serve os arquivos compilados de `dist/`.

## Configuração

Copie `.env.example` para o ambiente privado da hospedagem e configure:

- `VERDANT_USERS_JSON`: contas iniciais. Gere um hash de senha com `npm run auth:hash`; não armazene senhas reais no repositório.
- `VERDANT_ADMIN_USERNAME`: opcionalmente identifica a conta ativa que deve receber o papel `admin` no bootstrap. Configure-o no ambiente privado da hospedagem para determinar explicitamente a pessoa administradora.
- `VERDANT_INTEGRATION_ENCRYPTION_KEY`: chave AES-256-GCM privada (32 bytes em base64 ou 64 caracteres hexadecimais), necessária para guardar segredo de OAuth/token. Gere-a fora do repositório, por exemplo com `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"`, e mantenha backup seguro; sem a chave, segredos salvos não poderão ser recuperados.
- `PUBLIC_BASE_URL`: origem pública usada nos links e metadados de compartilhamento. O padrão é `https://central.verdantcwb.com`.
- `TRUST_PROXY_HOPS`: permanece `0` por padrão, então `X-Forwarded-For` não pode escolher o IP usado nos limites de tentativas. Configure apenas o número de proxies reversos controlados pela hospedagem, depois de confirmar a cadeia de cabeçalhos.
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` e `DB_PASSWORD`: configure todos para usar MySQL. Sem eles, os dados ficam em arquivos JSON no diretório `storage/`.

Mantenha `storage/` em volume persistente. O modo JSON pressupõe uma instância Node; use MySQL se executar múltiplas instâncias. O servidor cria arquivos e tabelas ausentes na primeira execução, mas preserva arquivos JSON ilegíveis e retorna erro em vez de substituí-los pelo seed.

As sessões usam cookies `HttpOnly`, `SameSite=Lax` e `Secure` em produção. A validade é de 12 horas ou 30 dias quando “manter conectado” está selecionado. Os registros de sessão sobrevivem a reinicializações: ficam no MySQL quando configurado ou em `storage/sessions.json`, com o token armazenado como hash. Faça backup de `storage/` ou do banco antes de atualizar o servidor.

As gravações do estado incluem uma revisão crescente. Quando duas telas tentam salvar a mesma revisão, a API responde `409` e devolve a versão atual em vez de descartar silenciosamente a edição concorrente.

## Papéis e permissões

As contas usam os papéis `admin`, `operator` e `viewer`. Administradores podem gerenciar usuários e papéis; Operação pode alterar agenda, formulários, profissionais, importar clientes, gerenciar tarefas e usar o chat interno; Consulta acessa dados e exportações sem permissão para alterar dados ou preferências. Preferências pessoais são editáveis por `admin` e `operator`. As permissões são verificadas pelo servidor em cada endpoint; ocultar uma opção na interface não substitui essa verificação. O chat interno verifica mensagens a cada 10 segundos enquanto o painel está aberto; o aviso visual é automático e o som é opcional, ativado pelo usuário no próprio chat.

Os endpoints públicos de leitura dos formulários e envio de inscrições permanecem sem login para permitir inscrição de clientes; o servidor valida formulário habilitado, período de abertura e campos antes de aceitar cada envio.

Contas novas criadas no painel recebem `operator` por padrão. A conta configurada no servidor (`VERDANT_USERS_JSON`) com e-mail `brn@scopedeal.com.br` ou usuário `eibrnof` é a identidade Admin Master/DEV: sempre tem todos os privilégios (`admin`), não aparece na lista da equipe/atribuições/chat e não pode ser editada nem reivindicada pelo painel. Ela precisa existir com `passwordHash` no ambiente (ou no arquivo de equipe); nenhuma credencial é criada pelo código. Para compatibilidade com contas antigas sem papel, defina `VERDANT_ADMIN_USERNAME` para escolher a conta administradora; se não estiver definido e ainda não houver um administrador ativo explícito, a primeira conta ativa legada sem papel na ordem de configuração recebe `admin`, e as demais contas legadas recebem `viewer`. Contas com papéis explícitos mantêm esses papéis. Preserve ao menos uma conta administradora ativa e configure explicitamente `VERDANT_ADMIN_USERNAME` em produção para evitar depender da ordem de contas legadas.

Na tela **Apps**, administradores podem guardar o ID do Meta Pixel, destinos de contato e credenciais para configuração futura. Esses dados não ativam Pixel, rastreamento, atalhos ou conexões nesta versão. Segredos OAuth/tokens são criptografados no servidor e nunca devolvidos pela API; Gmail e Telegram ainda exigem fluxos de autorização antes de qualquer sincronização ou envio.

## Publicação

Publique como aplicação Node.js:

1. Instale as dependências com `npm ci`.
2. Gere os arquivos com `npm run build`.
3. Inicie `node server.mjs` (ou `npm start`) e configure `PORT` conforme a plataforma.
4. Mantenha `storage/` persistente ou configure MySQL, além das variáveis privadas de autenticação.

Hospedagem apenas estática (por exemplo, publicar `dist/` em um CDN sem iniciar `server.mjs`) não fornece login, API nem gravação de dados. O arquivo `netlify.toml` oferece somente o fallback de navegação SPA; não substitui o servidor da aplicação.

## Integrações

As áreas Google Analytics e Meta/Instagram informam que ainda não há conexão e não exibem métricas de demonstração. Para ativá-las, será necessário configurar credenciais e permissões aprovadas para as contas correspondentes.

### Zig (conexão, prévia, Gravar e Pendências)

Na tela **Apps** (somente a conta Admin Master `eibrnof`; validada no servidor em `/api/admin/zig/*`, outros usuários, inclusive administradores, recebem 403 e não veem a seção), é possível conectar à API da Zig e gerar uma prévia do cruzamento de clientes com as listas existentes. A Zig só recebe consultas `GET`; a prévia não grava nada (veja Gravar abaixo), não cria lançamentos no Financeiro, não mexe em bônus/pagamentos e não tem sincronização agendada.

Configuração privada:

- `VERDANT_INTEGRATION_ENCRYPTION_KEY` é obrigatória no servidor; sem ela o token não é salvo.
- O token de integração é informado só pela tela, fica criptografado no servidor e nunca é devolvido pela API, exibido, registrado em logs ou versionado. Ele é enviado cru no header `Authorization` (sem `Bearer`).
- A URL base é fixa (`https://api.zigcore.com.br/integration`) e não pode ser alterada. `VERDANT_ZIG_TEST_BASE_URL` só vale com `NODE_ENV=test` (testes automatizados).

Pendente de configuração (valores ainda desconhecidos, nada é presumido): token, identificador da rede e loja Verdant. A tela mostra o que falta; depois de salvar token e rede, use **Testar conexão** e **Listar lojas da rede** para escolher a loja.

Roteiro de teste com um evento encerrado:

1. Salve token e rede, teste a conexão e selecione a loja.
2. Gere a prévia com as datas de um evento já encerrado (até 14 dias; no máximo 5 eventos).
3. Confira os grupos: vínculo encontrado, cliente novo, divergência e comandas de mesa, além dos campos vazios que a Zig poderia preencher (documento, e-mail, nascimento; documentos aparecem mascarados).
4. Confirme que Clientes, listas e Financeiro permanecem inalterados.

Premissas (também exibidas na prévia): o `id` do check-in é o userId da Zig, não um identificador único de presença; os check-ins são buscados em janelas de até 5 dias, 50 por página, e qualquer falha interrompe a prévia (nunca há sucesso parcial).

Associação check-in/compra ↔ evento (**provisória**, a confirmar com a Zig): como o check-in não traz `eventId`, o registro é associado pelo horário, de 4 h antes a 16 h após o início do evento, respeitando a virada da meia-noite. Só conta como presença o registro associado a **um único evento do período pedido**. Ficam separados em **Presença não confirmada**, sem entrar no cruzamento nem contar como presença: registros fora da janela de qualquer evento e registros compatíveis com mais de um evento (ex.: eventos consecutivos com início próximo). Registros associados a eventos vizinhos (noite anterior ou dias seguintes) são descartados e apenas contados, para não incluir pessoas de outro evento.

Datas consultadas: eventos de 1 dia antes até 2 dias depois do período (contexto para separar noites consecutivas); check-ins de `dtinicio` até `dtfim`+2 (a Zig não documenta se `dtfim` é inclusivo; janelas se sobrepõem em 1 dia e duplicados são removidos); compradores até `dtfim`+1 para cobrir a madrugada, desde que o limite de 5 eventos por consulta seja respeitado — se houver evento no dia seguinte que estoure o limite, a consulta usa só `dtfim` e a prévia avisa que compras da madrugada podem faltar.

Erros da Zig: as mensagens mostradas são sempre locais (por status HTTP); o corpo bruto da resposta nunca é lido nem repassado, pois pode ecoar o token, inclusive truncado.

#### Gravar e Pendências (somente `eibrnof`)

Após a prévia, o botão **Gravar** (`POST /api/admin/zig/apply`, exige `confirm:true` e o `expected` da prévia; se os números mudaram, responde 409 sem gravar) recalcula o plano no servidor e:

- cria os clientes novos (`sourceSystem:'zig'`, `sourceId` = ID Zig);
- vincula o ID Zig (`zigRefs`) a clientes existentes e preenche **somente campos vazios** (CPF, e-mail, nascimento); CPF já usado por outro cliente não é preenchido;
- envia divergências (telefone compartilhado, homônimos, documento conflitante, múltiplas correspondências, duplicidade interna da Zig) para **Pendências**, sem gravar nelas;
- não apaga nem sobrescreve nada, não toca o Financeiro e não faz chamadas Zig além de GET; presença não confirmada e comandas de mesa não são gravadas.

Antes de gravar é feito um backup completo de clientes e pendências em `storage/backups` (`VERDANT_BACKUP_DIR`; a pasta precisa ser gravável; reutilizado por 30 minutos). Reaplicar é idempotente. Em **Pendências** (`GET /pending`, `POST /pending/resolve`) cada item pode ser vinculado a um cliente sugerido, criado como novo ou ignorado; a decisão é salva e não reaparece. Recomenda-se rodar a gravação real com um evento já encerrado.

Nome sozinho nunca unifica cadastros; telefone compartilhado, homônimos, documentos conflitantes e múltiplas correspondências ficam para conferência. Próxima etapa: gravar vínculos (ID Zig) e dados complementares após aprovação da prévia.

### Resumo financeiro por evento (Financeiro → Resumo financeiro)

“Salvar resumo dos eventos” (`POST /api/admin/zig/report/save`, master) grava, por evento Zig do período, pessoas na casa, inscritos, vindos pela lista, conversão, total, bar, couvert/ingressos e ticket médio (receita ÷ pessoas na casa) em `storage/zig-reports.json` (`VERDANT_ZIG_REPORTS_FILE`). Nunca apaga; reexecutar atualiza. A aba lê `GET /api/finance/zig-reports` (`finance:manage`). Eventos passados sem evento no app trazem casa, receita e ticket da Zig; inscritos e conversão ficam “—”.

### Conversão e caixa Zig (somente master)

Na seção “Conversão das listas e caixa” (`POST /api/admin/zig/conversion`, `sales/preview`, `sales/apply`; só consultas GET à Zig):

- **Conversão**: cruza inscritos das listas (por evento do app na mesma data e por lista/`formKey`) com presença na Zig (telefone/documento; nome sozinho não conta; ambíguos ficam de fora). Depende da associação provisória de check-ins por horário.
- **Caixa → Financeiro** (`GET /erp/saida-produtos`): receita de bar/consumo, couvert e ingressos, uma receita já recebida por evento e tipo (categoria `general`, contraparte “Zig · Verdant”, `externalId` `zig:sales:<loja>:<evento>:<tipo>`). Recargas ZigCard e gorjetas ficam fora da receita; itens estornados não são somados. Gravar exige confirmação, gera backup `zig-finance-*.json` antes (se falhar, nada é gravado), é idempotente, recusa (409) se a prévia mudou e nunca apaga ou sobrescreve; valores diferentes de lançamentos existentes são apenas reportados como conflito.

## Verificações

```bash
npm test
npm run test:server
npm run build
npm run lint
```

`npm test` executa os testes de interface em navegador; `npm run test:server` executa os testes Node da API e dos metadados públicos. O workflow de GitHub Actions executa as verificações configuradas em cada pull request e em atualizações da branch principal.


## Trabalhe conosco

O formulário público está disponível em `/trabalhe-conosco`, sem login e independente das datas das listas de eventos. Somente nome e telefone com DDD são obrigatórios. Funções e disponibilidade aceitam múltiplas opções; experiência profissional é opcional.

O envio usa `POST /api/public/job-applications`. As candidaturas ficam separadas de clientes, profissionais e inscrições de eventos. A consulta interna está em **Formulários → Trabalhe conosco**, com paginação, e usa `GET /api/job-applications`, protegido pela permissão `business:read`.

Em MySQL, o servidor cria automaticamente a tabela `verdant_job_applications`. Em modo JSON, grava em `storage/job-applications.json`; `VERDANT_JOB_APPLICATIONS_FILE` permite mudar esse caminho. Preserve esse arquivo em volume persistente quando não houver MySQL.

Para divulgar `https://verdantcwb.com/trabalhe-conosco`, o domínio principal precisa encaminhar essa rota para a aplicação Node. Se o painel continuar em `central.verdantcwb.com`, configure no site principal um redirecionamento para `https://central.verdantcwb.com/trabalhe-conosco`, ou um proxy que também encaminhe os recursos e a API. A alteração deste repositório não configura a hospedagem do domínio principal.

## Equipe — atualização cadastral

`/equipe` recebe atualizações de quem já presta serviços à Verdant, com nome, telefone e chave Pix obrigatórios; funções e disponibilidade são opcionais e aceitam múltiplas opções. O cadastro não confirma escala ou convocação.

`POST /api/public/team-registrations` recebe os dados e confirma somente após a gravação. Os registros ficam separados das candidaturas em `verdant_team_registrations` no MySQL ou `storage/team-registrations.json` no modo JSON. O caminho local pode ser alterado com `VERDANT_TEAM_REGISTRATIONS_FILE` e precisa de armazenamento persistente.

A consulta com Pix está disponível apenas para administradores, em **Formulários → Equipe — Atualização cadastral**, e em `GET /api/team-registrations`, protegido por `team:manage`, sem cache. O envio público não retorna dados cadastrais nem permite consultar ou sobrescrever registros de outras pessoas. Administradores também podem importar respostas CSV da equipe nessa tela. A importação consolida respostas repetidas por nome e telefone, preserva funções e disponibilidade, ignora cadastros já existentes e deixa a chave Pix vazia para atualização posterior.

## Resumo da operação

O Resumo apresenta o próximo evento por padrão, com seleção de evento e período (hoje, semana ou mês). Os indicadores e o gráfico contam inscrições pela data de envio no fuso `America/Sao_Paulo`; o total do evento conta cadastros, sem somar convidados. As listas mostram abertura, encerramento, datas futuras e configurações incompletas. Os atalhos para inscrições e portaria mantêm o evento selecionado.

`GET /api/dashboard-summary` exige `business:read` e retorna apenas contagens de candidaturas, contagem de atualizações da equipe para administradores e tarefas pendentes priorizadas por prazo. Não retorna Pix ou dados pessoais dos cadastros. Esse resumo atualiza a cada 30 segundos e ao retornar à janela; o estado operacional continua sincronizado e pausa sua consulta periódica em abas ocultas. Falhas aparecem na interface, sem apresentar zeros como se fossem dados confirmados.


## Central de cadastros

`/verdant/cadastros` reúne Clientes, DJs, Influencers, Equipe e Candidatos. As rotas antigas de clientes e profissionais continuam disponíveis na central. No celular, as categorias usam um seletor e os resultados aparecem como cards.

Clientes são agrupados para consulta por nome normalizado e contato, preservando o histórico original; pessoas com telefone compartilhado e nomes diferentes continuam separadas. A base importada continua paginada. Importações e inscrições detalhadas permanecem acessíveis nas ferramentas de Clientes.

Candidaturas começam como Novas e podem passar para Em avaliação, Aprovado ou Não selecionado. Apenas administradores avaliam e adicionam candidatos aprovados à equipe. A inclusão aproveita nome, WhatsApp, funções, disponibilidade e experiência, preserva membros já existentes e aceita repetição sem duplicar o cadastro. Pix fica pendente até atualização pelo formulário da equipe. Adicionar uma pessoa à equipe de prestadores não cria acesso ao painel; usuários e permissões continuam em Acessos ao painel.

O backend mantém os históricos de atualizações cadastrais; a central exibe a atualização mais recente por nome e contato. Endpoints `/api/registry/clients`, `/api/registry/candidates` e `/api/registry/team` exigem sessão e as capacidades correspondentes; Pix e inclusão na equipe exigem `team:manage`.

## Financeiro

`/verdant/financeiro` reúne contas a pagar e receber, registro de pagamentos de equipe e DJs, caixa e relatórios CSV. O acesso é exclusivo de administradores, também na API. Se você personalizou o menu antes da implantação, habilite **Financeiro** em **Configurações → Exibição**, ou acesse a rota diretamente.

O módulo usa os eventos, DJs e cadastros da equipe existentes como referências, mas mantém os lançamentos separados das inscrições, saldos importados de clientes e escalas. Ele não altera domínios, links públicos nem a configuração do `connect.verdantcwb.com`. A publicação e a disponibilidade desse domínio continuam dependendo da hospedagem.

### Contas, pagamentos e caixa

- Cadastre receitas como **A receber** e despesas como **A pagar**, com valor em reais e vencimento. Os valores são armazenados em centavos inteiros, sem arredondar valores inválidos.
- Para pagar equipe ou DJ, escolha a categoria e o profissional já cadastrado; o evento é opcional. A chave Pix disponível no cadastro da equipe é apenas uma referência para o administrador.
- A baixa registra a data e a forma do pagamento/recebimento. **Não executa Pix, transferência, cobrança ou integração bancária.** Efetue e confira o pagamento fora do painel antes de registrar a baixa.
- Lançamentos pendentes podem ser editados ou cancelados. Para corrigir uma baixa ou desfazer um cancelamento, reabra o lançamento antes de editar; as operações mantêm histórico com responsável, data e valores anteriores. Não há exclusão definitiva pela interface. Reabrir corrige o registro e retira a baixa dos totais; não registra uma devolução bancária em outra data.
- O período das contas usa o vencimento; o caixa usa a data da baixa. Cancelados e pendentes não movimentam caixa. O saldo anterior considera as baixas registradas antes do início do período, e o saldo final soma entradas e subtrai saídas. Não é um saldo bancário consultado: importe o histórico necessário ou registre o saldo inicial como uma entrada/saída identificada, sem duplicar o histórico.
- Relatórios e exportações respeitam os filtros indicados na tela. Valores de entrada, saída e pagamentos de equipe/DJs representam apenas baixas registradas, não pagamentos presumidos a partir das listas ou escalas.

### Importar a planilha existente

Exporte a planilha do Excel ou Google Sheets como **CSV UTF-8**, separado por ponto e vírgula ou vírgula. O módulo não lê `.xlsx` diretamente. Baixe o **modelo CSV** na tela e adapte as colunas da sua planilha antes de importar:

| Coluna | Conteúdo |
| --- | --- |
| `id_externo` | Identificador único e estável por lançamento, obrigatório na importação. |
| `tipo` | `pagar` ou `receber`. |
| `categoria` | `geral`, `equipe` ou `dj`; vazia significa `geral`. Equipe/DJ exigem conta a pagar. |
| `descricao` | Descrição obrigatória. |
| `favorecido` | Fornecedor/cliente, ou nome do profissional cadastrado. |
| `valor` | Valor positivo em reais, por exemplo `1.234,56` ou `1234.56`. |
| `vencimento` | Data obrigatória em `DD/MM/AAAA` ou `AAAA-MM-DD`. |
| `status` | `pendente`, `pago`, `recebido`, `baixado` ou `cancelado`; vazia significa `pendente`. |
| `data_baixa` | Obrigatória apenas para pagos/recebidos/baixados. |
| `forma_pagamento` | Para baixados: `dinheiro`, `pix`, `transferencia`, `cartao` ou `outro`. |
| `evento_id` | Opcional, ID de um evento existente, disponível nas referências da tela. |
| `beneficiario_id` | ID de equipe/DJ, disponível nas referências. Pode ficar vazio se o nome corresponder a um único profissional da categoria. |
| `observacoes` | Observações opcionais; textos com separadores ou quebras de linha devem estar entre aspas CSV. |

Cada arquivo aceita até 1.000 lançamentos e 2 MiB. A leitura mostra uma prévia e **não grava nada sem confirmação**. Uma linha nova inválida impede a gravação do lote inteiro. IDs externos já existentes são ignorados, sem substituir registros: a prévia conserva os dados já gravados desses IDs, inclusive referências históricas de eventos ou profissionais. Mantenha esses IDs ao exportar novamente a mesma planilha e use a edição de pendentes para corrigir valores. Não reutilize um ID para contas diferentes. A importação não modifica a planilha original e não mantém sincronização automática com ela.

### Persistência e implantação

Em modo JSON, os lançamentos ficam em `storage/finance.json`; `VERDANT_FINANCE_FILE` permite alterar esse caminho. Use volume persistente e uma única instância Node nesse modo. Com MySQL configurado, o módulo usa a chave `finance` da tabela existente `verdant_app_data`. Gravações financeiras usam revisão para rejeitar conflitos (`409`); no MySQL, também usam transação e bloqueio da linha financeira. Dados ilegíveis são preservados, não substituídos por exemplos.

Antes de publicar, faça backup da base e de `storage/`, mantenha a configuração atual de hospedagem/domínios e confira a primeira importação com os totais da planilha. Nenhum dado financeiro de demonstração é criado automaticamente. A compatibilidade das colunas da planilha real precisa ser conferida com um arquivo fornecido por você.
