// test/browser/ux-v0/env.mjs — where things are, for the SocriaUX v0 browser checks.
//
// UXV0_BASE           the running app (default http://localhost:3100; the v0 switch must be on)
// UXV0_OUT            where screenshots and captures go (default: a folder in the system temp dir)
// PLAYWRIGHT_MODULE   a Playwright to load instead of the one Node's require finds
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(here, '..', '..', '..') + '/';
export const FX = join(here, 'fx') + '/';
export const S = (process.env.UXV0_OUT || join(tmpdir(), 'ux-v0-browser')) + '/';
mkdirSync(S, { recursive: true });
export const BASE = (process.env.UXV0_BASE || 'http://localhost:3100').replace(/\/$/, '');
export const { chromium } = process.env.PLAYWRIGHT_MODULE ? await import(process.env.PLAYWRIGHT_MODULE) : createRequire(import.meta.url)('playwright');
/** the modules under test, as `node test/run.mjs` builds them (test/.tmp) */
export const underTest = () => import(pathToFileURL(join(ROOT, 'test/.tmp/ux-v0-under-test.mjs')).href);
