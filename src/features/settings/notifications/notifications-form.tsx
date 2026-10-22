import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link } from '@tanstack/react-router'
import { showSubmittedData } from '@/lib/show-submitted-data'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Switch } from '@/components/ui/switch'
import { LocalizedText, useLanguage } from '@/context/language-provider'

const createNotificationsFormSchema = (translate: (text: string) => string) => z.object({
  type: z.enum(['all', 'mentions', 'none'], {
    error: (iss) =>
      iss.input === undefined
        ? translate('Selecione um tipo de notificação.')
        : undefined,
  }),
  mobile: z.boolean().default(false).optional(),
  communication_emails: z.boolean().default(false).optional(),
  social_emails: z.boolean().default(false).optional(),
  marketing_emails: z.boolean().default(false).optional(),
  security_emails: z.boolean(),
})

type NotificationsFormValues = z.infer<ReturnType<typeof createNotificationsFormSchema>>

// This can come from your database or API.
const defaultValues: Partial<NotificationsFormValues> = {
  communication_emails: false,
  marketing_emails: false,
  social_emails: true,
  security_emails: true,
}

export function NotificationsForm() {
  const { translate } = useLanguage()
  const notificationsFormSchema = createNotificationsFormSchema(translate)
  const form = useForm<NotificationsFormValues>({
    resolver: zodResolver(notificationsFormSchema),
    defaultValues,
  })

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((data) => showSubmittedData(data))}
        className='space-y-8'
      >
        <FormField
          control={form.control}
          name='type'
          render={({ field }) => (
            <FormItem className='relative space-y-3'>
              <FormLabel>{<LocalizedText text="Quero receber notificações sobre..." />}</FormLabel>
              <FormControl>
                <RadioGroup
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                  className='flex flex-col gap-2'
                >
                  <FormItem className='flex items-center'>
                    <FormControl>
                      <RadioGroupItem value='all' />
                    </FormControl>
                    <FormLabel className='font-normal'>{<LocalizedText text="Todas as novas mensagens" leadingSpace trailingSpace />}</FormLabel>
                  </FormItem>
                  <FormItem className='flex items-center'>
                    <FormControl>
                      <RadioGroupItem value='mentions' />
                    </FormControl>
                    <FormLabel className='font-normal'>{<LocalizedText text="Mensagens diretas e menções" leadingSpace trailingSpace />}</FormLabel>
                  </FormItem>
                  <FormItem className='flex items-center'>
                    <FormControl>
                      <RadioGroupItem value='none' />
                    </FormControl>
                    <FormLabel className='font-normal'>{<LocalizedText text="Nenhuma" />}</FormLabel>
                  </FormItem>
                </RadioGroup>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className='relative'>
          <h3 className='mb-4 text-lg font-medium'>{<LocalizedText text="Notificações por e-mail" />}</h3>
          <div className='space-y-4'>
            <FormField
              control={form.control}
              name='communication_emails'
              render={({ field }) => (
                <FormItem className='flex flex-row items-center justify-between rounded-lg border p-4'>
                  <div className='space-y-0.5'>
                    <FormLabel className='text-base'>{<LocalizedText text="E-mails de comunicação" leadingSpace trailingSpace />}</FormLabel>
                    <FormDescription>{<LocalizedText text="Receba avisos sobre a atividade da sua conta." leadingSpace trailingSpace />}</FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='marketing_emails'
              render={({ field }) => (
                <FormItem className='flex flex-row items-center justify-between rounded-lg border p-4'>
                  <div className='space-y-0.5'>
                    <FormLabel className='text-base'>{<LocalizedText text="E-mails de novidades" leadingSpace trailingSpace />}</FormLabel>
                    <FormDescription>{<LocalizedText text="Receba novidades sobre produtos, recursos e atualizações." leadingSpace trailingSpace />}</FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='social_emails'
              render={({ field }) => (
                <FormItem className='flex flex-row items-center justify-between rounded-lg border p-4'>
                  <div className='space-y-0.5'>
                    <FormLabel className='text-base'>{<LocalizedText text="E-mails sociais" />}</FormLabel>
                    <FormDescription>{<LocalizedText text="Receba avisos de interações e conexões." leadingSpace trailingSpace />}</FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='security_emails'
              render={({ field }) => (
                <FormItem className='flex flex-row items-center justify-between rounded-lg border p-4'>
                  <div className='space-y-0.5'>
                    <FormLabel className='text-base'>{<LocalizedText text="E-mails de segurança" />}</FormLabel>
                    <FormDescription>{<LocalizedText text="Receba avisos sobre a atividade e a segurança da sua conta." leadingSpace trailingSpace />}</FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      disabled
                      aria-readonly
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
        </div>
        <FormField
          control={form.control}
          name='mobile'
          render={({ field }) => (
            <FormItem className='relative flex flex-row items-start'>
              <FormControl>
                <Checkbox
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
              <div className='space-y-1 leading-none'>
                <FormLabel>{<LocalizedText text="Usar configurações diferentes nos meus dispositivos móveis" leadingSpace trailingSpace />}</FormLabel>
                <FormDescription>
                  Você pode gerenciar as notificações móveis na página de{' '}
                  <Link
                    to='/settings'
                    className='underline decoration-dashed underline-offset-4 hover:decoration-solid'
                  >{<LocalizedText text="configurações para celular" leadingSpace trailingSpace />}</Link>{' '}
                  .
                </FormDescription>
              </div>
            </FormItem>
          )}
        />
        <Button type='submit'>{<LocalizedText text="Salvar notificações" />}</Button>
      </form>
    </Form>
  )
}

