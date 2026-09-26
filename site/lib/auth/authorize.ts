import { NotFoundError } from "@/lib/auth/errors";

export function assertOwner(
  user: { id: string },
  resource: { userId: string },
): void {
  if (resource.userId !== user.id) throw new NotFoundError();
}
