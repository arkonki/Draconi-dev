import colors from 'tailwindcss/colors'; // Import Tailwind's default colors

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      // Add the colors section here
      colors: {
        primary: {
          DEFAULT: colors.blue[600], // Example: Use Tailwind's blue-600 as primary
          foreground: colors.white, // Example: White text on primary background
        },
        // You might want to define secondary, destructive etc. here too for consistency
        secondary: { // Define secondary if used by Button variants
          DEFAULT: colors.gray[200],
          foreground: colors.gray[800],
        },
        destructive: { // Define destructive if used by Button variants
          DEFAULT: colors.red[600],
          foreground: colors.white,
        },
        // Define other colors used by Button variants (accent, ring, etc.) if needed
        // accent: {
        //   DEFAULT: colors.gray[100],
        //   foreground: colors.gray[900],
        // },
        // ring: colors.blue[500], // Example for focus rings
        // background: colors.white, // Example background
        // foreground: colors.gray[900], // Example foreground text
        // input: colors.gray[300], // Example border color for inputs/outline buttons
      },
      fontFamily: {
        fantasy: ['MedievalSharp', 'fantasy'],
        serif: ['Crimson Text', 'serif'],
      },
      typography: {
        DEFAULT: {
          css: {
            maxWidth: 'none',
            color: '#374151', // Consider using theme colors like theme('colors.gray.700')
            h1: {
              fontFamily: 'MedievalSharp, fantasy',
            },
            h2: {
              fontFamily: 'MedievalSharp, fantasy',
            },
            h3: {
              fontFamily: 'MedievalSharp, fantasy',
            },
            p: {
              fontFamily: 'Crimson Text, serif',
            },
          },
        },
      },
      screens: {
        'xs': '475px',
      },
      container: {
        center: true,
        padding: {
          DEFAULT: '1rem',
          sm: '2rem',
          lg: '4rem',
          xl: '5rem',
        },
      },
      keyframes: {
        shimmer: {
          '100%': {
            transform: 'translateX(100%)',
          },
        },
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
    // Consider adding require('@tailwindcss/forms') if you use form styling classes
  ],
};
