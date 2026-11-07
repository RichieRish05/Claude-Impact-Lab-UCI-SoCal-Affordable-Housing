import type Anthropic from "@anthropic-ai/sdk";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { anthropic, ASSISTANT_MODEL } from "@/lib/anthropic";
import { db } from "@/lib/db";
import { parcelFiltersSchema, type ParcelFilters } from "@/lib/parcel-filters";
import { buildSystemPrompt } from "./assistant-prompt";
import { protectedProcedure, router } from "./init";
import { countStreetLots, searchSummary, type ParcelResult } from "./parcels";

export const MAX_TURNS = 6;
export const FALLBACK_REPLY = "I couldn't finish that search. Try rephrasing it.";
const UNAVAILABLE = "The assistant is unavailable. Use the filters instead.";
const TOP_LOTS = 10;

export const askInputSchema = z.object({
  message: z.string().trim().min(1).max(1000),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), text: z.string() }))
    .max(20),
  filters: parcelFiltersSchema,
  selectedApn: z.string().min(1).max(40).optional(),
});

export type AskInput = z.infer<typeof askInputSchema>;

const filtersJsonSchema = z.toJSONSchema(parcelFiltersSchema, { io: "input" });
delete filtersJsonSchema.$schema;

const TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: "search_parcels",
    description:
      "Search Huntington Beach parcels with the full filter set. The map and results list show the filters from your last call. Returns the number of matching lots, their total possible homes, and the top lots by the chosen sort.",
    input_schema: filtersJsonSchema as Anthropic.Beta.BetaTool.InputSchema,
  },
  {
    name: "get_parcel",
    description:
      "Look up one parcel by APN: its zone, lot size, vacancy, possible homes, eligibility reason and the zoning code section it was checked against.",
    input_schema: {
      type: "object",
      properties: { apn: { type: "string", description: "The parcel's APN, e.g. 025-071-13" } },
      required: ["apn"],
      additionalProperties: false,
    },
  },
];

type ParcelDetail = Omit<ParcelResult, "geometry" | "lng" | "lat">;

async function getParcel(apn: string) {
  const [parcel] = await db.$queryRaw<ParcelDetail[]>`
    SELECT apn, address, zone, lot_sqft, vacant, vacant_confidence, sb684_eligible,
           max_homes, eligibility_reason, assessed_value, dist_transit_ft,
           flood_zone, neighborhood, source_section
    FROM parcels LEFT JOIN zone_rules USING (zone)
    WHERE apn = ${apn}
  `;
  return parcel ?? { error: "No parcel with that APN" };
}

type ToolOutcome = { content: string; isError?: boolean; filters?: ParcelFilters };

async function runTool(name: string, input: unknown): Promise<ToolOutcome> {
  if (name === "search_parcels") {
    const parsed = parcelFiltersSchema.safeParse(input);
    if (!parsed.success) {
      return { content: `Invalid filters: ${z.prettifyError(parsed.error)}`, isError: true };
    }
    const filters = parsed.data;
    const [summary, streetLots] = await Promise.all([
      searchSummary(filters, TOP_LOTS),
      filters.nearStreet ? countStreetLots(filters.nearStreet) : undefined,
    ]);
    const result = streetLots === undefined ? summary : { ...summary, streetFound: streetLots > 0 };
    return { content: JSON.stringify(result), filters };
  }
  if (name === "get_parcel") {
    const parsed = z.object({ apn: z.string().min(1) }).safeParse(input);
    if (!parsed.success) return { content: "get_parcel needs an apn", isError: true };
    return { content: JSON.stringify(await getParcel(parsed.data.apn)) };
  }
  return { content: `Unknown tool ${name}`, isError: true };
}

async function callClaude(system: string, messages: Anthropic.Beta.BetaMessageParam[]) {
  try {
    return await anthropic.beta.messages.create({
      model: ASSISTANT_MODEL,
      max_tokens: 4096,
      system,
      tools: TOOLS,
      messages,
      output_config: { effort: "low" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
  } catch (cause) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: UNAVAILABLE, cause });
  }
}

export async function runAssistant(input: AskInput): Promise<{ filters: ParcelFilters; reply: string }> {
  const system = buildSystemPrompt(input.filters, input.selectedApn);
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...input.history
      .filter((turn) => turn.text.trim())
      .map((turn) => ({ role: turn.role, content: turn.text })),
    { role: "user", content: input.message },
  ];
  let filters = input.filters;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await callClaude(system, messages);
    const toolUses = response.content.filter(
      (block): block is Anthropic.Beta.BetaToolUseBlock => block.type === "tool_use",
    );

    if (response.stop_reason !== "tool_use" || toolUses.length === 0) {
      const reply = response.content
        .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === "text")
        .map((block) => block.text)
        .join(" ")
        .trim();
      return { filters, reply: reply || FALLBACK_REPLY };
    }

    messages.push({ role: "assistant", content: response.content });
    const outcomes = await Promise.all(
      toolUses.map((block) =>
        runTool(block.name, block.input).catch(
          (): ToolOutcome => ({ content: "The search failed. Try again.", isError: true }),
        ),
      ),
    );
    for (const outcome of outcomes) {
      if (outcome.filters) filters = outcome.filters;
    }
    messages.push({
      role: "user",
      content: toolUses.map((block, i) => ({
        type: "tool_result" as const,
        tool_use_id: block.id,
        content: outcomes[i].content,
        ...(outcomes[i].isError ? { is_error: true } : {}),
      })),
    });
  }

  return { filters, reply: FALLBACK_REPLY };
}

export const assistantRouter = router({
  ask: protectedProcedure.input(askInputSchema).mutation(({ input }) => runAssistant(input)),
});
