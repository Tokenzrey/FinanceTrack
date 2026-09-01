import type { Config } from 'tailwindcss'

/** Pillar / status palette from the FinTrack maximalism design tokens. */
export const fintrackColors = {
  income: { DEFAULT: '#F59E0B', light: '#FEF3C7', dark: '#78350F' },
  needs: { DEFAULT: '#14B8A6', light: '#CCFBF1', dark: '#134E4A' },
  wants: { DEFAULT: '#F97316', light: '#FFEDD5', dark: '#7C2D12' },
  savings: { DEFAULT: '#8B5CF6', light: '#EDE9FE', dark: '#4C1D95' },
  safe: '#22C55E',
  warning: '#EAB308',
  danger: '#F97316',
  exceeded: '#EF4444',
  surface: { 900: '#0F172A', 800: '#1E293B', 700: '#334155', 600: '#475569' },
  accents: ['#6366F1', '#EC4899', '#14B8A6', '#F59E0B', '#22C55E', '#8B5CF6', '#F97316', '#0EA5E9'],
} as const

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx,mdx}'],
  theme: {
    screens: {
      xs: '480px',
      sm: '640px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
      '2xl': '1536px',
    },
    extend: {
      colors: {
        income: fintrackColors.income,
        needs: fintrackColors.needs,
        wants: fintrackColors.wants,
        savings: fintrackColors.savings,
        safe: fintrackColors.safe,
        warning: fintrackColors.warning,
        danger: fintrackColors.danger,
        exceeded: fintrackColors.exceeded,
        surface: fintrackColors.surface,
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
        popover: { DEFAULT: 'hsl(var(--popover))', foreground: 'hsl(var(--popover-foreground))' },
      },
      fontFamily: {
        display: ['var(--font-sora)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['var(--font-inter)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        display: ['3rem', { lineHeight: '1', letterSpacing: '-0.03em', fontWeight: '700' }],
        'display-sm': ['2rem', { lineHeight: '1.1', letterSpacing: '-0.02em', fontWeight: '700' }],
        caption: ['0.75rem', { lineHeight: '1rem' }],
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      boxShadow: {
        'glow-needs': '0 0 24px rgba(20,184,166,0.15)',
        'glow-wants': '0 0 24px rgba(249,115,22,0.15)',
        'glow-savings': '0 0 24px rgba(139,92,246,0.15)',
        'glow-income': '0 0 24px rgba(245,158,11,0.15)',
      },
      keyframes: {
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        shimmer: 'shimmer 1.6s infinite',
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}

export default config
