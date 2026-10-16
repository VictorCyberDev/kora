import { buildDemoService } from "./app.js";
import { resolveListen } from "./listen.js";
const listen = resolveListen(process.env);
const app = buildDemoService();
await app.listen(listen);
