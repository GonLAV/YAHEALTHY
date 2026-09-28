/**
 * Build-time prerender entry (never shipped to the browser).
 *
 * Built with `vite build --ssr src/entry-server.tsx --outDir dist-ssr` and
 * driven by scripts/prerender.mjs, which writes one static HTML file per
 * public route so crawlers that do not run JavaScript still get the content,
 * the right <html lang dir>, and the full head.
 *
 * renderToPipeableStream + onAllReady waits for the lazy route chunks, so the
 * output contains the real page (with Suspense markers the client's
 * hydrateRoot understands) rather than the loading spinner.
 */
import React from 'react';
import { renderToPipeableStream } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { Writable } from 'node:stream';
import { AppShell } from './App';
import {
  PUBLIC_ROUTES,
  PRIVATE_PATHS,
  buildSeoHead,
  buildSitemapXml,
  matchPublicRoute,
  renderSeoHeadHtml,
  type SeoHead,
} from './seo/site';
import { guides, readingMinutes } from './content/guides';

export { PUBLIC_ROUTES, PRIVATE_PATHS, guides, readingMinutes, buildSitemapXml };

export interface PrerenderResult {
  html: string;
  head: SeoHead;
  headHtml: string;
}

export function render(url: string, siteUrl: string): Promise<PrerenderResult> {
  const match = matchPublicRoute(url);
  if (!match) return Promise.reject(new Error(`Not a public route: ${url}`));
  const head = buildSeoHead(match, siteUrl);

  return new Promise((resolve, reject) => {
    let html = '';
    const sink = new Writable({
      write(chunk, _enc, cb) {
        html += chunk.toString();
        cb();
      },
      final(cb) {
        resolve({ html, head, headHtml: renderSeoHeadHtml(head) });
        cb();
      },
    });

    const stream = renderToPipeableStream(
      <React.StrictMode>
        <StaticRouter location={url}>
          <AppShell initialLang={match.lang} />
        </StaticRouter>
      </React.StrictMode>,
      {
        onAllReady() {
          stream.pipe(sink);
        },
        onShellError: reject,
        onError(error) {
          reject(error);
        },
      },
    );
  });
}
