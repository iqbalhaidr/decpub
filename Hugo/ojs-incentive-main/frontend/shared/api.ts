// Shared frontend helpers used by every page.

// POST JSON to an API endpoint, throwing on non-OK responses.
// (Identical to the inline post() used by every page.)
export async function post(url: string, body?: any): Promise<any> {
  var r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  var d = await r.json();
  if (!r.ok) throw new Error(d.error || 'Failed');
  return d;
}

// Format a number to a fixed number of decimals (default 4); '--' for non-numbers.
// (Identical to the inline fmt()/f() used by every page.)
export function fmt(n: any, d?: number): string {
  return typeof n === 'number' ? n.toFixed(d === undefined ? 4 : d) : '--';
}

// Render a status message. Two call styles are supported, matching the inline code:
//  - setStatus(id, msg, type): writes a `.status` div into the element `id` (monitor.html).
//  - setStatus(msg, type):     writes a `.status` div into the element with id="status" (pipeline.html).
export function setStatus(a: string, b?: string, c?: string): void {
  if (c !== undefined) {
    var el = document.getElementById(a);
    if (el) el.innerHTML = '<div class="status ' + c + '">' + b + '</div>';
  } else {
    var s = document.getElementById('status');
    if (s) s.innerHTML = '<div class="status ' + (b || 'info') + '">' + a + '</div>';
  }
}
