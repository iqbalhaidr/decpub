import { SimulatedQoSProvider, type QoSProvider } from "@decpub/incentive-core";
import type { AppConfig } from "../config/config.js";

export const QOS_PROVIDER = Symbol("QOS_PROVIDER");

/**
 * Pabrik penyedia QoS (q2, q3). Hanya `simulated` yang ada: heuristik deterministik tanpa model bahasa
 * (keputusan pengguna: QoS cukup disimulasikan). Mengganti ke `LocalModelProvider` Hugo = menambah cabang di sini
 * dan mengatur `QOS_PROVIDER=local`; pemanggil tidak berubah karena memakai antarmuka `QoSProvider`.
 */
export function createQosProvider(config: Pick<AppConfig, "qosProvider">): QoSProvider {
  if (config.qosProvider === "simulated") return new SimulatedQoSProvider();
  throw new Error(`QOS_PROVIDER=${config.qosProvider} belum didukung (hanya "simulated"; LocalModelProvider Hugo belum dipasang)`);
}
