import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { cloudflare } from '@cloudflare/vite-plugin';

export default defineConfig({
  plugins: [react(), cloudflare(), {
    name: 'sahar-inline-entry-styles',
    transformIndexHtml: {
      order: 'post',
      handler(html, context) {
        if (!context.bundle) return html;
        // Deliver the layout with its HTML so a missing or retired stylesheet
        // cannot leave a working application without its presentation.
        return html.replace(/<link\b[^>]*\brel="stylesheet"[^>]*>/g, link => {
          const href = link.match(/\bhref="([^"]+)"/)?.[1];
          const asset = href ? context.bundle?.[href.replace(/^\//, '')] : undefined;
          if (!asset || asset.type !== 'asset' || typeof asset.source !== 'string') return link;
          return `<style data-sahar-layout>${asset.source.replace(/<\/style/gi, '<\\/style')}</style>`;
        });
      }
    }
  }],
  server: { port: 3000 }
});
