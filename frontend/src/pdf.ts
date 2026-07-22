import { marked } from "marked";

const PRINT_STYLES = `
  @page { margin: 2cm; }
  body {
    font-family: Georgia, "Times New Roman", serif;
    color: #111;
    line-height: 1.5;
    max-width: 800px;
    margin: 0 auto;
    padding: 24px;
  }
  h1 { font-size: 24px; margin: 0 0 4px; }
  h2 { font-size: 16px; border-bottom: 1px solid #ccc; padding-bottom: 2px; margin-top: 20px; }
  h3 { font-size: 14px; margin-bottom: 2px; }
  ul { margin: 4px 0 10px; padding-left: 20px; }
  li { margin: 2px 0; }
  hr { border: none; border-top: 1px solid #ccc; margin: 12px 0; }
  p { margin: 6px 0; }
  a { color: #111; text-decoration: none; }
`;

/** Render Markdown to a styled HTML string. */
export function renderMarkdown(md: string): string {
  return marked.parse(md, { async: false }) as string;
}

/**
 * Print the rendered document via a hidden iframe and trigger the browser's
 * print dialog, where the user can choose "Save as PDF". Using an iframe
 * avoids pop-up blockers and blank-window issues from window.open.
 */
export function printAsPdf(title: string, markdown: string): void {
  const html =
    `<!doctype html><html><head><title>${title}</title>` +
    `<style>${PRINT_STYLES}</style></head><body>` +
    renderMarkdown(markdown) +
    `</body></html>`;

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);

  const cleanup = () => {
    // Delay removal so the print dialog has the document available.
    setTimeout(() => iframe.remove(), 1000);
  };

  iframe.onload = () => {
    const win = iframe.contentWindow;
    if (!win) {
      iframe.remove();
      return;
    }
    win.focus();
    win.print();
    win.onafterprint = cleanup;
    // Fallback cleanup if onafterprint never fires.
    setTimeout(cleanup, 60000);
  };

  iframe.srcdoc = html;
}

