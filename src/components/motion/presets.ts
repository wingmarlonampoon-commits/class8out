const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

// Scroll-triggered stagger for grid items — spread onto a motion.div.
export function fadeUp(index = 0, delayStep = 0.08) {
  const reduced = prefersReducedMotion()
  return {
    initial: { opacity: 0, y: reduced ? 0 : 24 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, amount: 0.2 },
    transition: {
      duration: reduced ? 0 : 0.5,
      delay: reduced ? 0 : index * delayStep,
      ease: [0.21, 0.47, 0.32, 0.98] as const,
    },
    whileHover: reduced ? undefined : { y: -6 },
  }
}
