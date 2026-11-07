import { AuthView } from "@neondatabase/auth-ui";
import { authViewPaths } from "@neondatabase/auth-ui/server";

// Only the paths from generateStaticParams are valid; any other /auth/* URL
// returns 404 instead of rendering AuthView with an unknown path.
export const dynamicParams = false;

export function generateStaticParams() {
  return Object.values(authViewPaths).map((path) => ({ path }));
}

export default async function AuthPage({
  params,
}: PageProps<"/auth/[path]">) {
  const { path } = await params;

  return (
    <AuthView
      path={path}
      classNames={{
        base: "border-0 bg-transparent shadow-none",
        title: "font-normal tracking-tight",
      }}
    />
  );
}
