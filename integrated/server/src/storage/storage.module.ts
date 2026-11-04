import { Global, Module } from "@nestjs/common";
import { createStorageProvider, type StorageProvider } from "@decpub/shared";
import { APP_CONFIG, type AppConfig } from "../config/config.js";
import { EncryptedFilePrivateStore, PRIVATE_STORE } from "./private-store.js";

/** Token untuk `StorageProvider` publik (simulator IPFS atau Kubo, dari env). */
export const PUBLIC_STORAGE = Symbol("PUBLIC_STORAGE");

@Global()
@Module({
  providers: [
    { provide: PUBLIC_STORAGE, inject: [APP_CONFIG], useFactory: (c: AppConfig): StorageProvider => createStorageProvider(c.storage) },
    {
      provide: PRIVATE_STORE,
      inject: [APP_CONFIG],
      useFactory: (c: AppConfig) => new EncryptedFilePrivateStore(c.privateStoreDir, c.privateStoreKey),
    },
  ],
  exports: [PUBLIC_STORAGE, PRIVATE_STORE],
})
export class StorageModule {}
