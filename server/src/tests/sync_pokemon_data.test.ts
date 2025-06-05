
import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { pokemonTable } from '../db/schema';
import { syncPokemonData } from '../handlers/sync_pokemon_data';

// Mock data for API responses
const mockPokemonList = {
  count: 2,
  results: [
    { name: 'bulbasaur', url: 'https://pokeapi.co/api/v2/pokemon/1/' },
    { name: 'charmander', url: 'https://pokeapi.co/api/v2/pokemon/4/' }
  ]
};

const mockBulbasaurData = {
  id: 1,
  name: 'bulbasaur',
  types: [
    { type: { name: 'grass' } },
    { type: { name: 'poison' } }
  ],
  species: { url: 'https://pokeapi.co/api/v2/pokemon-species/1/' },
  sprites: { front_default: 'https://example.com/bulbasaur.png' }
};

const mockCharmanderData = {
  id: 4,
  name: 'charmander',
  types: [
    { type: { name: 'fire' } }
  ],
  species: { url: 'https://pokeapi.co/api/v2/pokemon-species/4/' },
  sprites: { front_default: null }
};

const mockBulbasaurSpecies = {
  id: 1,
  name: 'bulbasaur',
  color: { name: 'green' },
  habitat: { name: 'grassland' },
  generation: { name: 'generation-i' },
  evolution_chain: { url: 'https://pokeapi.co/api/v2/evolution-chain/1/' }
};

const mockCharmanderSpecies = {
  id: 4,
  name: 'charmander',
  color: { name: 'red' },
  habitat: null,
  generation: { name: 'generation-i' },
  evolution_chain: { url: 'https://pokeapi.co/api/v2/evolution-chain/2/' }
};

const mockBulbasaurEvolution = {
  chain: {
    species: { name: 'bulbasaur' },
    evolves_to: [{
      species: { name: 'ivysaur' },
      evolves_to: [{
        species: { name: 'venusaur' },
        evolves_to: []
      }]
    }]
  }
};

const mockCharmanderEvolution = {
  chain: {
    species: { name: 'charmander' },
    evolves_to: [{
      species: { name: 'charmeleon' },
      evolves_to: [{
        species: { name: 'charizard' },
        evolves_to: []
      }]
    }]
  }
};

describe('syncPokemonData', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should sync Pokemon data from API', async () => {
    // Mock fetch responses
    const fetchMock = mock((url: string) => {
      if (url.includes('pokemon?limit=')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockPokemonList)
        });
      }
      if (url.includes('pokemon/1/')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockBulbasaurData)
        });
      }
      if (url.includes('pokemon/4/')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockCharmanderData)
        });
      }
      if (url.includes('pokemon-species/1/')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockBulbasaurSpecies)
        });
      }
      if (url.includes('pokemon-species/4/')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockCharmanderSpecies)
        });
      }
      if (url.includes('evolution-chain/1/')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockBulbasaurEvolution)
        });
      }
      if (url.includes('evolution-chain/2/')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockCharmanderEvolution)
        });
      }
      return Promise.reject(new Error('Unknown URL'));
    });

    // Replace global fetch with mock
    global.fetch = fetchMock as any;

    const result = await syncPokemonData(2);

    expect(result.synced).toBe(2);
    expect(result.message).toContain('Successfully synced 2');

    // Verify Pokemon were inserted correctly
    const pokemon = await db.select().from(pokemonTable).execute();
    expect(pokemon).toHaveLength(2);

    // Check Bulbasaur data
    const bulbasaur = pokemon.find(p => p.name === 'bulbasaur');
    expect(bulbasaur).toBeDefined();
    expect(bulbasaur!.type1).toBe('grass');
    expect(bulbasaur!.type2).toBe('poison');
    expect(bulbasaur!.evolution_count).toBe(0);
    expect(bulbasaur!.is_final_evolution).toBe(false);
    expect(bulbasaur!.color).toBe('green');
    expect(bulbasaur!.habitat).toBe('grassland');
    expect(bulbasaur!.generation).toBe(1);
    expect(bulbasaur!.sprite_url).toBe('https://example.com/bulbasaur.png');

    // Check Charmander data
    const charmander = pokemon.find(p => p.name === 'charmander');
    expect(charmander).toBeDefined();
    expect(charmander!.type1).toBe('fire');
    expect(charmander!.type2).toBeNull();
    expect(charmander!.evolution_count).toBe(0);
    expect(charmander!.is_final_evolution).toBe(false);
    expect(charmander!.color).toBe('red');
    expect(charmander!.habitat).toBeNull();
    expect(charmander!.generation).toBe(1);
    expect(charmander!.sprite_url).toBe('https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/4.png');
  });

  it('should skip existing Pokemon', async () => {
    // Insert existing Pokemon
    await db.insert(pokemonTable)
      .values({
        name: 'bulbasaur',
        type1: 'grass',
        type2: 'poison',
        evolution_count: 0,
        is_final_evolution: false,
        color: 'green',
        habitat: 'grassland',
        generation: 1,
        sprite_url: 'https://example.com/existing.png'
      })
      .execute();

    // Mock fetch responses - only Charmander should be processed
    const fetchMock = mock((url: string) => {
      if (url.includes('pokemon?limit=')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockPokemonList)
        });
      }
      if (url.includes('pokemon/4/')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockCharmanderData)
        });
      }
      if (url.includes('pokemon-species/4/')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockCharmanderSpecies)
        });
      }
      if (url.includes('evolution-chain/2/')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockCharmanderEvolution)
        });
      }
      return Promise.reject(new Error('Unexpected API call'));
    });

    global.fetch = fetchMock as any;

    const result = await syncPokemonData(2);

    expect(result.synced).toBe(1);
    expect(result.message).toContain('Successfully synced 1');

    // Should still have 2 Pokemon (1 existing + 1 new)
    const pokemon = await db.select().from(pokemonTable).execute();
    expect(pokemon).toHaveLength(2);
  });

  it('should handle API errors gracefully', async () => {
    const fetchMock = mock((url: string) => {
      if (url.includes('pokemon?limit=')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            count: 1,
            results: [{ name: 'error-pokemon', url: 'https://pokeapi.co/api/v2/pokemon/999/' }]
          })
        });
      }
      // Simulate API error for Pokemon details
      return Promise.resolve({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      });
    });

    global.fetch = fetchMock as any;

    const result = await syncPokemonData(1);

    expect(result.synced).toBe(0);
    expect(result.message).toContain('Successfully synced 0');

    // No Pokemon should be inserted due to error
    const pokemon = await db.select().from(pokemonTable).execute();
    expect(pokemon).toHaveLength(0);
  });
});
