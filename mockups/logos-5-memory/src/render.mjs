// Renders the Logos 5 Memory mockups to PNG.
//   node render.mjs                 every state, both devices, plus the boards
//   node render.mjs desktop 3       one screen
import { chromium } from '../../../node_modules/playwright-core/index.mjs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..');
const STATES = ['1-overview', '2-expanded-cluster', '3-selected-memory', '4-changes', '5-review'];
const VIEW = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } };

const [onlyDevice, onlyState] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

async function shoot(device, i) {
  const page = await browser.newPage({ viewport: VIEW[device], deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`file://${join(here, 'index.html')}?device=${device}&state=${i + 1}`);
  await page.waitForSelector('body[data-ready="1"]', { timeout: 15000 });
  const file = join(out, device, `${STATES[i]}.png`);
  await page.screenshot({ path: file });
  await page.close();
  if (errors.length) console.log(device, STATES[i], 'errors:', errors);
  console.log('wrote', file.replace(out + '/', ''));
}

async function board(device) {
  const page = await browser.newPage({ viewport: { width: 1800, height: 1200 }, deviceScaleFactor: 2 });
  await page.goto(`file://${join(here, 'board.html')}?device=${device}`);
  await page.waitForSelector('body[data-ready="1"]', { timeout: 15000 });
  const el = await page.$('.board');
  const file = join(out, '0-overview', `${device}.png`);
  await el.screenshot({ path: file });
  await page.close();
  console.log('wrote', file.replace(out + '/', ''));
}

const devices = onlyDevice ? [onlyDevice] : ['desktop', 'mobile'];
for (const d of devices) {
  for (let i = 0; i < STATES.length; i++) {
    if (onlyState && Number(onlyState) !== i + 1) continue;
    await shoot(d, i);
  }
}
if (!onlyDevice) for (const d of devices) await board(d);
await browser.close();
