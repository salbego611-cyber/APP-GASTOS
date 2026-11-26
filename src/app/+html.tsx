import { ScrollViewStyleReset } from 'expo-router/html';
import type { ReactNode } from 'react';

export default function Html({ children }: { children: ReactNode }) {
  return <html lang="pt-BR">
    <head>
      <meta charSet="utf-8" />
      <title>Bolso em Dia</title>
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <ScrollViewStyleReset />
    </head>
    <body>{children}</body>
  </html>;
}
