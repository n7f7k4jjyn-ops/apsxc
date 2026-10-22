import { type SVGProps } from 'react'
import { Root as Radio, Item } from '@radix-ui/react-radio-group'
import { CircleCheck, RotateCcw, Settings } from 'lucide-react'
import { IconDir } from '@/assets/custom/icon-dir'
import { IconLayoutCompact } from '@/assets/custom/icon-layout-compact'
import { IconLayoutDefault } from '@/assets/custom/icon-layout-default'
import { IconLayoutFull } from '@/assets/custom/icon-layout-full'
import { IconSidebarFloating } from '@/assets/custom/icon-sidebar-floating'
import { IconSidebarInset } from '@/assets/custom/icon-sidebar-inset'
import { IconSidebarSidebar } from '@/assets/custom/icon-sidebar-sidebar'
import { IconThemeDark } from '@/assets/custom/icon-theme-dark'
import { IconThemeLight } from '@/assets/custom/icon-theme-light'
import { IconThemeSystem } from '@/assets/custom/icon-theme-system'
import { cn } from '@/lib/utils'
import { useDirection } from '@/context/direction-provider'
import { type Collapsible, useLayout } from '@/context/layout-provider'
import { useTheme } from '@/context/theme-provider'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { useSidebar } from './ui/sidebar'
import { LocalizedText, useLanguage } from '@/context/language-provider'

