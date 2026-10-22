import { ContentSection } from '../components/content-section'
import { NotificationsForm } from './notifications-form'

export function SettingsNotifications() {
  return (
    <ContentSection
      title='Notificações'
      desc='Configure como você recebe notificações.'
    >
      <NotificationsForm />
    </ContentSection>
  )
}

