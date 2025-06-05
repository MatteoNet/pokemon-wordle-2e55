
import { db } from '../db';
import { pokemonTable } from '../db/schema';
import { type Pokemon } from '../schema';
import { eq } from 'drizzle-orm';

// PokeAPI interfaces
interface PokeAPIListResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: Array<{
    name: string;
    url: string;
  }>;
}

interface PokeAPIPokemon {
  id: number;
  name: string;
  types: Array<{
    slot: number;
    type: {
      name: string;
      url: string;
    };
  }>;
  sprites: {
    front_default: string | null;
    other?: {
      'official-artwork'?: {
        front_default?: string | null;
      };
    };
  };
  species: {
    name: string;
    url: string;
  };
}

interface PokeAPISpecies {
  id: number;
  name: string;
  color: {
    name: string;
    url: string;
  };
  habitat: {
    name: string;
    url: string;
  } | null;
  generation: {
    name: string;
    url: string;
  };
  evolution_chain: {
    url: string;
  };
}

interface PokeAPIEvolutionChain {
  id: number;
  chain: EvolutionChainNode;
}

interface EvolutionChainNode {
  is_baby: boolean;
  species: {
    name: string;
    url: string;
  };
  evolves_to: EvolutionChainNode[];
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const fetchWithRetry = async (url: string, retries = 3): Promise<any> => {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      if (i === retries - 1) throw error;
      await delay(1000 * (i + 1)); // Exponential backoff
    }
  }
};

const getEvolutionCount = (chain: EvolutionChainNode, targetName: string): number => {
  // Helper function to find the position of a Pokemon in the evolution chain
  const findPokemonPosition = (node: EvolutionChainNode, target: string, depth: number = 0): number => {
    if (node.species.name.toLowerCase() === target.toLowerCase()) {
      return depth;
    }
    
    for (const evolution of node.evolves_to) {
      const result = findPokemonPosition(evolution, target, depth + 1);
      if (result !== -1) {
        return result;
      }
    }
    
    return -1;
  };
  
  const position = findPokemonPosition(chain, targetName);
  return position === -1 ? 0 : position;
};

const isFinalEvolution = (chain: EvolutionChainNode, targetName: string): boolean => {
  const findInChain = (node: EvolutionChainNode): boolean => {
    if (node.species.name.toLowerCase() === targetName.toLowerCase()) {
      return node.evolves_to.length === 0;
    }
    
    for (const evolution of node.evolves_to) {
      const result = findInChain(evolution);
      if (result !== false) return result;
    }
    
    return false;
  };
  
  return findInChain(chain);
};

const getGenerationNumber = (generationName: string): number => {
  const match = generationName.match(/generation-(\w+)/);
  if (!match) return 1;
  
  const romanNumerals: { [key: string]: number } = {
    'i': 1, 'ii': 2, 'iii': 3, 'iv': 4, 'v': 5,
    'vi': 6, 'vii': 7, 'viii': 8, 'ix': 9
  };
  
  return romanNumerals[match[1]] || 1;
};

export const syncPokemonData = async (): Promise<void> => {
  try {
    console.log('Starting Pokemon data sync from PokeAPI...');
    
    // Fetch list of all Pokemon (limit to first 151 for initial implementation)
    const listResponse: PokeAPIListResponse = await fetchWithRetry(
      'https://pokeapi.co/api/v2/pokemon?limit=151'
    );
    
    console.log(`Found ${listResponse.results.length} Pokemon to sync`);
    
    for (const [index, pokemonRef] of listResponse.results.entries()) {
      try {
        console.log(`Processing ${pokemonRef.name} (${index + 1}/${listResponse.results.length})`);
        
        // Check if Pokemon already exists
        const existingPokemon = await db.select()
          .from(pokemonTable)
          .where(eq(pokemonTable.name, pokemonRef.name.toLowerCase()))
          .execute();
        
        if (existingPokemon.length > 0) {
          console.log(`${pokemonRef.name} already exists, skipping`);
          continue;
        }
        
        // Fetch detailed Pokemon data
        const pokemonData: PokeAPIPokemon = await fetchWithRetry(pokemonRef.url);
        await delay(100); // Rate limiting
        
        // Fetch species data
        const speciesData: PokeAPISpecies = await fetchWithRetry(pokemonData.species.url);
        await delay(100); // Rate limiting
        
        // Fetch evolution chain data
        const evolutionChainData: PokeAPIEvolutionChain = await fetchWithRetry(
          speciesData.evolution_chain.url
        );
        await delay(100); // Rate limiting
        
        // Extract types
        const type1 = pokemonData.types.find(t => t.slot === 1)?.type.name || '';
        const type2 = pokemonData.types.find(t => t.slot === 2)?.type.name || null;
        
        // Extract sprite URL
        const spriteUrl = pokemonData.sprites.other?.['official-artwork']?.front_default ||
                         pokemonData.sprites.front_default ||
                         '';
        
        // Calculate evolution data
        const evolutionCount = getEvolutionCount(evolutionChainData.chain, pokemonData.name);
        const isFinal = isFinalEvolution(evolutionChainData.chain, pokemonData.name);
        
        // Extract other data
        const color = speciesData.color.name;
        const habitat = speciesData.habitat?.name || null;
        const generation = getGenerationNumber(speciesData.generation.name);
        
        // Insert Pokemon data
        await db.insert(pokemonTable).values({
          name: pokemonData.name.toLowerCase(),
          type1: type1,
          type2: type2,
          evolution_count: Math.max(0, evolutionCount),
          is_final_evolution: isFinal,
          color: color,
          habitat: habitat,
          generation: generation,
          sprite_url: spriteUrl
        }).execute();
        
        console.log(`Successfully synced ${pokemonData.name}`);
        
      } catch (error) {
        console.error(`Failed to sync ${pokemonRef.name}:`, error);
        // Continue with next Pokemon instead of failing entirely
        continue;
      }
    }
    
    console.log('Pokemon data sync completed');
    
  } catch (error) {
    console.error('Pokemon data sync failed:', error);
    throw error;
  }
};

export const getAllPokemon = async (): Promise<Pokemon[]> => {
  try {
    const results = await db.select()
      .from(pokemonTable)
      .execute();

    return results;
  } catch (error) {
    console.error('Get all pokemon failed:', error);
    throw error;
  }
};
