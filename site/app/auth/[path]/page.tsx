import { AuthView } from "@neondatabase/auth-ui";
import { authViewPaths } from "@neondatabase/auth-ui/server";

export const dynamicParams = false;

export function generateStaticParams() {
  return Object.values(authViewPaths).map((path) => ({ path }));
}

export default async function AuthPage({
  params,
}: PageProps<"/auth/[path]">) {
  const { path } = await params;

  return (
    <main className="flex grow flex-col items-center justify-center p-4">
      <AuthView path={path} />
    </main>
  );
}
