import { getNavigationPage } from './navigation'

type NavigationEvent =
  'page_view' | 'menu_click' | 'breadcrumb_click' | 'cta_click' | 'route_error'
type EventDetails = {
  destination?: string
  action?: string
  reason?: 'not_found' | 'render_error'
}

export function trackNavigation(
  event: NavigationEvent,
  path: string,
  details: EventDetails = {}
) {
  try {
    window.dispatchEvent(
      new CustomEvent('verdant:analytics', {
        detail: {
          event,
          path: getNavigationPage(path).path,
          ...details,
          ...(details.destination
            ? { destination: getNavigationPage(details.destination).path }
            : {}),
        },
      })
    )
  } catch {
    // Analytics must never interrupt navigation or require a vendor.
  }
}
