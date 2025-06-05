
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { createDB, resetDB } from '../helpers';
import { db } from '../db';
import { pokemonTable, dailyPokemonTable, gameSessionTable, gameGuessTable } from '../db/schema';
import { makeGuess } from '../handlers/make_guess';
import { type MakeGuessInput } from '../schema';
import { eq } from 'drizzle-orm';

describe('makeGuess', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  // Test data setup
  let targetPokemon: any;
  let guessPokemon: any;
  let dailyPokemon: any;
  let gameSession: any;

  const setupTestData = async () => {
    // Create target Pokemon
    const targetResult = await db.insert(pokemonTable)
      .values({
        name: 'pikachu',
        type1: 'electric',
        type2: null,
        evolution_count: 1,
        is_final_evolution: false,
        color: 'yellow',
        habitat: 'forest',
        generation: 1,
        sprite_url: 'https://example.com/pikachu.png'
      })
      .returning()
      .execute();
    targetPokemon = targetResult[0];

    // Create guess Pokemon
    const guessResult = await db.insert(pokemonTable)
      .values({
        name: 'charmander',
        type1: 'fire',
        type2: null,
        evolution_count: 2,
        is_final_evolution: false,
        color: 'red',
        habitat: 'mountain',
        generation: 1,
        sprite_url: 'https://example.com/charmander.png'
      })
      .returning()
      .execute();
    guessPokemon = guessResult[0];

    // Create daily Pokemon
    const dailyResult = await db.insert(dailyPokemonTable)
      .values({
        date: '2024-01-01',
        pokemon_id: targetPokemon.id
      })
      .returning()
      .execute();
    dailyPokemon = dailyResult[0];

    // Create game session
    const sessionResult = await db.insert(gameSessionTable)
      .values({
        session_id: 'test-session-123',
        daily_pokemon_id: dailyPokemon.id,
        max_guesses: 6,
        current_guesses: 0,
        is_completed: false,
        is_won: false
      })
      .returning()
      .execute();
    gameSession = sessionResult[0];
  };

  it('should make a successful guess and return game state', async () => {
    await setupTestData();

    const input: MakeGuessInput = {
      session_id: 'test-session-123',
      pokemon_name: 'charmander'
    };

    const result = await makeGuess(input);

    // Verify game state structure
    expect(result.session).toBeDefined();
    expect(result.session.current_guesses).toBe(1);
    expect(result.session.is_completed).toBe(false);
    expect(result.session.is_won).toBe(false);
    expect(result.target_pokemon).toBeNull(); // Should be null when game not completed
    expect(result.guesses).toHaveLength(1);
    expect(result.can_guess).toBe(true);

    // Verify guess data
    const guess = result.guesses[0];
    expect(guess.guess.session_id).toBe('test-session-123');
    expect(guess.guess.guess_number).toBe(1);
    expect(guess.guess.is_correct).toBe(false);
    expect(guess.pokemon.name).toBe('charmander');

    // Verify feedback
    expect(guess.feedback.type1).toBe('incorrect'); // fire vs electric
    expect(guess.feedback.evolution_count).toBe('lower'); // 2 vs 1 (charmander has higher evolution count)
    expect(guess.feedback.generation).toBe('correct'); // both generation 1
    expect(guess.feedback.color).toBe('incorrect'); // red vs yellow
  });

  it('should handle correct guess and complete game', async () => {
    await setupTestData();

    const input: MakeGuessInput = {
      session_id: 'test-session-123',
      pokemon_name: 'pikachu'
    };

    const result = await makeGuess(input);

    // Verify game completion
    expect(result.session.current_guesses).toBe(1);
    expect(result.session.is_completed).toBe(true);
    expect(result.session.is_won).toBe(true);
    expect(result.session.completed_at).toBeInstanceOf(Date);
    expect(result.target_pokemon).toBeDefined(); // Should show target when completed
    expect(result.can_guess).toBe(false);

    // Verify correct guess
    const guess = result.guesses[0];
    expect(guess.guess.is_correct).toBe(true);
    expect(guess.pokemon.name).toBe('pikachu');

    // All feedback should be correct
    expect(guess.feedback.type1).toBe('correct');
    expect(guess.feedback.evolution_count).toBe('correct');
    expect(guess.feedback.generation).toBe('correct');
    expect(guess.feedback.color).toBe('correct');
  });

  it('should complete game when max guesses reached', async () => {
    await setupTestData();

    // Update session to have 5 current guesses (max is 6)
    await db.update(gameSessionTable)
      .set({ current_guesses: 5 })
      .where(eq(gameSessionTable.session_id, 'test-session-123'))
      .execute();

    const input: MakeGuessInput = {
      session_id: 'test-session-123',
      pokemon_name: 'charmander'
    };

    const result = await makeGuess(input);

    // Verify game completion due to max guesses
    expect(result.session.current_guesses).toBe(6);
    expect(result.session.is_completed).toBe(true);
    expect(result.session.is_won).toBe(false);
    expect(result.target_pokemon).toBeDefined(); // Should show target when completed
    expect(result.can_guess).toBe(false);
  });

  it('should save guess to database', async () => {
    await setupTestData();

    const input: MakeGuessInput = {
      session_id: 'test-session-123',
      pokemon_name: 'charmander'
    };

    await makeGuess(input);

    // Verify guess was saved
    const guesses = await db.select()
      .from(gameGuessTable)
      .where(eq(gameGuessTable.session_id, 'test-session-123'))
      .execute();

    expect(guesses).toHaveLength(1);
    expect(guesses[0].guess_number).toBe(1);
    expect(guesses[0].guessed_pokemon_id).toBe(guessPokemon.id);
    expect(guesses[0].is_correct).toBe(false);
  });

  it('should throw error for non-existent session', async () => {
    const input: MakeGuessInput = {
      session_id: 'non-existent-session',
      pokemon_name: 'pikachu'
    };

    expect(makeGuess(input)).rejects.toThrow(/session not found/i);
  });

  it('should throw error for non-existent pokemon', async () => {
    await setupTestData();

    const input: MakeGuessInput = {
      session_id: 'test-session-123',
      pokemon_name: 'non-existent-pokemon'
    };

    expect(makeGuess(input)).rejects.toThrow(/pokemon not found/i);
  });

  it('should throw error for already completed game', async () => {
    await setupTestData();

    // Mark session as completed
    await db.update(gameSessionTable)
      .set({ is_completed: true })
      .where(eq(gameSessionTable.session_id, 'test-session-123'))
      .execute();

    const input: MakeGuessInput = {
      session_id: 'test-session-123',
      pokemon_name: 'charmander'
    };

    expect(makeGuess(input)).rejects.toThrow(/already completed/i);
  });

  it('should throw error when max guesses exceeded', async () => {
    await setupTestData();

    // Set current guesses to max
    await db.update(gameSessionTable)
      .set({ current_guesses: 6 })
      .where(eq(gameSessionTable.session_id, 'test-session-123'))
      .execute();

    const input: MakeGuessInput = {
      session_id: 'test-session-123',
      pokemon_name: 'charmander'
    };

    expect(makeGuess(input)).rejects.toThrow(/maximum guesses/i);
  });
});
