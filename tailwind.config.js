/**
 * Design system ReviewFlow AI v3.5.0
 * Estética «Linear / Vercel»: fondo #090D16, superficies de cristal,
 * bordes con iluminación sutil y acento azul-violeta de alta saturación.
 *
 * @type {import('tailwindcss').Config}
 */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        /* Fondos profundos (never pure black) */
        ink: {
          950: '#090D16', // fondo base de la aplicación
          900: '#0C111C', // secciones alternas
          850: '#101625', // tarjetas
          800: '#141B2D', // tarjetas elevadas / inputs
          700: '#1B2438', // bordes intensos, hover
          600: '#26314A',
          500: '#3A4664',
          400: '#5A6785',
          300: '#8A94AC',
          200: '#B8C0D2',
          100: '#DDE2EC',
          50: '#F4F6FB',
        },
        /* Acento de marca (escala completa: antes faltaban 200/300/400/800) */
        brand: {
          50: '#eef4ff',
          100: '#dfe9ff',
          200: '#c2d6ff',
          300: '#93b8ff',
          400: '#5f92fb',
          500: '#3b76f0',
          600: '#2563eb',
          700: '#1d4fd0',
          800: '#1b41a3',
          900: '#1e3a8a',
          950: '#152452',
        },
        /* Acento secundario (gradientes) */
        violet: {
          300: '#c9b6ff',
          400: '#a78bfa',
          500: '#8b5cf6',
          600: '#7c3aed',
          700: '#6d28d9',
        },
        accent: {
          DEFAULT: '#5f92fb',
          soft: '#a78bfa',
          mint: '#34d399',
          amber: '#fbbf24',
          rose: '#fb7185',
        },
      },
      fontFamily: {
        sans: [
          'var(--font-sans)',
          'Inter',
          'Geist Sans',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        mono: [
          'var(--font-mono)',
          'Geist Mono',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Monaco',
          'Consolas',
          'monospace',
        ],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      /*
       * Escala de opacidad ampliada: permite modificadores finos tipo
       * `border-white/12` o `bg-brand-600/22` usados en el sistema de diseño
       * (Tailwind solo trae múltiplos de 5 por defecto).
       */
      opacity: {
        2: '0.02',
        3: '0.03',
        4: '0.04',
        6: '0.06',
        7: '0.07',
        8: '0.08',
        12: '0.12',
        14: '0.14',
        16: '0.16',
        18: '0.18',
        22: '0.22',
        28: '0.28',
        32: '0.32',
        92: '0.92',
      },
      letterSpacing: {
        tighter: '-0.03em',
        tightish: '-0.018em',
      },
      borderRadius: {
        '4xl': '2rem',
        '5xl': '2.5rem',
      },
      boxShadow: {
        /* Bordes iluminados y profundidad tipo Linear */
        glow: '0 0 0 1px rgba(255,255,255,0.06), 0 8px 30px -12px rgba(37,99,235,0.45)',
        'glow-lg':
          '0 0 0 1px rgba(255,255,255,0.08), 0 24px 70px -24px rgba(37,99,235,0.55), 0 0 40px -20px rgba(139,92,246,0.45)',
        'glow-soft': '0 0 0 1px rgba(255,255,255,0.05), 0 12px 40px -20px rgba(2,6,23,0.9)',
        inset: 'inset 0 1px 0 0 rgba(255,255,255,0.06)',
        'inset-lg': 'inset 0 1px 0 0 rgba(255,255,255,0.09), inset 0 -1px 0 0 rgba(0,0,0,0.4)',
        card: '0 1px 2px rgba(2,6,23,0.6), 0 12px 32px -18px rgba(2,6,23,0.9)',
        lift: '0 2px 4px rgba(2,6,23,0.5), 0 24px 48px -24px rgba(2,6,23,1)',
      },
      backgroundImage: {
        'grid-fade':
          'linear-gradient(to right, rgba(255,255,255,0.045) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.045) 1px, transparent 1px)',
        'radial-fade': 'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(59,118,240,0.28), transparent)',
        'aurora':
          'radial-gradient(60% 60% at 20% 10%, rgba(37,99,235,0.22) 0%, transparent 60%), radial-gradient(50% 50% at 85% 20%, rgba(124,58,237,0.18) 0%, transparent 60%), radial-gradient(45% 45% at 50% 100%, rgba(52,211,153,0.10) 0%, transparent 60%)',
        'shine':
          'linear-gradient(110deg, transparent 20%, rgba(255,255,255,0.14) 45%, transparent 70%)',
        'brand-gradient': 'linear-gradient(120deg, #2563eb 0%, #5f92fb 45%, #8b5cf6 100%)',
        'glass-gradient':
          'linear-gradient(160deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.02) 40%, rgba(255,255,255,0.005) 100%)',
      },
      backgroundSize: {
        grid: '44px 44px',
        'grid-sm': '24px 24px',
      },
      keyframes: {
        marquee: {
          from: { transform: 'translateX(0)' },
          to: { transform: 'translateX(-50%)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        'pulse-glow': {
          '0%, 100%': { opacity: '0.45', transform: 'scale(1)' },
          '50%': { opacity: '0.85', transform: 'scale(1.06)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(14px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.97)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        'accordion-down': {
          from: { height: '0', opacity: '0' },
          to: { height: 'var(--radix-accordion-content-height, auto)', opacity: '1' },
        },
        'border-spin': {
          '100%': { transform: 'rotate(-360deg)' },
        },
        'slide-in-right': {
          from: { opacity: '0', transform: 'translateX(24px) scale(0.98)' },
          to: { opacity: '1', transform: 'translateX(0) scale(1)' },
        },
      },
      animation: {
        marquee: 'marquee 32s linear infinite',
        shimmer: 'shimmer 1.8s infinite',
        'pulse-glow': 'pulse-glow 4.5s ease-in-out infinite',
        float: 'float 7s ease-in-out infinite',
        'fade-up': 'fade-up 0.5s cubic-bezier(0.21,0.6,0.35,1) both',
        'scale-in': 'scale-in 0.22s cubic-bezier(0.21,0.6,0.35,1) both',
        'border-spin': 'border-spin 6s linear infinite',
        'slide-in-right': 'slide-in-right 0.3s cubic-bezier(0.21,0.6,0.35,1) both',
      },
      transitionTimingFunction: {
        spring: 'cubic-bezier(0.21, 0.6, 0.35, 1)',
        out: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
};
