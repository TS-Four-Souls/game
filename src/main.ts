import { Game } from "@/models/game";
import { Monster } from "@/models/monster";
import { Player } from "@/models/player";
import { schemas, type Issuer } from "@/types";
import { playerEndpointHandler } from "@/utils/endpoints";

const game = new Game();

const PORT = process.env.PORT || 3000;
const HOSTNAME = process.env.HOSTNAME || "localhost";
console.log(`Server is running on http://${HOSTNAME}:${PORT}`);

// Factory to generate player-protected routes. `schema` is optional and
// should be a zod schema with `safeParse`. `handler` receives (issuer, data).
// If `schema` is omitted, `data` will be the raw body.
function createPlayerRoute(
  schema: { safeParse: (b: unknown) => { success: boolean; error?: any; data?: any } } | null,
  handler: (issuer: Issuer, data?: any) => string | Response
) {
  return async (request: Request) =>
    playerEndpointHandler(request, (issuer, body) => {
      if (schema) {
        const parsed = schema.safeParse(body);
        if (!parsed.success) {
          return new Response(JSON.stringify({ error: parsed.error.message }), {
            status: 400,
          });
        }
        try {
          const result = handler(issuer, parsed.data);
          return result instanceof Response ? result : new Response(result, { status: 200 });
        } catch (error) {
          return new Response(`Something went wrong: ${error}`, { status: 400 });
        }
      } else {
        try {
          const result = handler(issuer, body);
          return result instanceof Response ? result : new Response(result, { status: 200 });
        } catch (error) {
          return new Response(`Something went wrong: ${error}`, { status: 400 });
        }
      }
    });
}

Bun.serve({
  port: PORT,
  hostname: HOSTNAME,
  routes: {
    "/join": async (request) => {
      let body;
      try {
        body = await request.json();
      } catch (error) {
        return new Response("Invalid or missing JSON body", { status: 400 });
      }
      const result = schemas.joinRequest.safeParse(body);
      if (!result.success) {
        return new Response(JSON.stringify({ error: result.error.message }), {
          status: 400,
        });
      }
      const { id: name } = result.data;
      const player = new Player(name, 1, 2, 0);
      try {
        game.addPlayer(player);
      } catch (error) {
        return new Response(`Player ${name} cannot join the game: ${error}`, {
          status: 400,
        });
      }
      return new Response(
        JSON.stringify({
          message: `Welcome ${name} to the game`,
          secret: player.secret,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    },

    "/state": async (request) => {
      return new Response(game.state);
    },

    "/start": createPlayerRoute(null, (issuer) => {
      game.start(issuer);
      return "Game started";
    }),

    "/reset": createPlayerRoute(null, (issuer) => {
      game.reset(issuer);
      return "Game reset successfully";
    }),

    "/attack": createPlayerRoute(schemas.attackRequest, (issuer, data) =>
      game.attack(issuer, data.monsterId)
    ),

    "/gaincoins": createPlayerRoute(schemas.gainCoinsRequest, (issuer, data) =>
      game.gainCoins(issuer, data.coins)
    ),

    "/rolldice": createPlayerRoute(null, (issuer) => game.rollDice(issuer)),

    "/getdiscard": createPlayerRoute(null, (issuer) => game.getDiscard(issuer, "loot")),

    "/gethand": createPlayerRoute(null, (issuer) => game.getHand(issuer)),

    "/discardloot": createPlayerRoute(schemas.discardLootRequest, (issuer, data) =>
      game.discardFromHand(issuer, data.position)
    ),

    "/gaintreasure": createPlayerRoute(null, (issuer) => game.gainTreasure(issuer)),

    "/purchase": createPlayerRoute(schemas.purchaseRequest, (issuer, data) =>
      game.purchase(issuer, data.index)
    ),

    "/discardmonster": createPlayerRoute(schemas.discardMonsterRequest, (issuer, data) =>
      game.discardMonster(issuer, data.index)
    ),

    "/killmonster": createPlayerRoute(schemas.killMonsterRequest, (issuer, data) =>
      game.killMonster(issuer, data.index)
    ),

    "/drawmonster": createPlayerRoute(schemas.drawMonsterRequest, (issuer, data) =>
      game.drawMonster(issuer, data.index)
    ),

    "/discardinplay": createPlayerRoute(schemas.discardInPlayRequest, (issuer, data) =>
      game.discardInPlay(issuer, data.index)
    ),

    "/detailedstate": createPlayerRoute(null, (issuer, data) =>
      game.detailedState(issuer)
    ),

    "/loot": createPlayerRoute(null, (issuer) => game.loot(issuer)),

    "/hand": createPlayerRoute(null, (issuer) => game.getHand(issuer)),

    "/inplay": createPlayerRoute(null, (issuer) => game.getInPlay(issuer)),

    "/losecoins": createPlayerRoute(schemas.loseCoinsRequest, (issuer, data) =>
      game.loseCoins(issuer, data.coins, data.asMany)
    ),

    "/next": createPlayerRoute(null, (issuer) => game.nextTurn(issuer)),
  },
});
