// Progress bar
const progressBar = document.getElementById('progressBar')
window.addEventListener('scroll', () => {
  const scrollTop = window.scrollY
  const docHeight = document.documentElement.scrollHeight - window.innerHeight
  const progress = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0
  progressBar.style.width = progress + '%'
})

// Active nav link on scroll
const sections = document.querySelectorAll('section[id]')
const navLinks = document.querySelectorAll('.sidebar-nav a')

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        navLinks.forEach((link) => link.classList.remove('active'))
        const activeLink = document.querySelector(
          `.sidebar-nav a[href="#${entry.target.id}"]`
        )
        if (activeLink) activeLink.classList.add('active')
      }
    })
  },
  { rootMargin: '-20% 0px -60% 0px' }
)

sections.forEach((section) => observer.observe(section))

// Mobile nav toggle
const navToggle = document.getElementById('navToggle')
const sidebar = document.getElementById('sidebar')

navToggle.addEventListener('click', () => {
  sidebar.classList.toggle('open')
})

// Close sidebar on link click (mobile)
navLinks.forEach((link) => {
  link.addEventListener('click', () => {
    sidebar.classList.remove('open')
  })
})

// Close sidebar on outside click (mobile)
document.addEventListener('click', (e) => {
  if (
    sidebar.classList.contains('open') &&
    !sidebar.contains(e.target) &&
    !navToggle.contains(e.target)
  ) {
    sidebar.classList.remove('open')
  }
})

// Animate elements on scroll
const animateOnScroll = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible')
        animateOnScroll.unobserve(entry.target)
      }
    })
  },
  { threshold: 0.1 }
)

document.querySelectorAll('.card, .principle-card, .topology-card, .loop-card, .ap-card, .guardrail-layer, .hero-card, .consider-card, .section-group').forEach((el) => {
  el.classList.add('animate-in')
  animateOnScroll.observe(el)
})

// Add animation styles
const style = document.createElement('style')
style.textContent = `
  .animate-in {
    opacity: 0;
    transform: translateY(16px);
    transition: opacity 0.4s ease, transform 0.4s ease;
  }
  .animate-in.visible {
    opacity: 1;
    transform: translateY(0);
  }
`
document.head.appendChild(style)
