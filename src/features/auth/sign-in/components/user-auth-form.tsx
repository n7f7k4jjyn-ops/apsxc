import { useState } from 'react'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from '@tanstack/react-router'
import { Loader2, LogIn } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/password-input'
import { LocalizedText, useLanguage } from '@/context/language-provider'

interface UserAuthFormProps extends React.HTMLAttributes<HTMLFormElement> {
  redirectTo?: string
  appearance?: 'default' | 'verdant'
}

const REMEMBERED_USERNAME_KEY = 'verdant_remembered_username'

function getRememberedUsername() {
  if (typeof window === 'undefined') return ''
  try {
    return window.localStorage.getItem(REMEMBERED_USERNAME_KEY) || ''
  } catch {
    return ''
  }
}

export function UserAuthForm({
  className,
  redirectTo,
  appearance = 'default',
  ...props
}: UserAuthFormProps) {
  const [isLoading, setIsLoading] = useState(false)
  const { translate } = useLanguage()
  const navigate = useNavigate()
  const { auth } = useAuthStore()
  const rememberedUsername = appearance === 'verdant' ? getRememberedUsername() : ''
  const passwordSchema = z
    .string()
    .min(1, translate('Digite sua senha.'))
    .min(12, translate('A senha precisa ter pelo menos 12 caracteres.'))
  const formSchema = z.object({
    email: appearance === 'verdant'
      ? z.string().trim().min(1, translate('Digite seu nome de usuário.')).max(80, translate('O nome de usuário é muito longo.'))
      : z.email({ error: (iss) => (iss.input === '' ? translate('Digite seu e-mail.') : undefined) }),
    password: passwordSchema,
    rememberMe: z.boolean(),
  })

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: rememberedUsername,
      password: '',
      rememberMe: Boolean(rememberedUsername),
    },
  })

  async function onSubmit(data: z.infer<typeof formSchema>) {
    const rememberMe = appearance === 'verdant' && data.rememberMe
    setIsLoading(true)
    form.clearErrors('root')
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(appearance === 'verdant'
          ? { username: data.email, password: data.password, rememberMe }
          : { email: data.email, password: data.password, rememberMe }),
      })
      const result = await response.json() as { error?: string; user?: { accountNo: string; email: string; role: string[]; exp: number } }
      if (!response.ok || !result.user) throw new Error(translate(result.error || 'Não foi possível entrar.'))
      if (appearance === 'verdant') {
        try {
          if (rememberMe) window.localStorage.setItem(REMEMBERED_USERNAME_KEY, data.email.trim())
          else window.localStorage.removeItem(REMEMBERED_USERNAME_KEY)
        } catch {
          // Keep the server session even when browser storage is unavailable.
        }
      }
      auth.setUser(result.user)
      const targetPath = redirectTo?.startsWith('/') && !redirectTo.startsWith('//') ? redirectTo : '/'
      await navigate({ to: targetPath, replace: true })
    } catch (error) {
      form.setError('root', { message: translate(error instanceof Error ? error.message : 'Falha ao entrar. Tente novamente.') })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className={cn('grid gap-3', className)}
        {...props}
      >
        <FormField
          control={form.control}
          name='email'
          render={({ field }) => (
            <FormItem>
              <FormLabel><LocalizedText text={appearance === 'verdant' ? 'Nome de usuário' : 'E-mail'} /></FormLabel>
              <FormControl>
                <Input placeholder={translate(appearance === 'verdant' ? 'seu.usuario' : 'nome@exemplo.com')} autoComplete={appearance === 'verdant' ? 'username' : 'email'} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name='password'
          render={({ field }) => (
            <FormItem className='relative'>
              {appearance === 'verdant' ? (
                <div className='verdant-login-password-label'>
                  <FormLabel>{<LocalizedText text={"Senha"} />}</FormLabel>
                </div>
              ) : (
                <>
                  <FormLabel>{<LocalizedText text={"Senha"} />}</FormLabel>
                  <span className='absolute inset-e-0 -top-0.5 text-xs text-muted-foreground'>{<LocalizedText text={"Acesso gerenciado pela equipe"} />}</span>
                </>
              )}
              <FormControl>
                <PasswordInput placeholder='********' {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {appearance === 'verdant' && (
          <div className='verdant-login-remember'>
            <label>
              <input type='checkbox' {...form.register('rememberMe')} />
              <span>{<LocalizedText text={"Lembrar usuário e manter conectado por 30 dias"} />}</span>
            </label>
            <p>{<LocalizedText text={"Senha não é salva neste dispositivo."} />}</p>
          </div>
        )}
        <Button className={cn('mt-2', appearance === 'verdant' && 'verdant-login-button')} disabled={isLoading}>
          {isLoading ? <Loader2 className='animate-spin' /> : <LogIn />}
          <LocalizedText text='Entrar' />
        </Button>

        {form.formState.errors.root?.message && <p role='alert' className='text-sm text-destructive'>{translate(form.formState.errors.root.message)}</p>}
        {appearance === 'verdant' ? (
          <p className='verdant-login-support'>{<LocalizedText text={"Precisa de acesso ou redefinir sua senha?"} />}<br />{<LocalizedText text={"Fale com a"} />}<a className='verdant-login-contact' href='https://www.instagram.com/scope.deal' target='_blank' rel='noreferrer'>@scope.deal</a>.
          </p>
        ) : (
          <p className='text-center text-xs text-muted-foreground'>{<LocalizedText text={"Precisa de acesso ou redefinir a senha? Fale com a equipe @verdantcwb."} />}</p>
        )}
      </form>
    </Form>
  )
}

