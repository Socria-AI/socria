// components/ux-v0/studio/held.ts — files brought into a conversation that are not pictures (tokens, stylesheets,
// guidelines, fonts, a page to critique): held in memory for the visit, until the import or the critique that needs
// them begins. Pictures are kept in this browser like any reference (uploads.ts); these are not kept anywhere, and a
// reload asks for them again.

const held = new Map<string, File>();

export const holdFile = (id: string, f: File) => void held.set(id, f);
export const heldFile = (id: string): File | null => held.get(id) ?? null;
export const releaseFile = (id: string) => void held.delete(id);
