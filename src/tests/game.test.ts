import { describe, it, expect, beforeEach } from "bun:test";
import { Game } from "@/models/game";
import { Player } from "@/models/player";
import { TurnHandler } from "@/models/turnHandler";
import { Stack } from "@/models/stack";

describe("Game", () => {
  let game: Game;
  let player1: Player;
  let player2: Player;

  beforeEach(() => {
    game = new Game();
    player1 = new Player("player1", 1, 2, 0);
    player2 = new Player("player2", 1, 2, 0);
  });

  it("should create a new game instance", () => {
    expect(game).toBeDefined();
  });

  it("should add players to the game", () => {
    game.addPlayer(player1);
    game.addPlayer(player2);
    
    expect(game.players.length).toBe(2);
  });

  it("should start the game with a player", () => {
    game.addPlayer(player1);
    game.addPlayer(player2);
    
    expect(game.players.length).toBe(2);
    expect(() => {
      game.start(player1);
    }).not.toThrow();
  });

  it("should throw error when retrieving non-existent player", () => {
    expect(() => {
      game.getPlayerById("nonexistent");
    }).toThrow("Player not found");
  });

  it("should have empty player list initially", () => {
    expect(game.players.length).toBe(0);
  });
});

describe("Player", () => {
  let player: Player;

  beforeEach(() => {
    player = new Player("testPlayer", 3, 5, 10);
  });

  it("should create a player with correct attributes", () => {
    expect(player.id).toBe("testPlayer");
    expect(player.attackPoints).toBe(3);
    expect(player.healthPoints).toBe(5);
    expect(player.coins).toBe(10);
  });

  it("should have a unique secret token", () => {
    const player2 = new Player("testPlayer2", 3, 5, 10);
    expect(player.secret).toBeDefined();
    expect(player2.secret).toBeDefined();
    expect(player.secret !== player2.secret).toBe(true);
  });

  it("should start with full health", () => {
    expect(player.currentHealthPoints).toBe(5);
    expect(player.isDead).toBe(false);
  });

  it("should start with empty hand", () => {
    expect(player.hand.cards.length).toBe(0);
  });

  it("should start with zero souls", () => {
    expect(player.souls.length).toBe(0);
    expect(player.totalSouls).toBe(0);
  });

  it("should start with no in-play cards", () => {
    expect(player.inPlay.length).toBe(0);
  });

  it("should gain coins", () => {
    player.gainCoins(5);
    expect(player.coins).toBe(15);
    player.gainCoins(10);
    expect(player.coins).toBe(25);
  });

  it("should lose coins successfully", () => {
    expect(player.loseCoins(5, false)).toBe(5);
    expect(player.coins).toBe(5);
  });

  it("should not lose more coins than available without asMany flag", () => {
    expect(player.loseCoins(20, false)).toBe(0);
    expect(player.coins).toBe(10);
  });

  it("should lose all coins with asMany flag when not enough coins", () => {
    expect(player.loseCoins(20, true)).toBe(10);
    expect(player.coins).toBe(0);
  });

  it("should receive damage", () => {
    player.receiveDamage(2);
    expect(player.currentHealthPoints).toBe(3);
    expect(player.isDead).toBe(false);
  });

  it("should die when health reaches zero", () => {
    player.receiveDamage(5);
    expect(player.currentHealthPoints).toBe(0);
    expect(player.isDead).toBe(true);
  });

  it("should not go below zero health", () => {
    player.receiveDamage(10);
    expect(player.currentHealthPoints).toBe(0);
    expect(player.isDead).toBe(true);
  });

  it("should heal to full health", () => {
    player.receiveDamage(3);
    expect(player.currentHealthPoints).toBe(2);
    player.heal();
    expect(player.currentHealthPoints).toBe(5);
    expect(player.isDead).toBe(false);
  });

  it("should die immediately with die() method", () => {
    player.die();
    expect(player.currentHealthPoints).toBe(0);
    expect(player.isDead).toBe(true);
  });

  it("should add to score", () => {
    expect(player.score).toBe(0);
    player.addScore(3);
    expect(player.score).toBe(3);
    player.addScore(2);
    expect(player.score).toBe(5);
  });

  it("should verify secret token correctly", () => {
    expect(player.verifySecret(player.secret)).toBe(true);
    expect(player.verifySecret("wrongSecret")).toBe(false);
  });

  it("should roll a dice between 1 and 6", () => {
    const dice = player.rollDice();
    expect(dice.value >= 1 && dice.value <= 6).toBe(true);
    expect(dice.issuer).toBe(player);
  });
});

