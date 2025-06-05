
import { db } from '../db';
import { pokemonTable, gameSessionTable, gameGuessTable, dailyPokemonTable } from '../db/schema';
import { type MakeGuessInput, type GameState, type GuessFeedback } from '../schema';
import { eq, and } from 'drizzle-orm';

export const makeGuess = async (input: MakeGuessInput): Promise<GameState> => {
  try {
    // Get the current game session
    const gameSessionResults = await db.select()
      .from(gameSessionTable)
      .innerJoin(dailyPokemonTable, eq(gameSessionTable.daily_pokemon_id, dailyPokemonTable.id))
      .innerJoin(pokemonTable, eq(dailyPokemonTable.pokemon_id, pokemonTable.id))
      .where(eq(gameSessionTable.session_id, input.session_id))
      .execute();

    if (gameSessionResults.length === 0) {
      throw new Error('Game session not found');
    }

    const sessionData = gameSessionResults[0];
    const session = sessionData.game_session;
    const targetPokemon = sessionData.pokemon;

    // Check if game is already completed
    if (session.is_completed) {
      throw new Error('Game session is already completed');
    }

    // Check if max guesses reached
    if (session.current_guesses >= session.max_guesses) {
      throw new Error('Maximum guesses reached');
    }

    // Find the guessed Pokemon by name (case-insensitive)
    const guessedPokemonResults = await db.select()
      .from(pokemonTable)
      .where(eq(pokemonTable.name, input.pokemon_name.toLowerCase()))
      .execute();

    if (guessedPokemonResults.length === 0) {
      throw new Error('Pokemon not found');
    }

    const guessedPokemon = guessedPokemonResults[0];
    const isCorrect = guessedPokemon.id === targetPokemon.id;
    const newGuessNumber = session.current_guesses + 1;
    const isGameComplete = isCorrect || newGuessNumber >= session.max_guesses;

    // Create the guess record
    await db.insert(gameGuessTable)
      .values({
        session_id: input.session_id,
        guess_number: newGuessNumber,
        guessed_pokemon_id: guessedPokemon.id,
        is_correct: isCorrect
      })
      .execute();

    // Update game session
    await db.update(gameSessionTable)
      .set({
        current_guesses: newGuessNumber,
        is_completed: isGameComplete,
        is_won: isCorrect,
        completed_at: isGameComplete ? new Date() : null
      })
      .where(eq(gameSessionTable.session_id, input.session_id))
      .execute();

    // Get updated session data
    const updatedSessionResults = await db.select()
      .from(gameSessionTable)
      .where(eq(gameSessionTable.session_id, input.session_id))
      .execute();

    const updatedSession = updatedSessionResults[0];

    // Get all guesses with Pokemon data
    const guessResults = await db.select()
      .from(gameGuessTable)
      .innerJoin(pokemonTable, eq(gameGuessTable.guessed_pokemon_id, pokemonTable.id))
      .where(eq(gameGuessTable.session_id, input.session_id))
      .execute();

    // Generate feedback for each guess
    const guessesWithFeedback = guessResults.map(result => {
      const guess = result.game_guess;
      const pokemon = result.pokemon;
      
      const feedback: GuessFeedback = {
        type1: pokemon.type1 === targetPokemon.type1 ? 'correct' : 'incorrect',
        type2: pokemon.type2 === targetPokemon.type2 ? 'correct' : 'incorrect',
        evolution_count: pokemon.evolution_count === targetPokemon.evolution_count ? 'correct' :
                        pokemon.evolution_count < targetPokemon.evolution_count ? 'higher' : 'lower',
        is_final_evolution: pokemon.is_final_evolution === targetPokemon.is_final_evolution ? 'correct' : 'incorrect',
        color: pokemon.color === targetPokemon.color ? 'correct' : 'incorrect',
        habitat: pokemon.habitat === targetPokemon.habitat ? 'correct' : 'incorrect',
        generation: pokemon.generation === targetPokemon.generation ? 'correct' :
                   pokemon.generation < targetPokemon.generation ? 'higher' : 'lower'
      };

      return {
        guess,
        pokemon,
        feedback
      };
    });

    return {
      session: updatedSession,
      target_pokemon: updatedSession.is_completed ? targetPokemon : null,
      guesses: guessesWithFeedback,
      can_guess: !updatedSession.is_completed
    };
  } catch (error) {
    console.error('Make guess failed:', error);
    throw error;
  }
};
