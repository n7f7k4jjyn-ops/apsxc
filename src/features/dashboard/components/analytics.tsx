import { Camera, ExternalLink, MousePointerClick } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { LocalizedText } from '@/context/language-provider'

export function Analytics() {
  return <div className='grid gap-4 lg:grid-cols-2'>
    <Card><CardHeader><div className='mb-2 grid size-10 place-items-center rounded-xl bg-muted'><MousePointerClick size={19} /></div><CardTitle>{<LocalizedText text={"Tráfego do site"} />}</CardTitle><CardDescription>{<LocalizedText text={"Os indicadores só serão exibidos depois de conectar uma fonte de dados autorizada."} />}</CardDescription></CardHeader><CardContent><p className='text-sm text-muted-foreground'>{<LocalizedText text={"Ainda não há uma conexão do Google Analytics configurada neste painel."} />}</p><Button asChild variant='outline' className='mt-4'><Link to='/apps'>{<LocalizedText text={"Ver integrações disponíveis"} trailingSpace />}<ExternalLink size={15} /></Link></Button></CardContent></Card>
    <Card><CardHeader><div className='mb-2 grid size-10 place-items-center rounded-xl bg-muted'><Camera size={19} /></div><CardTitle>{<LocalizedText text={"Meta e Instagram"} />}</CardTitle><CardDescription>{<LocalizedText text={"O acesso aos insights da conta requer autorização pela Meta e configuração de credenciais."} />}</CardDescription></CardHeader><CardContent><p className='text-sm text-muted-foreground'>{<LocalizedText text={"Nenhuma conta Meta está conectada. Não exibimos métricas de demonstração."} />}</p><Button asChild variant='outline' className='mt-4'><Link to='/apps'>{<LocalizedText text={"Ver integrações disponíveis"} trailingSpace />}<ExternalLink size={15} /></Link></Button></CardContent></Card>
  </div>
}

