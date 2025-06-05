
import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { trpc } from '@/utils/trpc';
import type { Pokemon, GameState } from '../../server/src/schema';

function App() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [allPokemon, setAllPokemon] = useState<Pokemon[]>([]);
  const [pokemonGuess, setPokemonGuess] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId] = useState(() => `session-${Date.now()}-${Math.random()}`);
  const [filteredPokemon, setFilteredPokemon] = useState<Pokemon[]>([]);
  const [gameComplete, setGameComplete] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Load all Pokemon for autocomplete
  const loadAllPokemon = useCallback(async () => {
    try {
      const pokemon = await trpc.getAllPokemon.query();
      setAllPokemon(pokemon);
    } catch (error) {
      console.error('Failed to load Pokemon:', error);
    }
  }, []);

  // Initialize game session
  const initializeGame = useCallback(async () => {
    try {
      setIsLoading(true);
      await trpc.createGameSession.mutate({
        session_id: sessionId,
        max_guesses: 6
      });
      
      const state = await trpc.getGameSession.query({ session_id: sessionId });
      setGameState(state);
      setGameComplete(state.session.is_completed);
    } catch (error) {
      console.error('Failed to initialize game:', error);
    } finally {
      setIsLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    loadAllPokemon();
    initializeGame();
  }, [loadAllPokemon, initializeGame]);

  // Filter Pokemon for autocomplete
  useEffect(() => {
    if (pokemonGuess.length > 0) {
      const filtered = allPokemon
        .filter(p => p.name.toLowerCase().includes(pokemonGuess.toLowerCase()))
        .slice(0, 10);
      setFilteredPokemon(filtered);
      setShowSuggestions(true);
    } else {
      setFilteredPokemon([]);
      setShowSuggestions(false);
    }
  }, [pokemonGuess, allPokemon]);

  const handleGuess = async (pokemonName: string) => {
    if (!gameState || gameComplete) return;
    
    try {
      setIsLoading(true);
      const updatedState = await trpc.makeGuess.mutate({
        session_id: sessionId,
        pokemon_name: pokemonName
      });
      
      setGameState(updatedState);
      setGameComplete(updatedState.session.is_completed);
      setPokemonGuess('');
      setShowSuggestions(false);
    } catch (error) {
      console.error('Failed to make guess:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pokemonGuess.trim()) {
      handleGuess(pokemonGuess.trim());
    }
  };

  const getFeedbackColor = (feedback: string) => {
    switch (feedback) {
      case 'correct': return 'bg-green-500 text-white';
      case 'higher': return 'bg-yellow-500 text-white';
      case 'lower': return 'bg-blue-500 text-white';
      case 'incorrect': return 'bg-red-500 text-white';
      default: return 'bg-gray-500 text-white';
    }
  };

  const getFeedbackIcon = (feedback: string) => {
    switch (feedback) {
      case 'correct': return '✅';
      case 'higher': return '⬆️';
      case 'lower': return '⬇️';
      case 'incorrect': return '❌';
      default: return '❔';
    }
  };

  if (isLoading && !gameState) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-400 via-purple-500 to-pink-500 flex items-center justify-center">
        <Card className="w-96">
          <CardContent className="p-8 text-center">
            <div className="animate-spin text-4xl mb-4">⚡</div>
            <p className="text-lg">Loading Pokemon Wordle...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!gameState) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-400 via-purple-500 to-pink-500 flex items-center justify-center">
        <Card className="w-96">
          <CardContent className="p-8 text-center">
            <p className="text-lg text-red-600">Failed to load game. Please refresh the page.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const progressPercentage = (gameState.session.current_guesses / gameState.session.max_guesses) * 100;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-400 via-purple-500 to-pink-500 p-4">
      <div className="container mx-auto max-w-4xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2 drop-shadow-lg">
            🎯 Pokemon Wordle
          </h1>
          <p className="text-white/90 text-lg">
            Guess today's Pokemon by its attributes!
          </p>
        </div>

        {/* Game Stats */}
        <Card className="mb-6 backdrop-blur-sm bg-white/90">
          <CardContent className="p-4">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold text-purple-600">
                  {gameState.session.current_guesses}
                </p>
                <p className="text-sm text-gray-600">Guesses Used</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-blue-600">
                  {gameState.session.max_guesses - gameState.session.current_guesses}
                </p>
                <p className="text-sm text-gray-600">Remaining</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-pink-600">
                  {gameState.session.max_guesses}
                </p>
                <p className="text-sm text-gray-600">Total Guesses</p>
              </div>
            </div>
            <Progress value={progressPercentage} className="mt-4" />
          </CardContent>
        </Card>

        {/* Win/Lose Message */}
        {gameComplete && (
          <Alert className={`mb-6 ${gameState.session.is_won ? 'border-green-500 bg-green-50' : 'border-red-500 bg-red-50'}`}>
            <AlertDescription className="text-center text-lg">
              {gameState.session.is_won ? (
                <div className="animate-bounce">
                  🎉 Congratulations! You guessed it: <strong>{gameState.target_pokemon?.name}</strong> 🎉
                </div>
              ) : (
                <div>
                  😞 Game Over! The Pokemon was: <strong>{gameState.target_pokemon?.name}</strong>
                  <br />
                  <img 
                    src={gameState.target_pokemon?.sprite_url} 
                    alt={gameState.target_pokemon?.name}
                    className="mx-auto mt-2 w-24 h-24"
                  />
                </div>
              )}
            </AlertDescription>
          </Alert>
        )}

        {/* Guess Input */}
        {!gameComplete && gameState.can_guess && (
          <Card className="mb-6 backdrop-blur-sm bg-white/90">
            <CardHeader>
              <CardTitle className="text-center text-xl">Make Your Guess</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="relative">
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <Input
                      value={pokemonGuess}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPokemonGuess(e.target.value)}
                      placeholder="Enter Pokemon name..."
                      className="text-lg"
                      autoComplete="off"
                    />
                    
                    {/* Autocomplete Suggestions */}
                    {showSuggestions && filteredPokemon.length > 0 && (
                      <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-md shadow-lg z-10 max-h-60 overflow-y-auto">
                        {filteredPokemon.map((pokemon: Pokemon) => (
                          <button
                            key={pokemon.id}
                            type="button"
                            onClick={() => {
                              setPokemonGuess(pokemon.name);
                              setShowSuggestions(false);
                            }}
                            className="w-full text-left px-4 py-2 hover:bg-gray-100 flex items-center gap-2"
                          >
                            <img 
                              src={pokemon.sprite_url} 
                              alt={pokemon.name}
                              className="w-8 h-8"
                            />
                            <span className="capitalize">{pokemon.name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <Button 
                    type="submit" 
                    disabled={isLoading || !pokemonGuess.trim()}
                    className="bg-purple-600 hover:bg-purple-700"
                  >
                    {isLoading ? 'Guessing...' : 'Guess! 🎯'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Attribute Headers */}
        {gameState.guesses.length > 0 && (
          <Card className="mb-4 backdrop-blur-sm bg-white/90">
            <CardContent className="p-4">
              <div className="grid grid-cols-8 gap-2 text-center font-semibold text-sm">
                <div>Pokemon</div>
                <div>Type 1</div>
                <div>Type 2</div>
                <div>Evolutions</div>
                <div>Final Evo?</div>
                <div>Color</div>
                <div>Habitat</div>
                <div>Generation</div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Guesses History */}
        <div className="space-y-3">
          {gameState.guesses.map((guessData) => (
            <Card key={guessData.guess.id} className="backdrop-blur-sm bg-white/90 animate-fadeIn">
              <CardContent className="p-4">
                <div className="grid grid-cols-8 gap-2 items-center">
                  {/* Pokemon Name & Image */}
                  <div className="text-center">
                    <img 
                      src={guessData.pokemon.sprite_url} 
                      alt={guessData.pokemon.name}
                      className="w-12 h-12 mx-auto mb-1"
                    />
                    <p className="text-xs font-medium capitalize truncate">
                      {guessData.pokemon.name}
                    </p>
                  </div>

                  {/* Type 1 */}
                  <div className="text-center">
                    <Badge className={`${getFeedbackColor(guessData.feedback.type1)} text-xs`}>
                      {getFeedbackIcon(guessData.feedback.type1)}
                    </Badge>
                    <p className="text-xs mt-1 capitalize">{guessData.pokemon.type1}</p>
                  </div>

                  {/* Type 2 */}
                  <div className="text-center">
                    <Badge className={`${getFeedbackColor(guessData.feedback.type2)} text-xs`}>
                      {getFeedbackIcon(guessData.feedback.type2)}
                    </Badge>
                    <p className="text-xs mt-1 capitalize">
                      {guessData.pokemon.type2 || 'None'}
                    </p>
                  </div>

                  {/* Evolution Count */}
                  <div className="text-center">
                    <Badge className={`${getFeedbackColor(guessData.feedback.evolution_count)} text-xs`}>
                      {getFeedbackIcon(guessData.feedback.evolution_count)}
                    </Badge>
                    <p className="text-xs mt-1">{guessData.pokemon.evolution_count}</p>
                  </div>

                  {/* Final Evolution */}
                  <div className="text-center">
                    <Badge className={`${getFeedbackColor(guessData.feedback.is_final_evolution)} text-xs`}>
                      {getFeedbackIcon(guessData.feedback.is_final_evolution)}
                    </Badge>
                    <p className="text-xs mt-1">
                      {guessData.pokemon.is_final_evolution ? 'Yes' : 'No'}
                    </p>
                  </div>

                  {/* Color */}
                  <div className="text-center">
                    <Badge className={`${getFeedbackColor(guessData.feedback.color)} text-xs`}>
                      {getFeedbackIcon(guessData.feedback.color)}
                    </Badge>
                    <p className="text-xs mt-1 capitalize">{guessData.pokemon.color}</p>
                  </div>

                  {/* Habitat */}
                  <div className="text-center">
                    <Badge className={`${getFeedbackColor(guessData.feedback.habitat)} text-xs`}>
                      {getFeedbackIcon(guessData.feedback.habitat)}
                    </Badge>
                    <p className="text-xs mt-1 capitalize">
                      {guessData.pokemon.habitat || 'Unknown'}
                    </p>
                  </div>

                  {/* Generation */}
                  <div className="text-center">
                    <Badge className={`${getFeedbackColor(guessData.feedback.generation)} text-xs`}>
                      {getFeedbackIcon(guessData.feedback.generation)}
                    </Badge>
                    <p className="text-xs mt-1">Gen {guessData.pokemon.generation}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Game Rules */}
        <Card className="mt-8 backdrop-blur-sm bg-white/90">
          <CardHeader>
            <CardTitle className="text-center text-lg">How to Play 🎮</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <p><strong>🎯 Goal:</strong> Guess today's Pokemon in {gameState.session.max_guesses} tries or less!</p>
            <Separator />
            <p><strong>🔍 Feedback Legend:</strong></p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>✅ <span className="text-green-600">Correct</span></div>
              <div>❌ <span className="text-red-600">Incorrect</span></div>
              <div>⬆️ <span className="text-yellow-600">Too Low</span></div>
              <div>⬇️ <span className="text-blue-600">Too High</span></div>
            </div>
            <Separator />
            <p><strong>📊 Attributes:</strong> Type 1, Type 2, Evolution Count, Final Evolution, Color, Habitat, Generation</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default App;
