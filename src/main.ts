import { Game } from "@/models/game";
import { Monster } from "@/models/monster";
import { Player } from "@/models/player";
import { schemas } from "@/types";
import { playerEndpointHandler } from "@/utils/endpoints";

const game = new Game();
const randomMonsters = [
  new Monster("Monster 1", 1, 2, 3, 1),
  new Monster("Monster 2", 2, 2, 3, 1),
  new Monster("Monster 3", 2, 1, 4, 1),
  new Monster("Monster 4", 1, 4, 3, 1),
  new Monster("Monster 5", 1, 5, 4, 2),
  new Monster("Monster 6", 1, 2, 3, 1),
  new Monster("Monster 7", 1, 1, 5, 1),
];
randomMonsters.forEach((monster) => game.addMonster(monster));

const PORT = process.env.PORT || 3000;
const HOSTNAME = process.env.HOSTNAME || "localhost";
console.log(`Server is running on http://${HOSTNAME}:${PORT}`);

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
      const player = new Player(name, 1, 2);
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
    "/start": async (request) =>
      playerEndpointHandler(request, (issuer) => {
        try {
          game.start(issuer);
        } catch (error) {
          return new Response(`Game cannot start: ${error}`, { status: 400 });
        }
        return new Response("Game started");
      }),
    "/reset": async (request) =>
      playerEndpointHandler(request, (issuer) => {
        try {
          game.reset(issuer);
          randomMonsters.forEach((monster) => game.addMonster(monster));
        } catch (error) {
          return new Response(`Something went wrong: ${error}`, {
            status: 400,
          });
        }
        return new Response("Game reset successfully");
      }),
    "/state": async (request) => {
      return new Response(game.state);
    },
    "/attack": async (request) =>
      playerEndpointHandler(request, (issuer, body) => {
        const parsedBody = schemas.attackRequest.safeParse(body);
        if (!parsedBody.success) {
          return new Response(
            JSON.stringify({ error: parsedBody.error.message }),
            { status: 400 }
          );
        }
        try {
          const result = game.attack(issuer, parsedBody.data.monsterId);
          return new Response(result, { status: 200 });
        } catch (error) {
          return new Response(`Something went wrong: ${error}`, {
            status: 400,
          });
        }
      }),
    "/next": (request) =>
      playerEndpointHandler(request, (issuer) => {
        try {
          const result = game.nextTurn(issuer);
          return new Response(result, { status: 200 });
        } catch (error) {
          return new Response(`Something went wrong: ${error}`, {
            status: 400,
          });
        }
      }),
  },
});
