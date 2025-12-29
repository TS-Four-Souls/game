import { describe, it, beforeEach, expect } from "bun:test";
import { Game } from "../../models/game";
import { Player } from "../../models/player";
import { CharacterCard, ItemCard, MonsterCard } from "@/models/cards";

describe("card activations", () => {
  let game: Game;
  let player1: Player;
  let player2: Player;

  beforeEach(() => {
    game = new Game();
    player1 = new Player("Player 1");
    player2 = new Player("Player 2");
    game.addPlayer(player1);
    game.addPlayer(player2);
    game.setupGame();
    const samson = game.decks["character"]!.getCardFromSlug(
      "b2-samson"
    )! as CharacterCard;
    const isaac = game.decks["character"]!.getCardFromSlug(
      "b2-isaac"
    )! as CharacterCard;
    game.start(player1, [samson, isaac]);
    for (const slug of ["b2-red_host", "b2-pooter", "b2-gurdy"]) {
      const monsterCardTop = game.obtainCard(slug) as MonsterCard;
      game.decks["monster"]!.addTopPosition(monsterCardTop);
    }
    const monsterCard = game.obtainCard("b2-fly")! as MonsterCard;
    const monsterCard2 = game.obtainCard("b2-fatty")! as MonsterCard;
    game.monsterSlots.forceSetMonsterAtSlot(0, monsterCard);
    game.monsterSlots.forceSetMonsterAtSlot(1, monsterCard2);
  });

});
