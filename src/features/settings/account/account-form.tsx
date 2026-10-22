import { useEffect } from 'react'
import { LocalizedText, useLanguage } from '@/context/language-provider'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { CaretSortIcon, CheckIcon } from '@radix-ui/react-icons'
import { zodResolver } from '@hookform/resolvers/zod'
import { showSubmittedData } from '@/lib/show-submitted-data'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { DatePicker } from '@/components/date-picker'
const languages = [
  { label: 'Português (Brasil)', value: 'pt-BR' },
  { label: 'English', value: 'en' },
] as const

const createAccountFormSchema = (translate: (text: string) => string) =>
  z.object({
    name: z
      .string()
      .min(1, translate('Digite seu nome.'))
      .min(2, translate('O nome deve ter pelo menos 2 caracteres.'))
      .max(30, translate('O nome deve ter no máximo 30 caracteres.')),
    dob: z.date(translate('Selecione sua data de nascimento.')),
    language: z.string(translate('Selecione um idioma.')),
  })

type AccountFormValues = z.infer<ReturnType<typeof createAccountFormSchema>>

// This can come from your database or API.
const defaultValues: Partial<AccountFormValues> = {
  name: '',
}

export function AccountForm() {
  const { language, setLanguage, translate } = useLanguage()
  const accountFormSchema = createAccountFormSchema(translate)
  const form = useForm<AccountFormValues>({
    resolver: zodResolver(accountFormSchema),
    defaultValues: { ...defaultValues, language },
  })
  useEffect(() => {
    form.setValue('language', language)
  }, [form.setValue, language])

  function onSubmit(data: AccountFormValues) {
    setLanguage(data.language === 'en' ? 'en' : 'pt-BR')
    showSubmittedData(data)
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-8'>
        <FormField
          control={form.control}
          name='name'
          render={({ field }) => (
            <FormItem>
              <FormLabel>{<LocalizedText text="Nome completo" />}</FormLabel>
              <FormControl>
                <Input placeholder={translate('Seu nome')} {...field} />
              </FormControl>
              <FormDescription>{<LocalizedText text="Este nome será exibido no seu perfil e nos e-mails." leadingSpace trailingSpace />}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name='dob'
          render={({ field }) => (
            <FormItem className='flex flex-col'>
              <FormLabel>{<LocalizedText text="Data de nascimento" />}</FormLabel>
              <DatePicker selected={field.value} onSelect={field.onChange} />
              <FormDescription>{<LocalizedText text="Sua data de nascimento é usada para calcular sua idade." leadingSpace trailingSpace />}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name='language'
          render={({ field }) => (
            <FormItem className='flex flex-col'>
              <FormLabel>{<LocalizedText text="Idioma" />}</FormLabel>
              <Popover>
                <PopoverTrigger asChild>
                  <FormControl>
                    <Button
                      variant='outline'
                      role='combobox'
                      className={cn(
                        'w-50 justify-between',
                        !field.value && 'text-muted-foreground'
                      )}
                    >
                      {field.value
                        ? languages.find(
                            (language) => language.value === field.value
                          )?.label
                    : translate('Selecione um idioma')}
                      <CaretSortIcon className='ms-2 h-4 w-4 shrink-0 opacity-50' />
                    </Button>
                  </FormControl>
                </PopoverTrigger>
                <PopoverContent className='w-50 p-0'>
                  <Command>
                    <CommandInput placeholder={translate('Buscar idioma...')} />
                    <CommandEmpty>{<LocalizedText text="Nenhum idioma encontrado." />}</CommandEmpty>
                    <CommandGroup>
                      <CommandList>
                        {languages.map((language) => (
                          <CommandItem
                            value={language.label}
                            key={language.value}
                            onSelect={() => {
                              form.setValue('language', language.value)
                            }}
                          >
                            <CheckIcon
                              className={cn(
                                'size-4',
                                language.value === field.value
                                  ? 'opacity-100'
                                  : 'opacity-0'
                              )}
                            />
                            {language.label}
                          </CommandItem>
                        ))}
                      </CommandList>
                    </CommandGroup>
                  </Command>
                </PopoverContent>
              </Popover>
              <FormDescription>{<LocalizedText text="Este é o idioma usado no painel." leadingSpace trailingSpace />}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type='submit'>{<LocalizedText text="Salvar conta" />}</Button>
      </form>
    </Form>
  )
}

