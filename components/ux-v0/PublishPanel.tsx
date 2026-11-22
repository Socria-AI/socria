'use client';

// components/ux-v0/PublishPanel.tsx — the design made ready to live somewhere: what stands in the way, the site's
// settings, where every button goes, and the downloads.
//
// Every setting here is the designer's (spec.site, lib/ux-v0/spec.ts): SocriaUX never invents an address, a form
// service or a description of the business. Each change is a version Undo takes back. The website download is a
// folder that builds and runs without SocriaUX (lib/ux-v0/export-site.ts); the page download is one HTML file.

import { useEffect, useMemo, useState } from 'react';
import { describeLink, linkKey, resolveLinks } from '@/lib/ux-v0/links';
import { exportSite, siteReadiness, type ExportContext } from '@/lib/ux-v0/export-site';
import { kindDef, safeHref, type DesignSpec } from '@/lib/ux-v0/spec';
import type { MoodboardRef } from '@/lib/ux-v0/types';

const textOf = (v: unknown) => (typeof v === 'string' ? v.replace(/\*/g, '') : '');

/** One setting typed in: kept on Enter or when the field is left, checked first. */
function SettingField({
  id,
  label,
  value,
  placeholder,
  multiline,
  hint,
  check,
  onSave,
}: {
  id: string;
  label: string;
  value: string;
  placeholder?: string;
  multiline?: boolean;
  hint?: string;
  /** what is wrong with it, or '' */
  check?: (v: string) => string;
  onSave: (v: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState('');
  useEffect(() => setDraft(value), [value]);
  const save = () => {
    const v = draft.trim();
    if (v === value) return setError('');
    const problem = v && check ? check(v) : '';
    if (problem) return setError(problem);
    setError('');
    onSave(v);
  };
  const common = {
    id,
    className: 'v0-field',
    value: draft,
    placeholder,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': `${id}-hint`,
    onChange: (e: { target: { value: string } }) => setDraft(e.target.value),
    onBlur: save,
  };
  return (
    <div className="v0-pub-field">
      <label className="sb-label" htmlFor={id}>
        {label}
      </label>
      {multiline ? <textarea rows={3} {...common} /> : <input type="text" {...common} onKeyDown={(e) => e.key === 'Enter' && save()} />}
      <p id={`${id}-hint`} className={error ? 'v0-pub-error' : 'v0-quiet'} role={error ? 'alert' : undefined}>
        {error || hint}
      </p>
    </div>
  );
}

export function PublishPanel({
  spec,
  refs,
  context,
  onSite,
  onDownloadPage,
  onDownloaded,
}: {
  spec: DesignSpec;
  /** the moodboard's references, uploads as data addresses (what the frames draw) */
  refs: readonly MoodboardRef[];
  context: ExportContext;
  /** set site settings: a version Undo takes back */
  onSite: (site: Record<string, unknown>, label: string) => void;
  /** the one-file HTML download (kept as it was) */
  onDownloadPage: () => void;
  /** a download happened: the design is an accepted one */
  onDownloaded: () => void;
}) {
  const ready = useMemo(() => siteReadiness(spec), [spec]);
  const links = useMemo(() => resolveLinks(spec), [spec]);
  const [custom, setCustom] = useState<Record<string, boolean>>({});
  const [zipping, setZipping] = useState(false);
  const [zipError, setZipError] = useState('');
  const parts = spec.sections.filter((s) => s.kind !== 'nav');
  const partName = (id: string) => {
    const s = spec.sections.find((x) => x.id === id);
    if (!s) return id;
    const own = textOf(s.content.title) || textOf(s.content.eyebrow);
    return `${kindDef(s.kind)?.label ?? s.kind}${own ? `: ${own.slice(0, 36)}` : ''}`;
  };
  const hasForm = spec.sections.some((s) => s.kind === 'form');

  const downloadZip = async () => {
    setZipping(true);
    setZipError('');
    try {
      const site = exportSite(spec, refs, context);
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      const folder = zip.folder(site.name)!;
      for (const f of site.files) folder.file(f.path, f.data);
      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${site.name}.zip`;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1500);
      onDownloaded();
    } catch (e) {
      setZipError(`The website could not be packed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setZipping(false);
    }
  };

  return (
    <div className="v0-rail-body v0-publish">
      <section className="v0-cellset" aria-labelledby="pub-ready">
        <span className="sb-label" id="pub-ready">
          Before it goes live
        </span>
        <ul className="v0-pub-ready">
          {ready.items.map((it) => (
            <li key={it.text} className={it.done ? 'is-done' : 'is-todo'}>
              <span className="v0-pub-mark" aria-hidden="true">
                {it.done ? '✓' : '·'}
              </span>
              <span>
                <span className="sr-only">{it.done ? 'Done: ' : 'To do: '}</span>
                {it.text}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="v0-cellset" aria-label="Where it lives">
        <SettingField
          id="pub-url"
          label="Its address"
          value={spec.site?.url ?? ''}
          placeholder="https://example.com"
          hint="For the canonical link, link previews and the sitemap. Leave it empty until the domain is known."
          check={(v) => (safeHref(v).startsWith('https://') ? '' : 'An address starting with https://, please.')}
          onSave={(v) => onSite({ url: v }, v ? `the site's address: ${v}` : "the site's address cleared")}
        />
        <SettingField
          id="pub-desc"
          label="Description for search results"
          value={spec.site?.description ?? ''}
          multiline
          placeholder={ready.description.from === 'page' ? `From the page: “${ready.description.text}”` : 'One or two sentences about the site'}
          hint="Your words. Without them, the page's opening words stand in."
          onSave={(v) => onSite({ description: v }, v ? 'a description for search results' : 'the description cleared')}
        />
        <SettingField
          id="pub-lang"
          label="Language of the words"
          value={spec.site?.lang ?? ''}
          placeholder="en"
          hint="A language code: en, fr, pt-BR."
          check={(v) => (/^[a-z]{2,3}(-[a-z0-9]{2,8}){0,2}$/i.test(v) ? '' : 'A language code, such as en or pt-BR.')}
          onSave={(v) => onSite({ lang: v }, v ? `the page's language: ${v}` : "the page's language cleared")}
        />
        {hasForm && (
          <SettingField
            id="pub-form"
            label="Where the form sends"
            value={spec.site?.formAction ?? ''}
            placeholder="https://formspree.io/f/… or mailto:you@example.com"
            hint="A form service's endpoint, or an email address. Until then the form checks its answers and says plainly that nothing was sent."
            check={(v) => (/^(https:\/\/|mailto:)/.test(safeHref(v)) ? '' : 'A form endpoint starting with https://, or mailto:you@example.com.')}
            onSave={(v) => onSite({ formAction: v }, v ? `the form sends to ${v.replace(/^mailto:/, '')}` : 'the form disconnected')}
          />
        )}
      </section>

      {links.all.length > 0 && (
        <section className="v0-cellset" aria-labelledby="pub-links">
          <span className="sb-label" id="pub-links">
            Where each button and link goes
          </span>
          <p className="v0-quiet">Found by their words unless you choose. A link that goes nowhere is said so on export, never passed off as working.</p>
          <ul className="v0-pub-links">
            {[...links.unlinked, ...links.all.filter((l) => l.by !== 'none')].map((l) => {
              const key = linkKey(l.section, l.path);
              const set = spec.site?.links?.[key] ?? '';
              const isCustom = custom[key] || (!!set && !set.startsWith('#'));
              const value = isCustom ? 'custom' : set;
              const id = `pub-l-${key.replace(/[^\w-]/g, '-')}`;
              return (
                <li key={key} className={l.by === 'none' ? 'is-todo' : ''}>
                  <label htmlFor={id} className="v0-pub-link-l">
                    “{l.label}” <span className="v0-quiet">({kindDef(spec.sections.find((s) => s.id === l.section)?.kind ?? '')?.label.toLowerCase()})</span>
                  </label>
                  <select
                    id={id}
                    className="v0-select"
                    value={value}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === 'custom') return setCustom((c) => ({ ...c, [key]: true }));
                      setCustom((c) => ({ ...c, [key]: false }));
                      onSite({ links: { [key]: v } }, v ? `“${l.label}” goes to ${v === '#top' ? 'the top of the page' : partName(v.slice(3))}` : `“${l.label}” found by its words again`);
                    }}
                  >
                    <option value="">{set ? 'By its words' : `By its words: ${describeLink(l, spec)}`}</option>
                    <option value="#top">The top of the page</option>
                    {parts
                      .filter((p) => p.id !== l.section)
                      .map((p) => (
                        <option key={p.id} value={`#s-${p.id}`}>
                          {partName(p.id)}
                        </option>
                      ))}
                    <option value="custom">An address…</option>
                  </select>
                  {isCustom && (
                    <SettingField
                      id={`${id}-to`}
                      label="Address"
                      value={set.startsWith('#') ? '' : set}
                      placeholder="https://… · mailto:… · tel:…"
                      check={(v) => (safeHref(v) && !safeHref(v).startsWith('#') ? '' : 'An address starting with https://, mailto: or tel:.')}
                      onSave={(v) => onSite({ links: { [key]: v } }, v ? `“${l.label}” goes to ${v}` : `“${l.label}” found by its words again`)}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="v0-cellset" aria-label="Download">
        <button type="button" className="sb-link is-meta is-strong" onClick={downloadZip} disabled={zipping}>
          {zipping ? 'Packing the website…' : 'Download the website (.zip)'}
        </button>
        <p className="v0-quiet">A folder that builds and runs without SocriaUX: `npm run build`, nothing to install. Its README says how to deploy it and what is left to connect.</p>
        {zipError && (
          <p className="v0-pub-error" role="alert">
            {zipError}
          </p>
        )}
        <button type="button" className="sb-link is-meta" onClick={onDownloadPage}>
          Download the page as one HTML file
        </button>
      </section>
    </div>
  );
}
