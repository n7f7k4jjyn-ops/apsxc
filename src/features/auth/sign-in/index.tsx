import { useSearch } from '@tanstack/react-router'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { AuthLayout } from '../auth-layout'
import { UserAuthForm } from './components/user-auth-form'
import './sign-in.css'
import { LocalizedText } from '@/context/language-provider'

export function SignIn() {
  const { redirect } = useSearch({ from: '/(auth)/sign-in' })

  return (
    <AuthLayout variant='login'>
      <Card className='verdant-login-card mx-auto max-w-none gap-3 rounded-2xl'>
        <CardHeader>
          <CardTitle className='text-lg tracking-tight'>{<LocalizedText text={"Entrar"} />}</CardTitle>
          <CardDescription>
            <span className='block'>{<LocalizedText text={"Entre com seu acesso individual da equipe Verdant."} />}</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UserAuthForm redirectTo={redirect} appearance='verdant' />
        </CardContent>
        <CardFooter className='verdant-login-footer'>
          <p className='verdant-login-security'>{<LocalizedText text={"Sessão padrão de 12 horas."} />}<br />{<LocalizedText text={"Com “Manter conectado”, até 30 dias."} />}</p>
          <div className='verdant-login-signature'>
            <span>{<LocalizedText text={"Desenvolvido por"} />}</span>
            <a className='verdant-login-signature-link' href='https://www.instagram.com/scope.deal' target='_blank' rel='noreferrer' aria-label='Scope Connect no Instagram'>
              <img src='/images/scope-connect-colorida.webp' width={512} height={139} loading='lazy' decoding='async' alt='Logo Scope Connect' />
            </a>
          </div>
        </CardFooter>
      </Card>
    </AuthLayout>
  )
}

