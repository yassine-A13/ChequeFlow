import type { LucideIcon } from 'lucide-react'
import { Button } from '../ui/button'

export function EmptyState({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description: string; action?: { label: string; onClick?: () => void } }) {
  return <div className="empty-state"><div className="empty-icon"><Icon size={23} strokeWidth={1.7} /></div><h2>{title}</h2><p>{description}</p>{action && <Button onClick={action.onClick}>{action.label}</Button>}</div>
}
