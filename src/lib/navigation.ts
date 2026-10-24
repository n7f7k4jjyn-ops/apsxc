export type NavigationPage = {
  path: string
  title: string
  parent?: string
  quick?: boolean
  admin?: boolean
}

// File-based routes remain the source of truth for matching and access control.
export const navigationPages: NavigationPage[] = [
  { path: '/', title: 'Resumo', quick: true },
  { path: '/verdant/agenda', title: 'Agenda de eventos', quick: true },
  { path: '/verdant/inscricoes', title: 'Inscrições', quick: true },
  { path: '/verdant/exportacoes', title: 'Relatórios', quick: true },
  { path: '/verdant/listas', title: 'Listas', quick: true },
  { path: '/verdant/formularios', title: 'Formulários', quick: true },
  { path: '/verdant/cadastros', title: 'Cadastros', quick: true },
  { path: '/verdant/djs', title: 'DJs', parent: '/verdant/cadastros' },
  {
    path: '/verdant/influencers',
    title: 'Influencers',
    parent: '/verdant/cadastros',
  },
  { path: '/verdant/respostas', title: 'Inscrições' },
  { path: '/verdant/conteudo', title: 'Conteúdo', quick: true },
  { path: '/tasks', title: 'Tarefas', quick: true },
  { path: '/verdant/escalas', title: 'Escalas', quick: true, admin: true },
  {
    path: '/verdant/financeiro',
    title: 'Financeiro',
    quick: true,
    admin: true,
  },
  { path: '/verdant/configuracoes', title: 'Configurações Verdant' },
  { path: '/apps', title: 'Apps' },
  { path: '/chats', title: 'Conversas' },
  { path: '/users', title: 'Acessos ao painel' },
  { path: '/settings', title: 'Perfil' },
  { path: '/settings/account', title: 'Conta', parent: '/settings' },
  { path: '/settings/appearance', title: 'Aparência', parent: '/settings' },
  {
    path: '/settings/notifications',
    title: 'Notificações',
    parent: '/settings',
  },
  { path: '/settings/display', title: 'Exibição', parent: '/settings' },
  { path: '/help-center', title: 'Central de ajuda' },
  { path: '/sign-in', title: 'Entrar' },
  { path: '/sign-in-2', title: 'Entrar' },
  { path: '/sign-up', title: 'Criar conta' },
  { path: '/forgot-password', title: 'Recuperar acesso' },
  { path: '/otp', title: 'Verificar acesso' },
  { path: '/equipe', title: 'Cadastro da equipe' },
  { path: '/lovers', title: 'Lista Lovers' },
  { path: '/trabalhe-conosco', title: 'Trabalhe conosco' },
  { path: '/401', title: 'Não autorizado' },
  { path: '/403', title: 'Acesso negado' },
  { path: '/404', title: 'Página não encontrada' },
  { path: '/500', title: 'Erro do servidor' },
  { path: '/503', title: 'Em manutenção' },
]

export function normalizePath(path: string) {
  return path.split(/[?#]/)[0].replace(/\/+$/, '') || '/'
}

export function getNavigationPage(path: string): NavigationPage {
  const pathname = normalizePath(path)
  const page = navigationPages.find((item) => item.path === pathname)
  if (page) return page
  if (/^\/lista\/[^/]+$/.test(pathname))
    return { path: '/lista/:slug', title: 'Inscrição na lista' }
  if (/^\/errors\/[^/]+$/.test(pathname))
    return { path: '/errors/:error', title: 'Aviso do aplicativo' }
  if (pathname === '/clerk/sign-in' || pathname === '/clerk/sign-up')
    return { path: pathname, title: 'Acesso à conta' }
  if (pathname === '/clerk/user-management')
    return { path: pathname, title: 'Gerenciar conta' }
  return { path: '/404', title: 'Página não encontrada' }
}

export function isNavigationActive(pathname: string, target: string): boolean {
  const current = normalizePath(pathname)
  const destination = normalizePath(target)
  return (
    current === destination ||
    getNavigationPage(current).parent === destination ||
    (destination !== '/' && current.startsWith(`${destination}/`))
  )
}

export function getBreadcrumbs(pathname: string): NavigationPage[] {
  const page = getNavigationPage(pathname)
  if (page.path === '/') return [page]
  const parent = page.parent ? getNavigationPage(page.parent) : undefined
  return [navigationPages[0], ...(parent ? [parent] : []), page]
}

export function safeRedirect(value?: string): string {
  if (
    !value ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\') ||
    Array.from(value).some(
      (char) => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127
    )
  )
    return '/'
  const url = new URL(value, 'https://navigation.invalid')
  if (
    url.origin !== 'https://navigation.invalid' ||
    ['/sign-in', '/sign-in-2'].includes(normalizePath(url.pathname))
  )
    return '/'
  return `${url.pathname}${url.search}${url.hash}`
}
