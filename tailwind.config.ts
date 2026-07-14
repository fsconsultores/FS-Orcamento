import type { Config } from 'tailwindcss';
import colors from 'tailwindcss/colors';

// Paleta antiga da marca — mantida (aliasada em `blue-*`) enquanto os módulos
// que ainda não foram migrados para o design system novo (ver plano de UI/UX)
// continuarem usando `bg-blue-600` esperando este roxo. Remover só quando
// TODO o sistema estiver migrado para `primary`/`secondary`.
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

// Identidade nova da FS Consultores (design system 2026). `primary` ancora o
// hex exato pedido (#52276E) no stop 700; `secondary` ancora #344DA1 no stop
// 500. Os demais stops são uma rampa HSL gerada a partir desses valores.
const primary = {
  50:  '#f6f0fa',
  100: '#eaddf3',
  200: '#d6bbe7',
  300: '#ba8ed7',
  400: '#9e60c7',
  500: '#833eb1',
  600: '#653088',
  700: '#52276E',
  800: '#3d1d53',
  900: '#2d153c',
  950: '#1c0d26',
};

const secondary = {
  50:  '#f0f2fa',
  100: '#dce2f4',
  200: '#bac5e9',
  300: '#8b9eda',
  400: '#5d77cb',
  500: '#344DA1',
  600: '#2d438b',
  700: '#243670',
  800: '#1b2955',
  900: '#141e3e',
  950: '#0c1327',
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { lightBlue, warmGray, trueGray, coolGray, blueGray, ...safeColors } = colors as any;

const config: Config = {
  content: [
    './src/app/**/*.{ts,tsx}',
    './src/components/**/*.{ts,tsx}',
    './src/lib/**/*.{ts,tsx}',
  ],
  theme: {
    colors: {
      ...safeColors,
      blue: brand,
    },
    extend: {
      colors: {
        primary,
        secondary,
        info: secondary,
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
