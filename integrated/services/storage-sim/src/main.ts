/** Menjalankan simulator sebagai proses mandiri. Konfigurasi dari env (lihat .env.example). */
import { resolve } from "node:path";
import { corsOriginsFromEnv, createStorageApp } from "./app.js";

const port = Number(process.env.STORAGE_PORT ?? 8081);
const host = process.env.STORAGE_HOST ?? "127.0.0.1";
const dataDir = resolve(process.env.STORAGE_DATA_DIR ?? "../../data/storage");
const maxBytes = process.env.STORAGE_MAX_BYTES ? Number(process.env.STORAGE_MAX_BYTES) : undefined;

const { app } = await createStorageApp({ dataDir, maxBytes, corsOrigins: corsOriginsFromEnv() });
app.listen(port, host, () => {
  console.log(`[storage-sim] http://${host}:${port}  data: ${dataDir}  [SIMULASI]`);
});
