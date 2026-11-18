// lib/ux-v0/fit.ts — a generated design made to do what its intent requires.
//
// The prompt says what a design must do; this makes sure it does, in code,
// whatever a model wrote. For each requirement with a component (a booking, a
// form, a table…) that the design lacks, the component is added with clearly
// labelled sample content, placed where the task needs it: first on a
// task-first screen, after the opening on a site. The approved direction's
// composition for those components is applied (a calendar, a list, a split…)
// unless the designer fixed a section's variant. Each change is said in the
// design's notes, so nothing is added silently.

import type { ArtDirection } from './direction';
import { intentOf, requiredComponents, sampleBooking, type DesignIntent } from './intent';
import { kindDef, normalizeSection, type DesignSpec, type Section } from './spec';

type Brief = Parameters<typeof intentOf>[0] & { objective?: string; audience?: string };

/** Sample content for a component the design must have, labelled as such. */
export function sampleFor(component: string, intent: DesignIntent, brief: Brief): Record<string, unknown> | null {
  switch (component) {
    case 'booking':
      return sampleBooking(intent, brief ?? {});
    case 'form':
      // a donation: the amount is the designer's to set, and nothing is charged
      if (intent.requirements.some((r) => r.id === 'req-donate'))
        return {
          title: 'Give',
          intro: '',
          fields: [
            { label: 'Amount', type: 'select', placeholder: '', options: ['[Amount 1]', '[Amount 2]', '[Amount 3]', 'Another amount'], required: true },
            { label: 'Name', type: 'text', placeholder: '', options: [], required: true },
            { label: 'Email', type: 'email', placeholder: '', options: [], required: true },
          ],
          submit: 'Donate',
          note: 'A prototype: no payment is taken.',
        };
      return {
        title: intent.kind === 'checkout' ? 'Your details' : 'Send it to us',
        intro: '',
        fields: [
          { label: 'Name', type: 'text', placeholder: '', options: [], required: true },
          { label: 'Email', type: 'email', placeholder: '', options: [], required: true },
          { label: intent.kind === 'checkout' ? 'Delivery address' : 'Message', type: 'textarea', placeholder: '', options: [], required: intent.kind === 'checkout' },
        ],
        submit: intent.kind === 'checkout' ? 'Place the order' : 'Send',
        note: 'A prototype: nothing is sent.',
      };
    case 'stat-cards':
      return { items: [1, 2, 3].map((i) => ({ label: `[Measure ${i}]`, value: '[Value]', delta: '', trend: 'flat' })) };
    case 'table':
      return { title: '[Items]', columns: ['[Name]', '[Owner]', '[Status]'], rows: [1, 2, 3, 4].map((i) => ({ cells: [`[Item ${i}]`, '[Owner]'], status: '[Status]' })) };
    case 'chart':
      return { title: '[What is measured]', labels: ['[1]', '[2]', '[3]', '[4]', '[5]'], series: [{ name: 'Sample', values: [3, 5, 4, 7, 6] }], note: 'Sample data.' };
    default:
      return null;
  }
}

const CHROME = new Set(['nav', 'app-nav', 'app-header']);
/** Task-first screens with one job, where marketing sections are filler. */
const FOCUSED = new Set(['booking', 'checkout', 'form', 'flow']);

/** Where a required component goes: first after the chrome on a screen; after the opening on a site. */
function placeOf(sections: readonly Section[], screen: boolean): number {
  let i = 0;
  while (i < sections.length && CHROME.has(sections[i].kind)) i++;
  if (!screen && sections[i]?.kind === 'hero') i++;
  return i;
}

export interface Fitted {
  spec: DesignSpec;
  /** what was changed, in words the designer reads */
  changes: string[];
}

/**
 * The design, doing what the intent requires. Required components that are
 * missing are added (with sample content); on a task-first screen they lead;
 * the direction's composition for each is applied unless a section was fixed.
 */
