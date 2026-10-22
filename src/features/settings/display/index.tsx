import { ContentSection } from '../components/content-section'
import { DisplayForm } from './display-form'

export function SettingsDisplay() {
  return (
    <ContentSection
      title='Exibição'
      desc='Escolha quais áreas aparecem no menu do painel.'
    >
      <DisplayForm />
    </ContentSection>
  )
}
