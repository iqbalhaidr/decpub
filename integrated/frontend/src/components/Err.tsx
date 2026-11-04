/** Galat yang ditampilkan apa adanya, tanpa dekorasi. */
export default function Err({ message }: { message: string | null | undefined }) {
  return message ? <p>GALAT: {message}</p> : null;
}
