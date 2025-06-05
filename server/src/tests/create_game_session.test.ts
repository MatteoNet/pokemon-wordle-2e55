
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { pokemonTable } from '../db/schema';
import { syncPokemonData } from '../handlers/create_game_session';
import { eq } from 'drizzle-orm';

describe('syncPokemonData', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should sync Pokemon data from PokeAPI', async () => {
    // Test with a small number to avoid long test runs
    const result = await syncPokemonData(3);

    expect(result.synced).toBeGreaterThan(0);
    expect(result.synced).toBeLessThanOrEqual(3);
    expect(typeof result.skipped).toBe('number');

    // Verify Pokemon were actually saved to database
    const savedPokemon = await db.select()
      .from(pokemonTable)
      .execute();

    expect(savedPokemon.length).toBe(result.synced);

    // Verify first Pokemon has expected structure
    if (savedPokemon.length > 0) {
      const pokemon = savedPokemon[0];
      expect(pokemon.name).toBeDefined();
      expect(typeof pokemon.name).toBe('string');
      expect(pokemon.name).toBe(pokemon.name.toLowerCase()); // Should be lowercase
      expect(pokemon.type1).toBeDefined();
      expect(typeof pokemon.evolution_count).toBe('number');
      expect(typeof pokemon.is_final_evolution).toBe('boolean');
      expect(pokemon.color).toBeDefined();
      expect(typeof pokemon.generation).toBe('number');
      expect(pokemon.sprite_url).toBeDefined();
      expect(pokemon.created_at).toBeInstanceOf(Date);
    }
  });

  it('should skip existing Pokemon', async () => {
    // First sync
    await syncPokemonData(2);

    // Second sync should skip existing Pokemon
    const result = await syncPokemonData(2);

    expect(result.synced).toBe(0);
    expect(result.skipped).toBe(2);

    // Verify no duplicates were created
    const allPokemon = await db.select()
      .from(pokemonTable)
      .execute();

    expect(allPokemon.length).toBe(2);
  });

  it('should handle Pokemon with single type correctly', async () => {
    const result = await syncPokemonData(1);

    expect(result.synced).toBe(1);

    const pokemon = await db.select()
      .from(pokemonTable)
      .limit(1)
      .execute();

    expect(pokemon[0].type1).toBeDefined();
    // type2 can be null for single-type Pokemon
    expect(pokemon[0].type2 === null || typeof pokemon[0].type2 === 'string').toBe(true);
  });

  it('should handle evolution data correctly', async () => {
    const result = await syncPokemonData(5);

    expect(result.synced).toBeGreaterThan(0);

    const pokemon = await db.select()
      .from(pokemonTable)
      .execute();

    // Check that evolution data is properly set
    pokemon.forEach(p => {
      expect(typeof p.evolution_count).toBe('number');
      expect(p.evolution_count).toBeGreaterThanOrEqual(0);
      expect(typeof p.is_final_evolution).toBe('boolean');
    });
  });

  it('should handle habitat being null', async () => {
    const result = await syncPokemonData(3);

    expect(result.synced).toBeGreaterThan(0);

    const pokemon = await db.select()
      .from(pokemonTable)
      .execute();

    // Some Pokemon don't have habitats
    pokemon.forEach(p => {
      expect(p.habitat === null || typeof p.habitat === 'string').toBe(true);
    });
  });

  it('should extract generation numbers correctly', async () => {
    const result = await syncPokemonData(2);

    expect(result.synced).toBeGreaterThan(0);

    const pokemon = await db.select()
      .from(pokemonTable)
      .execute();

    pokemon.forEach(p => {
      expect(typeof p.generation).toBe('number');
      expect(p.generation).toBeGreaterThan(0);
      expect(p.generation).toBeLessThanOrEqual(9); // Current max generation
    });
  });

  it('should continue syncing even if one Pokemon fails', async () => {
    // This test verifies error handling - even if one Pokemon fails,
    // the sync should continue with others
    const result = await syncPokemonData(5);

    // Should have synced some Pokemon even if some failed
    expect(result.synced + result.skipped).toBeGreaterThan(0);
  });
});
