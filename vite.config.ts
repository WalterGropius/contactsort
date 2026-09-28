import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Production builds get a strict Content-Security-Policy: no network access at
// all, so contact data can never leave the machine. (Not applied in dev, where
// Vite needs a websocket for hot reload.)
const offlineCsp = (): Plugin => ({
  name: 'contactsort-offline-csp',
  apply: 'build',
  transformIndexHtml(html) {
    const csp = [
      "default-src 'none'",
      "script-src 'unsafe-inline'",
      "style-src 'unsafe-inline'",
      'img-src data: blob:',
      "connect-src 'none'",
      "base-uri 'none'",
      "form-action 'none'",
    ].join('; ');
    return html.replace(
      '<meta charset="UTF-8" />',
      `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`,
    );
  },
});

export default defineConfig({
  base: './',
  plugins: [react(), viteSingleFile(), offlineCsp()],
});
