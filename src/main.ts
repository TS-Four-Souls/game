import { cards, Game } from "@/models/game";
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
  schema: {
    safeParse: (b: unknown) => { success: boolean; error?: any; data?: any };
  } | null,
  handler: (params: { issuer: Issuer; data?: any; request: Request }) => string
) {
  return async (request: Request) =>
    playerEndpointHandler(request, (issuer, body) => {
      if (schema) {
        const parsed = schema.safeParse(body);
        if (!parsed.success) {
          return new Response(JSON.stringify({ error: parsed.error.message }), {
            status: 400,
            headers: { "Access-Control-Allow-Origin": "*" },
          });
        }
        try {
          const result = handler({ issuer, data: parsed.data, request });
          return new Response(result, {
            status: 200,
            headers: { "Access-Control-Allow-Origin": "*" },
          });
        } catch (error) {
          return new Response(`Something went wrong: ${error}`, {
            status: 400,
            headers: { "Access-Control-Allow-Origin": "*" },
          });
        }
      } else {
        try {
          const result = handler({ issuer, data: body, request });
          return new Response(result, {
            status: 200,
            headers: { "Access-Control-Allow-Origin": "*" },
          });
        } catch (error) {
          return new Response(`Something went wrong: ${error}`, {
            status: 400,
            headers: { "Access-Control-Allow-Origin": "*" },
          });
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
      const { id } = result.data;
      const player = new Player(id, 1, 2, 0);
      try {
        game.addPlayer(player);
      } catch (error) {
        return new Response(`Player ${id} cannot join the game: ${error}`, {
          status: 400,
        });
      }
      return new Response(
        JSON.stringify({
          message: `Welcome ${id} to the game`,
          secret: player.secret,
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    },

    "/state": async (request) => {
      request.headers.get("Accept");
      if (request.headers.get("Accept") === "application/json") {
        return new Response(JSON.stringify(game.stateJson), {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        });
      } else {
        return new Response(game.state, {
          headers: {
            "Content-Type": "text/plain",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }
    },

    "/monsterslots": async (request) => {
      return new Response(game.monsterSlotsJSON);
    },

    "/start": createPlayerRoute(null, ({ issuer }) => {
      game.start(issuer);
      return "Game started";
    }),

    "/reset": createPlayerRoute(null, ({ issuer }) => {
      game.reset(issuer);
      return "Game reset successfully";
    }),

    "/attack": createPlayerRoute(schemas.attackRequest, ({ issuer, data }) =>
      game.attack(issuer, data.monsterId)
    ),

    "/gaincoins": createPlayerRoute(
      schemas.gainCoinsRequest,
      ({ issuer, data }) => game.gainCoins(issuer, data.coins)
    ),

    "/playcard": createPlayerRoute(
      schemas.playCardRequest,
      ({ issuer, data }) => game.playCard(issuer, data.index)
    ),

    "/rolldice": createPlayerRoute(null, ({ issuer }) => game.rollDice(issuer)),

    "/gethand": createPlayerRoute(null, ({ issuer }) => game.getHand(issuer)),

    "/discardloot": createPlayerRoute(
      schemas.discardLootRequest,
      ({ issuer, data }) => game.discardFromHand(issuer, data.position)
    ),

    "/gaintreasure": createPlayerRoute(null, ({ issuer }) =>
      game.gainTreasure(issuer)
    ),

    "/purchase": createPlayerRoute(
      schemas.purchaseRequest,
      ({ issuer, data }) => game.purchase(issuer, data.index)
    ),

    "/discardmonster": createPlayerRoute(
      schemas.discardMonsterRequest,
      ({ issuer, data }) => game.discardMonster(issuer, data.index)
    ),

    "/killmonster": createPlayerRoute(
      schemas.killMonsterRequest,
      ({ issuer, data }) => game.killMonster(issuer, data.index)
    ),

    "/drawmonster": createPlayerRoute(
      schemas.drawMonsterRequest,
      ({ issuer, data }) => game.drawMonster(issuer, data.index)
    ),

    "/discardinplay": createPlayerRoute(
      schemas.discardInPlayRequest,
      ({ issuer, data }) => game.discardInPlay(issuer, data.index)
    ),

    "/detailedstate": createPlayerRoute(null, ({ issuer, request }) => {
      const accept = request.headers.get("Accept");
      return game.detailedStateJSON(issuer);
      if (accept === "application/json") {
        return JSON.stringify(game.detailedStateJSON(issuer));
      } else {
        return game.detailedState(issuer);
      }
    }),

    "/loot": createPlayerRoute(null, ({ issuer }) => game.loot(issuer)),

    "/hand": createPlayerRoute(null, ({ issuer }) => game.getHand(issuer)),

    "/inplay": createPlayerRoute(null, ({ issuer }) => game.getInPlay(issuer)),

    "/losecoins": createPlayerRoute(
      schemas.loseCoinsRequest,
      ({ issuer, data }) => game.loseCoins(issuer, data.coins, data.asMany)
    ),
    "/next": createPlayerRoute(null, ({ issuer }) => game.nextTurn(issuer)),
    "/wp-content/*": (request) => {
      const path = new URL(request.url).pathname;
      return new Response(Bun.file(`./data/${path}`), {
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    },
    "/getdiscard/:type": (request) => {
      const type:string = request.params.type;

      return new Response(game.getDiscard(type), {
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    },

    "/images/:slug/front": (request) => {
      const slug = request.params.slug;
      const card = cards.find((card) => card.slug === slug);
      if (!card) {
        return new Response("Card not found", { status: 404 });
      }

      const path = card.front.replace("https://foursouls.com/", "./data/");
      console.log(path);
      return new Response(Bun.file(path), {
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    },
    "/images/:slug/back": (request) => {
      const slug = request.params.slug;
      const card = cards.find((card) => card.slug === slug);
      if (!card) {
        return new Response("Card not found", { status: 404 });
      }
      const path = card.back.replace("https://foursouls.com/", "./data/");
      return new Response(Bun.file(path), {
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    },
  },
});
