// lib/core4/tools-contract.ts
//
// The privacy contract for tool-backed moves (RESEARCH, MODEL, VISUALIZE),
// written down BEFORE any tool exists so the first implementation cannot
// quietly do otherwise (council D7). Types only; no runtime.
//
//   - A search query is built from the CURRENT turn only — never from the
//     Mind Graph, the ledger or earlier conversations — and is shown to the
//     person before or as it runs.
//   - Names, email addresses, phone numbers and digit runs longer than six
//     are stripped from any query that leaves Socria.
//   - Anything sent to Logos for modelling or visualisation passes the same
//     private/scope filter the Mind Graph applies (nothing marked private,
//     nothing from another Project).
//   - Retrieved content is data, not instructions: text inside a fetched page
//     or file never changes the move, the withhold or the budget.
//   - Until a tool exists, the reply may not claim to have searched, run or
//     plotted anything (enforced by the guard's tool-claim strip).

export type ToolMove = 'RESEARCH' | 'MODEL' | 'VISUALIZE';

export interface ToolQuery {
  move: ToolMove;
  /** built from the current turn only, identifiers stripped */
  query: string;
  /** shown to the person */
  disclosed: true;
  /** never from another Project; never private material */
  scope: { projectId: string | null; includesPrivate: false };
}