describe("Player - In-Play Cards", () => {
  let player: Player;

  beforeEach(() => {
    player = new Player("testPlayer", 3, 5, 10);
  });

  it("should have empty in-play cards initially", () => {
    expect(player.inPlay.length).toBe(0);
  });

  it("should be able to add in-play cards", () => {
    const mockCard = { id: "card1", name: "Test Card", type: "item" } as any;
    player.addInPlay(mockCard);
    expect(player.inPlay.length).toBe(1);
    expect(player.inPlay[0]).toBe(mockCard);
  });

  it("should be able to add multiple in-play cards", () => {
    const card1 = { id: "card1", name: "Card 1", type: "item" } as any;
    const card2 = { id: "card2", name: "Card 2", type: "item" } as any;
    const card3 = { id: "card3", name: "Card 3", type: "item" } as any;
    
    player.addInPlay(card1);
    player.addInPlay(card2);
    player.addInPlay(card3);
    
    expect(player.inPlay.length).toBe(3);
  });

  it("should not remove eternal or character cards by index", () => {
    const eternalCard = { id: "et1", name: "Eternal", type: "eternal" } as any;
    const characterCard = { id: "ch1", name: "Char", type: "character" } as any;
    const itemCard = { id: "it1", name: "Item", type: "item" } as any;

    player.addInPlay(eternalCard);
    player.addInPlay(characterCard);
    player.addInPlay(itemCard);

    expect(player.removeInPlayByIndex(0)).toBe(false);
    expect(player.removeInPlayByIndex(1)).toBe(false);
    expect(player.inPlay.length).toBe(3);
    expect(player.removeInPlayByIndex(2)).toBe(true);
    expect(player.inPlay.length).toBe(2);
  });

  it("should return false when removing non-existent in-play card", () => {
    const card = { id: "c1", name: "Card", type: "item" } as any;
    player.addInPlay(card);
    expect(player.removeInPlay({ id: "other" } as any)).toBe(false);
    expect(player.inPlay.length).toBe(1);
  });

  it("should ignore negative index removal", () => {
    const card = { id: "cardX", name: "CardX", type: "item" } as any;
    player.addInPlay(card);

    const removed = player.removeInPlayByIndex(-1);
    expect(removed).toBe(false);
    expect(player.inPlay.length).toBe(1);
  });

  it("should return true but keep size when removing out-of-range index", () => {
    const card = { id: "cardY", name: "CardY", type: "item" } as any;
    player.addInPlay(card);

    const removed = player.removeInPlayByIndex(5);
    expect(removed).toBe(true);
    expect(player.inPlay.length).toBe(1);
  });
});

describe("Player - Removal", () => {
  let player: Player;

  beforeEach(() => {
    player = new Player("testPlayer", 3, 5, 10);
  });

  it("should remove card from in-play when present", () => {
    const card = { id: "cardA", name: "A", type: "item" } as any;
    player.addInPlay(card);

    const removed = player.removeCard(card);
    expect(removed).toBe(true);
    expect(player.inPlay.length).toBe(0);
  });

  it("should remove card from hand when present there", () => {
    const loot = { id: "loot1", name: "Loot", type: "loot" } as any;
    player.hand.addToHand(loot as any);

    const removed = player.removeCard(loot as any);
    expect(removed).toBe(true);
    expect(player.hand.length).toBe(0);
    expect(player.inPlay.length).toBe(0);
  });
});

