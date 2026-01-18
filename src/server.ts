import { Server as Engine } from "@socket.io/bun-engine";
import { Server } from "socket.io";
import { Game } from "./models/game";
import { Player } from "./models/player";
import type { ClientToServerEvents, Issuer, ServerToClientEvents, TargetSelectorResponse } from "./shared/api";
import { schemas } from "./shared/api";
import { TargetBuilder } from "./models/targetBuilder";

const PORT = process.env.PORT || 3000;
const HOSTNAME = process.env.HOSTNAME || "localhost";
const io = new Server<ClientToServerEvents, ServerToClientEvents>();

const game = new Game();

const engine = new Engine({
  path: "/socket.io/",
  cors: {
    origin: "*",
  },
});

io.bind(engine);

game.onStateChange.add(() => {
  game.players.map((player) => {
    io.to(player.id).emit("on:game:changed", game.detailedStateJSON(player));
  })
});

io.on("connection", (socket) => {
  console.log("Client connected");

  socket.on("join", (payload, callback) => {
    const validated = schemas.joinRequest.safeParse(payload);
    if (!validated.success) {
      return callback({ status: 400, error: validated.error });
    }
    try {
      const name = validated.data;
      const player = new Player(name);
      game.addPlayer(player);
      console.log(`Player ${name} joined the game`);
      socket.join(player.id);
      game.addToHistory(validated.data);
      return callback({ status: 200, secret: player.secret });
    } catch (error) {
      console.error("Failed to join the game", error);
      return callback({ status: 400, error });
    }
  });

  socket.on("rejoin", (payload, callback) => {
    const validated = schemas.rejoinRequest.safeParse(payload);
    if (!validated.success) {
      return callback({ status: 400, error: validated.error });
    }
    try {
      const player = game.getPlayerById(validated.data.id);
      if (!player.verifySecret(validated.data.secret)) {
        return callback({ status: 400, error: "Invalid secret" });
      }
      socket.join(player.id);
      game.addToHistory(validated.data);
      return callback({ status: 200, gameState: game.isStarted ? game.detailedStateJSON(validated.data) : undefined });
    } catch (error) {
      console.error("Failed to rejoin the game", error);
      return callback({ status: 400, error });
    }
  });

  socket.on("start", (payload, callback) => {
    const validated = schemas.startRequest.safeParse(payload);
    if (!validated.success) {
      return callback({ status: 400, error: validated.error });
    }
    try {
      game.start(validated.data.issuer);
      io.emit("on:game:start");
      game.addToHistory(validated.data);
      return callback({ status: 200 });
    } catch (error) {
      console.error("Failed to start the game", error);
      return callback({ status: 400, error });
    }
  });

  socket.on("reset", (payload, callback) => {
    const validated = schemas.resetRequest.safeParse(payload);
    if (!validated.success) {
      return callback({ status: 400, error: validated.error });
    }
    try {
      game.reset();
      game.addToHistory(validated.data);
      return callback({ status: 200 });
    } catch (error) {
      console.error("Failed to reset the game", error);
      return callback({ status: 400, error });
    }
  });

  socket.on("declareAttack", (payload, callback) => {
    const validated = schemas.declareAttackRequest.safeParse(payload);
    if (!validated.success) {
      return callback({ status: 400, error: validated.error });
    }
    try {
      const player = game.getPlayerByIssuer(validated.data.issuer);
      game.declareAttack(player);
      return callback({ status: 200 });
    } catch (error) {
      console.error("Failed to declare attack", error);
      return callback({ status: 400, error });
    }
  });

  socket.on("attackMonster", (payload, callback) => {
    const validated = schemas.attackMonsterRequest.safeParse(payload);
    if (!validated.success) {
      return callback({ status: 400, error: validated.error });
    }
    try {
      const player = game.getPlayerById(validated.data.issuer.id);
      const monster =
        validated.data.index === "top"
          ? "topDeck"
          : game.encounters.monsterIn(validated.data.index);
      if (!monster) {
        return new Response(`No monster at index ${validated.data.index}`, {
          status: 400,
        });
      }
      const drawInIndex =
        validated.data.index === "top"
          ? validated.data.replaceIndex
          : -1;
      game.declareAttackOnMonster(player, monster, drawInIndex);
      game.addToHistory(validated.data);
    } catch (error) {
      console.error("Failed to declare attack", error);
      return callback({ status: 400, error });
    }
    return callback({ status: 200 });
  });

  socket.on("attackRoll", (payload, callback) => {
    const validated = schemas.attackRollRequest.safeParse(payload);
    if (!validated.success) {
      return callback({ status: 400, error: validated.error });
    }
    try {
      const player = game.getPlayerByIssuer(validated.data);
      game.attackRoll(player);
      game.addToHistory(validated.data);
      return callback({ status: 200 });
    } catch (error) {
      console.error("Failed to declare attack", error);
      return callback({ status: 400, error });
    }
  });

  socket.on("resolve", (payload, callback) => {
    const validated = schemas.resolveRequest.safeParse(payload);
    if (!validated.success) {
      return callback({ status: 400, error: validated.error });
    }
    try {
      const player = game.getPlayerByIssuer(validated.data.issuer);
      game.resolveStack();
      game.addToHistory(validated.data);
      return callback({ status: 200 });
    } catch (error) {
      console.error("Failed to resolve the stack", error);
      return callback({ status: 400, error });
    }
  });

  socket.on("submitSelection", (payload, callback) => {
    const validated = schemas.submitSelectionRequest.safeParse(payload);
    if (!validated.success) {
      return callback({ status: 400, error: validated.error });
    }
    try {
      const player = game.getPlayerByIssuer(validated.data.issuer);
      game.submitSelection(
          validated.data.issuer,
          validated.data.requestId,
          validated.data.selections
        );
      game.addToHistory(validated.data);
      return callback({ status: 200 });
    } catch (error) {
      console.error("Failed to submit selection", error);
      return callback({ status: 400, error });
    }
  });

  socket.on("playCard", (payload, callback) => {
    const validated = schemas.playCardRequest.safeParse(payload);
    if (!validated.success) {
      return callback({ status: 400, error: validated.error });
    }
    try {
      const player = game.getPlayerByIssuer(validated.data.issuer);
      const partialChoices = validated.data.targetChoices || [];
            const card = TargetBuilder.getCardFromPlayer(game, player, validated.data.index, "hand");
            const choices: TargetSelectorResponse = TargetBuilder.getNextSelector(game, player, card, partialChoices, validated.data.effectIndex);
            if (choices.complete) {
              const targets = TargetBuilder.buildTargets(game, player, card, partialChoices, validated.data.effectIndex);
              game.playCard(player, validated.data.index, targets);
            }
      game.addToHistory(validated.data);
      return callback({ response: choices,status: 200 });
    } catch (error) {
      console.error("Failed to play card", error);
      return callback({ status: 400, error });
    }
  });

  socket.on("activate", async (payload, callback) => {
    const validated = schemas.activateRequest.safeParse(payload);
    if (!validated.success) {
      return callback({ status: 400, error: validated.error });
    }
    try {
      const player = game.getPlayerByIssuer(validated.data.issuer);
      const partialChoices = validated.data.targetChoices || [];
      const item = TargetBuilder.getCardFromPlayer(game, player, validated.data.index, "inPlay");
      const choices: TargetSelectorResponse = TargetBuilder.getNextSelector(game, player, item, partialChoices, validated.data.effectIndex);
      if (choices.complete) {
        console.log("Activation complete");
        const targets = TargetBuilder.buildTargets(game, player, item, partialChoices, validated.data.effectIndex);
        await game.activateItemAtIndex(player, validated.data.index, targets, validated.data.effectIndex);
        game.addToHistory(validated.data);
      }
      return callback({ response: choices, status: 200 });
    } catch (error) {
      console.error("Failed to play card", error);
      return callback({ status: 400, error });
    }
  });
  socket.on("purchase", async (payload, callback) => {
    const validated = schemas.purchaseRequest.safeParse(payload);
    if (!validated.success) {
      return callback({ status: 400, error: validated.error });
    }
    try {
      const player = game.getPlayerByIssuer(validated.data.issuer);
      game.purchase(player, validated.data.index);
      game.addToHistory(validated.data);
      return callback({ status: 200 });
    } catch (error) {
      console.error("Failed to play card", error);
      return callback({ status: 400, error });
    }
  });
  socket.on("endTurn", async (payload, callback) => {
    const validated = schemas.endTurnRequest.safeParse(payload);
    if (!validated.success) {
      return callback({ status: 400, error: validated.error });
    }
    try {
      game.addToHistory(validated.data);
      return callback({ response: game.nextTurn(validated.data.issuer), status: 200 });
    } catch (error) {
      console.error("Failed to end turn", error);
      return callback({ status: 400, error });
    }
  });

  socket.on("giveCoins", (payload, callback) => {
    const validated = schemas.giveCoinsRequest.safeParse(payload);
    if (!validated.success) {
      return callback({ status: 400, error: validated.error });
    }
    try {
      const player = game.getPlayerByIssuer(validated.data.issuer);
      const target = game.getPlayerById(validated.data.target);
      const amount = validated.data.coins;
      if(!game.giveCoins(player, target, amount))
        throw new Error("amount of coins invalid");
      game.addToHistory(validated.data);
      return callback({ status: 200 });
    } catch (error) {
      console.error("Failed to give coins", error);
      return callback({ status: 400, error });
    }
  });

// ------------- DEBUG EVENTS -------------

  socket.on("debugLoot", (payload, callback) => {
    const validated = schemas.debugLootRequest.safeParse(payload);
    if (!validated.success) {
      return callback({ status: 400, error: validated.error });
    }
    try {
      const player = game.getPlayerByIssuer(validated.data);
      game.addToHistory(validated.data);
      return callback({ response: game.loot(player), status: 200 });
    } catch (error) {
      console.error("Failed to debug loot", error);
      return callback({ status: 400, error });
    }
  });

  socket.on("debugGainTreasure", (payload, callback) => {
    const validated = schemas.debugGainTreasureRequest.safeParse(payload);
    if (!validated.success) {
      return callback({ status: 400, error: validated.error });
    }
    try {
      const player = game.getPlayerByIssuer(validated.data);
      game.addToHistory(validated.data);
      return callback({ response: game.gainTreasure(player), status: 200 });
    } catch (error) {
      console.error("Failed to debug gain treasure", error);
      return callback({ status: 400, error });
    }
  });
  socket.on("debugReset", (payload, callback) => {
    const validated = schemas.debugResetRequest.safeParse(payload);
    if (!validated.success) {
      return callback({ status: 400, error: validated.error });
    }
    try {
      game.reset();
      const p1 = new Player("DrMint", 1, 2, 0, "");
      const p2 = new Player("slichau", 1, 2, 0, "");
      game.addPlayer(p1);
      game.addPlayer(p2);
      game.setupGame();
      // const isaac = game.decks["character"]!.getCardFromSlug(
      //   "b2-isaac"
      // )! as CharacterCard;
      // const samson = game.decks["character"]!.getCardFromSlug(
      //   "b2-samson"
      // )! as CharacterCard;
      // const card = game.obtainCard("b2-remote_detonator")!;
      // const card2 = game.obtainCard("b2-xv_the_devil")! as LootCard;
      const loots = ["b2-i_the_magician", "b2-gold_bomb", "b2-ii_the_high_priestess", "b2-bomb"]
      for (const slug of loots) {
        // const card = game.obtainCard(slug)! as LootCard;
        // game.addCardToHand(p1, card);
      }
      // const card2 = game.obtainCard("b2-gold_bomb")! as LootCard;
      // // const card2 = game.obtainCard("b2-bomb")! as LootCard;
      // game.addCardToHand(p1, card2);
      game.start(p1);
      const treas = ["b2-pandoras_box", "b2-placebo", "b2-the_d20", "b2-blank_card", "b2-chaos_card"]
      for (const slug of treas) {
        // const card = game.obtainCard(slug)!;
        // game.addInPlay(p1, card);
      }
      game.addToHistory(validated.data);
      return new Response("Debug reset", {
        status: 200,
      });
      return callback({ status: 200 });
    } catch (error) {
      console.error("Failed to debug reset", error);
      return callback({ status: 400, error });
    }
  });

  io.on("disconnect", (socket) => {
    console.log("Client disconnected");
  });
});

export default {
  port: PORT,
  hostname: HOSTNAME,
  ...engine.handler(),
};
