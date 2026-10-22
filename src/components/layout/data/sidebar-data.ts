import {
  Construction,
  LayoutDashboard,
  Monitor,
  Bug,
  ListTodo,
  FileX,
  HelpCircle,
  Lock,
  Bell,
  Package,
  Palette,
  ServerOff,
  Settings,
  Wrench,
  UserCog,
  UserX,
  Users,
  MessagesSquare,
  AudioWaveform,
  Command,
  GalleryVerticalEnd,
  CalendarDays,
  ClipboardList,
  PanelsTopLeft,
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
      title: 'Geral',
      items: [
        {
          title: 'Resumo',
          url: '/',
          icon: LayoutDashboard,
        },
        {
          title: 'Tarefas',
          url: '/tasks',
          icon: ListTodo,
        },
        {
          title: 'Apps',
          url: '/apps',
          icon: Package,
        },
        { title: 'Conversas', url: '/chats', icon: MessagesSquare },
        {
          title: 'Acessos ao painel',
          url: '/users',
          icon: Users,
        },
      ],
    },
    {
      title: 'Verdant · Operação',
      items: [
        { title: 'Agenda de eventos', url: '/verdant/agenda', icon: CalendarDays },
        { title: 'Conteúdo', url: '/verdant/conteudo', icon: PanelsTopLeft },
        { title: 'Escalas', url: '/verdant/escalas', icon: ClipboardList },
        { title: 'Formulários', url: '/verdant/formularios', icon: ClipboardList },
        { title: 'Listas', url: '/verdant/listas', icon: ClipboardList },
        { title: 'Respostas', url: '/verdant/respostas', icon: ClipboardList },
        { title: 'Cadastros', url: '/verdant/cadastros', icon: Users },
        { title: 'Configurações Verdant', url: '/verdant/configuracoes', icon: Settings },
      ],
    },
    {
      title: 'Páginas',
      items: [
        {
          title: 'Alertas',
          icon: Bug,
          items: [
            {
              title: 'Não autorizado',
              url: '/errors/unauthorized',
              icon: Lock,
            },
            {
              title: 'Acesso negado',
              url: '/errors/forbidden',
              icon: UserX,
            },
            {
              title: 'Página não encontrada',
              url: '/errors/not-found',
              icon: FileX,
            },
            {
              title: 'Erro interno do servidor',
              url: '/errors/internal-server-error',
              icon: ServerOff,
            },
            {
              title: 'Em manutenção',
              url: '/errors/maintenance-error',
              icon: Construction,
            },
          ],
        },
      ],
    },
    {
      title: 'Outros',
      items: [
        {
          title: 'Configurações',
          icon: Settings,
          items: [
            {
              title: 'Perfil',
              url: '/settings',
              icon: UserCog,
            },
            {
              title: 'Conta',
              url: '/settings/account',
              icon: Wrench,
            },
            {
              title: 'Aparência',
              url: '/settings/appearance',
              icon: Palette,
            },
            {
              title: 'Notificações',
              url: '/settings/notifications',
              icon: Bell,
            },
            {
              title: 'Exibição',
              url: '/settings/display',
              icon: Monitor,
            },
          ],
        },
        {
          title: 'Central de ajuda',
          url: '/help-center',
          icon: HelpCircle,
        },
      ],
    },
  ],
}

