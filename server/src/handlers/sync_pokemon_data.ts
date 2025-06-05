
import { db } from '../db';
import { pokemonTable } from '../db/schema';
import { eq } from 'drizzle-orm';

interface PokeAPIListResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: {
    name: string;
    url: string;
  }[];
}

interface PokeAPIPokemon {
  id: number;
  name: string;
  types: {
    type: {
      name: string;
    };
  }[];
  species: {
    url: string;
  };
  sprites: {
    front_default: string | null;
  };
}

interface PokeAPISpecies {
  id: number;
  name: string;
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
    species: {
      name: string;
    };
    evolves_to: Array<{
      species: {
        name: string;
      };
      evolves_to: Array<{
        species: {
          name: string;
        };
        evolves_to: any[];
      }>;
    }>;
  };
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const fetchWithRetry = async (url: string, retries = 3): Promise<Response> => {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return response;
      }
      if (response.status === 429) {
        // Rate limited, wait longer
        await delay(2000 * (i + 1));
        continue;
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    } catch (error) {
      if (i === retries - 1) throw error;
      await delay(1000 * (i + 1));
    }
  }
  throw new Error('Max retries exceeded');
};

const getEvolutionInfo = (chain: PokeAPIEvolutionChain['chain'], targetName: string): { count: number; isFinal: boolean } => {
  const findInChain = (node: typeof chain, depth = 0): { count: number; isFinal: boolean } | null => {
    if (node.species.name === targetName) {
      const hasEvolutions = node.evolves_to.length > 0;
      return { count: depth, isFinal: !hasEvolutions };
    }
    
    for (const evolution of node.evolves_to) {
      const result = findInChain(evolution, depth + 1);
      if (result) return result;
    }
    
    return null;
  };

  const result = findInChain(chain);
  return result || { count: 0, isFinal: true };
};

const extractGenerationNumber = (generationName: string): number => {
  const match = generationName.match(/generation-(\w+)/);
  if (!match) return 1;
  
  const romanNumerals: { [key: string]: number } = {
    'i': 1, 'ii': 2, 'iii': 3, 'iv': 4, 'v': 5,
    'vi': 6, 'vii': 7, 'viii': 8, 'ix': 9
  };
  
  return romanNumerals[match[1]] || 1;
};

export const syncPokemonData = async (limit = 151): Promise<{ synced: number; message: string }> => {
  try {
    console.log(`Starting Pokemon data sync (limit: ${limit})`);
    
    // Fetch list of Pokemon
    const listResponse = await fetchWithRetry(`https://pokeapi.co/api/v2/pokemon?limit=${limit}`);
    const listData = await listResponse.json() as PokeAPIListResponse;
    
    console.log(`Found ${listData.results.length} Pokemon to process`);
    
    let syncedCount = 0;
    let processedCount = 0;

    for (const pokemonRef of listData.results) {
      try {
        processedCount++;
        console.log(`Processing ${processedCount}/${listData.results.length}: ${pokemonRef.name}`);
        
        // Check if Pokemon already exists
        const existingPokemon = await db.select()
          .from(pokemonTable)
          .where(eq(pokemonTable.name, pokemonRef.name.toLowerCase()))
          .execute();

        if (existingPokemon.length > 0) {
          console.log(`${pokemonRef.name} already exists, skipping`);
          continue;
        }

        // Fetch Pokemon details
        const pokemonResponse = await fetchWithRetry(pokemonRef.url);
        const pokemonData = await pokemonResponse.json() as PokeAPIPokemon;
        
        // Add delay between requests to be respectful to the API
        await delay(100);

        // Fetch species data
        const speciesResponse = await fetchWithRetry(pokemonData.species.url);
        const speciesData = await speciesResponse.json() as PokeAPISpecies;
        
        await delay(100);

        // Fetch evolution chain data
        const evolutionResponse = await fetchWithRetry(speciesData.evolution_chain.url);
        const evolutionData = await evolutionResponse.json() as PokeAPIEvolutionChain;
        
        await delay(100);

        // Extract evolution info
        const evolutionInfo = getEvolutionInfo(evolutionData.chain, pokemonData.name);

        // Extract types
        const type1 = pokemonData.types[0]?.type.name || 'normal';
        const type2 = pokemonData.types[1]?.type.name || null;

        // Extract sprite URL
        const spriteUrl = pokemonData.sprites.front_default || 
          `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${pokemonData.id}.png`;

        // Extract generation number
        const generation = extractGenerationNumber(speciesData.generation.name);

        // Insert Pokemon
        await db.insert(pokemonTable)
          .values({
            name: pokemonData.name.toLowerCase(),
            type1,
            type2,
            evolution_count: evolutionInfo.count,
            is_final_evolution: evolutionInfo.isFinal,
            color: speciesData.color.name,
            habitat: speciesData.habitat?.name || null,
            generation,
            sprite_url: spriteUrl
          })
          .execute();

        syncedCount++;
        console.log(`Successfully synced ${pokemonData.name}`);

      } catch (error) {
        console.error(`Failed to sync ${pokemonRef.name}:`, error);
        // Continue with next Pokemon instead of failing entirely
        continue;
      }
    }

    const message = `Successfully synced ${syncedCount} out of ${processedCount} Pokemon`;
    console.log(message);
    
    return {
      synced: syncedCount,
      message
    };
  } catch (error) {
    console.error('Pokemon data sync failed:', error);
    throw error;
  }
};
