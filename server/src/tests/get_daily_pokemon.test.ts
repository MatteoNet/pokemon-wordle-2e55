
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { pokemonTable, dailyPokemonTable } from '../db/schema';
import { type GetDailyPokemonInput } from '../schema';
import { getDailyPokemon, syncPokemonData } from '../handlers/get_daily_pokemon';
import { eq } from 'drizzle-orm';

// Test data
const testPokemon = {
  name: 'pikachu',
  type1: 'electric',
  type2: null,
  evolution_count: 1,
  is_final_evolution: false,
  color: 'yellow',
  habitat: 'forest',
  generation: 1,
  sprite_url: 'https://example.com/pikachu.png'
};

const createTestPokemon = async () => {
  const result = await db.insert(pokemonTable)
    .values(testPokemon)
    .returning()
    .execute();
  return result[0];
};

const createTestDailyPokemon = async (pokemonId: number, date: string) => {
  const result = await db.insert(dailyPokemonTable)
    .values({
      date: date,
      pokemon_id: pokemonId
    })
    .returning()
    .execute();
  return result[0];
};

describe('getDailyPokemon', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should get daily pokemon for today by default', async () => {
    // Create test data
    const pokemon = await createTestPokemon();
    const today = new Date().toISOString().split('T')[0];
    await createTestDailyPokemon(pokemon.id, today);

    const result = await getDailyPokemon();

    expect(result.id).toEqual(pokemon.id);
    expect(result.name).toEqual('pikachu');
    expect(result.type1).toEqual('electric');
    expect(result.type2).toBeNull();
    expect(result.evolution_count).toEqual(1);
    expect(result.is_final_evolution).toEqual(false);
    expect(result.color).toEqual('yellow');
    expect(result.habitat).toEqual('forest');
    expect(result.generation).toEqual(1);
    expect(result.sprite_url).toEqual('https://example.com/pikachu.png');
    expect(result.created_at).toBeInstanceOf(Date);
  });

  it('should get daily pokemon for specific date', async () => {
    // Create test data
    const pokemon = await createTestPokemon();
    const testDate = '2024-01-15';
    await createTestDailyPokemon(pokemon.id, testDate);

    const input: GetDailyPokemonInput = {
      date: testDate
    };

    const result = await getDailyPokemon(input);

    expect(result.id).toEqual(pokemon.id);
    expect(result.name).toEqual('pikachu');
  });

  it('should throw error when no daily pokemon found', async () => {
    const input: GetDailyPokemonInput = {
      date: '2024-01-01'
    };

    await expect(getDailyPokemon(input)).rejects.toThrow(/No daily Pokemon found for date/i);
  });

  it('should handle pokemon with dual types', async () => {
    // Create pokemon with dual types
    const dualTypePokemon = {
      ...testPokemon,
      name: 'charizard',
      type1: 'fire',
      type2: 'flying',
      evolution_count: 2,
      is_final_evolution: true,
      color: 'red',
      habitat: 'mountain'
    };

    const pokemon = await db.insert(pokemonTable)
      .values(dualTypePokemon)
      .returning()
      .execute();

    const today = new Date().toISOString().split('T')[0];
    await createTestDailyPokemon(pokemon[0].id, today);

    const result = await getDailyPokemon();

    expect(result.type1).toEqual('fire');
    expect(result.type2).toEqual('flying');
    expect(result.is_final_evolution).toEqual(true);
  });

  it('should handle pokemon with null habitat', async () => {
    // Create pokemon with null habitat
    const pokemonWithNullHabitat = {
      ...testPokemon,
      name: 'magnemite',
      habitat: null
    };

    const pokemon = await db.insert(pokemonTable)
      .values(pokemonWithNullHabitat)
      .returning()
      .execute();

    const today = new Date().toISOString().split('T')[0];
    await createTestDailyPokemon(pokemon[0].id, today);

    const result = await getDailyPokemon();

    expect(result.habitat).toBeNull();
  });
});

describe('syncPokemonData', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should not insert duplicate pokemon', async () => {
    // Create existing pokemon
    await createTestPokemon();

    // Mock fetch properly for Bun
    const originalFetch = globalThis.fetch;
    const mockFetch = async (url: string) => {
      if (url.includes('pokemon?limit=151')) {
        return new Response(JSON.stringify({
          results: [{ name: 'pikachu', url: 'https://pokeapi.co/api/v2/pokemon/pikachu' }]
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      throw new Error('Unexpected URL in test');
    };

    // Add the preconnect property to satisfy Bun's fetch interface
    (mockFetch as any).preconnect = () => {};
    globalThis.fetch = mockFetch as any;

    try {
      // This should not throw and should skip the existing pokemon
      await syncPokemonData();

      // Verify only one pokemon exists
      const allPokemon = await db.select().from(pokemonTable).execute();
      expect(allPokemon).toHaveLength(1);
      expect(allPokemon[0].name).toEqual('pikachu');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('should handle API errors gracefully', async () => {
    // Mock fetch to simulate API failure
    const originalFetch = globalThis.fetch;
    const mockFetch = async () => {
      throw new Error('API unavailable');
    };

    // Add the preconnect property to satisfy Bun's fetch interface
    (mockFetch as any).preconnect = () => {};
    globalThis.fetch = mockFetch as any;

    try {
      await expect(syncPokemonData()).rejects.toThrow(/API unavailable/i);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
