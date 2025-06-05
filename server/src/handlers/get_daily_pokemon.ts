
import { db } from '../db';
import { pokemonTable, dailyPokemonTable } from '../db/schema';
import { type GetDailyPokemonInput, type Pokemon } from '../schema';
import { eq } from 'drizzle-orm';

// Types for PokeAPI responses
interface PokeAPIListResponse {
  results: Array<{
    name: string;
    url: string;
  }>;
}

interface PokeAPIPokemonResponse {
  id: number;
  name: string;
  types: Array<{
    type: {
      name: string;
    };
  }>;
  sprites: {
    front_default: string;
  };
  species: {
    url: string;
  };
}

interface PokeAPISpeciesResponse {
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

interface PokeAPIEvolutionChainResponse {
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

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const fetchWithRetry = async (url: string, retries = 3): Promise<any> => {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      console.warn(`Fetch attempt ${i + 1} failed for ${url}:`, error);
      if (i === retries - 1) throw error;
      await sleep(1000 * (i + 1)); // Exponential backoff
    }
  }
};

const getEvolutionData = (evolutionChain: PokeAPIEvolutionChainResponse, pokemonName: string) => {
  const getAllPokemonInChain = (chain: any): string[] => {
    const names = [chain.species.name];
    for (const evolution of chain.evolves_to || []) {
      names.push(...getAllPokemonInChain(evolution));
    }
    return names;
  };

  const allPokemon = getAllPokemonInChain(evolutionChain.chain);
  const pokemonIndex = allPokemon.findIndex(name => name === pokemonName);
  
  return {
    evolution_count: pokemonIndex,
    is_final_evolution: pokemonIndex === allPokemon.length - 1
  };
};

const extractGeneration = (generationName: string): number => {
  const match = generationName.match(/generation-(\w+)/);
  if (!match) return 1;
  
  const romanNumerals: { [key: string]: number } = {
    'i': 1, 'ii': 2, 'iii': 3, 'iv': 4, 'v': 5, 'vi': 6, 'vii': 7, 'viii': 8, 'ix': 9
  };
  
  return romanNumerals[match[1]] || parseInt(match[1]) || 1;
};

export const syncPokemonData = async (): Promise<void> => {
  try {
    console.log('Starting Pokemon data sync...');
    
    // Fetch list of all Pokemon (limit to first 151 for initial implementation)
    const pokemonListResponse: PokeAPIListResponse = await fetchWithRetry(
      'https://pokeapi.co/api/v2/pokemon?limit=151'
    );
    
    console.log(`Found ${pokemonListResponse.results.length} Pokemon to process`);
    
    for (let i = 0; i < pokemonListResponse.results.length; i++) {
      const pokemonRef = pokemonListResponse.results[i];
      const pokemonName = pokemonRef.name.toLowerCase();
      
      try {
        // Check if Pokemon already exists
        const existingPokemon = await db.select()
          .from(pokemonTable)
          .where(eq(pokemonTable.name, pokemonName))
          .execute();
          
        if (existingPokemon.length > 0) {
          console.log(`Pokemon ${pokemonName} already exists, skipping`);
          continue;
        }
        
        console.log(`Processing Pokemon ${i + 1}/${pokemonListResponse.results.length}: ${pokemonName}`);
        
        // Fetch detailed Pokemon data
        const pokemonData: PokeAPIPokemonResponse = await fetchWithRetry(pokemonRef.url);
        
        // Fetch species data
        const speciesData: PokeAPISpeciesResponse = await fetchWithRetry(pokemonData.species.url);
        
        // Fetch evolution chain data
        const evolutionChainData: PokeAPIEvolutionChainResponse = await fetchWithRetry(
          speciesData.evolution_chain.url
        );
        
        // Process evolution data
        const evolutionInfo = getEvolutionData(evolutionChainData, pokemonName);
        
        // Extract generation number
        const generation = extractGeneration(speciesData.generation.name);
        
        // Prepare Pokemon data for insertion
        const newPokemon = {
          name: pokemonName,
          type1: pokemonData.types[0]?.type.name || 'unknown',
          type2: pokemonData.types[1]?.type.name || null,
          evolution_count: evolutionInfo.evolution_count,
          is_final_evolution: evolutionInfo.is_final_evolution,
          color: speciesData.color.name,
          habitat: speciesData.habitat?.name || null,
          generation: generation,
          sprite_url: pokemonData.sprites.front_default || ''
        };
        
        // Insert Pokemon into database
        await db.insert(pokemonTable)
          .values(newPokemon)
          .execute();
          
        console.log(`Successfully synced ${pokemonName}`);
        
        // Rate limiting - wait between requests
        await sleep(100);
        
      } catch (error) {
        console.error(`Failed to sync Pokemon ${pokemonName}:`, error);
        // Continue with next Pokemon instead of failing completely
        continue;
      }
    }
    
    console.log('Pokemon data sync completed');
  } catch (error) {
    console.error('Pokemon data sync failed:', error);
    throw error;
  }
};

export const getDailyPokemon = async (input?: GetDailyPokemonInput): Promise<Pokemon> => {
  try {
    // Use provided date or default to today
    const targetDate = input?.date ? new Date(input.date) : new Date();
    
    // Format date as YYYY-MM-DD for database comparison
    const dateString = targetDate.toISOString().split('T')[0];
    
    // Query for daily pokemon with join to get full pokemon data
    const results = await db.select()
      .from(dailyPokemonTable)
      .innerJoin(pokemonTable, eq(dailyPokemonTable.pokemon_id, pokemonTable.id))
      .where(eq(dailyPokemonTable.date, dateString))
      .execute();

    if (results.length === 0) {
      throw new Error(`No daily Pokemon found for date: ${dateString}`);
    }

    // Extract pokemon data from joined result
    const pokemonData = results[0].pokemon;
    
    return {
      id: pokemonData.id,
      name: pokemonData.name,
      type1: pokemonData.type1,
      type2: pokemonData.type2,
      evolution_count: pokemonData.evolution_count,
      is_final_evolution: pokemonData.is_final_evolution,
      color: pokemonData.color,
      habitat: pokemonData.habitat,
      generation: pokemonData.generation,
      sprite_url: pokemonData.sprite_url,
      created_at: pokemonData.created_at
    };
  } catch (error) {
    console.error('Failed to get daily Pokemon:', error);
    throw error;
  }
};
