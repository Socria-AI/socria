// lib/voice/risk.ts — WHAT A SPOKEN TURN MAY NOT DO WITHOUT A "YES".
//
// A recogniser mishears. Typed, "remove the rent node" was meant; spoken, it
// may have been "move the rent note". So a spoken turn that would take
// something away, or reach beyond this conversation, is shown back and waits
// for "yes" (or a press) before it goes anywhere:
//
//   destructive   it removes or deletes: an idea from the Logic Map, a block
//                 of their writing, an artifact's row or item — read by the
//                 same readers that would carry it out, so what is confirmed
//                 is exactly what would happen — or it plainly asks to delete,
//                 clear or wipe something
//   sensitive     it would keep something about them in memory, take
//                 something out of it, or share their work
//
// A question about deleting ("how do I remove a node?") is a question.
// Typed turns are not asked again: typing is deliberate.
//
// PURE: the readers are run by the caller, which holds the map, the artifacts
// and the writing, and their findings passed in.

export interface Risk {
  level: 'destructive' | 'sensitive';
  /** what would happen, in a line, as the confirmation asks it */
  what: string;
}

export interface RiskReading {
  /** the ideas a map command would take off (lib/map-edit.ts readMapCommand) */
  mapRemoves?: readonly string[] | null;
  /** an artifact's operation that takes something out, said as the artifact says it */
  objectRemove?: string | null;
  /** the block of their writing a document command would delete (lib/write/voice-edit.ts) */
  docDelete?: string | null;
}

const QUESTION = /^(?:how|what|why|when|where|who|which|is|are|was|were|does|did|do i|do you|should|can i|could i|would it)\b|\?\s*$/i;
const DESTROY = /\b(?:delete|remove|erase|wipe|clear (?:out |away )?(?:the|my|this|all|everything)|discard|destroy|get rid of|throw (?:away|out)|reset (?:the|my|this|everything))\b/i;
const MEMORY_KEEP = /\b(?:remember (?:that|this|my|me|i|we)|keep (?:this|that) in (?:my |your )?memory|add (?:this|that) to (?:my |your )?memory|save (?:this|that) to (?:my |your )?memory)\b/i;
const MEMORY_FORGET = /\b(?:forget (?:that|this|what|everything|about|my|i|me)|delete (?:it |that |this )?from (?:my |your )?memory|remove (?:it |that |this )?from (?:my |your )?memory)\b/i;
const SHARE = /\b(?:share (?:this|it|my|the)|invite \w+|make (?:this|it) public|publish (?:this|it|my))\b/i;

const quoted = (s: string) => `“${s.length > 60 ? `${s.slice(0, 57)}…` : s}”`;

/** What a spoken turn would do that needs a "yes" first, or null. */
export function riskOf(text: string, read: RiskReading = {}): Risk | null {
  const t = String(text ?? '').trim();
  if (!t) return null;
  if (read.mapRemoves?.length) {
    const names = read.mapRemoves.map(quoted);
    return { level: 'destructive', what: `Remove ${names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`} from the Logic Map?` };
  }
  if (read.docDelete) return { level: 'destructive', what: `Delete ${quoted(read.docDelete)} from your writing?` };
  if (read.objectRemove) return { level: 'destructive', what: `${read.objectRemove.charAt(0).toUpperCase()}${read.objectRemove.slice(1)}?` };
  if (QUESTION.test(t)) return null;
  if (MEMORY_FORGET.test(t)) return { level: 'sensitive', what: 'Take this out of what Socria remembers about you?' };
  if (DESTROY.test(t)) return { level: 'destructive', what: 'This asks to delete or remove something. Send it?' };
  if (MEMORY_KEEP.test(t)) return { level: 'sensitive', what: 'Socria may keep this in your memory. Send it?' };
  if (SHARE.test(t)) return { level: 'sensitive', what: 'This asks to share your work. Send it?' };
  return null;
}
