import 'dotenv/config';
import { execFileSync } from 'node:child_process';
const name = process.env.PRIVACY_TEST_DB_NAME;
if (!name || !/^procon_privacy_test_[a-z0-9_]+$/.test(name)) throw new Error('Informe PRIVACY_TEST_DB_NAME com prefixo procon_privacy_test_.');
const url = new URL(process.env.DATABASE_URL!);
url.pathname = `/${name}`;
execFileSync('npx', ['prisma', 'db', 'push'], { env: { ...process.env, DATABASE_URL: url.toString() }, stdio: 'inherit' });
