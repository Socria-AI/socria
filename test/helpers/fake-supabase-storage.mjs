// The database fake (fake-supabase.mjs) and the storage fake (fake-storage.mjs)
// as one client, for a route that uses both — deleting a conversation removes
// its row and the pictures its writing held.
import { supabaseAdmin as database } from './fake-supabase.mjs';
import { supabaseAdmin as storage } from './fake-storage.mjs';

export function supabaseAdmin() {
  return { ...database(), storage: storage().storage };
}
