
import { db } from '../db';
import { gameSessionTable, gameGuessTable, pokemonTable, dailyPokemonTable } from '../db/schema';
import { type GetGameSessionInput, type GameState, type GuessFeedback } from '../schema';
import { eq } from 'drizzle-orm';

const generateFeedback = (guessedPokemon: any, targetPokemon: any): GuessFeedback => {
  return {
    type1: guessedPokemon.type1 === targetPokemon.type1 ? 'correct' : 'incorrect',
    type2: guessedPokemon.type2 === targetPokemon.type2 ? 'correct' : 'incorrect',
    evolution_count: guessedPokemon.evolution_count === targetPokemon.evolution_count 
      ? 'correct' 
      : guessedPokemon.evolution_count > targetPokemon.evolution_count 
        ? 'lower' 
        : 'higher',
    is_final_evolution: guessedPokemon.is_final_evolution === targetPokemon.is_final_evolution ? 'correct' : 'incorrect',
    color: guessedPokemon.color === targetPokemon.color ? 'correct' : 'incorrect',
    habitat: guessedPokemon.habitat === targetPokemon.habitat ? 'correct' : 'incorrect',
    generation: guessedPokemon.generation === targetPokemon.generation 
      ? 'correct' 
      : guessedPokemon.generation > targetPokemon.generation 
        ? 'lower' 
        : 'higher'
  };
};

export const getGameSession = async (input: GetGameSessionInput): Promise<GameState> => {
  try {
    // Get game session with daily pokemon and target pokemon
    const sessionResults = await db.select()
      .from(gameSessionTable)
      .innerJoin(dailyPokemonTable, eq(gameSessionTable.daily_pokemon_id, dailyPokemonTable.id))
      .innerJoin(pokemonTable, eq(dailyPokemonTable.pokemon_id, pokemonTable.id))
      .where(eq(gameSessionTable.session_id, input.session_id))
      .execute();

    if (sessionResults.length === 0) {
      throw new Error('Game session not found');
    }

    const sessionData = sessionResults[0];
    const session = sessionData.game_session;
    const targetPokemon = sessionData.pokemon;

    // Get all guesses for this session with pokemon data
    const guessResults = await db.select()
      .from(gameGuessTable)
      .innerJoin(pokemonTable, eq(gameGuessTable.guessed_pokemon_id, pokemonTable.id))
      .where(eq(gameGuessTable.session_id, input.session_id))
      .execute();

    // Build guesses with feedback
    const guesses = guessResults.map(result => {
      const guess = result.game_guess;
      const guessedPokemon = result.pokemon;
      
      return {
        guess,
        pokemon: guessedPokemon,
        feedback: generateFeedback(guessedPokemon, targetPokemon)
      };
    });

    // Sort guesses by guess number
    guesses.sort((a, b) => a.guess.guess_number - b.guess.guess_number);

    // Determine if player can still guess
    const canGuess = !session.is_completed && session.current_guesses < session.max_guesses;

    return {
      session,
      target_pokemon: session.is_completed ? targetPokemon : null,
      guesses,
      can_guess: canGuess
    };
  } catch (error) {
    console.error('Get game session failed:', error);
    throw error;
  }
};
