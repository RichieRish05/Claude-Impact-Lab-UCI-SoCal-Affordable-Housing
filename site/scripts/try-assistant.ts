// Runs the spec's example questions through the real assistant and dev data,
// so prompt changes can be checked by eye. Costs a few cents per run.
import { runAssistant } from "@/app/api/trpc/assistant";
import { filterChips } from "@/lib/filter-chips";
import { DEFAULT_FILTERS, type ParcelFilters } from "@/lib/parcel-filters";

type Turn = { role: "user" | "assistant"; text: string };

// Each entry is a conversation; later questions are follow-ups to earlier ones.
const CONVERSATIONS: string[][] = [
  [
    "Where can I build starter homes in Huntington Beach?",
    "only ones that fit at least 4 homes near Beach Blvd",
  ],
  ["Where can I build 10 starter homes in Huntington Beach?"],
  ["Show vacant single-family lots under an acre"],
  ["Find something to build on"],
  ["Lots near Fake Blvd"],
  ["Is this a good investment?"],
  ["Just tell me roughly how many homes the whole county could fit"],
];

async function main() {
  for (const questions of CONVERSATIONS) {
    let filters: ParcelFilters = { ...DEFAULT_FILTERS };
    const history: Turn[] = [];
    for (const message of questions) {
      const started = Date.now();
      const result = await runAssistant({ message, history, filters });
      filters = result.filters;
      history.push({ role: "user", text: message }, { role: "assistant", text: result.reply });
      console.log(`\n> ${message}  (${((Date.now() - started) / 1000).toFixed(1)}s)`);
      console.log(`  filters: ${JSON.stringify(filters)}`);
      console.log(`  chips:   ${filterChips(filters).map((c) => c.label).join(" · ") || "(none)"}`);
      console.log(`  reply:   ${result.reply}`);
    }
  }
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
