import {
  LayoutDashboard,
  CalendarCheck,
  Users,
  Briefcase,
  CalendarDays,
  BookOpen,
  Layers,
  Settings,
  GraduationCap,
  UserCog,
  Wallet,
  Building2,
  Backpack,
  type LucideIcon,
} from 'lucide-react'

export const ROLE = {
  COMPANY: 1,
  TEACHER: 2,
  STUDENT: 3,
} as const

export type Role = (typeof ROLE)[keyof typeof ROLE]

// Mirrors the `role_access` table — each role's allowed menu items, in order.
export const roleAccess: Record<Role, string[]> = {
  [ROLE.COMPANY]: ['Dashboard', 'Bookings', 'Students', 'Employees', 'Schedule', 'Books', 'Subscription', 'Settings'],
  [ROLE.TEACHER]: ['Dashboard', 'Bookings', 'Students', 'Schedule', 'Books', 'Subscription', 'Settings'],
  [ROLE.STUDENT]: ['Dashboard', 'Classes', 'Teachers', 'Credit'],
}

export const roleBasePath: Record<Role, string> = {
  [ROLE.COMPANY]: '/company-dashboard',
  [ROLE.TEACHER]: '/teacher-dashboard',
  [ROLE.STUDENT]: '/student-dashboard',
}

export const roleLabel: Record<Role, string> = {
  [ROLE.COMPANY]: 'Company',
  [ROLE.TEACHER]: 'Teacher',
  [ROLE.STUDENT]: 'Student',
}

// Avatar icon shown in the header, swapped based on the signed-in account's role.
export const roleAvatarIcon: Record<Role, LucideIcon> = {
  [ROLE.COMPANY]: Building2,
  [ROLE.TEACHER]: GraduationCap,
  [ROLE.STUDENT]: Backpack,
}

type MenuMeta = { path: string; icon: LucideIcon }

export const menuMeta: Record<string, MenuMeta> = {
  Dashboard: { path: 'dashboard', icon: LayoutDashboard },
  Bookings: { path: 'bookings', icon: CalendarCheck },
  Students: { path: 'students', icon: Users },
  Employees: { path: 'employees', icon: Briefcase },
  Schedule: { path: 'schedule', icon: CalendarDays },
  Books: { path: 'books', icon: BookOpen },
  Subscription: { path: 'subscription', icon: Layers },
  Settings: { path: 'settings', icon: Settings },
  Classes: { path: 'classes', icon: GraduationCap },
  Teachers: { path: 'teachers', icon: UserCog },
  Credit: { path: 'credit', icon: Wallet },
}
