"use client";
// components/logos5/StudyDesk.tsx — STUDY, READ LEFT TO RIGHT (Logos 5, Screen 4).
//
// The Artifacts view of a study: your files on the left, each holding its
// topics (on your map, or not yet; where to start; what is new); what was made
// from them in the middle, as cards, for the topic chosen or for all of them;
// the conversation docks on the right with Split View. Choosing a topic on
// the left decides the middle, and "Show all" takes it back; the files fold
// away for room and come back from the middle's head. The card the
// conversation last pointed at is lit and brought into view. What is heavy
// to draw (a model, a 3D scene, your writing) opens at full size instead of
// being drawn in its card. Facts come from lib/logos5/studyDesk.ts.

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  deskArtifacts,
  fileMeta,
  fileTitle,
  kindsOf,
  topicOfArtifact,
  topicsOf,
  type DeskFile,
  type DeskTopic,
} from "@/lib/logos5/studyDesk";
import { L5Menu } from "./L5Chrome";
import "./study-desk.css";

export interface DeskItem {
  key: string;
  kind: string;
  title: string;
  /** where it came from: "from Lecture 9", "from 3 files" */
  source?: string;
  topic?: string;
  /** drawn in its card; absent, the card offers to open it */
  render?: () => ReactNode;
}

const HEAVY = new Set(["Writing", "CAD", "Model", "Simulation"]);
export const drawsInCard = (kind: string) => !HEAVY.has(kind);

