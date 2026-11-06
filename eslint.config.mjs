import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const config = [
  ...nextVitals,
  ...nextTs,
  {
    ignores: ['node_modules/**', '.next/**', 'out/**', 'dist-electron/**', 'release/**', 'resources/**', 'tests/.tmp/**', 'next-env.d.ts'],
  },
  {
    rules: {
      '@next/next/no-img-element': 'off',
    },
  },
];

export default config;
