
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { pokemonTable, dailyPokemonTable, gameSessionTable, gameGuessTable } from '../db/schema';
import { type GetGameSessionInput } from '../schema';
import { getGameSession } from '../handlers/get_game_session';

// Test data setup
const createTestPokemon = async () => {
  const pokemon1 = await db.insert(pokemonTable)
    .values({
      name: 'pikachu',
      type1: 'electric',
      type2: null,
      evolution_count: 2,
      is_final_evolution: false,
      color: 'yellow',
      habitat: 'forest',
      generation: 1,
      sprite_url: 'https://example.com/pikachu.png'
    })
    .returning()
    .execute();

  const pokemon2 = await db.insert(pokemonTable)
    .values({
      name: 'charizard',
      type1: 'fire',
      type2: 'flying',
      evolution_count: 3,
      is_final_evolution: true,
      color: 'red',
      habitat: 'mountain',
      generation: 1,
      sprite_url: 'https://example.com/charizard.png'
    })
    .returning()
    .execute();

  return { pikachu: pokemon1[0], charizard: pokemon2[0] };
};

const createTestDailyPokemon = async (pokemonId: number) => {
  const dailyPokemon = await db.insert(dailyPokemonTable)
    .values({
      date: '2024-01-01',
      pokemon_id: pokemonId
    })
    .returning()
    .execute();

  return dailyPokemon[0];
};

const createTestGameSession = async (dailyPokemonId: number, sessionId: string = 'test-session-123') => {
  const gameSession = await db.insert(gameSessionTable)
    .values({
      session_id: sessionId,
      daily_pokemon_id: dailyPokemonId,
      max_guesses: 6,
      current_guesses: 0,
      is_completed: false,
      is_won: false
    })
    .returning()
    .execute();

  return gameSession[0];
};

const createTestGuess = async (sessionId: string, pokemonId: number, guessNumber: number, isCorrect: boolean = false) => {
  const guess = await db.insert(gameGuessTable)
    .values({
      session_id: sessionId,
      guess_number: guessNumber,
      guessed_pokemon_id: pokemonId,
      is_correct: isCorrect
    })
    .returning()
    .execute();

  return guess[0];
};

