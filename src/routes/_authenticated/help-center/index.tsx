import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowRight, BookOpen, CalendarDays, CheckCircle2, CircleHelp, ClipboardList, FileDown, Headphones, ListTodo, LockKeyhole, MessageSquareWarning, Settings2, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'

export const Route = createFileRoute('/_authenticated/help-center/')({ component: HelpCenter })

const sections = [
  {
    title: 'Entrar e navegar', icon: LockKeyhole, where: 'Tela de login e menu lateral / menu do usuário',
    steps: [
      'Entre com seu nome de usuário ou e-mail e a senha individual. A sessão dura 12 horas; use Sair ao terminar em um computador compartilhado.',
      'O menu lateral reúne Resumo, Tarefas, Apps, Conversas e Equipe. Em Verdant · Operação ficam Agenda, Formulários, Clientes, cadastros profissionais e Configurações Verdant.',
      'No celular, abra ou recolha a navegação pelo botão do menu. O menu do usuário no canto superior também oferece atalhos para as áreas principais.',
    ],
    note: 'Não existe cadastro público nem redefinição de senha automática. Para criar acessos, use Equipe. Para recuperar ou trocar uma senha, fale com quem administra os acessos.',
  },
  {
    title: 'Resumo, gráfico e relatórios rápidos', icon: BookOpen, where: 'Menu lateral → Resumo',
    steps: [
      'Os cartões mostram inscrições recebidas, eventos ativos, opções de lista habilitadas e profissionais ativos.',
      'No gráfico, escolha Inscrições, Agenda ou Inscrições por lista. Depois selecione Dia, Semana ou Mês e use as setas para navegar no período.',
      'Inscrições recentes aparecem ao lado do gráfico. A aba Relatórios abre os mesmos arquivos disponíveis em Exportações.',
      'A aba Tráfego mostra Analytics e Meta somente depois que uma fonte real for autorizada e configurada. Hoje ela informa que não há conexões e não exibe números de demonstração.',
    ],
  },
  {
    title: 'Criar e arquivar eventos', icon: CalendarDays, where: 'Menu Verdant · Operação → Agenda de eventos',
    steps: [
      'Clique em Novo evento acima da lista para começar. A lista é ordenada por data; selecione uma linha para abrir a edição do evento.',
      'Preencha nome e data. Inclua horário do evento e valor de entrada quando já estiverem definidos. Escolha também o timbrado que será usado nos relatórios daquela data.',
      'Clique em Criar evento. É possível escolher qualquer data, inclusive feriados. Para alterar, selecione o evento na lista, edite os campos e clique em Salvar evento.',
      'Para tirar o evento da programação sem apagar histórico, use Arquivar evento. Ele continua registrado e pode ser reativado.',
    ],
    note: 'Criar um evento não publica as listas automaticamente. Configure cada formulário separadamente depois de salvar o evento.',
    href: '/verdant/agenda', action: 'Abrir Agenda',
  },
  {
    title: 'Configurar e testar formulários', icon: ClipboardList, where: 'Menu Verdant · Operação → Formulários',
    steps: [
      'Há cinco links fixos: /lista/djs, /lista/influencers, /lovers, /lista/vip e /lista/aniversario. O endereço antigo /lista/lover continua funcionando. Cada link é uma página própria; eventos habilitados aparecem como opções dentro dela.',
      'Expanda a linha do evento no formulário desejado e marque Incluir esta data como opção. As linhas começam recolhidas. Ao criar um evento, marque Copiar configurações do formulário anterior somente nas listas que devem receber uma cópia; depois, cada lista pode ser editada independentemente.',
      'A abertura padrão é terça às 20h. O encerramento padrão é 19h na data do evento; Aniversário usa 15h como padrão. A equipe pode ajustar os horários no próprio evento.',
      'Salve a configuração, use Copiar link ou Abrir página e confira o resultado no celular. Repita para cada combinação de formulário e data que pretende divulgar.',
      'Cada data é validada separadamente também no servidor. Se uma data fechar, as outras opções ainda abertas no mesmo link continuam disponíveis.',
    ],
    note: 'Em DJs e Influencers, associe pelo menos uma pessoa ativa à data antes de habilitar. O público só verá profissionais vinculados ao evento escolhido.',
    href: '/verdant/formularios', action: 'Abrir Formulários',
  },
  {
    title: 'Título, descrição e prévia ao compartilhar', icon: MessageSquareWarning, where: 'Links públicos / prévia do WhatsApp',
    steps: [
      'Cada endereço fixo identifica uma lista diferente: DJs, Influencers, Canal Lover, VIP ou Aniversário. Ao abrir a página, o título e a descrição próprios da lista aparecem no formulário.',
      'Ao compartilhar o endereço, a prévia do WhatsApp também deve mostrar o título e o resumo da lista correspondente. O cartão pode continuar usando a imagem institucional da Verdant.',
      'O campo Texto complementar para esta data altera as condições daquele evento; ele não troca o título geral nem a descrição fixa da lista.',
      'Se a prévia antiga continuar aparecendo, abra o link diretamente e confira o título da página. Aplicativos de mensagem podem guardar a prévia anterior; envie novamente o endereço depois de a publicação atualizada estar no ar.',
    ],
    note: 'Os títulos e descrições das cinco listas são definidos no projeto. A tela Formulários permite personalizar o texto complementar por data, não criar outros nomes de lista.',
  },
  {
    title: 'Entender as cinco listas', icon: CheckCircle2, where: 'Formulários públicos e seus cartões de configuração',
    steps: [
      'Todos pedem nome completo, WhatsApp com DDD, e-mail, aceite ou não de novidades e evento. O envio só é aceito se a inscrição estiver aberta naquele momento.',
      'DJs: a pessoa escolhe um DJ vinculado à data. A seleção e os dados de pista, horário e ordem são próprios de cada evento.',
      'Influencers: a pessoa escolhe um Influencer vinculado à data. O cadastro geral não aparece automaticamente no formulário; é necessário associar o profissional ao evento.',
      'Lista Amiga: um nome por resposta. Configure valor, consumação e início/fim do acesso para cada evento.',
      'VIP: a pessoa escolhe Pessoa trans ou Artista Drag. Configure o horário de liberação após o Open Bar e as condições específicas no texto do evento.',
      'Aniversário: configure limite de convidados, regra de preço, condição B-Day e condições SKY. A equipe registra a data de nascimento e informa cada convidado em um campo separado; a quantidade de campos segue o limite configurado para cada evento. O dia e mês do aniversário precisam cair na mesma semana do evento; revise antes, pois a lista enviada não tem edição na tela Clientes.',
    ],
    note: 'A tela pública mostra os valores e horários configurados para a data selecionada. Verifique preço, consumação e condições antes de divulgar o link.',
  },
  {
    title: 'Cadastrar e vincular DJs e Influencers', icon: Headphones, where: 'Menu Verdant · Operação → Cadastro de DJs / Cadastro de Influencers',
    steps: [
      'Crie o cadastro mestre uma vez. Nome é obrigatório; WhatsApp, e-mail e Instagram são opcionais.',
      'Os cadastros começam em ordem alfabética. Clique nos títulos das colunas para alternar a ordenação; os filtros por coluna ficam separados.',
      'Abra o cadastro da pessoa, marque individualmente cada evento em que participará e preencha horário e ordem. Para DJ, informe também pista ou ambiente.',
      'Clique em Salvar cadastro e vínculos. A seleção não é copiada automaticamente de uma data para outra.',
      'Desmarcar um evento apenas desvincula aquela data. Inativar o cadastro impede que o profissional apareça em novas inscrições; não apaga inscrições antigas.',
      'Se o formulário público disser que não há profissionais vinculados, confirme que o cadastro está ativo, que a data correta está marcada e que você clicou em Salvar cadastro e vínculos. Atualize o formulário após salvar.',
    ],
    note: 'Antes de abrir uma lista de DJs ou Influencers, confira se a pessoa certa está ativa e associada à data correta.',
    href: '/verdant/djs', action: 'Abrir cadastro de DJs',
  },
  {
    title: 'Consultar inscrições em Clientes', icon: Users, where: 'Menu Verdant · Operação → Clientes',
    steps: [
      'Cada linha representa uma inscrição enviada; a mesma pessoa pode aparecer mais de uma vez se se inscrever novamente.',
      'Busque por nome, WhatsApp, e-mail, evento ou profissional. Filtre por evento, formulário e aceite de novidades.',
      'As listas começam em ordem alfabética. Clique nos títulos das colunas para alternar entre ordem crescente e decrescente; os filtros por coluna continuam separados.',
      'Confira a opção escolhida, tipo VIP ou quantidade e nomes de convidados de aniversário, além da data e hora de recebimento.',
      'A tela é de consulta: os dados de uma inscrição não são editados por ali. Para corrigir a programação futura, ajuste evento, formulário ou vínculo profissional; isso não altera a inscrição já recebida.',
    ],
    note: 'Consentimento “Sim” identifica contatos elegíveis para o relatório de Leads. Respeite essa escolha ao exportar ou contatar pessoas.',
    href: '/verdant/inscricoes', action: 'Abrir Clientes',
  },
  {
    title: 'Gerar portaria, PDF e CSV', icon: FileDown, where: 'Resumo → Relatórios ou menu Verdant · Operação → Relatórios',
    steps: [
      'Selecione o evento. O timbrado selecionado na Agenda pode ser trocado nessa tela; a escolha fica salva no evento e é aplicada aos relatórios.',
      'Lista de portaria agrupa os nomes por lista e profissional/categoria. Use Imprimir / PDF e escolha Salvar como PDF na janela do navegador, ou Exportar CSV para abrir em planilha.',
      'Leads com consentimento inclui somente quem aceitou novidades. Relatórios de DJs e Influencers trazem os profissionais vinculados, com pista, ordem e horário quando informados.',
      'Todos os quatro tipos oferecem impressão/PDF e CSV. Confira evento, data, quantidade e timbrado antes de compartilhar o arquivo.',
    ],
    note: 'PDF e CSV podem conter dados pessoais. Compartilhe apenas com a equipe que precisa deles e não inclua contatos sem consentimento em ações de divulgação.',
    href: '/verdant/exportacoes', action: 'Abrir Relatórios',
  },
  {
    title: 'Criar e acompanhar tarefas', icon: ListTodo, where: 'Menu lateral → Tarefas',
    steps: [
      'Clique em Criar e informe título, descrição, responsável, prazo, status, categoria e prioridade. O responsável deve ser uma conta ativa da equipe.',
      'Use Importar para carregar tarefas em lote. O arquivo deve conter de 1 a 500 tarefas e passar pela validação do servidor.',
      'Pesquise por título ou ID, filtre status e prioridade, ordene as colunas e use ações da linha para editar ou excluir. Ações em lote aparecem após selecionar linhas.',
      'Status disponíveis: A fazer, Pendente, Em andamento, Concluída e Cancelada. Categorias: Documentação, Melhoria e Erro. Prioridade: Baixa, Média, Alta ou Crítica.',
    ],
    note: 'As tarefas ficam no servidor. Aguarde a confirmação ao salvar; se a tela informar erro de conexão, confira se a tarefa aparece antes de enviar outra.',
    href: '/tasks', action: 'Abrir Tarefas',
  },
  {
    title: 'Cadastrar pessoas da equipe', icon: Users, where: 'Menu lateral → Equipe',
    steps: [
      'Clique em Cadastrar usuário e preencha nome completo, nome de usuário, e-mail, senha e confirmação.',
      'Aceita e-mail de qualquer domínio, desde que o formato seja válido. O usuário deve ser único e ter de 3 a 32 caracteres; use letras sem acento, números, ponto, hífen ou sublinhado.',
      'Use senha exclusiva de pelo menos 12 caracteres. Ao concluir, passe o nome de usuário ou e-mail e a senha à pessoa por um canal privado.',
      'A senha é convertida em hash no servidor e não aparece na lista. Contas iniciais configuradas no servidor permanecem junto das contas criadas pelo painel.',
    ],
    note: 'Não há níveis de permissão diferentes nesta versão: quem entra no painel tem acesso às áreas internas e pode cadastrar outros usuários. Cadastre apenas pessoas autorizadas. Redefinição de senha não é feita nesta tela.',
    href: '/users', action: 'Abrir Equipe',
  },
  {
    title: 'Apps, Conversas e tráfego', icon: MessageSquareWarning, where: 'Menu lateral → Apps / Conversas; Resumo → Tráfego',
    steps: [
      'Apps é um catálogo. WhatsApp, Telegram, Gmail, Meta e Analytics ainda não têm autorização/credenciais configuradas nesta versão; não use o catálogo como sinal de conexão.',
      'Conversas usa conteúdo de exemplo do template e não está conectado ao WhatsApp, Telegram ou Gmail. Não envie mensagens reais por essa tela.',
      'Resumo → Tráfego informa que Google Analytics e Meta estão desconectados. Nenhuma métrica externa é apresentada até a conexão real ser implantada e testada.',
    ],
    note: 'O contato e o envio de mensagens continuam nos canais oficiais até uma integração completa ser configurada e validada de ponta a ponta.',
  },
  {
    title: 'Tema, navegação e outras configurações', icon: Settings2, where: 'Botão de tema, menu de configurações e Configurações Verdant',
    steps: [
      'Use o botão de sol/lua no cabeçalho para alternar entre tema claro e escuro. O tema é uma preferência visual.',
      'Em Configurações → Exibição, marque as áreas que quer manter no menu e clique em Salvar navegação. Essa preferência fica na sua conta e não altera a navegação dos outros usuários.',
      'Configurações Verdant mostra fuso de Curitiba e status de conexão com o servidor, além de um atalho para horários e regras dos formulários.',
      'No formulário público, quatro horários têm funções distintas: abertura e encerramento definem quando a inscrição pode ser enviada; início e fim do acesso definem o período da lista na portaria; horário do evento é a hora informada na Agenda.',
      'Perfil, Conta e Notificações ainda são telas herdadas do template: seus formulários não salvam alterações na conta da equipe nesta versão. Use apenas campos de aparência, menu e tema que indicam confirmação real.',
    ],
    note: 'Se o status do servidor estiver desconectado, não faça alterações operacionais. O painel pode desfazer uma alteração que não foi confirmada pelo servidor.',
    href: '/verdant/configuracoes', action: 'Abrir Configurações Verdant',
  },
  {
    title: 'O que fazer quando algo falhar', icon: CircleHelp, where: 'Checklist rápido',
    steps: [
      '“Servidor desconectado”: pare de editar. Atualize a página; se continuar, registre tela, horário e mensagem e peça para a equipe técnica verificar a aplicação e a API.',
      'Evento não aparece no formulário: confirme que está ativo, que a opção está habilitada, que a abertura já ocorreu e que o encerramento ainda não passou.',
      'DJ ou Influencer não aparece: confirme que está ativo, vinculado àquele evento e que a configuração correta foi salva.',
      'Inscrição recusada após deixar a tela aberta: atualize e selecione outra data. O servidor revalida abertura e encerramento no envio.',
      'Login bloqueado após erros: há limite temporário após cinco tentativas inválidas. Aguarde 15 minutos e confirme usuário/senha com o responsável pelo acesso.',
      'Antes de publicar, teste um link público em celular, revise a regra exibida, envie uma inscrição de teste controlada e confira Clientes e exportações.',
    ],
  },
]

