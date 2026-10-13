import { createPortalServer } from './app.mjs';

const app = createPortalServer({ onError: error => console.error('[portal api]', error.message) });
const port = Number(process.env.PORT ?? 4000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid TCP port.');
const host = process.env.HOST ?? '127.0.0.1';
const address = await app.listen(port, host);
console.log(`Las Olas demonstration API listening at http://${address.address}:${address.port}`);
console.log(`SQLite data: ${app.databasePath}`);
console.log('Demo records only. Do not use these credentials or this local server for production.');
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await app.close(); process.exit(0); });
