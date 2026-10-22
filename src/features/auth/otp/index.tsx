import { LocalizedText } from '@/context/language-provider'
import { Link } from '@tanstack/react-router'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { AuthLayout } from '../auth-layout'
import { OtpForm } from './components/otp-form'

export function Otp() {
  return (
    <AuthLayout>
      <Card className='max-w-md gap-4'>
        <CardHeader>
          <CardTitle className='text-base tracking-tight'>{<LocalizedText text="Autenticação em duas etapas" leadingSpace trailingSpace />}</CardTitle>
          <CardDescription>{<LocalizedText text="Digite o código de autenticação." leadingSpace trailingSpace />}<br />{<LocalizedText text="Enviamos o código para o seu e-mail." leadingSpace trailingSpace />}</CardDescription>
        </CardHeader>
        <CardContent>
          <OtpForm />
        </CardContent>
        <CardFooter>
          <p className='px-8 text-center text-sm text-muted-foreground'>
            Não recebeu o código?{' '}
            <Link
              to='/sign-in'
              className='underline underline-offset-4 hover:text-primary'
            >{<LocalizedText text="Enviar um novo código." leadingSpace trailingSpace />}</Link>
            .
          </p>
        </CardFooter>
      </Card>
    </AuthLayout>
  )
}

