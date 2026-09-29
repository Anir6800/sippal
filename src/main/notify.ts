import { Notification } from 'electron'
import icon from '../../resources/icon.png?asset'

interface NotifyOptions {
  title: string
  body: string
  silent?: boolean
  actions?: string[]
  onAction?: (index: number) => void
  onClick?: () => void
}

// Keep references: a garbage-collected Notification loses its action/click handlers.
const live = new Set<Notification>()

export function notify(o: NotifyOptions): Notification | null {
  if (!Notification.isSupported()) return null
  const n = new Notification({
    title: o.title,
    body: o.body,
    icon,
    silent: o.silent ?? false,
    actions: o.actions?.map((text) => ({ type: 'button' as const, text }))
  })
  n.on('action', (e) => o.onAction?.(e.actionIndex))
  if (o.onClick) n.on('click', o.onClick)
  n.on('close', () => live.delete(n))
  live.add(n)
  n.show()
  return n
}
