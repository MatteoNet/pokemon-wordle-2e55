
import { initTRPC } from '@trpc/server';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import 'dotenv/config';
import cors from 'cors';
import superjson from 'superjson';

import { 
  createGameSessionInputSchema,
  makeGuessInputSchema,
  getDailyPokemonInputSchema,
  getGameSessionInputSchema
} from './schema';

import { getDailyPokemon } from './handlers/get_daily_pokemon';
import { createGameSession } from './handlers/create_game_session';
import { getGameSession } from './handlers/get_game_session';
import { makeGuess } from './handlers/make_guess';
import { getAllPokemon } from './handlers/get_all_pokemon';
import { syncPokemonData } from './handlers/sync_pokemon_data';

const t = initTRPC.create({
  transformer: superjson,
});

const publicProcedure = t.procedure;
const router = t.router;

const appRouter = router({
  healthcheck: publicProcedure.query(() => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }),
  
  getDailyPokemon: publicProcedure
    .input(getDailyPokemonInputSchema)
    .query(({ input }) => getDailyPokemon(input)),
    
  createGameSession: publicProcedure
    .input(createGameSessionInputSchema)
    .mutation(({ input }) => createGameSession(input)),
    
  getGameSession: publicProcedure
    .input(getGameSessionInputSchema)
    .query(({ input }) => getGameSession(input)),
    
  makeGuess: publicProcedure
    .input(makeGuessInputSchema)
    .mutation(({ input }) => makeGuess(input)),
    
  getAllPokemon: publicProcedure
    .query(() => getAllPokemon()),
    
  syncPokemonData: publicProcedure
    .mutation(() => syncPokemonData()),
});

export type AppRouter = typeof appRouter;

async function start() {
  const port = process.env['SERVER_PORT'] || 2022;
  const server = createHTTPServer({
    middleware: (req, res, next) => {
      cors()(req, res, next);
    },
    router: appRouter,
    createContext() {
      return {};
    },
  });
  server.listen(port);
  console.log(`Pokemon Wordle TRPC server listening at port: ${port}`);
}

start();
