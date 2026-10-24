import { Link, useLocation } from '@tanstack/react-router'
import { useAuthStore } from '@/stores/auth-store'

export function AppQuickNav() {
  const pathname = useLocation({ select: (location) => location.pathname })
  const admin = useAuthStore((state) => state.auth.user?.role.includes('admin'))
  const links = [
    ['Resumo', '/'],
    ['Agenda', '/verdant/agenda'],
    ['Inscrições', '/verdant/inscricoes'],
    ['Relatórios', '/verdant/exportacoes'],
    ['Listas', '/verdant/listas'],
    ['Formulários', '/verdant/formularios'],
    ['Cadastros', '/verdant/cadastros'],
    ['Conteúdo', '/verdant/conteudo'],
    ['Tarefas', '/tasks'],
    ...(admin
      ? [
          ['Escalas', '/verdant/escalas'],
          ['Financeiro', '/verdant/financeiro'],
        ]
      : []),
  ]
  return (
    <nav
      aria-label='Navegação rápida do aplicativo'
      className='flex max-w-full items-center gap-1 overflow-x-auto border-b bg-background px-3 py-2 sm:px-4'
    >
      {links.map(([title, to]) => (
        <Link
          key={to}
          to={to}
          aria-current={(pathname === to || (to === '/verdant/cadastros' && ['/verdant/djs', '/verdant/influencers'].includes(pathname))) ? 'page' : undefined}
          className={`shrink-0 rounded-md px-3 py-2 text-sm font-medium hover:bg-accent ${(pathname === to || (to === '/verdant/cadastros' && ['/verdant/djs', '/verdant/influencers'].includes(pathname))) ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
        >
          {title}
        </Link>
      ))}
    </nav>
  )
}
