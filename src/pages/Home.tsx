import { useNavigate } from 'react-router-dom'
import { useState, type CSSProperties } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  Calendar,
  CalendarCheck,
  CircleCheck,
  GraduationCap,
  NotebookPen,
  Users,
  BarChart3,
  ArrowRight,
  Rocket,
  HeartHandshake,
  ShieldCheck,
  Globe,
  Check,
  Mail,
  Phone,
  MapPin,
  UserPlus,
  ListChecks,
  Sparkles,
  Activity,
  ChevronDown,
} from 'lucide-react'
import { scrollToId } from '../lib/scroll'
import { useAuth } from '../context/useAuth'
import { roleBasePath } from '../data/roleAccess'
import { businessPlans, teacherPlans, includedInEveryPlan } from '../data/pricing'
import Reveal from '../components/motion/Reveal'
import CountUp from '../components/motion/CountUp'
import { fadeUp } from '../components/motion/presets'
import './Home.css'

const highlights = ['Easy to Use', 'Save Time', 'Grow Your Business']

const features = [
  {
    icon: Calendar,
    tint: '#ffffff',
    color: '#1447e6',
    title: 'Smart Booking',
    desc: 'Easy class scheduling and automatic confirmations.',
  },
  {
    icon: Users,
    tint: '#eaf2ff',
    color: '#2f6fed',
    title: 'Student Management',
    desc: 'Manage student profiles, levels, progress, and history.',
  },
  {
    icon: GraduationCap,
    tint: '#e8eaf5',
    color: '#0c1b52',
    title: 'Teacher Management',
    desc: 'Organize teachers, availability, and class assignments.',
  },
  {
    icon: BarChart3,
    tint: '#e5edff',
    color: '#0f34b0',
    title: 'Reports & Analytics',
    desc: 'Track performance and grow your ESL business.',
  },
  {
    icon: NotebookPen,
    tint: '#e6f7ff',
    color: '#0f96d1',
    title: 'Class Notes',
    desc: 'Teachers can leave notes after every class so students can review them anytime.',
  },
]

const upcomingClasses = [
  { title: '1:1 Speaking Class', meta: 'John Smith · Teacher: Anna Lee', time: '09:00 AM', status: 'In Progress' },
  { title: 'Group Grammar Class', meta: 'Intermediate Level · David Kim', time: '10:30 AM', status: 'Upcoming' },
  { title: '1:1 Business English', meta: 'Sarah Johnson · Emma Thompson', time: '01:00 PM', status: 'Upcoming' },
]

const howItWorks = [
  {
    icon: UserPlus,
    title: 'Create Your Account',
    desc: 'Sign up as an ESL company or freelance teacher in minutes — no credit card required.',
  },
  {
    icon: ListChecks,
    title: 'Set Up Your Classes',
    desc: 'Add your teachers, students, and schedule so everything is ready to book.',
  },
  {
    icon: Sparkles,
    title: 'Start Booking',
    desc: 'Let students book classes and manage everything from one simple dashboard.',
  },
]

const aboutValues = [
  {
    icon: Rocket,
    title: 'Built for Growth',
    desc: 'Every feature is designed to help ESL businesses scale without the busywork.',
  },
  {
    icon: HeartHandshake,
    title: 'Teacher First',
    desc: 'We build alongside real ESL teachers and schools, not around them.',
  },
  {
    icon: ShieldCheck,
    title: 'Reliable & Secure',
    desc: 'Bookings and student data are protected at every step.',
  },
  {
    icon: Globe,
    title: 'Made for Remote Teaching',
    desc: 'Time zones, online classes, and global students – handled by default.',
  },
]

const aboutStats = [
  { icon: Calendar, value: 1200, suffix: '+', label: 'Classes booked monthly' },
  { icon: Users, value: 850, suffix: '+', label: 'Active students' },
  { icon: GraduationCap, value: 40, suffix: '+', label: 'Teachers & schools' },
  { icon: Activity, value: 99.9, decimals: 1, suffix: '%', label: 'Uptime' },
]

