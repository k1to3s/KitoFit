import { pgTable, pgSchema, uuid, text, jsonb, timestamp, integer, primaryKey, real } from 'drizzle-orm/pg-core';

export const foodLogs = pgTable('food_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  date: text('date').notNull(),
  meal: text('meal').notNull(),
  name: text('name').notNull(),
  serving: text('serving').notNull(),
grams: real('grams').notNull().default(100),
  calories: real('calories').notNull(),
  protein: real('protein').notNull(),
  carbs: real('carbs').notNull(),
  fat: real('fat').notNull(),
  image: text('image'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

const entity = (name: string) => pgTable(name, {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  date: text('date').notNull(),
  data: jsonb('data').$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const profiles = entity('profiles');
export const customFoods = entity('custom_foods');
export const supplements = entity('supplements');
export const supplementLogs = entity('supplement_logs');
export const supplementSchedules = entity('supplement_schedules');
export const workouts = entity('workouts');
export const workoutSessions = entity('workout_sessions');
export const exercises = entity('exercises');
export const workoutSets = entity('workout_sets');
export const trackerRecords = entity('tracker_records');
export const pushSubscriptions = entity('push_subscriptions');
export const auditLogs = entity('audit_logs');

export const foodsCache = pgTable('foods_cache', {
  key: text('key').primaryKey(),
  data: jsonb('data').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull()
});

const publicSchema = pgSchema('public');

export const rateLimits = publicSchema.table('rate_limits', {
  key: text('key').primaryKey(),
  count: integer('count').notNull().default(1),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull()
});
export const chatRooms = pgTable('chat_rooms', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  name: text('name').notNull()
});

export const chatMembers = pgTable('chat_members', {
  roomId: uuid('room_id').notNull().references(() => chatRooms.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull()
}, t => [
  primaryKey({ columns: [t.roomId, t.userId] })
]);

export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  roomId: uuid('room_id').notNull().references(() => chatRooms.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull(),
  content: text('content').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const blocks = pgTable('blocks', {
  userId: uuid('user_id').notNull(),
  blockedId: uuid('blocked_id').notNull()
}, t => [
  primaryKey({ columns: [t.userId, t.blockedId] })
]);

export const reports = entity('reports');
