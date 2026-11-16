import { prisma } from '../../src/database/index.js';
import { DOCUMENT_GUIDES } from '../../src/services/documents/documentGuides.js';
import { pathToFileURL } from 'node:url';

export const seedDocumentGuides = async () => {
  for (const guide of DOCUMENT_GUIDES) {
    await prisma.documentGuide.upsert({ where: { categoryKey: guide.categoryKey }, update: {}, create: guide });
  }
};
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  seedDocumentGuides().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
}
