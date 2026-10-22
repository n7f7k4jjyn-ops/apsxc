import { LocalizedText, useLanguage } from '@/context/language-provider'
import { useState } from 'react'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from '@tanstack/react-router'
import { ArrowRight, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { sleep, cn } from '@/lib/utils'
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
const createFormSchema = (translate: (text: string) => string) => z.object({
  email: z.email({
    error: (iss) => (iss.input === '' ? translate('Digite seu e-mail.') : undefined),
  }),
})
type ForgotPasswordFormValues = z.infer<ReturnType<typeof createFormSchema>>

export function ForgotPasswordForm({
  className,
  ...props
}: React.HTMLAttributes<HTMLFormElement>) {
  const navigate = useNavigate()
  const [isLoading, setIsLoading] = useState(false)
  const { language, translate } = useLanguage()
  const formSchema = createFormSchema(translate)

  const form = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: '' },
  })

  function onSubmit(data: ForgotPasswordFormValues) {
    setIsLoading(true)

    toast.promise(sleep(2000), {
      loading: translate('Enviando e-mail...'),
      success: () => {
        setIsLoading(false)
        form.reset()
        navigate({ to: '/otp' })
        return language === 'en' ? `Email sent to ${data.email}` : `E-mail enviado para ${data.email}`
      },
      error: translate('Falha ao enviar a solicitação.'),
    })
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className={cn('grid gap-2', className)}
        {...props}
      >
        <FormField
          control={form.control}
          name='email'
          render={({ field }) => (
            <FormItem>
              <FormLabel>{<LocalizedText text="E-mail" />}</FormLabel>
              <FormControl>
                <Input placeholder={translate('nome@exemplo.com')} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button className='mt-2' disabled={isLoading}>
          Continuar
          {isLoading ? <Loader2 className='animate-spin' /> : <ArrowRight />}
        </Button>
      </form>
    </Form>
  )
}

