
import { z } from 'zod';

// Pokemon schema
export const pokemonSchema = z.object({
  id: z.number(),
  name: z.string(),
  type1: z.string(),
  type2: z.string().nullable(),
  evolution_count: z.number().int().nonnegative(),
  is_final_evolution: z.boolean(),
  color: z.string(),
  habitat: z.string().nullable(),
  generation: z.number().int().positive(),
  sprite_url: z.string(),
  created_at: z.coerce.date()
});

export type Pokemon = z.infer<typeof pokemonSchema>;

// Daily Pokemon schema
export const dailyPokemonSchema = z.object({
  id: z.number(),
  date: z.coerce.date(),
  pokemon_id: z.number(),
  created_at: z.coerce.date()
});

export type DailyPokemon = z.infer<typeof dailyPokemonSchema>;

// Game guess schema
export const gameGuessSchema = z.object({
  id: z.number(),
  session_id: z.string(),
  guess_number: z.number().int().positive(),
  guessed_pokemon_id: z.number(),
  is_correct: z.boolean(),
  created_at: z.coerce.date()
});

export type GameGuess = z.infer<typeof gameGuessSchema>;

// Game session schema
export const gameSessionSchema = z.object({
  id: z.number(),
  session_id: z.string(),
  daily_pokemon_id: z.number(),
  max_guesses: z.number().int().positive(),
  current_guesses: z.number().int().nonnegative(),
  is_completed: z.boolean(),
  is_won: z.boolean(),
  created_at: z.coerce.date(),
  completed_at: z.coerce.date().nullable()
});

export type GameSession = z.infer<typeof gameSessionSchema>;

// Input schemas
export const createGameSessionInputSchema = z.object({
  session_id: z.string().min(1),
  max_guesses: z.number().int().positive().default(6)
});

export type CreateGameSessionInput = z.infer<typeof createGameSessionInputSchema>;

export const makeGuessInputSchema = z.object({
  session_id: z.string().min(1),
  pokemon_name: z.string().min(1)
});

export type MakeGuessInput = z.infer<typeof makeGuessInputSchema>;

export const getDailyPokemonInputSchema = z.object({
  date: z.string().optional() // YYYY-MM-DD format
});

export type GetDailyPokemonInput = z.infer<typeof getDailyPokemonInputSchema>;

export const getGameSessionInputSchema = z.object({
  session_id: z.string().min(1)
});

export type GetGameSessionInput = z.infer<typeof getGameSessionInputSchema>;

// Guess feedback schema
export const guessFeedbackSchema = z.object({
  type1: z.enum(['correct', 'incorrect']),
  type2: z.enum(['correct', 'incorrect']),
  evolution_count: z.enum(['correct', 'higher', 'lower']),
  is_final_evolution: z.enum(['correct', 'incorrect']),
  color: z.enum(['correct', 'incorrect']),
  habitat: z.enum(['correct', 'incorrect']),
  generation: z.enum(['correct', 'higher', 'lower'])
});

export type GuessFeedback = z.infer<typeof guessFeedbackSchema>;

// Game state response schema
export const gameStateSchema = z.object({
  session: gameSessionSchema,
  target_pokemon: pokemonSchema.nullable(),
  guesses: z.array(z.object({
    guess: gameGuessSchema,
    pokemon: pokemonSchema,
    feedback: guessFeedbackSchema
  })),
  can_guess: z.boolean()
});

export type GameState = z.infer<typeof gameStateSchema>;
