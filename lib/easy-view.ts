// lib/easy-view.ts — what the vision model is asked for an EASY VIEW (app/api/logos/easy).
//
// One photo — a menu, a label, a timetable, a letter — read once, into what it
// says, so lib/objects/display-easy.ts can keep it and the figure can draw it
// large and clear. The model copies; it does not interpret: every name, price,
// time and step must be on the photo, exactly as written, and what it cannot
// read it says it cannot read. What is drawn from the reading (bars, the next
// time) is computed afterwards, never asked for here.
//
// PURE.

/** The first words of the instruction — the dev stand-in model (scripts/dev/fake-openai.mjs) knows the request by them. */
export const EASY_PROMPT_HEAD = 'You make an EASY VIEW of a photo';

export const EASY_PROMPT = `${EASY_PROMPT_HEAD} for someone who finds small print hard to read — older eyes, low vision, a dim room. Read the photo and write down what is on it, faithfully, as JSON, so it can be shown large and clear.

Rules:
- Copy, never invent. Every name, price, time, amount and step must be on the photo, written exactly as it is — prices with their currency sign, times as printed. If you cannot read something, leave it out and say so in "unclear". Never guess a price, a time or a dose.
- Keep the photo's own order and grouping: its sections in order, and the items under each.
- Keep names as written. Mend only a word broken across a line; never reword a dish, a product or a label.
- "detail" is the small print under a name (what is in it, what it is), shortened only by dropping filler. Keep allergens and cautions whole.
- "tags" are only what the photo itself marks — vegetarian, vegan, gluten free, spicy, contains nuts, new — as plain lower-case words. Never infer one from a name.
- "summary": one or two short, plain sentences saying what this is (e.g. "A café menu with breakfast and lunch."). Facts only — no advice, no opinion.
- "facts": short label and value pairs the photo states — opening hours, a phone number, an address, a date, a total.
- "steps": instructions in order, if it has them (how to take a medicine, how to use something) — one step each.
- "times": for a timetable or a schedule, each time with what it is for, as printed.
- "warnings": anything stated as a warning or caution — allergens, dose limits, "do not…" — word for word.
- If the photo is not something to read (a scene, a person, an object), set "kind" to "other", say what it shows in "summary", and leave the lists empty.

Answer with one JSON object, nothing else:
{"title": "…", "kind": "menu | label | timetable | sign | letter | receipt | instructions | list | other", "summary": "…", "sections": [{"title": "…", "items": [{"name": "…", "detail": "…", "value": "…", "tags": ["…"]}]}], "facts": [{"label": "…", "value": "…"}], "steps": ["…"], "times": [{"time": "…", "label": "…"}], "warnings": ["…"], "unclear": ["…"]}`;

/** What is said with the photo: the request, and what the person typed beside it, as their own words. */
export function easyAsk(said?: string | null): string {
  const t = typeof said === 'string' ? said.replace(/\s+/g, ' ').trim().slice(0, 300) : '';
  return t ? `Make an easy view of this photo. They said beside it: “${t}”` : 'Make an easy view of this photo.';
}

/** Why nothing was made, said to the person — plainly, with what to try. */
export const EASY_UNREAD = 'Nothing on that photo could be read clearly. Try again a little closer, in more light, with the words filling the picture.';
