import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: { $queryRaw: vi.fn() } }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/anthropic", () => ({
  ASSISTANT_MODEL: "test-model",
  anthropic: { beta: { messages: { create: vi.fn() } } },
}));

import { FALLBACK_REPLY, MAX_TURNS } from "@/app/api/trpc/assistant";
import { createCallerFactory } from "@/app/api/trpc/init";
import { appRouter } from "@/app/api/trpc/router";
import { anthropic } from "@/lib/anthropic";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import type { ParcelFilters } from "@/lib/parcel-filters";

const caller = createCallerFactory(appRouter)({});
const user = { id: "user_1", email: "a@example.com", name: "Ada" };
const create = vi.mocked(anthropic.beta.messages.create);
const queryRaw = vi.mocked(db.$queryRaw);

let streetLots = 0;

function toolUse(name: string, input: object, id = `tool_${name}`) {
  return {
    stop_reason: "tool_use",
    content: [{ type: "tool_use", id, name, input }],
  };
}

function text(reply: string) {
  return { stop_reason: "end_turn", content: [{ type: "text", text: reply }] };
}

function respond(...responses: object[]) {
  for (const response of responses) create.mockResolvedValueOnce(response as never);
}

// The tool_result blocks Claude received on the given call (0-based).
function toolResults(call: number) {
  const params = create.mock.calls[call][0] as { messages: { role: string; content: unknown }[] };
  const last = params.messages[params.messages.length - 1];
  return last.content as { type: string; content: string; is_error?: boolean }[];
}

function ask(filters: Partial<ParcelFilters> = {}, message = "Where can I build?", selectedApn?: string) {
  return caller.assistant.ask({
    message,
    history: [],
    filters: { sort: "homes", ...filters },
    selectedApn,
  });
}

beforeEach(() => {
  create.mockReset();
  queryRaw.mockReset();
  streetLots = 0;
  vi.mocked(getCurrentUser).mockResolvedValue(user);
  queryRaw.mockImplementation(((strings: TemplateStringsArray) => {
    const sql = strings.join("");
    if (sql.includes("AS count")) return Promise.resolve([{ count: streetLots }]);
    if (sql.includes("count(*)")) return Promise.resolve([{ total: 86, total_homes: 825 }]);
    return Promise.resolve([{ apn: "025-071-13", max_homes: 10 }]);
  }) as unknown as typeof queryRaw);
});

describe("assistant.ask", () => {
  it("returns the last search's filters", async () => {
    respond(
      toolUse("search_parcels", { eligible: true, sort: "homes" }, "a"),
      toolUse("search_parcels", { eligible: true, minHomes: 4, sort: "homes" }, "b"),
      text("86 lots match."),
    );
    await expect(ask()).resolves.toEqual({
      filters: { eligible: true, minHomes: 4, sort: "homes" },
      reply: "86 lots match.",
    });
    expect(JSON.parse(toolResults(1)[0].content)).toMatchObject({ total: 86, totalHomes: 825 });
  });

  it("keeps filters when there is no search", async () => {
    respond(text("Groundwork covers zoning eligibility only."));
    const result = await ask({ minHomes: 4 });
    expect(result.filters).toEqual({ minHomes: 4, sort: "homes" });
  });

  it("builds on the URL's filters", async () => {
    respond(text("Done."));
    await ask({ minHomes: 4, nearStreet: "Beach Blvd" });
    const params = create.mock.calls[0][0] as { system: string; model: string };
    expect(params.system).toContain(JSON.stringify({ minHomes: 4, nearStreet: "Beach Blvd", sort: "homes" }));
    expect(params.model).toBe("test-model");
  });

  it("reports a missing street", async () => {
    respond(toolUse("search_parcels", { nearStreet: "Fake Blvd", sort: "homes" }), text("No such street."));
    await ask();
    expect(toolResults(1)[0].content).toContain('"streetFound":false');
  });

  it("returns schema errors to Claude", async () => {
    respond(toolUse("search_parcels", { minHomes: 20, sort: "homes" }), text("Try again."));
    const result = await ask({ eligible: true });
    expect(toolResults(1)[0].is_error).toBe(true);
    expect(result.filters).toEqual({ eligible: true, sort: "homes" });
  });

  it("stops after MAX_TURNS", async () => {
    create.mockResolvedValue(toolUse("search_parcels", { eligible: true, sort: "homes" }) as never);
    const result = await ask();
    expect(create).toHaveBeenCalledTimes(MAX_TURNS);
    expect(result).toEqual({ filters: { eligible: true, sort: "homes" }, reply: FALLBACK_REPLY });
  });

  it("answers why from get_parcel", async () => {
    respond(toolUse("get_parcel", { apn: "025-071-13" }), text("It is vacant and zoned RM."));
    const result = await ask({}, "Why does this one qualify?", "025-071-13");
    const values = queryRaw.mock.calls.flatMap(([, ...rest]) => rest);
    expect(values).toContain("025-071-13");
    expect(result.reply).toBe("It is vacant and zoned RM.");
    const params = create.mock.calls[0][0] as { system: string };
    expect(params.system).toContain("025-071-13");
  });

  it("says when the assistant is unavailable", async () => {
    create.mockRejectedValue(new Error("overloaded"));
    await expect(ask()).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "The assistant is unavailable. Use the filters instead.",
    });
  });

  it("rejects signed-out users", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    await expect(ask()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(create).not.toHaveBeenCalled();
  });
});
