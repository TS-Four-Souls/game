import { Game } from "@/models/game";
import { GameParameters } from "@/models/gameParameters";
import * as helper from "@/utils/gameRequestHelpers";
import { loadGameFromLogs } from "@/utils/loadGameFromLogs";
import { getTitles } from "@/models/gameStats";
import { Player } from "@/models/entities/player";
import { expect, it } from "bun:test";
import { TargetBuilder } from "@/models/targetBuilder";
import { setupTestGame } from "../testHelpers";
import { MonsterCard } from "@/models/cards";

const idle = async () => { for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0)); };

it("a rejected top-deck attack (bad slot) neither consumes the attack nor desyncs the log", async () => {
  const params = new GameParameters(() => {});
  const game = new Game("bad-cover", params);
  const players = ["A", "B"].map((id, i) => ({ issuer: id, character: "b2-isaac", user: `u-${id}`, team: i + 1 }));
  game.startOfGameSetup(players);
  game.addToHistory({ type: "Start", players, params: params.toJson() });
  void game.atGameStartDecisions();
  await idle();
  const me = game.currentPlayer;
  await helper.executeResolveRequest(game, me); // loot step
  await idle();
  helper.executeDeclareAttackRequest(game, me);
  const before = (me as any).attackThisTurn;
  await expect(helper.executeAttackMonsterRequest(game, { card: "top", toCoverIndex: 99 } as any, me)).rejects.toThrow();
  expect((me as any).attackThisTurn).toBe(before);
  const log = console.log; console.log = () => {};
  const loaded = await loadGameFromLogs(game.log);
  console.log = log;
  expect((loaded.entityHandler.getPlayerById(me.id) as any).attackThisTurn).toBe((me as any).attackThisTurn);
});

it("dice titles distance depends on expectations, not on seating order", () => {
  const mk = (id: string, face: number) => { const p = new Player(id, 1 as any, id); p.stats.nbNonAttackRolledValues[face - 1] = 10; return p; };
  const titleDist = (players: Player[], key: string) => Object.values(getTitles(players)).flat().find(t => t.name.key === key)!.distanceWithNormalizedMean;
  const log = console.log; console.log = () => {};
  // Same rolls, different seat order.
  const a = titleDist([mk("A", 1), mk("B", 6), mk("C", 3)], "title.lucky");
  const b = titleDist([mk("B", 6), mk("A", 1), mk("C", 3)], "title.lucky");
  console.log = log;
  expect(a).toBe(b);
});

it("two simultaneous starting-item choices answered out of request order replay to the same treasure deck", async () => {
  const params = new GameParameters(() => {});
  const game = new Game("eden-order", params);
  const players = ["A", "B"].map((id, i) => ({ issuer: id, character: "b2-eden", user: `u-${id}`, team: i + 1 }));
  game.startOfGameSetup(players);
  game.addToHistory({ type: "Start", players, params: params.toJson() });
  void game.atGameStartDecisions();
  await idle();
  const pending = [...game.pendingMultipleSelections.values()].sort((a, b) => b.requestId - a.requestId);
  expect(pending.length).toBe(2);
  // The player whose prompt opened second answers first.
  for (const sel of pending) {
    helper.executeSubmitSelectionRequest(game, { requestId: sel.requestId, selections: TargetBuilder.convertToSelectionItems([sel.options[0]]) },
      game.entityHandler.getPlayerById(sel.playerId));
    await idle();
  }
  const log = console.log; console.log = () => {};
  const loaded = await loadGameFromLogs(game.log);
  console.log = log;
  expect(loaded.decks.treasure._order).toEqual(game.decks.treasure._order);
});

it("building the game view does not change the game; dispatch ends a combat left without attacks", async () => {
  // Fixed monsters: a random one could add its own attack requirement (e.g. Krampus).
  const { game, player1: me, player2 } = await setupTestGame({ characters: ["b2-isaac", "b2-lilith"], playerCount: 2, monsters: ["b2-fly", "b2-fatty"] });
  const other = player2!;
  game.actions.declareAttack(me);
  // A requirement on something not attackable, and no attack left: both are cleaned up at the next dispatch.
  me.mustAttackEntity.push({ targets: [other], source: me.character, checkAttackRemaining: false } as any);
  me.attackThisTurn = 0;
  const log = console.log; console.log = () => {};
  for (const p of game.players) game.detailedStateJSON(p);
  console.log = log;
  expect(me.mustAttackEntity.length).toBe(1);
  expect(me.isEngagedInCombat).toBe(true);
  game.dispatch();
  expect(me.mustAttackEntity.length).toBe(0);
  expect(me.isEngagedInCombat).toBe(false);
});

for (const slug of ["b2-pooter", "fsp2-krampus"])
  it(`attacking the top of the monster deck with the last attack keeps the combat (${slug})`, async () => {
    const { game, player1: me } = await setupTestGame({ characters: ["b2-isaac", "b2-lilith"], playerCount: 2, monsters: ["b2-fly", "b2-fatty"] });
    game.decks.monster.addTopPosition(game.obtainCard(slug) as MonsterCard);
    game.actions.declareAttack(me);
    expect(me.attackThisTurn).toBe(1);
    await game.actions.declareAttackOnEntity(me, "topDeck", 0);
    await game.resolveEntireStack();
    const drawn = game.monsters.find(m => m.card.slug === slug)!;
    expect(drawn.isEngagedInCombat).toBe(true);
    expect(me.isEngagedInCombat).toBe(true);
  });
