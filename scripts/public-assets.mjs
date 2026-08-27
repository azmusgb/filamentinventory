export const PUBLIC_ASSETS = Object.freeze([
  'index.html',
  'styles.css',
  'app.js',
  'state-merge.js',
  'sync-client.js',
  'security-client.js',
  'labels-client.js',
  'household-client.js',
  'ux-client.js',
  'sw.js',
  'manifest.webmanifest',
  'icon.svg',
  'robots.txt',
]);

export const JAVASCRIPT_ASSETS = Object.freeze(
  PUBLIC_ASSETS.filter((asset) => asset.endsWith('.js')),
);