function HelpCenter() {
  return <>
    <Header fixed>
      <div className='min-w-0 flex-1'><Search /></div>
      <div className='flex shrink-0 items-center gap-0.5'><ThemeSwitch /><ProfileDropdown /></div>
    </Header>
    <Main className='flex flex-1 flex-col gap-5 sm:gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-3'>
        <div><div className='text-xs font-semibold tracking-[.16em] text-emerald-700 dark:text-emerald-300'>CENTRAL VERDANT</div><h1 className='mt-1 text-2xl font-bold tracking-tight'>Central de ajuda</h1><p className='mt-1 max-w-3xl text-sm text-muted-foreground'>Passo a passo das telas, dos formulários e dos relatórios. O guia também aponta o que ainda não está conectado ou não salva dados.</p></div>
        <Button asChild><a href='/docs/central-de-ajuda-verdant.pdf' download><BookOpen size={16} /> Baixar guia em PDF</a></Button>
      </div>

      <Card className='border-emerald-700/20 bg-emerald-50/40 dark:bg-emerald-950/20'>
        <CardHeader><CardTitle>Fluxo de operação recomendado</CardTitle><CardDescription>Use esta sequência a cada programação nova.</CardDescription></CardHeader>
        <CardContent className='grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
          <FlowStep number='1' title='Criar evento' text='Escolha qualquer data, horário, valor de entrada e timbrado.' />
          <FlowStep number='2' title='Vincular equipe artística' text='Marque DJs e Influencers que participarão dessa data.' />
          <FlowStep number='3' title='Configurar as listas' text='Ajuste prazo, valor, consumação e janela de acesso por data.' />
          <FlowStep number='4' title='Testar e divulgar' text='Abra os links públicos e revise cada regra antes de compartilhar.' />
        </CardContent>
      </Card>

      <div role='status' className='rounded-lg border border-amber-300/60 bg-amber-50/70 px-4 py-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100'>Atenção: Apps, Conversas, Analytics/Meta e alguns formulários de Configurações ainda não estão conectados ou não persistem alterações. Os tópicos abaixo identificam esses limites para evitar dúvida.</div>

      <section className='space-y-3' aria-label='Tópicos de ajuda'>
        {sections.map((section, index) => <details key={section.title} className='group rounded-xl border bg-card shadow-sm'>
          <summary className='flex cursor-pointer list-none items-center gap-3 p-4 [&::-webkit-details-marker]:hidden sm:p-5'>
            <span className='grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'><section.icon size={19} /></span>
            <span className='min-w-0 flex-1'><span className='block text-xs font-medium text-muted-foreground'>TÓPICO {String(index + 1).padStart(2, '0')} · {section.where}</span><span className='mt-0.5 block font-semibold'>{section.title}</span></span>
            <span aria-hidden='true' className='text-muted-foreground transition-transform group-open:rotate-90'><ArrowRight size={17} /></span>
          </summary>
          <div className='space-y-4 border-t px-4 py-4 sm:px-5 sm:py-5'>
            <ol className='space-y-3 text-sm leading-relaxed'>{section.steps.map((step, stepIndex) => <li key={step} className='flex gap-3'><span className='grid size-6 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold'>{stepIndex + 1}</span><span>{step}</span></li>)}</ol>
            {section.note && <div className='rounded-lg border border-amber-300/50 bg-amber-50/50 p-3 text-sm leading-relaxed text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100'><b>Atenção:</b> {section.note}</div>}
            {section.href && section.action && <Button asChild size='sm' variant='outline'><Link to={section.href}>{section.action}<ArrowRight size={14} /></Link></Button>}
          </div>
        </details>)}
      </section>

      <Card><CardHeader><CardTitle>Atalhos para começar</CardTitle><CardDescription>Abra a área relacionada ao seu próximo passo.</CardDescription></CardHeader><CardContent className='flex flex-wrap gap-2'><Button asChild variant='outline'><Link to='/verdant/agenda'>Agenda</Link></Button><Button asChild variant='outline'><Link to='/verdant/formularios'>Formulários</Link></Button><Button asChild variant='outline'><Link to='/verdant/inscricoes'>Clientes</Link></Button><Button asChild variant='outline'><Link to='/verdant/exportacoes'>Relatórios</Link></Button><Button asChild variant='outline'><Link to='/tasks'>Tarefas</Link></Button><Button asChild variant='outline'><Link to='/users'>Equipe</Link></Button></CardContent></Card>
      <p className='text-center text-xs text-muted-foreground'>Guia revisado com base nas telas e funções identificadas no projeto. Se algo na versão publicada estiver diferente, registre a tela, o horário e a mensagem para atualização deste material.</p>
    </Main>
  </>
}

function FlowStep({ number, title, text }: { number: string; title: string; text: string }) {
  return <div className='flex gap-3 rounded-xl bg-background/80 p-3'><span className='grid size-7 shrink-0 place-items-center rounded-full bg-muted text-xs font-bold'>{number}</span><div><b className='text-sm'>{title}</b><p className='mt-1 text-xs leading-relaxed text-muted-foreground'>{text}</p></div></div>
}