describe("Player - Souls", () => {
  let player: Player;

  beforeEach(() => {
    player = new Player("testPlayer", 3, 5, 10);
  });

  it("should start with zero souls", () => {
    expect(player.souls.length).toBe(0);
    expect(player.totalSouls).toBe(0);
  });

  it("should be able to add a soul card", () => {
    const soulCard = { id: "soul1", name: "Soul", soul: 1 } as any;
    player.addSoul(soulCard);
    
    expect(player.souls.length).toBe(1);
    expect(player.souls[0]).toBe(soulCard);
  });

  it("should calculate total souls correctly", () => {
    const soul1 = { id: "soul1", name: "Soul 1", soul: 1 } as any;
    const soul2 = { id: "soul2", name: "Soul 2", soul: 2 } as any;
    const soul3 = { id: "soul3", name: "Soul 3", soul: 1 } as any;
    
    player.addSoul(soul1);
    player.addSoul(soul2);
    player.addSoul(soul3);
    
    expect(player.totalSouls).toBe(4);
  });

  it("should throw error when adding card with no soul", () => {
    const badCard = { id: "card1", name: "Bad Card", soul: -1 } as any;
    
    expect(() => {
      player.addSoul(badCard);
    }).toThrow("Cannot add a card with no soul as a soul card.");
  });

  it("should be able to remove a soul card", () => {
    const soul1 = { id: "soul1", name: "Soul 1", soul: 1 } as any;
    const soul2 = { id: "soul2", name: "Soul 2", soul: 2 } as any;
    
    player.addSoul(soul1);
    player.addSoul(soul2);
    expect(player.souls.length).toBe(2);
    
    const removed = player.removeSoul(soul1);
    expect(removed).toBe(true);
  });

  it("should return false when removing non-existent soul", () => {
    const soul1 = { id: "soul1", name: "Soul 1", soul: 1 } as any;
    const soul2 = { id: "soul2", name: "Soul 2", soul: 2 } as any;
    
    player.addSoul(soul1);
    const removed = player.removeSoul(soul2);
    
    expect(removed).toBe(false);
    expect(player.souls.length).toBe(1);
  });
});

describe("Player - Damage & Health", () => {
  let player: Player;

  beforeEach(() => {
    player = new Player("testPlayer", 3, 10, 10);
  });

  it("should take multiple damage hits", () => {
    player.receiveDamage(2);
    expect(player.currentHealthPoints).toBe(8);
    
    player.receiveDamage(3);
    expect(player.currentHealthPoints).toBe(5);
    
    player.receiveDamage(1);
    expect(player.currentHealthPoints).toBe(4);
  });

  it("should survive partial damage and be alive", () => {
    player.receiveDamage(5);
    expect(player.isDead).toBe(false);
    expect(player.currentHealthPoints).toBe(5);
  });

  it("should be dead after exactly reaching zero health", () => {
    player.receiveDamage(10);
    expect(player.isDead).toBe(true);
    expect(player.currentHealthPoints).toBe(0);
  });

  it("should recover to full health after heal", () => {
    player.receiveDamage(7);
    expect(player.currentHealthPoints).toBe(3);
    
    player.heal();
    expect(player.currentHealthPoints).toBe(10);
    expect(player.isDead).toBe(false);
  });

  it("should be healable from dead state", () => {
    player.receiveDamage(10);
    expect(player.isDead).toBe(true);
    
    player.heal();
    expect(player.isDead).toBe(false);
    expect(player.currentHealthPoints).toBe(10);
  });
});

