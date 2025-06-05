
import { db } from '../db';
import { pokemonTable } from '../db/schema';
import { eq } from 'drizzle-orm';

// Types for PokeAPI responses
interface PokeAPIListResponse {
  results: Array<{
    name: string;
    url: string;
  }>;
}

interface PokeAPIPokemon {
  id: number;
  name: string;
  types: Array<{
    type: {
      name: string;
    };
  }>;
  sprites: {
    front_default: string | null;
  };
  species: {
    url: string;
  };
}

interface PokeAPISpecies {
  id: number;
  color: {
    name: string;
  };
  habitat: {
    name: string;
  } | null;
  generation: {
    name: string;
  };
  evolution_chain: {
    url: string;
  };
}

interface PokeAPIEvolutionChain {
  chain: {
    evolves_to: Array<{
      evolves_to: Array<any>;
    }>;
  };
}

// Helper function to extract generation number from generation name
const extractGenerationNumber = (generationName: string): number => {
  const match = generationName.match(/generation-(\w+)/);
  if (!match) return 1;
  
  const romanNumerals: { [key: string]: number } = {
    'i': 1, 'ii': 2, 'iii': 3, 'iv': 4, 'v': 5,
    'vi': 6, 'vii': 7, 'viii': 8, 'ix': 9
  };
  
  return romanNumerals[match[1]] || 1;
};

// Helper function to calculate evolution count and final evolution status
const calculateEvolutionData = (evolutionChain: PokeAPIEvolutionChain, pokemonId: number): { evolution_count: number; is_final_evolution: boolean } => {
  let currentChain = evolutionChain.chain;
  let evolutionCount = 0;
  let isTargetPokemon = false;
  let hasMoreEvolutions = false;

  // Traverse the evolution chain to find our Pokemon and count evolutions
  const traverseChain = (chain: any, depth: number): void => {
    // Extract Pokemon ID from species URL
    const speciesUrl = chain.species?.url || '';
    const chainPokemonId = parseInt(speciesUrl.split('/').slice(-2, -1)[0]) || 0;
    
    if (chainPokemonId === pokemonId) {
      evolutionCount = depth;
      isTargetPokemon = true;
      hasMoreEvolutions = chain.evolves_to && chain.evolves_to.length > 0;
    }
    
    if (chain.evolves_to) {
      for (const evolution of chain.evolves_to) {
        traverseChain(evolution, depth + 1);
      }
    }
  };

  traverseChain(currentChain, 0);

  return {
    evolution_count: evolutionCount,
    is_final_evolution: isTargetPokemon ? !hasMoreEvolutions : false
  };
};

// Helper function to make API requests with error handling
const fetchWithRetry = async (url: string, retries = 3): Promise<any> => {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      if (i === retries - 1) throw error;
      // Wait before retry (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
    }
  }
};

export const syncPokemonData = async (limit = 151): Promise<{ synced: number; skipped: number }> => {
  try {
    let synced = 0;
    let skipped = 0;

    console.log(`Starting Pokemon data sync for ${limit} Pokemon...`);

    // Fetch list of Pokemon
    const pokemonListResponse: PokeAPIListResponse = await fetchWithRetry(
      `https://pokeapi.co/api/v2/pokemon?limit=${limit}`
    );

    for (const pokemonRef of pokemonListResponse.results) {
      try {
        // Check if Pokemon already exists
        const existingPokemon = await db.select()
          .from(pokemonTable)
          .where(eq(pokemonTable.name, pokemonRef.name.toLowerCase()))
          .limit(1)
          .execute();

        if (existingPokemon.length > 0) {
          skipped++;
          continue;
        }

        // Fetch detailed Pokemon data
        const pokemonData: PokeAPIPokemon = await fetchWithRetry(pokemonRef.url);

        // Fetch species data
        const speciesData: PokeAPISpecies = await fetchWithRetry(pokemonData.species.url);

        // Fetch evolution chain data
        const evolutionChainResponse: PokeAPIEvolutionChain = await fetchWithRetry(
          speciesData.evolution_chain.url
        );

        // Calculate evolution data
        const evolutionData = calculateEvolutionData(evolutionChainResponse, pokemonData.id);

        // Extract types
        const type1 = pokemonData.types[0]?.type.name || 'normal';
        const type2 = pokemonData.types[1]?.type.name || null;

        // Get sprite URL
        const sprite_url = pokemonData.sprites.front_default || '';

        // Insert Pokemon data
        await db.insert(pokemonTable)
          .values({
            name: pokemonData.name.toLowerCase(), // Ensure lowercase for consistency
            type1,
            type2,
            evolution_count: evolutionData.evolution_count,
            is_final_evolution: evolutionData.is_final_evolution,
            color: speciesData.color.name,
            habitat: speciesData.habitat?.name || null,
            generation: extractGenerationNumber(speciesData.generation.name),
            sprite_url
          })
          .execute();

        synced++;
        console.log(`Synced: ${pokemonData.name} (${synced}/${limit})`);

        // Small delay to be respectful to the API
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error) {
        console.error(`Failed to sync Pokemon ${pokemonRef.name}:`, error);
        // Continue with next Pokemon instead of failing entirely
      }
    }

    console.log(`Pokemon sync completed: ${synced} synced, ${skipped} skipped`);
    return { synced, skipped };

  } catch (error) {
    console.error('Pokemon data sync failed:', error);
    throw error;
  }
};
