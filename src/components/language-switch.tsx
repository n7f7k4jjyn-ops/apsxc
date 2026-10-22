import { Check, Languages } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useLanguage } from '@/context/language-provider'

export function LanguageSwitch() {
  const { language, setLanguage } = useLanguage()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type='button'
          variant='ghost'
          size='sm'
          className='gap-2 px-2'
          aria-label='Change site language / Alterar idioma do site'
          title='Change site language / Alterar idioma do site'
        >
          <Languages className='size-4' aria-hidden='true' />
          <span>{language === 'en' ? 'EN' : 'PT-BR'}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end'>
        <DropdownMenuLabel>Language / Idioma</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => setLanguage('pt-BR')}>
          Português (Brasil)
          {language === 'pt-BR' && <Check className='ms-auto size-4' aria-hidden='true' />}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setLanguage('en')}>
          English
          {language === 'en' && <Check className='ms-auto size-4' aria-hidden='true' />}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
