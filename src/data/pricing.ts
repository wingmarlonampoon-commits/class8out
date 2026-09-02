export type Plan = {
  name: string
  price: string
  period: string
  desc: string
  features: string[]
  cta: string
  highlight: boolean
}

export const businessPlans: Plan[] = [
  {
    name: 'Free',
    price: 'Free',
    period: '',
    desc: 'For small ESL teams just getting started.',
    features: ['Up to 5 teachers', '1 admin account', 'Up to 50 student accounts'],
    cta: 'Start for Free',
    highlight: false,
  },
  {
    name: 'Basic',
    price: '₱799',
    period: '/month',
    desc: 'For growing ESL businesses.',
    features: ['Up to 100 users (teachers/admin)'],
    cta: 'Choose Plan',
    highlight: false,
  },
  {
    name: 'Pro',
    price: '₱1,500',
    period: '/month',
    desc: 'For established ESL businesses scaling up.',
    features: ['Up to 500 users (teachers/admin)'],
    cta: 'Choose Plan',
    highlight: true,
  },
  {
    name: 'Enterprise',
    price: '₱3,000',
    period: '/month',
    desc: 'For large ESL companies running at scale.',
    features: ['Unlimited users', 'Unlimited students'],
    cta: 'Choose Plan',
    highlight: false,
  },
]

export const teacherPlans: Plan[] = [
  {
    name: 'Free',
    price: 'Free',
    period: '',
    desc: 'Try Class8out with a small class list.',
    features: ['Up to 20 students'],
    cta: 'Start for Free',
    highlight: false,
  },
  {
    name: 'Basic',
    price: '₱199',
    period: '/month',
    desc: 'For growing your student base.',
    features: ['Up to 100 students'],
    cta: 'Choose Plan',
    highlight: false,
  },
  {
    name: 'Pro',
    price: '₱299',
    period: '/month',
    desc: 'For full-time freelance teachers.',
    features: ['Up to 200 students'],
    cta: 'Choose Plan',
    highlight: true,
  },
  {
    name: 'Ultimate',
    price: '₱799',
    period: '/month',
    desc: 'For top teachers with a full roster.',
    features: ['Unlimited students'],
    cta: 'Choose Plan',
    highlight: false,
  },
]

export const includedInEveryPlan = [
  'Class Feedback',
  'Teacher Rating (Optional)',
  'Class Notes',
  'Class History Records',
  'Book Upload',
  'Public Book Access',
  'Scheduling System',
]
