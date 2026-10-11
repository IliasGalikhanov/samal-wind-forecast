import {
  Wind,
  LayoutDashboard,
  ChartNoAxesCombined,
  Upload,
  Activity,
  Workflow,
  GitCompareArrows,
  Settings2,
} from 'lucide-react'
export type View =
  | 'overview'
  | 'forecast'
  | 'import'
  | 'quality'
  | 'agent'
  | 'compare'
  | 'settings'
  | 'notifications'
export const NAV: { id: View; icon: typeof Wind }[] = [
  { id: 'overview', icon: LayoutDashboard },
  { id: 'forecast', icon: ChartNoAxesCombined },
  { id: 'import', icon: Upload },
  { id: 'quality', icon: Activity },
  { id: 'agent', icon: Workflow },
  { id: 'compare', icon: GitCompareArrows },
  { id: 'settings', icon: Settings2 },
]
export const views = [...NAV.map((n) => n.id), 'notifications']
