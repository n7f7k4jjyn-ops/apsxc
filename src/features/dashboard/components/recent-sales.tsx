import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { formatDate, formTitle, type Registration } from '@/features/verdant/data'
import { LocalizedText, useLanguage } from '@/context/language-provider'
export function RecentSales({ registrations }: { registrations: Registration[] }) {
  const { language } = useLanguage()
  const recent = [...registrations]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 5)

  if (recent.length === 0) {
    return (
      <div className='flex min-h-40 items-center justify-center rounded-md border border-dashed px-4 text-center text-sm text-muted-foreground'>{<LocalizedText text={"Nenhuma inscrição recebida ainda. As respostas aparecerão aqui."} />}</div>
    )
  }

  return (
    <div className='space-y-5'>
      {recent.map((registration) => (
        <div key={registration.id} className='flex items-center gap-3'>
          <Avatar className='h-9 w-9'>
            <AvatarFallback>
              {registration.name
                .split(/\s+/)
                .slice(0, 2)
                .map((part) => part[0]?.toLocaleUpperCase())
                .join('')}
            </AvatarFallback>
          </Avatar>
          <div className='min-w-0 flex-1'>
            <p className='truncate text-sm leading-none font-medium'>{registration.name}</p>
            <p className='mt-1 truncate text-xs text-muted-foreground'>
              <LocalizedText text={formTitle(registration.formKey)} /> · {registration.eventName} · {formatDate(registration.eventDate)}
            </p>
          </div>
          <span className='shrink-0 text-xs text-muted-foreground'>
            {new Intl.DateTimeFormat(language, { hour: '2-digit', minute: '2-digit' }).format(new Date(registration.createdAt))}
          </span>
        </div>
      ))}
    </div>
  )
}

