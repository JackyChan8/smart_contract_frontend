import "./globals.scss";

import type { Metadata } from "next";
import { TonConnectUIProvider } from "@tonconnect/ui-react";
import TonConnectWrapper from "@/components/Transactions/TonConnectWrapper";

export const metadata: Metadata = {
  title: 'FullBalance Game',
  description: 'Игра на весь баланс в TON',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no, user-scalable=no, viewport-fit=cover, minimum-scale=1.0, maximum-scale=1.0"
        />
        <meta name="color-scheme" content="light" />
        <meta name="format-detection" content="telephone=no" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="MobileOptimized" content="176" />
        <meta name="HandheldFriendly" content="True" />
        <meta name="robots" content="noindex,nofollow" />
      </head>
      <body>
        <TonConnectWrapper>
          {children}
        </TonConnectWrapper>
      </body>
    </html>
  );
}