export function ConfigDrawer() {
  const { translate } = useLanguage()
  const { setOpen } = useSidebar()
  const { resetDir } = useDirection()
  const { resetTheme } = useTheme()
  const { resetLayout } = useLayout()

  const handleReset = () => {
    setOpen(true)
    resetDir()
    resetTheme()
    resetLayout()
  }

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          size='icon'
          variant='ghost'
          aria-label={translate('Abrir configurações de aparência')}
          className='rounded-full'
        >
          <Settings aria-hidden='true' />
        </Button>
      </SheetTrigger>
      <SheetContent className='flex flex-col'>
        <SheetHeader className='pb-0 text-start'>
          <SheetTitle>{<LocalizedText text={"Configurações de aparência"} />}</SheetTitle>
          <SheetDescription>{<LocalizedText text={"Ajuste a aparência e o layout do painel."} />}</SheetDescription>
        </SheetHeader>
        <div className='space-y-6 overflow-y-auto px-4'>
          <ThemeConfig />
          <SidebarConfig />
          <LayoutConfig />
          <DirConfig />
        </div>
        <SheetFooter className='gap-2'>
          <Button
            variant='destructive'
            onClick={handleReset}
            aria-label={translate('Restaurar todas as configurações padrão')}
          >{<LocalizedText text={"Restaurar"} />}</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

function SectionTitle({
  title,
  showReset = false,
  onReset,
  resetAriaLabel,
  className,
}: {
  title: string
  showReset?: boolean
  onReset?: () => void
  /** Shown on the small per-section reset (RotateCcw) for accessibility and tests. */
  resetAriaLabel?: string
  className?: string
}) {
  const { translate } = useLanguage()
  return (
    <div
      className={cn(
        'mb-2 flex items-center gap-2 text-sm font-semibold text-muted-foreground',
        className
      )}
    >
      <LocalizedText text={title} />
      {showReset && onReset && (
        <Button
          type='button'
          size='icon'
          variant='secondary'
          className='size-4 rounded-full'
          onClick={onReset}
          aria-label={resetAriaLabel ? translate(resetAriaLabel) : undefined}
        >
          <RotateCcw className='size-3' />
        </Button>
      )}
    </div>
  )
}

function RadioGroupItem({
  item,
  isTheme = false,
}: {
  item: {
    value: string
    label: string
    icon: (props: SVGProps<SVGSVGElement>) => React.ReactElement
  }
  isTheme?: boolean
}) {
  const { language, translate } = useLanguage()
  return (
    <Item
      value={item.value}
      className={cn('group outline-none', 'transition duration-200 ease-in')}
      aria-label={language === 'en' ? `Select ${translate(item.label).toLowerCase()}` : `Selecionar ${item.label.toLowerCase()}`}
      aria-describedby={`${item.value}-description`}
    >
      <div
        className={cn(
          'relative rounded-[6px] ring-[1px] ring-border',
          'group-data-[state=checked]:shadow-2xl group-data-[state=checked]:ring-primary',
          'group-focus-visible:ring-2'
        )}
        role='img'
        aria-hidden='false'
        aria-label={language === 'en' ? `Preview of ${translate(item.label)}` : `Prévia da opção ${item.label}`}
      >
        <CircleCheck
          className={cn(
            'size-6 fill-primary stroke-white',
            'group-data-[state=unchecked]:hidden',
            'absolute top-0 right-0 translate-x-1/2 -translate-y-1/2'
          )}
          aria-hidden='true'
        />
        <item.icon
          className={cn(
            !isTheme &&
              'fill-primary stroke-primary group-data-[state=unchecked]:fill-muted-foreground group-data-[state=unchecked]:stroke-muted-foreground'
          )}
          aria-hidden='true'
        />
      </div>
      <div
        className='mt-1 text-xs'
        id={`${item.value}-description`}
        aria-live='polite'
      >
        <LocalizedText text={item.label} />
      </div>
    </Item>
  )
}

function ThemeConfig() {
  const { translate } = useLanguage()
  const { defaultTheme, theme, setTheme } = useTheme()
  return (
    <div>
      <SectionTitle
        title='Tema'
        showReset={theme !== defaultTheme}
        onReset={() => setTheme(defaultTheme)}
        resetAriaLabel='Restaurar tema padrão'
      />
      <Radio
        value={theme}
        onValueChange={setTheme}
        className='grid w-full max-w-md grid-cols-3 gap-4'
        aria-label={translate('Selecionar tema')}
        aria-describedby='theme-description'
      >
        {[
          {
            value: 'system',
            label: 'Sistema',
            icon: IconThemeSystem,
          },
          {
            value: 'light',
            label: 'Claro',
            icon: IconThemeLight,
          },
          {
            value: 'dark',
            label: 'Escuro',
            icon: IconThemeDark,
          },
        ].map((item) => (
          <RadioGroupItem key={item.value} item={item} isTheme />
        ))}
      </Radio>
      <div id='theme-description' className='sr-only'>{<LocalizedText text={"Escolha entre o tema do sistema, claro ou escuro."} />}</div>
    </div>
  )
}

function SidebarConfig() {
  const { translate } = useLanguage()
  const { defaultVariant, variant, setVariant } = useLayout()
  return (
    <div className='max-md:hidden'>
      <SectionTitle
        title='Menu lateral'
        showReset={defaultVariant !== variant}
        onReset={() => setVariant(defaultVariant)}
        resetAriaLabel='Restaurar estilo padrão do menu lateral'
      />
      <Radio
        value={variant}
        onValueChange={setVariant}
        className='grid w-full max-w-md grid-cols-3 gap-4'
        aria-label={translate('Selecionar estilo do menu lateral')}
        aria-describedby='sidebar-description'
      >
        {[
          {
            value: 'inset',
            label: 'Interno',
            icon: IconSidebarInset,
          },
          {
            value: 'floating',
            label: 'Flutuante',
            icon: IconSidebarFloating,
          },
          {
            value: 'sidebar',
            label: 'Lateral',
            icon: IconSidebarSidebar,
          },
        ].map((item) => (
          <RadioGroupItem key={item.value} item={item} />
        ))}
      </Radio>
      <div id='sidebar-description' className='sr-only'>{<LocalizedText text={"Escolha entre o menu interno, flutuante ou lateral padrão."} />}</div>
    </div>
  )
}

function LayoutConfig() {
  const { translate } = useLanguage()
  const { open, setOpen } = useSidebar()
  const { defaultCollapsible, collapsible, setCollapsible } = useLayout()

  const radioState = open ? 'default' : collapsible

  return (
    <div className='max-md:hidden'>
      <SectionTitle
        title='Layout'
        showReset={radioState !== 'default'}
        onReset={() => {
          setOpen(true)
          setCollapsible(defaultCollapsible)
        }}
        resetAriaLabel='Restaurar opções de layout padrão'
      />
      <Radio
        value={radioState}
        onValueChange={(v) => {
          if (v === 'default') {
            setOpen(true)
            return
          }
          setOpen(false)
          setCollapsible(v as Collapsible)
        }}
        className='grid w-full max-w-md grid-cols-3 gap-4'
        aria-label={translate('Selecionar estilo de layout')}
        aria-describedby='layout-description'
      >
        {[
          {
            value: 'default',
            label: 'Padrão',
            icon: IconLayoutDefault,
          },
          {
            value: 'icon',
            label: 'Compacto',
            icon: IconLayoutCompact,
          },
          {
            value: 'offcanvas',
            label: 'Tela cheia',
            icon: IconLayoutFull,
          },
        ].map((item) => (
          <RadioGroupItem key={item.value} item={item} />
        ))}
      </Radio>
      <div id='layout-description' className='sr-only'>{<LocalizedText text={"Escolha entre o menu expandido, compacto com ícones ou tela cheia."} />}</div>
    </div>
  )
}

function DirConfig() {
  const { translate } = useLanguage()
  const { defaultDir, dir, setDir } = useDirection()
  return (
    <div>
      <SectionTitle
        title='Direção'
        showReset={defaultDir !== dir}
        onReset={() => setDir(defaultDir)}
        resetAriaLabel='Restaurar direção padrão do texto'
      />
      <Radio
        value={dir}
        onValueChange={setDir}
        className='grid w-full max-w-md grid-cols-3 gap-4'
        aria-label={translate('Selecionar direção do site')}
        aria-describedby='direction-description'
      >
        {[
          {
            value: 'ltr',
            label: 'Da esquerda para a direita',
            icon: (props: SVGProps<SVGSVGElement>) => (
              <IconDir dir='ltr' {...props} />
            ),
          },
          {
            value: 'rtl',
            label: 'Da direita para a esquerda',
            icon: (props: SVGProps<SVGSVGElement>) => (
              <IconDir dir='rtl' {...props} />
            ),
          },
        ].map((item) => (
          <RadioGroupItem key={item.value} item={item} />
        ))}
      </Radio>
      <div id='direction-description' className='sr-only'>{<LocalizedText text={"Escolha a direção de leitura do site."} />}</div>
    </div>
  )
}

