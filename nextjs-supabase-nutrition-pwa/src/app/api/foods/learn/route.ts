import { z } from 'zod';
import { eq, and, sql } from 'drizzle-orm';
import { identity, json, failure, limit } from '@/lib/security';
import { db } from '@/db';
import { foodAiCorrections } from '@/db/schema';

const label = z.string().trim().min(1).max(120);

export async function GET(req: Request) {
  try {
    const user = await identity(req);
    const rows = await db.select({
      predictedLabel: foodAiCorrections.predictedLabel,
      correctedLabel: foodAiCorrections.correctedLabel,
      correctionCount: foodAiCorrections.correctionCount,
    }).from(foodAiCorrections).where(eq(foodAiCorrections.userId, user.id));
    return json({ corrections: rows });
  } catch (e) {
    return failure(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await identity(req);
    await limit(`food-ai-learn:${user.id}`, 30);
    const input = z.object({
      predictedLabel: label,
      correctedLabel: label,
    }).strict().parse(await req.json());

    if (input.predictedLabel.toLowerCase() === input.correctedLabel.toLowerCase()) {
      return json({ ok: true, learned: false });
    }

    const predicted = input.predictedLabel.toLowerCase();
    const corrected = input.correctedLabel;
    const existing = await db.select().from(foodAiCorrections).where(and(
      eq(foodAiCorrections.userId, user.id),
      eq(foodAiCorrections.predictedLabel, predicted),
      eq(foodAiCorrections.correctedLabel, corrected),
    )).limit(1);

    if (existing[0]) {
      await db.update(foodAiCorrections)
        .set({
          correctionCount: sql`${foodAiCorrections.correctionCount} + 1`,
          lastUsedAt: new Date(),
        })
        .where(eq(foodAiCorrections.id, existing[0].id));
    } else {
      await db.insert(foodAiCorrections).values({
        userId: user.id,
        predictedLabel: predicted,
        correctedLabel: corrected,
      });
    }

    return json({ ok: true, learned: true });
  } catch (e) {
    return failure(e);
  }
}
