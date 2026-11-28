// test/browser/ux-v0/design-harness/entry.tsx — the design workspace on its own page, for the browser checks.
//
// The real component, bundled for the browser by design-qa.mjs, mounted with a project made here (its brief and
// kind from window.__HARNESS__) and signed in, so every request goes to /api/ux-v0/design — which the check answers
// itself. Nothing else of the app is loaded.
import { createRoot } from 'react-dom/client';
import { makeProject, type DesignProject } from '@/lib/ux-v0/types';
import { emptyState } from '@/lib/ux-v0/design/doc';
import { DesignWorkspace } from '@/components/ux-v0/design/DesignWorkspace';
import { CompanyApp } from '@/components/ux-v0/company/CompanyApp';

const cfg = (window as any).__HARNESS__ ?? {};
const base = makeProject('create', cfg.name ?? 'Harness design');
const project: DesignProject = cfg.project ?? { ...base, medium: 'design', design: cfg.design ?? emptyState(cfg.kind ?? 'poster', cfg.format ?? 'a3', cfg.brief ?? ''), ...(cfg.companyId ? { companyId: cfg.companyId } : {}), ...(cfg.systemLink ? { systemLink: cfg.systemLink } : {}) };
(window as any).__PROJECT_ID__ = project.id;
createRoot(document.getElementById('root')!).render(
  cfg.page === 'company' ? (
    // the company page on its own (it is kept in this browser like everything else; no account here)
    <CompanyApp signedIn={false} initialId={null} onExit={() => ((window as any).__EXITED__ = true)} onOpenProject={(id) => ((window as any).__OPENED__ = id)} onOpenSystems={(id) => ((window as any).__SYSTEMS__ = id ?? '')} />
  ) : (
    <DesignWorkspace initial={project} signedIn={cfg.signedIn !== false} onExit={() => ((window as any).__EXITED__ = true)} startIntent={cfg.startIntent} />
  )
);

// for the checks: an artboard as the export draws it (a data address), from the page's own code
import { artboardPicture, toDataUrl } from '@/lib/ux-v0/design/export';
import { assetData } from '@/components/ux-v0/design/runtime';
(window as any).__picture = async (a: any, tokens: string, assets: any[] = [], maxSide = 1400) => {
  const p = await artboardPicture(a, tokens, await assetData(assets), { type: 'image/png', maxSide });
  return toDataUrl(p.blob);
};
