import { LocalizedText } from '@/context/language-provider'
import { Link } from '@tanstack/react-router'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AuthLayout } from '../auth-layout'

export function SignUp() {
  return (
    <AuthLayout>
      <Card className='max-w-sm gap-4'>
        <CardHeader>
          <CardTitle className='text-lg tracking-tight'>{<LocalizedText text="Acesso da equipe" />}</CardTitle>
          <CardDescription>
            O cadastro público está desativado. Solicite sua conta à equipe @verdantcwb.{' '}
            <Link
              to='/sign-in'
              className='underline underline-offset-4 hover:text-primary'
            >{<LocalizedText text="Voltar para o login" leadingSpace trailingSpace />}</Link>
          </CardDescription>
        </CardHeader>
        <CardContent><p className='text-sm text-muted-foreground'>{<LocalizedText text="Contas são liberadas individualmente pelo administrador." />}</p></CardContent>
      </Card>
    </AuthLayout>
  )
}

