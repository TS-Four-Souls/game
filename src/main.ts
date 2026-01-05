import { cards, Game } from "@/models/game";
import { Player } from "@/models/player";
import { schemas, type Issuer } from "@/types/types";
import { playerEndpointHandler } from "@/utils/endpoints";
import { Elysia, sse } from "elysia";
import { cors } from "@elysiajs/cors";
import type { CharacterCard } from "./models/cards";
import { TargetBuilder, type TargetSelectorResponse } from "./models/targetBuilder";
const game = new Game();

const PORT = process.env.PORT || 3000;
const HOSTNAME = process.env.HOSTNAME || "localhost";
console.log(`Server is running on http://${HOSTNAME}:${PORT}`);

const app = new Elysia()
  .use(cors())
  .onBeforeHandle(({ request }) => {
    console.log("Incoming request:", request.url);
  })
  .get("/", () => "Hello Elysia")
  .post(
    "/join",
    async (request) => {
      const { id } = request.body;
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
          },
        }
      );
    },
    {
      body: schemas.joinRequest,
    }
  )
  .post(
    "/declareAttack",
    async (request) => {
      const player = game.getPlayerById(request.body.issuer.id);
      game.declareAttack(player);
      return new Response("", {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      });
    },
    {
      body: schemas.userProtectedRequest,
    }
  )
  .post(
    "/attackMonster",
    async (request) => {
      const player = game.getPlayerById(request.body.issuer.id);
      const monsterIndex =
        request.body.index === "top"
          ? request.body.replaceIndex
          : request.body.index;
      if (request.body.index === "top") {
        game.drawMonster(player, request.body.replaceIndex);
      }
      const monster = game.encounters.monsterIn(monsterIndex);
      if (!monster) {
        return new Response(`No monster at index ${request.body.index}`, {
          status: 400,
        });
      }
      game.declareAttackOnMonster(player, monster);

      return new Response("", {
        status: 200,
      });
    },
    {
      body: schemas.attackMonsterRequest,
    }
  )
  .post(
    "/attackRoll",
    async (request) => {
      const player = game.getPlayerById(request.body.issuer.id);
      game.attackRoll(player);
      return new Response("", {
        status: 200,
      });
    },
    {
      body: schemas.userProtectedRequest,
    }
  )
  .post(
    "/detailedstate",
    async (request) => {
      return new Response(game.detailedStateJSON(request.body.issuer), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      });
    },
    {
      body: schemas.userProtectedRequest,
    }
  )
  .get("/monsterslots", async (request) => {
    return new Response(game.monsterSlotsJSON, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  })
  .post(
    "/start",
    async (request) => {
      game.start(request.body.issuer);
      return new Response("Game started", {
        status: 200,
      });
    },
    {
      body: schemas.userProtectedRequest,
    }
  )
  .get("/resolve", async (request) => {
    game.resolveStack();
    return new Response(
      JSON.stringify(game.stack.elements.map((elem) => elem.json)),
      {
        status: 200,
      }
    );
  })
  .post(
    "/reset",
    async (request) => {
      game.reset(request.body.issuer);
      return new Response("Game reset", {
        status: 200,
      });
    },
    {
      body: schemas.userProtectedRequest,
    }
  )
  .post(
    "/gaincoins",
    async (request) => {
      return new Response(
        game.gainCoins(request.body.issuer, request.body.coins),
        {
          status: 200,
        }
      );
    },
    {
      body: schemas.gainCoinsRequest,
    }
  )
  .post(
    "/playcard",
    async (request) => {
      const player = game.getPlayerById(request.body.issuer.id);
      const partialChoices = request.body.targetChoices || [];
      const choices: TargetSelectorResponse = TargetBuilder.getNextSelector(game, player, request.body.index, partialChoices, request.body.effectIndex, true);
      if (choices.complete) {
        console.log("Card ready to be played");
        const targets = TargetBuilder.buildTargets(game, player, request.body.index, partialChoices, request.body.effectIndex, true);
        game.playCard(player, request.body.index, targets);
      }
      return new Response(JSON.stringify(choices), {
        status: 200,
      });
    },
    {
      body: schemas.playCardRequest,
    }
    // async (request) => {
    //   return new Response(
    //     game.playCard(request.body.issuer, request.body.index),
    //     {
    //       status: 200,
    //     }
    //   );
    // },
    // {
    //   body: schemas.playCardRequest,
    // }
  )
  .post(
    "/activate",
    async (request) => {
      const player = game.getPlayerById(request.body.issuer.id);
      const partialChoices = request.body.targetChoices || [];
      const choices: TargetSelectorResponse = TargetBuilder.getNextSelector(game, player, request.body.index, partialChoices, request.body.effectIndex);
      if (choices.complete) {
        console.log("Activation complete");
        const targets = TargetBuilder.buildTargets(game, player, request.body.index, partialChoices, request.body.effectIndex);
        game.activateItemAtIndex(player, request.body.index, targets, request.body.effectIndex);
      }
      return new Response(JSON.stringify(choices), {
        status: 200,
      });
    },
    {
      body: schemas.activateRequest,
    }
  )
  .post(
    "/purchase",
    async (request) => {
      const player = game.getPlayerById(request.body.issuer.id);
      game.purchase(player, request.body.index);
      return new Response("", {
        status: 200,
      });
    },
    {
      body: schemas.purchaseRequest,
    }
  )
  // .post(
  //   "/getEffectTarget",
  //   async (request) => {
  //     const player = game.getPlayerById(request.body.issuer.id);
  //     const result = game
  //       .getEffectTarget(player, request.body.index)
  //       .map((selector) => ({
  //         description: selector.description,
  //         choices: selector.selector(player),
  //       }));
  //     return new Response(JSON.stringify(result), {
  //       status: 200,
  //     });
  //   },
  //   {
  //     body: schemas.activateRequest,
  //   }
  // )
  .post(
    "/rolldice",
    async (request) => {
      return new Response(
        game.rollDice(request.body.issuer, false).json.toString(),
        {
          status: 200,
          headers: {
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    },
    {
      body: schemas.userProtectedRequest,
    }
  )
  // .post(
  //   "/gethand",
  //   async (request) => {
  //     return new Response(game.getHand(request.body.issuer), {
  //       status: 200,
  //       headers: {
  //         "Access-Control-Allow-Origin": "*",
  //       },
  //     });
  //   },
  //   {
  //     body: schemas.userProtectedRequest,
  //   }
  // )
  .post(
    "/discardloot",
    async (request) => {
      return new Response(
        game.discardFromHand(request.body.issuer, request.body.position),
        {
          status: 200,
        }
      );
    },
    {
      body: schemas.discardLootRequest,
    }
  )
  .post(
    "/gaintreasure",
    async (request) => {
      return new Response(game.gainTreasure(request.body.issuer), {
        status: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
        },
      });
    },
    {
      body: schemas.userProtectedRequest,
    }
  )
  .post(
    "/discardmonster",
    async (request) => {
      return new Response(
        game.discardMonster(request.body.issuer, request.body.index),
        {
          status: 200,
        }
      );
    },
    {
      body: schemas.discardMonsterRequest,
    }
  )
  .post(
    "/killmonster",
    async (request) => {
      return new Response(
        game.killMonster(request.body.issuer, request.body.index),
        {
          status: 200,
        }
      );
    },
    {
      body: schemas.killMonsterRequest,
    }
  )
  .post(
    "/discardinplay",
    async (request) => {
      return new Response(
        game.discardInPlay(request.body.issuer, request.body.index),
        {
          status: 200,
        }
      );
    },
    {
      body: schemas.discardInPlayRequest,
    }
  )
  .get("/images/:slug/front", (request) => {
    const slug = request.params.slug;
    const card = cards.find((card) => card.slug === slug);
    if (!card) {
      return new Response("Card not found", { status: 404 });
    }
    const path = card.front.replace("https://foursouls.com/", "./data/");
    return new Response(Bun.file(path), {
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  })
  .get("/images/:slug/back", (request) => {
    const slug = request.params.slug;
    const card = cards.find((card) => card.slug === slug);
    if (!card) {
      return new Response("Card not found", { status: 404 });
    }
    const path = card.back.replace("https://foursouls.com/", "./data/");
    return new Response(Bun.file(path), {
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  })
  .post(
    "/loot",
    async (request) => {
      return new Response(game.loot(request.body.issuer), {
        status: 200,
      });
    },
    {
      body: schemas.userProtectedRequest,
    }
  )
  .post(
    "/inplay",
    async (request) => {
      return new Response(game.getInPlay(request.body.issuer), {
        status: 200,
      });
    },
    {
      body: schemas.userProtectedRequest,
    }
  )
  .post(
    "/losecoins",
    async (request) => {
      return new Response(
        "" +
          game.loseCoins(
            request.body.issuer,
            request.body.coins,
            request.body.asMany
          ),
        {
          status: 200,
        }
      );
    },
    {
      body: schemas.loseCoinsRequest,
    }
  )
  .post(
    "/endturn",
    async (request) => {
      return new Response(game.nextTurn(request.body.issuer), {
        status: 200,
      });
    },
    {
      body: schemas.userProtectedRequest,
    }
  )

  // .post(
  //   "/endturn",
  //   async (request) => {
  //     if(request.body.issuer !== game.currentPlayer?.name) {
  //     game.endTurn();
  //   return new Response("Turn ended", {
  //     status: 200,
  //   });
  //   },
  //   {
  //     body: schemas.userProtectedRequest,
  //   }
  // )
  .get("/getdiscard/:type", async (request) => {
    const type: string = request.params.type;
    return new Response(game.getDiscard(type), {
      status: 200,
    });
  })
  .post("/debug", async () => {
    game.debugReset();
    const p1 = new Player("DrMint", 1, 2, 0, "");
    const p2 = new Player("slichau", 1, 2, 0, "");
    game.addPlayer(p1);
    game.addPlayer(p2);
    game.setupGame();
    const isaac = game.decks["character"]!.getCardFromSlug(
      "b2-isaac"
    )! as CharacterCard;
    const samson = game.decks["character"]!.getCardFromSlug(
      "b2-samson"
    )! as CharacterCard;
    const card = game.obtainCard("b2-chaos_card")!;
    game.addInPlay(p1, card);
    game.start(p1, [samson, isaac]);
    return new Response("Debug reset", {
      status: 200,
    });
  })

  .get(
    "/sse",
    async (request) => {
      const issuer = request.query;

      let listener: () => void; // defined outside so cancel() can reference it

      const stream = new ReadableStream({
        start(controller) {
          listener = () => {
            controller.enqueue(
              `event: stateChange\ndata: ${game.detailedStateJSON(issuer)}\n\n`
            );
          };

          game.onStateChange.add(listener);

          // send initial state immediately
          listener();
        },

        cancel() {
          console.log("SSE stream canceled — cleaning up");
          game.onStateChange.remove(listener);
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    },
    {
      query: schemas.issuerRequest,
    }
  )
  .listen(PORT);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);
