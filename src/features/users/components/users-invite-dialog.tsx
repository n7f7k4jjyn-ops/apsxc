import { LocalizedText, useLanguage } from '@/context/language-provider'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { MailPlus, Send } from 'lucide-react'
import { showSubmittedData } from '@/lib/show-submitted-data'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { SelectDropdown } from '@/components/select-dropdown'
import { roles } from '../data/data'

const createFormSchema = (translate: (text: string) => string) => z.object({
  email: z.email({
    error: (iss) =>
      iss.input === '' ? translate('Digite o e-mail para enviar o convite.') : undefined,
  }),
  role: z.string().min(1, translate('Selecione uma permissão.')),
  desc: z.string().optional(),
})

type UserInviteForm = z.infer<ReturnType<typeof createFormSchema>>

type UserInviteDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function UsersInviteDialog({
  open,
  onOpenChange,
}: UserInviteDialogProps) {
  const { translate } = useLanguage()
  const formSchema = createFormSchema(translate)
  const form = useForm<UserInviteForm>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: '', role: '', desc: '' },
  })

  const onSubmit = (values: UserInviteForm) => {
    form.reset()
    showSubmittedData(values)
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(state) => {
        form.reset()
        onOpenChange(state)
      }}
    >
      <DialogContent className='sm:max-w-md'>
        <DialogHeader className='text-start'>
          <DialogTitle className='flex items-center gap-2'>
            <MailPlus />{<LocalizedText text="Convidar pessoa" leadingSpace trailingSpace />}</DialogTitle>
          <DialogDescription>{<LocalizedText text="Envie um convite por e-mail para adicionar uma pessoa à equipe e defina o nível de acesso." leadingSpace trailingSpace />}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            id='user-invite-form'
            onSubmit={form.handleSubmit(onSubmit)}
            className='space-y-4'
          >
            <FormField
              control={form.control}
              name='email'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{<LocalizedText text="E-mail" />}</FormLabel>
                  <FormControl>
                    <Input
                      type='email'
                      placeholder={translate('nome.sobrenome@exemplo.com')}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='role'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{<LocalizedText text="Permissão" />}</FormLabel>
                  <SelectDropdown
                    defaultValue={field.value}
                    onValueChange={field.onChange}
                    placeholder={translate('Selecione uma permissão')}
                    items={roles.map(({ label, value }) => ({
                      label: translate(label),
                      value,
                    }))}
                  />
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='desc'
              render={({ field }) => (
                <FormItem className=''>
                  <FormLabel>{<LocalizedText text="Observação (opcional)" />}</FormLabel>
                  <FormControl>
                    <Textarea
                      className='resize-none'
                      placeholder={translate('Escreva uma mensagem para acompanhar o convite (opcional).')}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>
        <DialogFooter className='gap-y-2'>
          <DialogClose asChild>
            <Button variant='outline'>{<LocalizedText text="Cancelar" />}</Button>
          </DialogClose>
          <Button type='submit' form='user-invite-form'>{<LocalizedText text="Convidar" leadingSpace trailingSpace />}<Send />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