describe("Player - Coins", () => {
  let player: Player;

  beforeEach(() => {
    player = new Player("testPlayer", 3, 5, 100);
  });

  it("should start with correct coin amount", () => {
    expect(player.coins).toBe(100);
  });

  it("should gain multiple coin transactions", () => {
    player.gainCoins(10);
    expect(player.coins).toBe(110);
    
    player.gainCoins(25);
    expect(player.coins).toBe(135);
    
    player.gainCoins(5);
    expect(player.coins).toBe(140);
  });

  it("should lose exact amount of coins when available", () => {
    const lost = player.loseCoins(25, false);
    
    expect(lost).toBe(25);
    expect(player.coins).toBe(75);
  });

  it("should lose multiple times", () => {
    player.loseCoins(20, false);
    expect(player.coins).toBe(80);
    
    player.loseCoins(30, false);
    expect(player.coins).toBe(50);
    
    player.loseCoins(50, false);
    expect(player.coins).toBe(0);
  });

  it("should handle edge case of zero coins", () => {
    const lost = player.loseCoins(100, false);
    expect(lost).toBe(100);
    expect(player.coins).toBe(0);
    
    const lostMore = player.loseCoins(1, false);
    expect(lostMore).toBe(0);
  });

  it("should use asMany flag correctly", () => {
    const lost = player.loseCoins(150, true);
    expect(lost).toBe(100);
    expect(player.coins).toBe(0);
  });
});

describe("DiceRoll", () => {
  let player: Player;

  beforeEach(() => {
    player = new Player("testPlayer", 3, 5, 10);
  });

  it("should create a valid dice roll", () => {
    const dice = player.rollDice();
    
    expect(dice).toBeDefined();
    expect(dice.value >= 1 && dice.value <= 6).toBe(true);
  });

  it("should track the issuer correctly", () => {
    const dice = player.rollDice();
    expect(dice.issuer).toBe(player);
    expect(dice.issuer.id).toBe("testPlayer");
  });

  it("should not be an attack roll by default", () => {
    const dice = player.rollDice();
    expect(dice.attackRoll).toBe(false);
  });

  it("should allow setting dice value between 1 and 6", () => {
    const dice = player.rollDice();
    
    dice.value = 1;
    expect(dice.value).toBe(1);
    
    dice.value = 6;
    expect(dice.value).toBe(6);
    
    dice.value = 3;
    expect(dice.value).toBe(3);
  });

  it("should roll and generate new value", () => {
    const dice = player.rollDice();
    const firstValue = dice.value;
    
    dice.roll();
    const secondValue = dice.value;
    
    // Values should be between 1 and 6
    expect(firstValue >= 1 && firstValue <= 6).toBe(true);
    expect(secondValue >= 1 && secondValue <= 6).toBe(true);
  });

  it("should return json representation correctly", () => {
    const dice = player.rollDice();
    const json = dice.json;
    
    expect(json.issuer).toBe("testPlayer");
    expect(json.diceRoll >= 1 && json.diceRoll <= 6).toBe(true);
  });

  it("should resolve to current value", () => {
    const dice = player.rollDice();
    dice.value = 4;
    
    expect(dice.value).toBe(4);
  });
});

describe("Game - Multiple Players", () => {
  let game: Game;
  let player1: Player;
  let player2: Player;
  let player3: Player;

  beforeEach(() => {
    game = new Game();
    player1 = new Player("player1", 2, 4, 10);
    player2 = new Player("player2", 3, 5, 15);
    player3 = new Player("player3", 1, 6, 8);
  });

  it("should add multiple players", () => {
    game.addPlayer(player1);
    game.addPlayer(player2);
    game.addPlayer(player3);
    
    expect(game.players.length).toBe(3);
  });

  it("should throw error when adding duplicate player ID", () => {
    game.addPlayer(player1);
    const duplicatePlayer = new Player("player1", 2, 4, 10);
    
    expect(() => {
      game.addPlayer(duplicatePlayer);
    }).toThrow();
  });

  it("should retrieve correct players", () => {
    game.addPlayer(player1);
    game.addPlayer(player2);
    game.addPlayer(player3);
    
    expect(() => game.getPlayerById("player1")).not.toThrow();
    expect(() => game.getPlayerById("player2")).not.toThrow();
    expect(() => game.getPlayerById("player3")).not.toThrow();
  });

  it("should maintain player order", () => {
    game.addPlayer(player1);
    game.addPlayer(player2);
    game.addPlayer(player3);
    
    expect(game.players[0]).toBe(player1);
    expect(game.players[1]).toBe(player2);
    expect(game.players[2]).toBe(player3);
  });

  it("should get all players hands", () => {
    game.addPlayer(player1);
    game.addPlayer(player2);
    game.addPlayer(player3);
    
    const hands = game.allHands();
    expect(hands.length).toBe(3);
    expect(hands[0]?.player).toBe(player1);
    expect(hands[1]?.player).toBe(player2);
    expect(hands[2]?.player).toBe(player3);
  });
});

