import { Download, Smartphone } from 'lucide-react'
import { toast } from 'sonner'
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

declare global {
  interface Window {
    __verdantInstallPrompt?: InstallPromptEvent
  }
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in window.navigator && (window.navigator as Navigator & { standalone?: boolean }).standalone === true)
}

export function InstallAppButtons() {
  const installIos = () => {
    if (isStandalone()) {
      toast.success('O Verdant Central já está instalado neste dispositivo.')
      return
    }
    window.alert('No iPhone/iPad: abra este site no Safari, toque em Compartilhar e escolha “Adicionar à Tela de Início”. Depois toque em “Adicionar”.')
  }

  const installAndroid = async () => {
    if (isStandalone()) {
      toast.success('O Verdant Central já está instalado neste dispositivo.')
      return
    }
    const prompt = window.__verdantInstallPrompt
    if (!prompt) {
      window.alert('No Android: abra este site no Chrome e use o menu ⋮ → “Instalar app” ou “Adicionar à tela inicial”. Se a opção ainda não aparecer, recarregue a página e tente novamente.')
      return
    }
    await prompt.prompt()
    const choice = await prompt.userChoice
    if (choice.outcome === 'accepted') {
      window.__verdantInstallPrompt = undefined
      toast.success('Instalação iniciada.')
    }
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton type='button' onClick={installIos} tooltip='Instalar app iOS'>
          <Smartphone />
          <span>Instalar app iOS</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
      <SidebarMenuItem>
        <SidebarMenuButton type='button' onClick={() => void installAndroid()} tooltip='Instalar app Android'>
          <Download />
          <span>Instalar app Android</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
