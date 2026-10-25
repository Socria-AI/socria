// lib/logos5/artifacts.ts — WHAT THE MAP DRAWS ITSELF, AS ARTIFACTS.
//
// Artifacts lists what was made in a line of thinking (components/logos5/
// Study.tsx ArtifactsView). Each display is an artifact of its own. Beside
// them the map can draw three things itself: a model (the engine's document),
// the picture or simulation the map pass made (map.viz), and the functions,
// plotted (the plot lens). These are the rules for which of those is listed,
// so one thing is never listed twice:
//
//   · the plot lens DRAWS the model or the picture when there is one, so it is
//     an artifact of its own only for functions nothing else draws — it was
//     listed beside the picture as a second "Plot" of the same functions;
//   · a picture that repeats a display is not listed: asked for "a Venn
//     diagram of mitosis and meiosis", the map pass drew its own copy beside
//     the display (overlapping triangles on axes). The server no longer keeps
//     one (app/api/logos/map, ONE ANSWER TO ONE ASK); this hides one saved
//     before that — when its title names a display that is here, the display
//     is the answer. A simulation is never a repeat: no display moves.
//
// PURE.

/** A picture whose title names a display that is here. Titles shorter than four letters name nothing. */
export function pictureRepeatsDisplay(
  pictureTitle: string | null | undefined,
  simulation: boolean,
  displayTitles: readonly string[],
): boolean {
  const vt = String(pictureTitle ?? '').toLowerCase();
  if (!vt || simulation) return false;
  return displayTitles.some((t) => {
    const s = String(t ?? '').trim().toLowerCase();
    return s.length >= 4 && vt.includes(s);
  });
}

export interface MapDrawn {
  /** model documents the engine built */
  models: number;
  /** the map pass's own picture or simulation */
  viz: 'picture' | 'simulation' | null;
  /** the plot lens is offered: there are functions to plot */
  plot: boolean;
  /** the picture repeats a display (pictureRepeatsDisplay) */
  repeats: boolean;
}

/** Which of the map's own drawings are artifacts: a model is; else the picture, unless it repeats a display; the plot only when nothing else draws it. */
export function mapArtifacts(m: MapDrawn): { viz: boolean; plot: boolean } {
  return {
    viz: !m.models && !!m.viz && !m.repeats,
    plot: m.plot && !m.viz && !m.models,
  };
}

/** The artifact that draws the plot: the active (else newest) model, else the picture, else the functions on their own. */
export function plotArtifact(models: readonly string[], active: string | null, viz: boolean): string {
  if (models.length) return `m:${active ?? models[models.length - 1]}`;
  return viz ? 'v:viz' : 'v:plot';
}
