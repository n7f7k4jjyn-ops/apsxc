import { useNavigate, useLocation } from '@tanstack/react-router'
import { useAuthStore } from '@/stores/auth-store'
import { ConfirmDialog } from '@/components/confirm-dialog'

interface SignOutDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SignOutDialog({ open, onOpenChange }: SignOutDialogProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { auth } = useAuthStore()

  const handleSignOut = () => {
    const currentPath = location.href
    void fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }).finally(() => {
      auth.reset()
      navigate({ to: '/sign-in', search: { redirect: currentPath }, replace: true })
    })
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title='Sair'
      desc='Tem certeza de que deseja sair? Você precisará entrar novamente para acessar sua conta.'
      confirmText='Sair'
      destructive
      handleConfirm={handleSignOut}
      className='sm:max-w-sm'
    />
  )
}