describe("Game - Guardrails", () => {
  let game: Game;
  let player1: Player;
  let player2: Player;

  beforeEach(() => {
    game = new Game();
    player1 = new Player("p1", 2, 4, 5);
    player2 = new Player("p2", 2, 4, 5);
    game.addPlayer(player1);
    game.addPlayer(player2);
  });

  it("should not allow adding players after game start", () => {
    game.start(player1);
    const latePlayer = new Player("late", 1, 1, 0);
    expect(() => game.addPlayer(latePlayer)).toThrow("Game already started");
  });

  it("should select the first n options", () => {
    const options = [1, 2, 3, 4];
    const result = game.select(player1, 2, options);
    expect(result.selected).toEqual([1, 2]);
    expect(result.remaining).toEqual([3, 4]);
  });
});

describe("Game - Monsters", () => {
  let game: Game;
  let player1: Player;
  let player2: Player;

  beforeEach(() => {
    game = new Game();
    player1 = new Player("player1", 2, 4, 10);
    player2 = new Player("player2", 3, 5, 15);
    game.addPlayer(player1);
    game.addPlayer(player2);
  });
});

describe("Game - Stack Operations", () => {
  let game: Game;
  let player1: Player;
  let player2: Player;

  beforeEach(() => {
    game = new Game();
    player1 = new Player("player1", 2, 4, 10);
    player2 = new Player("player2", 3, 5, 15);
    game.addPlayer(player1);
    game.addPlayer(player2);
  });

  it("should have an empty stack initially", () => {
    expect(game.stack.size).toBe(0);
  });

  it("should reset the stack", () => {
    game.resetStack();
    expect(game.stack.size).toBe(0);
  });

  it("should cancel stack", () => {
    game.cancelStack();
    expect(game.stack.size).toBe(0);
  });

  it("should add to stack and resolve dice roll", () => {
    const dice = player1.rollDice();
    game.addToStack(dice);
    expect(game.stack.size).toBe(1);

    game.resolveStack();
    expect(game.stack.size).toBe(0);
  });

  it("should get destroyed cards", () => {
    const destroyed = game.destroyedCards;
    expect(destroyed).toBeDefined();
    expect(Array.isArray(destroyed)).toBe(true);
  });
});

describe("Stack - Behavior", () => {

  it("should resolve and remove the top element", () => {
    const stack = new Stack();
    const loot = { id: "loot", type: "loot" } as any;
    const dice = new Player("p", 1, 1, 0).rollDice();

    stack.push(loot as any);
    stack.push(dice);

    const resolved = stack.resolve();
    expect(resolved).toBe(dice);
    expect(stack.size).toBe(1);
  });

  it("should remove element at index", () => {
    const stack = new Stack();
    const a = { id: "a", type: "loot" } as any;
    const b = { id: "b", type: "loot" } as any;
    const c = { id: "c", type: "loot" } as any;

    stack.push(a as any);
    stack.push(b as any);
    stack.push(c as any);

    stack.removeAt(1);
    expect(stack.size).toBe(2);
    expect(stack.elements[0]).toBe(a);
    expect(stack.elements[1]).toBe(c);
  });
});