const faqs = [
  {
    q: 'Can I change plans later?',
    a: 'Yes, you can upgrade or downgrade your plan at any time from your account settings.',
  },
  {
    q: 'Can I try Class8out for free?',
    a: "Yes — the Free Plan doesn't require a credit card and is free for as long as you need it. Upgrade to a paid plan whenever you're ready.",
  },
  {
    q: 'Do you offer discounts for schools?',
    a: 'Yes, contact our sales team for volume pricing for schools and larger teams.',
  },
]

const contactInfo = [
  { icon: Mail, label: 'Email', value: 'servicesjmseptember@gmail.com' },
  { icon: Phone, label: 'Phone', value: '+63 935 254 1057' },
  { icon: MapPin, label: 'Location', value: 'Baguio City, Philippines' },
]

function Home() {
  const navigate = useNavigate()
  const { session, role } = useAuth()
  const [audience, setAudience] = useState<'business' | 'teacher'>('business')
  const plans = audience === 'business' ? businessPlans : teacherPlans
  const [openFaq, setOpenFaq] = useState<number | null>(0)
  const reduceMotion = useReducedMotion()

  return (
    <>
      <section className="hero anchor-section" id="home">
        <div className="hero-blob hero-blob-1" aria-hidden="true" />
        <div className="hero-blob hero-blob-2" aria-hidden="true" />

        <div className="container hero-inner">
          <div className="hero-copy">
            <motion.span
              className="badge-pill"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              ALL-IN-ONE ESL BOOKING SYSTEM
            </motion.span>
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.08 }}
            >
              The Smarter Way to
              <br />
              Manage &amp; Book
              <br />
              <span className="hero-highlight">ESL Classes.</span>
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.16 }}
            >
              Class8out helps ESL companies and freelance teachers manage bookings, students,
              schedules, and classes – all in one place.
            </motion.p>

            <motion.div
              className="hero-actions"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.24 }}
            >
              <motion.button
                className="btn btn-primary"
                onClick={() => navigate(session && role ? `${roleBasePath[role]}/dashboard` : '/register')}
                whileHover={reduceMotion ? undefined : { scale: 1.03 }}
                whileTap={reduceMotion ? undefined : { scale: 0.97 }}
              >
                {session && role ? 'Go back to Dashboard' : 'Start for Free'} <ArrowRight size={18} />
              </motion.button>
              <motion.button
                className="btn btn-outline"
                onClick={() => scrollToId('contact')}
                whileHover={reduceMotion ? undefined : { scale: 1.03 }}
                whileTap={reduceMotion ? undefined : { scale: 0.97 }}
              >
                <CalendarCheck size={18} /> Book a Demo
              </motion.button>
            </motion.div>

            <motion.ul
              className="hero-highlights"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.32 }}
            >
              {highlights.map((item) => (
                <li key={item}>
                  <CircleCheck size={16} /> {item}
                </li>
              ))}
            </motion.ul>
          </div>

          <motion.div
            className="hero-preview"
            initial={{ opacity: 0, y: 30, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <div className={`hero-preview-float ${reduceMotion ? 'is-static' : ''}`}>
            <div className="preview-frame">
              <div className="preview-topbar">
                <div className="preview-brand">
                  Clas<span>8</span>out
                </div>
                <div className="preview-avatar" />
              </div>

              <div className="preview-body">
                <aside className="preview-sidebar">
                  {['Dashboard', 'Bookings', 'Calendar', 'Students', 'Teachers'].map(
                    (item, i) => (
                      <div key={item} className={`preview-nav-item ${i === 0 ? 'active' : ''}`}>
                        {item}
                      </div>
                    ),
                  )}
                </aside>

                <div className="preview-main">
                  <div className="preview-stats">
                    <div className="preview-stat">
                      <span>Total Bookings</span>
                      <strong>1,248</strong>
                    </div>
                    <div className="preview-stat">
                      <span>Total Students</span>
                      <strong>864</strong>
                    </div>
                    <div className="preview-stat">
                      <span>Total Teachers</span>
                      <strong>38</strong>
                    </div>
                    <div className="preview-stat">
                      <span>Revenue</span>
                      <strong>$8,560</strong>
                    </div>
                  </div>

                  <div className="preview-classes">
                    <h5>Upcoming Classes</h5>
                    {upcomingClasses.map((c) => (
                      <div className="preview-class-row" key={c.title}>
                        <div>
                          <strong>{c.title}</strong>
                          <span>{c.meta}</span>
                        </div>
                        <div className="preview-class-meta">
                          <span>{c.time}</span>
                          <em className={c.status === 'In Progress' ? 'live' : ''}>{c.status}</em>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="preview-stand" />
            </div>
          </motion.div>
        </div>
      </section>

      <section className="features anchor-section" id="features">
        <div className="features-blob features-blob-1" aria-hidden="true" />
        <div className="features-blob features-blob-2" aria-hidden="true" />

        <div className="container">
          <Reveal className="section-head">
            <span className="eyebrow">Built for ESL Professionals</span>
            <h2>Everything You Need to Run Your ESL Business</h2>
            <p>Powerful tools to manage your classes, students, and schedule – so you can focus on teaching.</p>
          </Reveal>

          <div className="features-grid">
            {features.map((f, i) => (
              <motion.div
                className={`feature-card ${i === 0 ? 'is-featured' : ''}`}
                key={f.title}
                style={{ '--accent': f.color } as CSSProperties}
                {...fadeUp(i)}
              >
                {i === 0 && <span className="feature-badge">Core Feature</span>}
                <div className="feature-icon" style={{ background: f.tint, color: f.color }}>
                  <f.icon size={22} />
                </div>
                <div>
                  <h3>{f.title}</h3>
                  <p>{f.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="how-it-works">
        <div className="container">
          <Reveal className="section-head">
            <span className="eyebrow">How It Works</span>
            <h2>Up and running in three steps</h2>
            <p>No setup calls, no onboarding fees — just sign up and go.</p>
          </Reveal>

          <div className="steps-grid">
            {howItWorks.map((step, i) => (
              <motion.div className="step-card" key={step.title} {...fadeUp(i)}>
                <span className="step-number">{i + 1}</span>
                <div className="step-icon">
                  <step.icon size={22} />
                </div>
                <h3>{step.title}</h3>
                <p>{step.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <div className="anchor-section" id="about">
        <section className="about-story">
          <div className="about-blob about-blob-1" aria-hidden="true" />
          <div className="about-blob about-blob-2" aria-hidden="true" />
          <div className="container about-story-inner">
            <Reveal>
              <span className="eyebrow">About Class8out</span>
              <h2>We help ESL professionals teach, book, and grow.</h2>
              <p>
                Class8out started as a simple scheduling sheet for a small group of online
                English teachers. Today it&apos;s the booking system that ESL companies and
                freelancers rely on to run their entire business. We saw teachers juggling
                spreadsheets, messaging apps, and payment links just to run a single class –
                so we brought scheduling, students, and reporting into one place.
              </p>
            </Reveal>
            <motion.div
              className="about-stats"
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.5 }}
            >
              {aboutStats.map((s) => (
                <div className="about-stat" key={s.label}>
                  <div className="about-stat-icon">
                    <s.icon size={18} />
                  </div>
                  <strong>
                    <CountUp value={s.value} decimals={s.decimals ?? 0} suffix={s.suffix} />
                  </strong>
                  <span>{s.label}</span>
                </div>
              ))}
            </motion.div>
          </div>
        </section>

        <section className="about-values">
          <div className="values-pattern" aria-hidden="true" />
          <div className="container">
            <Reveal className="section-head">
              <span className="eyebrow">What We Stand For</span>
              <h2>The values behind Class8out</h2>
            </Reveal>

            <div className="values-grid">
              {aboutValues.map((v, i) => (
                <motion.div className="value-card" key={v.title} {...fadeUp(i)}>
                  <span className="value-index">{String(i + 1).padStart(2, '0')}</span>
                  <div className="value-icon">
                    <v.icon size={22} />
                  </div>
                  <h3>{v.title}</h3>
                  <p>{v.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>
      </div>

      <div className="anchor-section" id="pricing">
        <section className="pricing-section">
          <div className="pricing-blob" aria-hidden="true" />
          <div className="container">
            <Reveal className="section-head">
              <span className="eyebrow">Pricing</span>
              <h2>Simple pricing that grows with you</h2>
              <p>Start free, upgrade when you&apos;re ready. No hidden fees.</p>
            </Reveal>

            <div className="pricing-tabs">
              <button
                className={audience === 'business' ? 'is-active' : ''}
                onClick={() => setAudience('business')}
              >
                For ESL Businesses
              </button>
              <button
                className={audience === 'teacher' ? 'is-active' : ''}
                onClick={() => setAudience('teacher')}
              >
                For Teachers
              </button>
            </div>

            <div className="pricing-grid">
              {plans.map((plan, i) => (
                <motion.div
                  className={`pricing-card ${plan.highlight ? 'is-highlight' : ''}`}
                  key={plan.name}
                  {...fadeUp(i)}
                >
                  {plan.highlight && <span className="pricing-tag">Most Popular</span>}
                  <h3>{plan.name}</h3>
                  <p className="pricing-desc">{plan.desc}</p>
                  <div className="pricing-price">
                    <strong>{plan.price}</strong>
                    <span>{plan.period}</span>
                  </div>

                  <button
                    className={`btn btn-block ${plan.highlight ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() =>
                      navigate('/register', {
                        state: { accountType: audience === 'business' ? 'company' : 'teacher', plan: plan.name },
                      })
                    }
                  >
                    {plan.cta}
                  </button>

                  <ul className="pricing-features">
                    {plan.features.map((f) => (
                      <li key={f}>
                        <Check size={16} /> {f}
                      </li>
                    ))}
                  </ul>

                  <div className="pricing-features-divider">Also included</div>

                  <ul className="pricing-features pricing-features-shared">
                    {includedInEveryPlan.map((f) => (
                      <li key={f}>
                        <Check size={16} /> {f}
                      </li>
                    ))}
                  </ul>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        <section className="pricing-faq">
          <div className="container">
            <Reveal className="section-head">
              <span className="eyebrow">FAQ</span>
              <h2>Frequently Asked Questions</h2>
            </Reveal>

            <div className="faq-list">
              {faqs.map((f, i) => {
                const isOpen = openFaq === i
                return (
                  <motion.div
                    className={`faq-item ${isOpen ? 'is-open' : ''}`}
                    key={f.q}
                    {...fadeUp(i, 0.06)}
                  >
                    <button
                      className="faq-question"
                      onClick={() => setOpenFaq(isOpen ? null : i)}
                      aria-expanded={isOpen}
                    >
                      <h4>{f.q}</h4>
                      <motion.span
                        className="faq-chevron"
                        animate={{ rotate: isOpen ? 180 : 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <ChevronDown size={18} />
                      </motion.span>
                    </button>
                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.25, ease: 'easeInOut' }}
                          className="faq-answer-wrap"
                        >
                          <p className="faq-answer">{f.a}</p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                )
              })}
            </div>
          </div>
        </section>
      </div>

      <section className="contact-section anchor-section" id="contact">
        <div className="container">
          <div className="contact-panel">
            <div className="contact-panel-pattern" aria-hidden="true" />
            <div className="contact-panel-blob" aria-hidden="true" />

            <Reveal className="section-head">
              <span className="eyebrow contact-eyebrow">Contact Us</span>
              <h2>Let&apos;s talk about your ESL business</h2>
              <p>Have a question or want a demo? Reach out to us directly through any of the channels below.</p>
            </Reveal>

            <div className="contact-info-grid">
              {contactInfo.map((item, i) => (
                <motion.div className="contact-info-card" key={item.label} {...fadeUp(i)}>
                  <div className="contact-info-icon">
                    <item.icon size={22} />
                  </div>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </>
  )
}

export default Home
