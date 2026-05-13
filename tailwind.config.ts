import type { Config } from 'tailwindcss';
import colors from 'tailwindcss/colors';

const brand = {
  50:  '#f8eef9',
  100: '#f0ddf1',
  200: '#dfbae2',
  300: '#cb97d1',
  400: '#af6ab8',
  500: '#7c4180',
  600: '#562c59',
  700: '#442246',
  800: '#321934',
  900: '#211122',
  950: '#110a11',
};

const config: Config = {
  content: [
    './src/app/**/*.{ts,tsx}',
    './src/components/**/*.{ts,tsx}',
    './src/lib/**/*.{ts,tsx}',
  ],
  theme: {
    colors: {
      ...colors,
      blue: brand,
    },
  },
  plugins: [],
};

export default config;
