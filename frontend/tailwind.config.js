/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Primary accent: purple, taken from the Clipura logo mark.
        brand: {
          50: '#f6f2ff',
          100: '#eadcff',
          200: '#d4bbff',
          300: '#b98cff',
          400: '#9f5bff',
          500: '#8b2ff5',
          600: '#7a1fe0',
          700: '#6417bb',
          800: '#4f1596',
          900: '#3a0b74',
        },
        // Second accent: gold, taken from the logo's play triangle and wordmark.
        gold: {
          50: '#fff9e6',
          100: '#fdefbf',
          200: '#fbdf86',
          300: '#facc4d',
          400: '#f6bb24',
          500: '#eda50a',
          600: '#c9850a',
          700: '#9f6410',
          800: '#7e4f14',
          900: '#684015',
        },
        surface: {
          DEFAULT: '#0d0f1a',
          1: '#12141f',
          2: '#1a1d2e',
          3: '#22263a',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'slide-up': 'slideUp 0.3s ease-out',
        'fade-in': 'fadeIn 0.4s ease-out',
      },
      keyframes: {
        slideUp: {
          '0%': { transform: 'translateY(12px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};