export function StudyDesk({
  course,
  files,
  topics,
  mapped,
  start,
  fresh,
  topic,
  onTopic,
  items,
  lit,
  onOpen,
  onAddFiles,
}: {
  course: string;
  files: DeskFile[];
  topics: DeskTopic[];
  /** the topics on the Logic Map */
  mapped: Set<string>;
  /** where Socria recommends starting */
  start: string | null;
  /** topics not looked at yet */
  fresh?: Set<string>;
  topic: string | null;
  onTopic: (id: string | null) => void;
  items: DeskItem[];
  /** the card the conversation points at */
  lit: string | null;
  /** an artifact opened at full size */
  onOpen: (key: string) => void;
  onAddFiles?: () => void;
}) {
  const [folded, setFolded] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    // the file that holds the topic chosen — or where to start — opens by itself
    const want = topic ?? start;
    const f = want
      ? files.find((x) =>
          topics.find((t) => t.id === want)?.docs.includes(x.doc),
        )
      : files[0];
    return f ? { [f.doc]: true } : {};
  });
  const [kind, setKind] = useState<string | null>(null);
  const grid = useRef<HTMLDivElement>(null);
  const shown = deskArtifacts(items, topics, topic, kind);
  const chosen = topic ? (topics.find((t) => t.id === topic) ?? null) : null;
  const chosenFile = chosen
    ? files.find((f) => chosen.docs.includes(f.doc))
    : null;
  const kinds = kindsOf(items);
  // the card the conversation points at: brought into view
  useEffect(() => {
    if (!lit) return;
    const el = grid.current?.querySelector<HTMLElement>(
      `[data-art="${CSS.escape(lit)}"]`,
    );
    el?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [lit, topic, kind]);
  const countFor = (id: string) =>
    items.filter((a) => topicOfArtifact(a, topics) === id).length;
  const rest = topics.filter((t) => !files.some((f) => t.docs.includes(f.doc)));
  const topicRow = (t: DeskTopic) => {
    const on = mapped.has(t.id);
    const here = topic === t.id;
    const n = countFor(t.id);
    return (
      <li key={t.id}>
        <button
          type="button"
          className={`l5-row l5sd-topic${here ? " is-on" : ""}`}
          aria-pressed={here}
          onClick={() => onTopic(here ? null : t.id)}
        >
          <i
            className={`l5sd-dot${on ? " is-on" : ""}`}
            aria-label={on ? "on your map" : "not on your map yet"}
          />
          <span className="l5sd-topic-t">{t.title}</span>
          {here && n > 0 ? (
            <span className="l5-count">{n}</span>
          ) : t.id === start ? (
            <span className="l5sd-hint">start here</span>
          ) : fresh?.has(t.id) ? (
            <span className="l5sd-hint">new</span>
          ) : null}
        </button>
      </li>
    );
  };
  return (
    <div className={`l5sd${folded ? " is-folded" : ""}`}>
      {!folded && (
        <aside className="l5sd-files" aria-label="Your files">
          <div className="l5sd-head">
            <span className="l5-label">Your files</span>
            <span className="l5-count">{files.length}</span>
            <span className="l5sd-head-acts">
              {onAddFiles && (
                <button
                  type="button"
                  className="l5-icon"
                  aria-label="Add files"
                  title="Add files"
                  onClick={onAddFiles}
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="16"
                    height="16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    aria-hidden="true"
                  >
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </button>
              )}
              <button
                type="button"
                className="l5-icon"
                aria-label="Fold your files away"
                title="Fold away"
                onClick={() => setFolded(true)}
              >
                <svg
                  viewBox="0 0 24 24"
                  width="16"
                  height="16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
                  <path d="M9.5 4.5v15M16 9.5l-2.5 2.5 2.5 2.5" />
                </svg>
              </button>
            </span>
          </div>
          <ul className="l5sd-list">
            {files.map((f) => {
              const mine = topicsOf(f, topics);
              const isOpen = !!open[f.doc];
              return (
                <li key={f.doc} className="l5sd-file">
                  <button
                    type="button"
                    className="l5sd-file-b"
                    aria-expanded={mine.length ? isOpen : undefined}
                    onClick={() =>
                      mine.length &&
                      setOpen((o) => ({ ...o, [f.doc]: !o[f.doc] }))
                    }
                  >
                    <svg
                      className="l5sd-chev"
                      viewBox="0 0 24 24"
                      width="16"
                      height="16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      {mine.length ? (
                        <path d={isOpen ? "M7 10l5 5 5-5" : "M10 7l5 5-5 5"} />
                      ) : null}
                    </svg>
                    <span className="l5sd-file-tx">
                      <span className="l5sd-file-t">{fileTitle(f.name)}</span>
                      <span className="l5sd-meta">
                        {fileMeta(f, topics, mapped)}
                      </span>
                    </span>
                  </button>
                  {isOpen && mine.length > 0 && (
                    <ul className="l5sd-topics">{mine.map(topicRow)}</ul>
                  )}
                </li>
              );
            })}
            {rest.length > 0 && (
              <li className="l5sd-file">
                <span className="l5-label l5sd-rest">
                  From the conversation
                </span>
                <ul className="l5sd-topics">{rest.map(topicRow)}</ul>
              </li>
            )}
          </ul>
          <p className="l5sd-key">
            <span>
              <i className="l5sd-dot is-on" aria-hidden="true" /> on your map
            </span>
            <span>
              <i className="l5sd-dot" aria-hidden="true" /> not yet
            </span>
          </p>
        </aside>
      )}
      <section
        className="l5sd-mid"
        aria-label={chosen ? `Made for ${chosen.title}` : "Everything made"}
      >
        <div className="l5sd-top">
          <div className="l5sd-top-t">
            <p className="l5-label">
              {chosen
                ? `Topic${chosenFile ? ` · ${fileTitle(chosenFile.name)}` : ""}`
                : "Everything made"}
            </p>
            <h2 className="l5sd-display">
              {chosen ? chosen.title : course || "What you have made"}.
            </h2>
            <p className="l5sd-meta">
              {chosen
                ? `${shown.length} of ${items.length} ${items.length === 1 ? "artifact" : "artifacts"}${mapped.has(chosen.id) ? " · on your map" : ""}`
                : `${items.length} ${items.length === 1 ? "artifact" : "artifacts"}`}
            </p>
          </div>
          <div className="l5sd-top-a">
            {folded && (
              <button
                type="button"
                className="l5-btn is-sm is-quiet l5sd-unfold"
                aria-label={`Your files: ${files.length}`}
                onClick={() => setFolded(false)}
              >
                Your files <span className="l5-count">{files.length}</span>
              </button>
            )}
            {kinds.length > 1 && (
              <L5Menu
                label="Which kinds"
                className="l5sd-kinds"
                align="end"
                button={
                  <span className="l5sd-kinds-b">
                    {kind ?? "All kinds"}
                    <svg
                      viewBox="0 0 24 24"
                      width="14"
                      height="14"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M7 10l5 5 5-5" />
                    </svg>
                  </span>
                }
                items={[
                  { label: "All kinds", onSelect: () => setKind(null) },
                  ...kinds.map((k) => ({
                    label: k,
                    onSelect: () => setKind(k),
                  })),
                ]}
              />
            )}
            {(topic || kind) && (
              <button
                type="button"
                className="l5-btn is-sm"
                onClick={() => {
                  onTopic(null);
                  setKind(null);
                }}
              >
                Show all {items.length}
              </button>
            )}
          </div>
        </div>
        {shown.length ? (
          <div className="l5sd-grid" ref={grid}>
            {shown.map((a) => (
              <article
                key={a.key}
                data-art={a.key}
                className={`l5-holder l5sd-card${a.key === lit ? " is-lit" : ""}`}
                aria-label={`${a.kind}: ${a.title}`}
              >
                <p className="l5sd-card-k">
                  <span className="l5-label">{a.kind}</span>
                  {a.source && <span className="l5sd-meta">{a.source}</span>}
                  <button
                    type="button"
                    className="l5-icon l5sd-card-open"
                    aria-label={`Open ${a.title} at full size`}
                    title="Open at full size"
                    onClick={() => onOpen(a.key)}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      width="16"
                      height="16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
                    </svg>
                  </button>
                </p>
                <h3 className="l5sd-card-t">{a.title}</h3>
                {a.render && drawsInCard(a.kind) ? (
                  <div className="l5sd-card-b">{a.render()}</div>
                ) : (
                  <div className="l5sd-card-b is-closed">
                    <button
                      type="button"
                      className="l5-btn is-sm"
                      onClick={() => onOpen(a.key)}
                    >
                      Open{" "}
                      <span className="l5-ar" aria-hidden="true">
                        →
                      </span>
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
        ) : (
          <div className="l5sd-none">
            <p className="l5sd-none-t">
              {chosen
                ? `Nothing made from “${chosen.title}” yet.`
                : "Nothing made yet."}
            </p>
            <p className="l5sd-meta">
              Ask for practice, a worked example or a comparison — it is kept
              here, and drawn as a card.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
