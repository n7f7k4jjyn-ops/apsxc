import {
  LayoutDashboard,
  Monitor,
  ListTodo,
  HelpCircle,
  Bell,
  Package,
  Palette,
  Settings,
  Wrench,
  UserCog,
  Users,
  MessagesSquare,
  AudioWaveform,
  Command,
  GalleryVerticalEnd,
  CalendarDays,
  ClipboardList,
  PanelsTopLeft,
  Wallet,
} from 'lucide-react'
import { type SidebarData } from '../types'

export const sidebarData: SidebarData = {
  user: {
    name: 'Equipe Verdant',
    email: 'Acesso interno',
    avatar: '/avatars/shadcn.jpg',
  },
  teams: [
    {
      name: 'verdantcwb',
      logo: Command,
      plan: 'Painel interno',
    },
    {
      name: 'Equipe Verdant',
      logo: GalleryVerticalEnd,
      plan: 'Acesso da equipe',
    },
    {
      name: 'Operação Verdant',
      logo: AudioWaveform,
      plan: 'Painel interno',
    },
  ],
  navGroups: [
    {
      title: 'Visão geral',
      items: [{ title: 'Resumo', url: '/', icon: LayoutDashboard }],
    },
    {
      title: 'Operação',
      items: [
        {
          title: 'Agenda de eventos',
          url: '/verdant/agenda',
          icon: CalendarDays,
        },
        {
          title: 'Formulários',
          url: '/verdant/formularios',
          icon: ClipboardList,
        },
        {
          title: 'Inscrições',
          url: '/verdant/inscricoes',
          icon: ClipboardList,
        },
        { title: 'Listas', url: '/verdant/listas', icon: ClipboardList },
        { title: 'Escalas', url: '/verdant/escalas', icon: ClipboardList },
      ],
    },
    {
      title: 'Relacionamento',
      items: [
        { title: 'Cadastros', url: '/verdant/cadastros', icon: Users },
        { title: 'Conversas', url: '/chats', icon: MessagesSquare },
      ],
    },
    {
      title: 'Marketing',
      items: [
        { title: 'Conteúdo', url: '/verdant/conteudo', icon: PanelsTopLeft },
        { title: 'Tarefas', url: '/tasks', icon: ListTodo },
      ],
    },
    {
      title: 'Financeiro',
      items: [
        { title: 'Financeiro', url: '/verdant/financeiro', icon: Wallet },
      ],
    },
    {
      title: 'Relatórios',
      items: [
        {
          title: 'Relatórios',
          url: '/verdant/exportacoes',
          icon: ClipboardList,
        },
      ],
    },
    {
      title: 'Administração',
      items: [
        { title: 'Apps', url: '/apps', icon: Package },
        { title: 'Acessos ao painel', url: '/users', icon: Users },
        {
          title: 'Configurações Verdant',
          url: '/verdant/configuracoes',
          icon: Settings,
        },
        {
          title: 'Configurações',
          icon: Settings,
          items: [
            { title: 'Perfil', url: '/settings', icon: UserCog },
            { title: 'Conta', url: '/settings/account', icon: Wrench },
            { title: 'Aparência', url: '/settings/appearance', icon: Palette },
            {
              title: 'Notificações',
              url: '/settings/notifications',
              icon: Bell,
            },
            { title: 'Exibição', url: '/settings/display', icon: Monitor },
          ],
        },
        { title: 'Central de ajuda', url: '/help-center', icon: HelpCircle },
      ],
    },
  ],
}
