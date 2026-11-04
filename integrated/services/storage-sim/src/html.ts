/** Halaman HTML polos tanpa JavaScript dan tanpa CSS. */

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function page(body: string): string {
  return `<!doctype html>
<html lang="id">
<head><meta charset="utf-8"><title>Storage Publik [SIMULASI]</title></head>
<body>
<h1>Storage Publik (simulasi IPFS) [SIMULASI]</h1>
<p>Penyimpanan berkas berdasarkan hash isi (CID). Berkas yang sama selalu mendapat CID yang sama.</p>
${body}
<hr>
<p>API: <code>POST /api/v0/add</code> (subset Kubo), <code>GET /ipfs/&lt;cid&gt;</code>.
Layanan ini pengganti IPFS; mengganti ke node Kubo cukup mengubah <code>STORAGE_API_URL</code> dan <code>STORAGE_GATEWAY_URL</code>.</p>
</body>
</html>
`;
}

const forms = `<h2>Unggah</h2>
<form method="post" action="/upload" enctype="multipart/form-data">
<input type="file" name="file" required>
<input type="submit" value="Unggah">
</form>
<h2>Cari berdasarkan ID (CID)</h2>
<form method="get" action="/">
<input type="text" name="cid" size="70" placeholder="bafkrei..." required>
<input type="submit" value="Cari">
</form>`;

export function homePage(): string {
  return page(forms);
}

export interface FileInfo {
  cid: string;
  size: number;
  name?: string;
}

function fileBlock(f: FileInfo): string {
  const fname = f.name ? `&amp;filename=${encodeURIComponent(f.name)}` : "";
  return `<table border="1" cellpadding="4">
<tr><td>ID (CID)</td><td><code>${esc(f.cid)}</code></td></tr>
<tr><td>Ukuran</td><td>${f.size} byte</td></tr>
${f.name ? `<tr><td>Nama</td><td>${esc(f.name)}</td></tr>` : ""}
<tr><td>Tautan</td><td><a href="/ipfs/${esc(f.cid)}">buka</a> | <a href="/ipfs/${esc(f.cid)}?download=1${fname}">unduh</a></td></tr>
</table>`;
}

export function foundPage(f: FileInfo): string {
  return page(`<h2>Ditemukan</h2>\n${fileBlock(f)}\n${forms}`);
}

export function uploadedPage(f: FileInfo, created: boolean): string {
  return page(
    `<h2>${created ? "Terunggah" : "Sudah ada (isi sama, CID sama)"}</h2>\n${fileBlock(f)}\n${forms}`,
  );
}

export function messagePage(message: string): string {
  return page(`<p><strong>${esc(message)}</strong></p>\n${forms}`);
}
