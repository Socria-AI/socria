'use client';

// app/logos2/Logos2Workspace.tsx
//
// What goes in the panes. The layout does not know or care (Logos2Layout);
// this file is the wiring, and it is deliberately the only place that holds a
// sample conversation — swapping it for a live session changes nothing else.

import { useState } from 'react';
import { Logos2Layout, type PaneDef } from '@/components/logos2/Logos2Layout';
import { SurfaceSwitch } from '@/components/surfaces/SurfaceSwitch';
import { ThinkingMap } from '@/components/ThinkingMap';
import type { ThinkingMap as TMap } from '@/lib/logos';

const SESSIONS = [
  { id: 'berlin', title: 'The Berlin offer', meta: '5 nodes · now' },
  { id: 'hole', title: 'Simulate a black hole', meta: '9 nodes · 1h' },
  { id: 'bang', title: 'What happened first', meta: '12 nodes · 1d' },
  { id: 'three', title: 'Why three bodies are hard', meta: '7 nodes · 2d' },
  { id: 'essay', title: 'Whether to rewrite the essay', meta: '3 nodes · 1w' },
];

/**
 * The map behind the sample conversation — a real map, in the real component.
 *
 * NO CRITERION NODES, DELIBERATELY. `leadLens` opens any map that can be
 * compared on the Compare lens, and a value, constraint or goal node is what
 * makes a map comparable — so a decision sketched with three values opened on
 * a table this conversation has not filled in yet. The reasoning here is a
 * shape, not a scoring, so it is drawn as one and the graph leads.
 */
const MAP: TMap = {
  context: 'deciding',
  nodes: [
    { id: 'o1', type: 'idea', label: 'Take the Berlin role' },
    { id: 'o2', type: 'idea', label: 'Stay where I am' },
    { id: 'b1', type: 'belief', label: 'I have felt unchallenged for a year', status: 'supported' },
    { id: 'b2', type: 'belief', label: 'I have been telling myself it is fine' },
    { id: 'c1', type: 'consequence', label: 'More money, a smaller team' },
    { id: 'a1', type: 'assumption', label: 'The offer is what opened the question', status: 'open' },
    { id: 'q1', type: 'question', label: 'Which of the two is doing the deciding?' },
  ],
  edges: [
    { from: 'b1', to: 'o1', relation: 'supports' },
    { from: 'b2', to: 'b1', relation: 'relates' },
    { from: 'c1', to: 'o1', relation: 'relates' },
    { from: 'o2', to: 'o1', relation: 'conflicts' },
    { from: 'a1', to: 'o1', relation: 'depends' },
    { from: 'q1', to: 'a1', relation: 'relates' },
  ],
};

const THREAD = [
  { who: 'them', text: 'I’ve been offered a role in Berlin. More money, smaller team. I keep going back and forth.' },
  { who: 'socria', text: 'Before the money and the team size — what made you open to leaving at all?' },
  { who: 'them', text: 'I’ve felt unchallenged for about a year. And I think I’ve been telling myself it’s fine.' },
  {
    who: 'socria',
    text: 'So the offer arrived into a question you’d already opened. Which of those two — the year of feeling unchallenged, or the offer itself — is doing the deciding right now?',
  },
];

export function Logos2Workspace() {
  const [session, setSession] = useState('berlin');

  const panes: PaneDef[] = [
    {
      id: 'rail',
      label: 'History',
      title: 'Lines of thinking',
      node: (
        <div className="l2-sessions">
          {SESSIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`l2-session${session === s.id ? ' on' : ''}`}
              onClick={() => setSession(s.id)}
            >
              <b>{s.title}</b>
              <span>{s.meta}</span>
            </button>
          ))}
        </div>
      ),
    },
    {
      id: 'chat',
      label: 'Chat',
      title: SESSIONS.find((s) => s.id === session)?.title ?? 'Conversation',
      node: (
        <>
          <div className="l2-thread">
            {THREAD.map((m, i) => (
              <div key={i} className={`l2-msg ${m.who}`}>
                {m.text}
              </div>
            ))}
          </div>
          <div className="l2-composer">
            <div>
              <input placeholder="Write what’s actually on your mind" aria-label="Message" />
              <button type="button" className="l2-send" aria-label="Send">
                ↑
              </button>
            </div>
          </div>
        </>
      ),
    },
    {
      id: 'map',
      label: 'Map',
      title: 'Thinking map',
      node: <ThinkingMap embedded map={MAP} initialLens="graph" />,
    },
    {
      id: 'surface',
      label: 'Surface',
      title: 'Working surface',
      node: <SurfaceSwitch />,
    },
  ];

  return <Logos2Layout title="Socria · Logos 2" panes={panes} />;
}