describe('getGameSession', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should return game state for existing session', async () => {
    const pokemon = await createTestPokemon();
    const dailyPokemon = await createTestDailyPokemon(pokemon.pikachu.id);
    const gameSession = await createTestGameSession(dailyPokemon.id);

    const input: GetGameSessionInput = {
      session_id: 'test-session-123'
    };

    const result = await getGameSession(input);

    expect(result.session.id).toEqual(gameSession.id);
    expect(result.session.session_id).toEqual('test-session-123');
    expect(result.session.max_guesses).toEqual(6);
    expect(result.session.current_guesses).toEqual(0);
    expect(result.session.is_completed).toEqual(false);
    expect(result.session.is_won).toEqual(false);
    expect(result.target_pokemon).toBeNull(); // Should be null for incomplete games
    expect(result.guesses).toEqual([]);
    expect(result.can_guess).toEqual(true);
  });

  it('should return game state with guesses and feedback', async () => {
    const pokemon = await createTestPokemon();
    const dailyPokemon = await createTestDailyPokemon(pokemon.pikachu.id);
    const gameSession = await createTestGameSession(dailyPokemon.id);
    
    // Create a guess with charizard (different from target pikachu)
    await createTestGuess('test-session-123', pokemon.charizard.id, 1, false);

    const input: GetGameSessionInput = {
      session_id: 'test-session-123'
    };

    const result = await getGameSession(input);

    expect(result.guesses).toHaveLength(1);
    
    const guess = result.guesses[0];
    expect(guess.guess.guess_number).toEqual(1);
    expect(guess.guess.is_correct).toEqual(false);
    expect(guess.pokemon.name).toEqual('charizard');
    
    // Check feedback (charizard vs pikachu)
    expect(guess.feedback.type1).toEqual('incorrect'); // fire vs electric
    expect(guess.feedback.type2).toEqual('incorrect'); // flying vs null
    expect(guess.feedback.evolution_count).toEqual('lower'); // 3 vs 2 (charizard > pikachu)
    expect(guess.feedback.is_final_evolution).toEqual('incorrect'); // true vs false
    expect(guess.feedback.color).toEqual('incorrect'); // red vs yellow
    expect(guess.feedback.habitat).toEqual('incorrect'); // mountain vs forest
    expect(guess.feedback.generation).toEqual('correct'); // both generation 1
  });

  it('should return completed game with target pokemon revealed', async () => {
    const pokemon = await createTestPokemon();
    const dailyPokemon = await createTestDailyPokemon(pokemon.pikachu.id);
    
    // Create completed game session
    const gameSession = await db.insert(gameSessionTable)
      .values({
        session_id: 'completed-session',
        daily_pokemon_id: dailyPokemon.id,
        max_guesses: 6,
        current_guesses: 1,
        is_completed: true,
        is_won: true
      })
      .returning()
      .execute();

    // Add winning guess
    await createTestGuess('completed-session', pokemon.pikachu.id, 1, true);

    const input: GetGameSessionInput = {
      session_id: 'completed-session'
    };

    const result = await getGameSession(input);

    expect(result.session.is_completed).toEqual(true);
    expect(result.session.is_won).toEqual(true);
    expect(result.target_pokemon).not.toBeNull();
    expect(result.target_pokemon?.name).toEqual('pikachu');
    expect(result.can_guess).toEqual(false);
    
    // Check winning guess feedback (all correct)
    const guess = result.guesses[0];
    expect(guess.feedback.type1).toEqual('correct');
    expect(guess.feedback.type2).toEqual('correct');
    expect(guess.feedback.evolution_count).toEqual('correct');
    expect(guess.feedback.is_final_evolution).toEqual('correct');
    expect(guess.feedback.color).toEqual('correct');
    expect(guess.feedback.habitat).toEqual('correct');
    expect(guess.feedback.generation).toEqual('correct');
  });

  it('should return game state when max guesses reached but not won', async () => {
    const pokemon = await createTestPokemon();
    const dailyPokemon = await createTestDailyPokemon(pokemon.pikachu.id);
    
    // Create game session that hit max guesses
    await db.insert(gameSessionTable)
      .values({
        session_id: 'maxed-session',
        daily_pokemon_id: dailyPokemon.id,
        max_guesses: 2,
        current_guesses: 2,
        is_completed: true,
        is_won: false
      })
      .returning()
      .execute();

    // Add unsuccessful guesses
    await createTestGuess('maxed-session', pokemon.charizard.id, 1, false);
    await createTestGuess('maxed-session', pokemon.charizard.id, 2, false);

    const input: GetGameSessionInput = {
      session_id: 'maxed-session'
    };

    const result = await getGameSession(input);

    expect(result.session.is_completed).toEqual(true);
    expect(result.session.is_won).toEqual(false);
    expect(result.session.current_guesses).toEqual(2);
    expect(result.target_pokemon?.name).toEqual('pikachu'); // Revealed on completion
    expect(result.can_guess).toEqual(false);
    expect(result.guesses).toHaveLength(2);
  });

  it('should sort guesses by guess number', async () => {
    const pokemon = await createTestPokemon();
    const dailyPokemon = await createTestDailyPokemon(pokemon.pikachu.id);
    await createTestGameSession(dailyPokemon.id, 'sort-test');

    // Add guesses in random order
    await createTestGuess('sort-test', pokemon.charizard.id, 3, false);
    await createTestGuess('sort-test', pokemon.charizard.id, 1, false);
    await createTestGuess('sort-test', pokemon.charizard.id, 2, false);

    const input: GetGameSessionInput = {
      session_id: 'sort-test'
    };

    const result = await getGameSession(input);

    expect(result.guesses).toHaveLength(3);
    expect(result.guesses[0].guess.guess_number).toEqual(1);
    expect(result.guesses[1].guess.guess_number).toEqual(2);
    expect(result.guesses[2].guess.guess_number).toEqual(3);
  });

  it('should generate correct feedback for higher/lower comparisons', async () => {
    const pokemon = await createTestPokemon();
    const dailyPokemon = await createTestDailyPokemon(pokemon.pikachu.id); // evolution_count: 2, generation: 1
    await createTestGameSession(dailyPokemon.id, 'feedback-test');

    // Create pokemon with different stats for testing
    const testPokemon = await db.insert(pokemonTable)
      .values({
        name: 'test-pokemon',
        type1: 'water',
        type2: null,
        evolution_count: 1, // Lower than pikachu's 2
        is_final_evolution: true,
        color: 'blue',
        habitat: 'sea',
        generation: 3, // Higher than pikachu's 1
        sprite_url: 'https://example.com/test.png'
      })
      .returning()
      .execute();

    await createTestGuess('feedback-test', testPokemon[0].id, 1, false);

    const input: GetGameSessionInput = {
      session_id: 'feedback-test'
    };

    const result = await getGameSession(input);

    const feedback = result.guesses[0].feedback;
    expect(feedback.evolution_count).toEqual('higher'); // 1 < 2, so target is higher
    expect(feedback.generation).toEqual('lower'); // 3 > 1, so target is lower
  });

  it('should throw error for non-existent session', async () => {
    const input: GetGameSessionInput = {
      session_id: 'non-existent-session'
    };

    await expect(getGameSession(input)).rejects.toThrow(/game session not found/i);
  });

  it('should handle null type2 and habitat correctly in feedback', async () => {
    // Create pokemon with null type2 and habitat
    const pokemon1 = await db.insert(pokemonTable)
      .values({
        name: 'pokemon1',
        type1: 'electric',
        type2: null,
        evolution_count: 1,
        is_final_evolution: true,
        color: 'yellow',
        habitat: null,
        generation: 1,
        sprite_url: 'https://example.com/1.png'
      })
      .returning()
      .execute();

    const pokemon2 = await db.insert(pokemonTable)
      .values({
        name: 'pokemon2',
        type1: 'electric',
        type2: 'flying',
        evolution_count: 1,
        is_final_evolution: true,
        color: 'yellow',
        habitat: 'forest',
        generation: 1,
        sprite_url: 'https://example.com/2.png'
      })
      .returning()
      .execute();

    const dailyPokemon = await createTestDailyPokemon(pokemon1[0].id);
    await createTestGameSession(dailyPokemon.id, 'null-test');
    await createTestGuess('null-test', pokemon2[0].id, 1, false);

    const input: GetGameSessionInput = {
      session_id: 'null-test'
    };

    const result = await getGameSession(input);

    const feedback = result.guesses[0].feedback;
    expect(feedback.type1).toEqual('correct'); // both electric
    expect(feedback.type2).toEqual('incorrect'); // flying vs null
    expect(feedback.habitat).toEqual('incorrect'); // forest vs null
  });
});
