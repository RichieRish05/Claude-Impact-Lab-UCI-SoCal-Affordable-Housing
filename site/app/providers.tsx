"use client";

import { NeonAuthUIProvider } from "@neondatabase/auth-ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client";
import { TRPCReactProvider } from "@/lib/trpc/client";

export function Providers({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  return (
    <NeonAuthUIProvider
      authClient={authClient}
      defaultTheme="light"
      className="flex grow flex-col"
      navigate={router.push}
      replace={router.replace}
      onSessionChange={() => router.refresh()}
      social={{ providers: ["google"] }}
      redirectTo="/dashboard"
      Link={Link}
    >
      <TRPCReactProvider>{children}</TRPCReactProvider>
    </NeonAuthUIProvider>
  );
}
