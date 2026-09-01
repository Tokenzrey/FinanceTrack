/**
 * A short confetti burst, hand-rolled on a full-screen canvas.
 *
 * No dependency: a physics-free particle burst is ~40 lines of canvas code, which beats
 * pulling in a library for one animation. Removes itself after the burst settles, and
 * is a silent no-op for a user who has `prefers-reduced-motion` set.
 */

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  color: string
  rotation: number
  vrotation: number
}

const COLORS = ['#14B8A6', '#F97316', '#8B5CF6', '#F59E0B', '#22C55E']

export function fireConfetti(originXRatio = 0.5): void {
  if (typeof window === 'undefined') return
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

  const canvas = document.createElement('canvas')
  canvas.width = window.innerWidth
  canvas.height = window.innerHeight
  canvas.style.cssText = 'position:fixed;inset:0;z-index:9999;pointer-events:none;'
  document.body.appendChild(canvas)

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    canvas.remove()
    return
  }

  const originX = canvas.width * originXRatio
  const particles: Particle[] = Array.from({ length: 120 }, () => ({
    x: originX,
    y: canvas.height * 0.3,
    vx: (Math.random() - 0.5) * 12,
    vy: Math.random() * -12 - 4,
    size: Math.random() * 6 + 4,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    rotation: Math.random() * 360,
    vrotation: (Math.random() - 0.5) * 20,
  }))

  const gravity = 0.35
  let frame = 0
  const maxFrames = 130

  const tick = () => {
    frame += 1
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    for (const p of particles) {
      p.vy += gravity
      p.x += p.vx
      p.y += p.vy
      p.rotation += p.vrotation

      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate((p.rotation * Math.PI) / 180)
      ctx.fillStyle = p.color
      ctx.globalAlpha = Math.max(0, 1 - frame / maxFrames)
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6)
      ctx.restore()
    }

    if (frame < maxFrames) {
      requestAnimationFrame(tick)
    } else {
      canvas.remove()
    }
  }

  requestAnimationFrame(tick)
}
