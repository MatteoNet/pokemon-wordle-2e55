
import { serial, text, pgTable, timestamp, integer, boolean, date, varchar } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const pokemonTable = pgTable('pokemon', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  type1: varchar('type1', { length: 50 }).notNull(),
  type2: varchar('type2', { length: 50 }),
  evolution_count: integer('evolution_count').notNull(),
  is_final_evolution: boolean('is_final_evolution').notNull(),
  color: varchar('color', { length: 50 }).notNull(),
  habitat: varchar('habitat', { length: 50 }),
  generation: integer('generation').notNull(),
  sprite_url: text('sprite_url').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
});

export const dailyPokemonTable = pgTable('daily_pokemon', {
  id: serial('id').primaryKey(),
  date: date('date').notNull(),
  pokemon_id: integer('pokemon_id').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
});

export const gameSessionTable = pgTable('game_session', {
  id: serial('id').primaryKey(),
  session_id: varchar('session_id', { length: 100 }).notNull(),
  daily_pokemon_id: integer('daily_pokemon_id').notNull(),
  max_guesses: integer('max_guesses').notNull(),
  current_guesses: integer('current_guesses').notNull().default(0),
  is_completed: boolean('is_completed').notNull().default(false),
  is_won: boolean('is_won').notNull().default(false),
  created_at: timestamp('created_at').defaultNow().notNull(),
  completed_at: timestamp('completed_at'),
});

export const gameGuessTable = pgTable('game_guess', {
  id: serial('id').primaryKey(),
  session_id: varchar('session_id', { length: 100 }).notNull(),
  guess_number: integer('guess_number').notNull(),
  guessed_pokemon_id: integer('guessed_pokemon_id').notNull(),
  is_correct: boolean('is_correct').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
});

// Relations
export const pokemonRelations = relations(pokemonTable, ({ many }) => ({
  dailyPokemon: many(dailyPokemonTable),
  gameGuesses: many(gameGuessTable),
}));

export const dailyPokemonRelations = relations(dailyPokemonTable, ({ one, many }) => ({
  pokemon: one(pokemonTable, {
    fields: [dailyPokemonTable.pokemon_id],
    references: [pokemonTable.id],
  }),
  gameSessions: many(gameSessionTable),
}));

export const gameSessionRelations = relations(gameSessionTable, ({ one, many }) => ({
  dailyPokemon: one(dailyPokemonTable, {
    fields: [gameSessionTable.daily_pokemon_id],
    references: [dailyPokemonTable.id],
  }),
  guesses: many(gameGuessTable),
}));

export const gameGuessRelations = relations(gameGuessTable, ({ one }) => ({
  pokemon: one(pokemonTable, {
    fields: [gameGuessTable.guessed_pokemon_id],
    references: [pokemonTable.id],
  }),
  session: one(gameSessionTable, {
    fields: [gameGuessTable.session_id],
    references: [gameSessionTable.session_id],
  }),
}));

// TypeScript types for the table schemas
export type Pokemon = typeof pokemonTable.$inferSelect;
export type NewPokemon = typeof pokemonTable.$inferInsert;
export type DailyPokemon = typeof dailyPokemonTable.$inferSelect;
export type NewDailyPokemon = typeof dailyPokemonTable.$inferInsert;
export type GameSession = typeof gameSessionTable.$inferSelect;
export type NewGameSession = typeof gameSessionTable.$inferInsert;
export type GameGuess = typeof gameGuessTable.$inferSelect;
export type NewGameGuess = typeof gameGuessTable.$inferInsert;

// Export all tables for proper query building
export const tables = {
  pokemon: pokemonTable,
  dailyPokemon: dailyPokemonTable,
  gameSession: gameSessionTable,
  gameGuess: gameGuessTable,
};
