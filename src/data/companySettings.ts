export type CompanySettings = {
  timezone: string
  time_interval: '30' | '60'
  teacher_self_booking: boolean
}

// Seeded into company_registration.company_settings when a company registers,
// and used as the fallback whenever a row predates this field.
export const DEFAULT_COMPANY_SETTINGS: CompanySettings = {
  timezone: 'Asia/Manila',
  time_interval: '30',
  teacher_self_booking: true,
}