export function fitToIntent(spec: DesignSpec, intent: DesignIntent, opts: { brief?: Brief; dir?: ArtDirection | null } = {}): Fitted {
  const changes: string[] = [];
  let sections = [...spec.sections];
  const taken = new Set(sections.map((s) => s.id));
  const compose = opts.dir?.compose ?? {};
  for (const component of requiredComponents(intent)) {
    if (!component || sections.some((s) => s.kind === component)) continue;
    const def = kindDef(component);
    const content = sampleFor(component, intent, opts.brief ?? {});
    if (!def || !content || !def.pages.includes(spec.pageType)) continue;
    const variant = compose[component] && def.variants.includes(compose[component]) ? compose[component] : def.variants[0];
    const sec = normalizeSection({ id: component, kind: component, variant, content, images: [] }, spec.pageType, null, taken);
    if (!sec) continue;
    const at = placeOf(sections, intent.screen);
    sections.splice(at, 0, sec);
    const req = intent.requirements.find((r) => r.component === component);
    changes.push(`Added the ${def.label.toLowerCase()} this ${intent.kind === 'site' ? 'site' : 'screen'} must have${req ? ` (${req.text.toLowerCase()})` : ''}, with sample content to replace.`);
  }
  // a booking, a checkout or a form is the task, not a pitch: a "why us" feature grid has no place on it
  if (FOCUSED.has(intent.kind) && sections.some((s) => s.kind === 'features')) {
    sections = sections.filter((s) => s.kind !== 'features' || s.fixed);
    changes.push(`Left out the feature grid: ${intent.kind === 'booking' ? 'a booking screen is the booking' : 'this screen is the task'}, not a pitch.`);
  }
  // on a task-first screen the task leads: its components come straight after the chrome, in the
  // direction's order of importance (figures first, the table first, the trend first…)
  if (intent.screen) {
    const needed = new Set(requiredComponents(intent));
    const order = opts.dir?.order ?? [];
    const rankOf = (k: string) => (order.includes(k) ? order.indexOf(k) : 50);
    const lead = placeOf(sections, true);
    const chrome = sections.slice(0, lead);
    const rest = sections.slice(lead);
    const first = rest.filter((s) => needed.has(s.kind as any) || order.includes(s.kind));
    // a section the designer fixed or locked keeps its place among them
    if (order.length && !first.some((s) => s.locked)) first.sort((a, b) => rankOf(a.kind) - rankOf(b.kind));
    const others = rest.filter((s) => !first.includes(s));
    const next = [...chrome, ...first, ...others];
    if (next.map((s) => s.id).join() !== sections.map((s) => s.id).join()) changes.push(order.length ? 'Put the task first, in the direction’s order.' : 'Put the task first: the screen opens on what it is for.');
    sections = next;
  } else if (opts.dir?.lead) {
    // on a page, what the direction says leads comes straight after the navigation (the work before words about it)
    const at = sections.findIndex((s) => s.kind === opts.dir!.lead && !s.locked);
    const to = placeOf(sections, true);
    if (at > to) {
      const [lead] = sections.splice(at, 1);
      sections.splice(to, 0, lead);
      changes.push(`Opened with the ${kindDef(lead.kind)?.label.toLowerCase() ?? lead.kind}, as the direction leads.`);
    }
  }
  // the approved direction's composition, on the first section of each kind, unless the designer fixed it;
  // a layout built around a picture the section does not have falls back, as it always does (spec.ts NEEDS_IMAGE)
  for (const [kind, variant] of Object.entries(compose)) {
    const at = sections.findIndex((s) => s.kind === kind);
    const s = at >= 0 ? sections[at] : null;
    if (!s || s.fixed || s.variant === variant || !kindDef(kind)?.variants.includes(variant)) continue;
    const next = normalizeSection({ ...s, variant }, spec.pageType, null, new Set());
    if (next) sections[at] = { ...next, id: s.id };
  }
  const out: DesignSpec = { ...spec, sections, notes: [...spec.notes, ...changes].slice(-8) };
  return { spec: out, changes };
}
