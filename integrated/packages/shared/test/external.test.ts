/**
 * Menjalankan rangkaian tes StorageProvider melawan layanan yang sudah hidup
 * (simulator di :8081 atau node Kubo). Atur STORAGE_API_URL dan STORAGE_GATEWAY_URL.
 */
import { HttpStorageProvider, storageConfigFromEnv } from "../src/index.js";
import { runStorageProviderSuite } from "../src/testing.js";

const config = storageConfigFromEnv();
runStorageProviderSuite(`eksternal ${config.apiUrl}`, () => new HttpStorageProvider(config, { timeoutMs: 8000 }));
