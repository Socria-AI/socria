// lib/types.ts
// Shared types for Socria.

export type Role = 'user' | 'assistant' | 'system';

export interface Conversation {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: Role;
  content: string;
  created_at: string;
}

export interface UsageRow {
  user_id: string;
  date: string; // ISO date (YYYY-MM-DD)
  message_count: number;
  token_estimate: number;
}
