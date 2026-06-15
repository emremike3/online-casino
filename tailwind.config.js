/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Base surfaces — deep, clean dark palette inspired by modern crypto casinos
        base: '#0a0b10',
        surface: '#12141d',
        elevated: '#1a1d29',
        hover: '#222637',
        border: '#262b3b',
        // Brand
        brand: {
          DEFAULT: '#7c5cff',
          light: '#9b82ff',
          dark: '#5a3fd6',
        },
        accent: '#4f8cff',
        // Semantic
        win: '#00e701',
        loss: '#ff3b59',
        gold: '#ffc93c',
        muted: '#8b93a7',
        subtle: '#5b6478',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'Avenir', 'Helvetica', 'Arial', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 32px -4px rgba(124, 92, 255, 0.45)',
        'glow-win': '0 0 32px -4px rgba(0, 231, 1, 0.45)',
        card: '0 8px 30px -12px rgba(0, 0, 0, 0.6)',
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, #7c5cff 0%, #4f8cff 100%)',
        'win-gradient': 'linear-gradient(135deg, #00e701 0%, #00b894 100%)',
        'radial-fade': 'radial-gradient(ellipse at top, rgba(124,92,255,0.12), transparent 55%)',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'pop-in': {
          '0%': { opacity: '0', transform: 'scale(0.8)' },
          '60%': { opacity: '1', transform: 'scale(1.05)' },
          '100%': { transform: 'scale(1)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(124,92,255,0.4)' },
          '50%': { boxShadow: '0 0 24px 6px rgba(124,92,255,0.25)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.4s ease-out',
        'pop-in': 'pop-in 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)',
        shimmer: 'shimmer 2.5s linear infinite',
        float: 'float 4s ease-in-out infinite',
        'pulse-glow': 'pulse-glow 2.5s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