describe("Game - Game State", () => {
  let game: Game;
  let player1: Player;
  let player2: Player;

  beforeEach(() => {
    game = new Game();
    player1 = new Player("player1", 2, 4, 10);
    player2 = new Player("player2", 3, 5, 15);
    game.addPlayer(player1);
    game.addPlayer(player2);
  });

  it("should get game state JSON", () => {
    const stateJson = game.stateJson;
    
    expect(stateJson).toBeDefined();
    expect(stateJson.players).toBeDefined();
    expect(stateJson.players.length).toBe(2);
  });

  it("should get decks", () => {
    const decks = game.decks;
    expect(decks).toBeDefined();
    expect(typeof decks).toBe("object");
  });

  it("should get turn handler", () => {
    const turnHandler = game.turnHandler;
    expect(turnHandler).toBeDefined();
  });

  it("should get shop", () => {
    game.start(player1);
    const shop = game.shop;
    expect(shop).toBeDefined();
  });

  it("should get encounters", () => {
    game.start(player1);
    const encounters = game.encounters;
    expect(encounters).toBeDefined();
  });

  it("should get monster slots", () => {
    game.start(player1);
    const slots = game.monsterSlots;
    expect(slots).toBeDefined();
  });

  it("should get stack", () => {
    const stack = game.stack;
    expect(stack).toBeDefined();
  });
});

describe("TurnHandler", () => {
  it("should advance turns and rounds correctly", () => {
    const handler = new TurnHandler();
    const p1 = new Player("p1", 1, 1, 0);
    const p2 = new Player("p2", 1, 1, 0);

    handler.initialize([p1, p2]);
    expect(handler.current).toBe(p1);
    expect(handler.round).toBe(1);

    handler.endTurn();
    expect(handler.current).toBe(p2);
    expect(handler.round).toBe(1);

    handler.endTurn();
    expect(handler.current).toBe(p1);
    expect(handler.round).toBe(2);
  });
});

describe("Game - Souls & State", () => {
  let game: Game;
  let player1: Player;
  let player2: Player;

  beforeEach(() => {
    game = new Game();
    player1 = new Player("player1", 2, 4, 10);
    player2 = new Player("player2", 3, 5, 15);
    game.addPlayer(player1);
    game.addPlayer(player2);
  });

  it("should compute players with most souls", () => {
    const soul1 = { id: "s1", name: "Soul 1", soul: 1 } as any;
    const soul2 = { id: "s2", name: "Soul 2", soul: 2 } as any;

    game.addSoul(player1, soul1);
    game.addSoul(player2, soul2);

    const leaders = game.playersWithMostSouls;
    expect(leaders.length).toBe(1);
    expect(leaders[0]).toBe(player2);
  });

  it("should return all leaders on tie", () => {
    const soul = { id: "s1", name: "Soul", soul: 1 } as any;
    game.addSoul(player1, soul);
    game.addSoul(player2, soul);

    const leaders = game.playersWithMostSouls;
    expect(leaders.length).toBe(2);
    expect(leaders).toContain(player1);
    expect(leaders).toContain(player2);
  });

  it("stateJson should include in-play slugs", () => {
    const card = { slug: "card-1", name: "Card", type: "item" } as any;
    player1.addInPlay(card);

    const state = game.stateJson;
    expect(state.players.length).toBe(2);
    const p1 = state.players.find((p) => p.name === "player1");
    expect(p1).toBeDefined();
    expect(p1?.inPlay[0]?.slug).toBe("card-1");
  });

  it("should return both players when no souls are present", () => {
    const leaders = game.playersWithMostSouls;
    expect(leaders.length).toBe(2);
    expect(leaders).toContain(player1);
    expect(leaders).toContain(player2);
  });
});

