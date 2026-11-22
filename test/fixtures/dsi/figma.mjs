// Figma REST API responses, in the shapes the official API documents (GET /v1/files/:key?depth=1, /nodes, /variables/local,
// /images). Used by the DSI tests and benchmark E to exercise the real mapping code. These are fixtures, not a live file.
export const FILE_KEY = 'AbC123dEf456GhI789';
export const variables = {
  status: 200,
  error: false,
  meta: {
    variableCollections: {
      'VariableCollectionId:1:1': { id: 'VariableCollectionId:1:1', name: 'Primitives', modes: [{ modeId: '1:0', name: 'Value' }], defaultModeId: '1:0', remote: false, hiddenFromPublishing: false, variableIds: ['VariableID:1:2', 'VariableID:1:3', 'VariableID:1:4', 'VariableID:1:5', 'VariableID:1:9'] },
      'VariableCollectionId:2:1': { id: 'VariableCollectionId:2:1', name: 'Semantic', modes: [{ modeId: '2:0', name: 'Light' }, { modeId: '2:1', name: 'Dark' }], defaultModeId: '2:0', remote: false, hiddenFromPublishing: false, variableIds: ['VariableID:2:2', 'VariableID:2:3', 'VariableID:2:4', 'VariableID:2:5'] },
    },
    variables: {
      'VariableID:1:2': { id: 'VariableID:1:2', name: 'blue/600', key: 'k1', variableCollectionId: 'VariableCollectionId:1:1', resolvedType: 'COLOR', valuesByMode: { '1:0': { r: 0.059, g: 0.384, b: 0.996, a: 1 } }, remote: false, description: 'Brand blue', hiddenFromPublishing: false, scopes: ['ALL_SCOPES'], codeSyntax: { WEB: 'var(--blue-600)' } },
      'VariableID:1:3': { id: 'VariableID:1:3', name: 'gray/0', key: 'k2', variableCollectionId: 'VariableCollectionId:1:1', resolvedType: 'COLOR', valuesByMode: { '1:0': { r: 1, g: 1, b: 1, a: 1 } }, remote: false, description: '', hiddenFromPublishing: false, scopes: ['ALL_SCOPES'], codeSyntax: {} },
      'VariableID:1:4': { id: 'VariableID:1:4', name: 'gray/900', key: 'k3', variableCollectionId: 'VariableCollectionId:1:1', resolvedType: 'COLOR', valuesByMode: { '1:0': { r: 0.086, g: 0.086, b: 0.086, a: 1 } }, remote: false, description: '', hiddenFromPublishing: false, scopes: ['ALL_SCOPES'], codeSyntax: {} },
      'VariableID:1:5': { id: 'VariableID:1:5', name: 'radius/md', key: 'k4', variableCollectionId: 'VariableCollectionId:1:1', resolvedType: 'FLOAT', valuesByMode: { '1:0': 8 }, remote: false, description: '', hiddenFromPublishing: false, scopes: ['CORNER_RADIUS'], codeSyntax: {} },
      'VariableID:1:9': { id: 'VariableID:1:9', name: 'font/family/sans', key: 'k9', variableCollectionId: 'VariableCollectionId:1:1', resolvedType: 'STRING', valuesByMode: { '1:0': 'IBM Plex Sans' }, remote: false, description: '', hiddenFromPublishing: false, scopes: ['FONT_FAMILY'], codeSyntax: {} },
      'VariableID:2:2': { id: 'VariableID:2:2', name: 'color/background/default', key: 'k5', variableCollectionId: 'VariableCollectionId:2:1', resolvedType: 'COLOR', valuesByMode: { '2:0': { type: 'VARIABLE_ALIAS', id: 'VariableID:1:3' }, '2:1': { type: 'VARIABLE_ALIAS', id: 'VariableID:1:4' } }, remote: false, description: '', hiddenFromPublishing: false, scopes: ['FRAME_FILL'], codeSyntax: {} },
      'VariableID:2:3': { id: 'VariableID:2:3', name: 'color/text/default', key: 'k6', variableCollectionId: 'VariableCollectionId:2:1', resolvedType: 'COLOR', valuesByMode: { '2:0': { type: 'VARIABLE_ALIAS', id: 'VariableID:1:4' }, '2:1': { type: 'VARIABLE_ALIAS', id: 'VariableID:1:3' } }, remote: false, description: '', hiddenFromPublishing: false, scopes: ['TEXT_FILL'], codeSyntax: {} },
      'VariableID:2:4': { id: 'VariableID:2:4', name: 'color/action/primary', key: 'k7', variableCollectionId: 'VariableCollectionId:2:1', resolvedType: 'COLOR', valuesByMode: { '2:0': { type: 'VARIABLE_ALIAS', id: 'VariableID:1:2' }, '2:1': { type: 'VARIABLE_ALIAS', id: 'VariableID:1:2' } }, remote: false, description: 'Buttons and links', hiddenFromPublishing: false, scopes: ['ALL_FILLS'], codeSyntax: {} },
      'VariableID:2:5': { id: 'VariableID:2:5', name: 'color/border/subtle', key: 'k8', variableCollectionId: 'VariableCollectionId:2:1', resolvedType: 'COLOR', valuesByMode: { '2:0': { type: 'VARIABLE_ALIAS', id: 'VariableID:9:9' }, '2:1': { r: 0.2, g: 0.2, b: 0.2, a: 1 } }, remote: false, description: 'From a library not in this file', hiddenFromPublishing: false, scopes: ['STROKE_COLOR'], codeSyntax: {} },
    },
  },
};
export const file = {
  name: 'Aster Design System',
  lastModified: '2026-10-02T09:15:00Z',
  version: '4211',
  schemaVersion: 0,
  document: { id: '0:0', name: 'Document', type: 'DOCUMENT', children: [{ id: '0:1', name: 'Foundations', type: 'CANVAS' }] },
  components: {
    '10:1': { key: 'c1', name: 'Size=Small, State=Default', description: '', componentSetId: '10:0', documentationLinks: [] },
    '10:2': { key: 'c2', name: 'Size=Large, State=Default', description: '', componentSetId: '10:0', documentationLinks: [] },
    '10:3': { key: 'c3', name: 'Size=Large, State=Hover', description: '', componentSetId: '10:0', documentationLinks: [] },
    '20:1': { key: 'c4', name: 'Aster logo', description: 'Primary logo', documentationLinks: [] },
  },
  componentSets: { '10:0': { key: 'cs1', name: 'Button', description: 'Primary actions' } },
  styles: {
    '30:1': { key: 's1', name: 'Brand/Signal', styleType: 'FILL', description: 'Signal colour', remote: false },
    '30:2': { key: 's2', name: 'Heading/Large', styleType: 'TEXT', description: '', remote: false },
    '30:3': { key: 's3', name: 'Elevation/Raised', styleType: 'EFFECT', description: '', remote: false },
    '30:4': { key: 's4', name: 'Layout/Desktop', styleType: 'GRID', description: '', remote: false },
  },
};
export const nodes = {
  name: 'Aster Design System',
  nodes: {
    '30:1': { document: { id: '30:1', name: 'Brand/Signal', type: 'RECTANGLE', fills: [{ type: 'SOLID', color: { r: 0.937, g: 0.267, b: 0.137, a: 1 } }] } },
    '30:2': { document: { id: '30:2', name: 'Heading/Large', type: 'TEXT', style: { fontFamily: 'IBM Plex Sans', fontWeight: 600, fontSize: 40, lineHeightPx: 48, letterSpacing: -0.4 } } },
    '30:3': { document: { id: '30:3', name: 'Elevation/Raised', type: 'RECTANGLE', effects: [{ type: 'DROP_SHADOW', visible: true, color: { r: 0, g: 0, b: 0, a: 0.16 }, offset: { x: 0, y: 4 }, radius: 12, spread: 0 }] } },
    '30:4': { document: { id: '30:4', name: 'Layout/Desktop', type: 'FRAME', layoutGrids: [{ pattern: 'COLUMNS', sectionSize: 72, gutterSize: 24, count: 12, offset: 80, alignment: 'STRETCH' }] } },
  },
};
export const images = { err: null, images: { '20:1': 'https://figma-alpha-api.s3.us-west-2.amazonaws.com/images/aster-logo.svg' } };
export const logoSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 60"><path d="M10 50 L30 10 L50 50 Z" fill="#ef4423"/><path d="M70 20h110v20H70z" fill="#161616"/></svg>';
