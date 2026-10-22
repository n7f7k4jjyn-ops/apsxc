import { ContentSection } from '../components/content-section'
import { ProfileForm } from './profile-form'

export function SettingsProfile() {
  return (
    <ContentSection
      title='Perfil'
      desc='Estas informações serão exibidas no seu perfil.'
    >
      <ProfileForm />
    </ContentSection>
  )
}
