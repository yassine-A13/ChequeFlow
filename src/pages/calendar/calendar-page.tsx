import { CalendarDays } from 'lucide-react'
import { EmptyState } from '../../components/shared/empty-state'

export function CalendarPage() { return <div className="page-stack"><section><div className="eyebrow">ÉCHÉANCES</div><h2 className="page-heading">Calendrier</h2><p className="page-subtitle">Visualisez les dates importantes de vos chèques.</p></section><div className="panel empty-panel"><EmptyState icon={CalendarDays} title="Aucune échéance à afficher" description="Ajoutez des chèques pour voir vos échéances dans le calendrier." /></div></div> }
