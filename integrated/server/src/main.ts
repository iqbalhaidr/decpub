import { createApp } from "./bootstrap.js";
import { loadConfig } from "./config/config.js";

const config = loadConfig();
const app = await createApp(config);
await app.listen(config.port, config.host);
console.log(`[server] http://${config.host}:${config.port}  Swagger: /api  jaringan ${config.network} (chainId ${config.deployments.chainId})`);
