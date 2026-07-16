/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        sambal: '#E63946',
        pandan: '#2A9D8F',
        kaya: '#E9C46A',
        coconut: '#F8F9FA',
        charcoal: '#1D3557',
      },
      fontFamily: {
        display: ['"Plus Jakarta Sans"', 'sans-serif'],
        body: ['"Inter"', 'sans-serif'],
      },
      boxShadow: {
        glass: '0 8px 32px 0 rgba(29, 53, 87, 0.15)',
        glow: '0 0 24px rgba(233, 196, 106, 0.55)',
      },
      keyframes: {
        scanline: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100%)' },
        },
        floatSlow: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-6px)' },
        },
      },
      animation: {
        scanline: 'scanline 1.8s ease-in-out infinite',
        floatSlow: 'floatSlow 4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