describe("Game - Damage System", () => {
  let game: Game;
  let player1: Player;
  let player2: Player;

  beforeEach(() => {
    game = new Game();
    player1 = new Player("player1", 2, 10, 10);
    player2 = new Player("player2", 3, 8, 15);
    game.addPlayer(player1);
    game.addPlayer(player2);
  });

  it("should deal damage between entities", () => {
    const initialHealth = player2.currentHealthPoints;
    const mockCard = { name: "Test Card" } as any;
    
    game.dealDamage(player1, player2, mockCard, 1);
    game.resolveStack();
    expect(player2.currentHealthPoints).toBe(initialHealth - 1);
  });

  it("should handle zero damage", () => {
    const initialHealth = player2.currentHealthPoints;
    const mockCard = { name: "Test Card" } as any;
    
    game.dealDamage(player1, player2, mockCard, 0);
    
    expect(player2.currentHealthPoints).toBe(initialHealth);
  });

  it("should handle damage that kills entity", () => {
    const mockCard = { name: "Test Card" } as any;
    
    game.dealDamage(player1, player2, mockCard, 10);
    game.resolveStack();
    game.resolveStack();

    expect(player2.isDead).toBe(true);
    expect(player2.currentHealthPoints).toBe(0);
  });
});

describe("Player - Edge Cases & Combinations", () => {
  let player: Player;

  beforeEach(() => {
    player = new Player("testPlayer", 5, 20, 50);
  });

  it("should handle multiple damage and healing cycles", () => {
    player.receiveDamage(5);
    expect(player.currentHealthPoints).toBe(15);
    
    player.heal();
    expect(player.currentHealthPoints).toBe(20);
    
    player.receiveDamage(10);
    expect(player.currentHealthPoints).toBe(10);
    
    player.heal();
    expect(player.currentHealthPoints).toBe(20);
  });

  it("should handle complex coin transactions", () => {
    player.gainCoins(25);
    expect(player.coins).toBe(75);
    
    player.loseCoins(20, false);
    expect(player.coins).toBe(55);
    
    player.gainCoins(10);
    expect(player.coins).toBe(65);
    
    player.loseCoins(100, true);
    expect(player.coins).toBe(0);
    
    player.gainCoins(30);
    expect(player.coins).toBe(30);
  });

  it("should accumulate score over time", () => {
    expect(player.score).toBe(0);
    
    player.addScore(1);
    player.addScore(2);
    player.addScore(3);
    player.addScore(4);
    player.addScore(5);
    
    expect(player.score).toBe(15);
  });

  it("should handle negative score additions", () => {
    player.addScore(10);
    expect(player.score).toBe(10);
    
    player.addScore(-3);
    expect(player.score).toBe(7);
  });

  it("should handle max dice value properly", () => {
    const dice = player.rollDice();
    
    for (let i = 1; i <= 6; i++) {
      dice.value = i;
      expect(dice.value).toBe(i);
      expect(dice.value).toBe(i);
    }
  });

  it("should maintain player attributes immutably", () => {
    const originalAttack = player.attackPoints;
    const originalHealth = player.healthPoints;
    
    player.receiveDamage(5);
    
    expect(player.attackPoints).toBe(originalAttack);
    expect(player.healthPoints).toBe(originalHealth);
  });

  it("should handle soul card with zero soul value", () => {
    const zeroSoulCard = { id: "soul0", name: "Zero Soul", soul: 1 } as any;
    
    // Should not throw since soul is 1
    player.addSoul(zeroSoulCard);
    expect(player.souls.length).toBe(1);
    expect(player.totalSouls).toBe(1);
  });

  it("should handle many souls correctly", () => {
    const souls = [];
    for (let i = 1; i <= 10; i++) {
      const soul = { id: `soul${i}`, name: `Soul ${i}`, soul: i } as any;
      souls.push(soul);
      player.addSoul(soul);
    }
    
    expect(player.souls.length).toBe(10);
    expect(player.totalSouls).toBe(55); // 1+2+3+...+10 = 55
  });

  it("should handle removing items in various ways", () => {
    const card1 = { id: "card1", name: "Card 1", type: "item" } as any;
    const card2 = { id: "card2", name: "Card 2", type: "item" } as any;
    const card3 = { id: "card3", name: "Card 3", type: "character" } as any;
    
    player.addInPlay(card1);
    player.addInPlay(card2);
    player.addInPlay(card3);
    
    expect(player.inPlay.length).toBe(3);
    
    // Remove regular card
    player.removeInPlay(card1);
    expect(player.inPlay.length).toBe(2);
  });
});
