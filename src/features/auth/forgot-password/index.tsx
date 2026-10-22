import { LocalizedText } from '@/context/language-provider'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AuthLayout } from '../auth-layout'

export function ForgotPassword() {
  return (
    <AuthLayout>
      <Card className='max-w-sm gap-4 sm:min-w-sm'>
        <CardHeader>
          <CardTitle className='text-lg tracking-tight'>{<LocalizedText text="Recuperar senha" leadingSpace trailingSpace />}</CardTitle>
          <CardDescription>{<LocalizedText text="A redefinição de senha é feita pelo administrador, para proteger o acesso individual da equipe." leadingSpace trailingSpace />}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className='text-sm text-muted-foreground'>{<LocalizedText text="Entre em contato com a equipe @verdantcwb para redefinir seu acesso." />}</p>
        </CardContent>
      </Card>
    </AuthLayout>
  )
}

