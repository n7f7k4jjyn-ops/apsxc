import { ContentSection } from '../components/content-section'
import { AccountForm } from './account-form'

export function SettingsAccount() {
  return (
    <ContentSection
      title='Conta'
      desc='Atualize os dados da sua conta e escolha o idioma de preferência.'
    >
      <AccountForm />
    </ContentSection>
  )
}
