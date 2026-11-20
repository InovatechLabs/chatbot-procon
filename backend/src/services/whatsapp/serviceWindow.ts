import type { Prisma } from '@prisma/client';

export async function serviceWindowUntil(db: Prisma.TransactionClient, phoneLookup: string) {
  const receipt = await db.messageReceipt.findFirst({
    where: { phoneLookup, sourceAt: { not: null } }, orderBy: { sourceAt: 'desc' }, select: { sourceAt: true },
  });
  return receipt?.sourceAt ? new Date(receipt.sourceAt.getTime() + 24 * 60 * 60_000) : null;
}

export function inboundTimestamp(value: string | undefined, receivedAt = Date.now()) {
  if (!value || !/^\d{1,10}$/.test(value)) return null;
  const time = Number(value) * 1000;
  return time > 0 ? new Date(Math.min(time, receivedAt)) : null;
}
