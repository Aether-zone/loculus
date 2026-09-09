import next from 'eslint-config-next/core-web-vitals';
import typescript from 'eslint-config-next/typescript';

// Named rather than exported inline: `import/no-anonymous-default-export`,
// which Next's own config turns on, warns about a bare array here.
const config = [
  // Both are build output: `.next` is generated on every run, and
  // `next-env.d.ts` is rewritten by `next dev` whatever it is edited to say.
  { ignores: ['.next/**', 'next-env.d.ts'] },
  ...next,
  ...typescript,
];

export default config;
