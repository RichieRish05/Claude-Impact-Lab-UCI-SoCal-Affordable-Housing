import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SiteHeader } from "@/components/site-header";
import { getCurrentUser } from "@/lib/auth/session";

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn() }));

const renderHeader = async () => renderToStaticMarkup(await SiteHeader());

describe("SiteHeader", () => {
  beforeEach(() => vi.mocked(getCurrentUser).mockReset());

  it("shows Sign in and Get started when signed out", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const html = await renderHeader();

    expect(html).toContain('href="/auth/sign-in"');
    expect(html).toContain('href="/auth/sign-up"');
    expect(html).not.toContain('href="/dashboard"');
  });

  it("shows only Dashboard when signed in", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: "user-1",
      email: "maria@example.com",
      name: "Maria",
    });

    const html = await renderHeader();

    expect(html).toContain('href="/dashboard"');
    expect(html).toContain("Dashboard");
    expect(html).not.toContain('href="/auth/sign-in"');
    expect(html).not.toContain('href="/auth/sign-up"');
  });
});
