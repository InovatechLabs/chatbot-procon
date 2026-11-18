import { copyFile, mkdir } from 'node:fs/promises';

const source = new URL('../src/database/data/legalRules.json', import.meta.url);
const target = new URL('../dist/database/data/legalRules.json', import.meta.url);
await mkdir(new URL('.', target), { recursive: true });
await copyFile(source, target);
