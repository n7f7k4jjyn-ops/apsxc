import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Circle,
  CheckCircle,
  AlertCircle,
  Timer,
  HelpCircle,
  CircleOff,
} from 'lucide-react'

export const labels = [
  {
    value: 'bug',
    label: 'Erro',
  },
  {
    value: 'feature',
    label: 'Melhoria',
  },
  {
    value: 'documentation',
    label: 'Documentação',
  },
]

export const statuses = [
  {
    label: 'A fazer',
    value: 'backlog' as const,
    icon: HelpCircle,
  },
  {
    label: 'Pendente',
    value: 'todo' as const,
    icon: Circle,
  },
  {
    label: 'Em andamento',
    value: 'in progress' as const,
    icon: Timer,
  },
  {
    label: 'Concluída',
    value: 'done' as const,
    icon: CheckCircle,
  },
  {
    label: 'Cancelada',
    value: 'canceled' as const,
    icon: CircleOff,
  },
]

export const priorities = [
  {
    label: 'Baixa',
    value: 'low' as const,
    icon: ArrowDown,
  },
  {
    label: 'Média',
    value: 'medium' as const,
    icon: ArrowRight,
  },
  {
    label: 'Alta',
    value: 'high' as const,
    icon: ArrowUp,
  },
  {
    label: 'Crítica',
    value: 'critical' as const,
    icon: AlertCircle,
  },
]
