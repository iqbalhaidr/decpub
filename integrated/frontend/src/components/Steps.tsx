/** Catatan langkah yang sedang berjalan, polos: daftar (nomor ada di teks langkah). */
export default function Steps({ items }: { items: string[] }) {
  return items.length ? (
    <ul>
      {items.map((s, i) => (
        <li key={i}>{s}</li>
      ))}
    </ul>
  ) : null;
}
