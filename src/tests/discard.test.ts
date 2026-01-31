import { describe, it, expect, beforeEach } from "bun:test";
import { Game } from "../models/game";
import { DamageOnStack, DiceRoll, Player } from "../models/player";
import { pl } from "zod/locales";
import type { LootCard, ItemCard, Card } from "@/models/cards";
import { InplayType, MonsterCard, CharacterCard } from "@/models/cards";
import { setupStandardTestGame, dischargeEachItemsAndRemoveCoins, emptyHands, mockGameSelections } from "./testHelpers";

describe("Discard", () => {
    let game: Game;
    let player1: Player;
    let player2: Player;

    beforeEach(() => {
        const setup = setupStandardTestGame();
        game = setup.game;
        player1 = setup.player1;
        player2 = setup.player2!;
    });

    it("discard 1 loots on death", async () => {
        game.loot(player1, 10);
        const handSize = player1.hand.length;
        game.kill(player1, player1, player1.hand._hand[0] as Card);
        expect(game.decks['loot']!.discard.length).toBe(0);
        await game.resolveEntireStack();
        expect(game.stack.size).toBe(0);
        expect(player1.hand.length).toBe(handSize - 1);
        expect(game.decks['loot']!.discard.length).toBe(1);
    });

    it("discard card on play", async () => {
        game.addCardToHand(player1, game.obtainCard("b2-a_dime")! as LootCard);
        game.addCardToHand(player1, game.obtainCard("b2-a_nickel")! as LootCard);
        game.playCard(player1, 0);
        game.addLootPlay(player1, 1);
        game.playCard(player1, 0);
        expect(game.decks['loot']!.discard.length).toBe(0);
        await game.resolveStack();
        expect(game.stack.size).toBe(1);
        expect(game.decks['loot']!.discard.length).toBe(1);
        await game.resolveStack();
        expect(game.stack.size).toBe(0);
        expect(game.decks['loot']!.discard.length).toBe(2);
    });
    
    it("discard trinket on play", async () => {
        game.addCardToHand(player1, game.obtainCard("b2-swallowed_penny")! as LootCard);
        game.playCard(player1, 0);
        expect(game.decks['loot']!.discard.length).toBe(0);
        await game.resolveEntireStack();
        expect(game.stack.size).toBe(0);
        expect(game.decks['loot']!.discard.length).toBe(0);
        game.kill(player1, player1, player1.inPlay[0]!);
        await game.resolveEntireStack();
        expect(game.decks['loot']!.discard.length).toBe(1);
        expect(game.decks['monster']!.discard.length).toBe(0);
        expect(game.decks['treasure']!.discard.length).toBe(0);
    });

    it("curse discard", async () => {
        const card: MonsterCard = game.obtainCard("b2-curse_of_loss") as MonsterCard;
        game.decks['monster']!.addTopPosition(card);
        game.declareAttack(player1);
        game.declareAttackOnMonster(player1, "topDeck", 0);
        await game.resolveEntireStack();
        expect(game.decks['loot']!.discard.length).toBe(0);
        expect(game.decks['monster']!.discard.length).toBe(0);
        expect(game.decks['treasure']!.discard.length).toBe(0);
        expect(player1.inPlay.map(c => c.slug)).toContain("b2-curse_of_loss");
        game.kill(player1, player1, player1.inPlay[0]!);
        await game.resolveEntireStack();
        expect(game.decks['loot']!.discard.length).toBe(0);
        expect(game.decks['treasure']!.discard.length).toBe(0);
        expect(game.decks['monster']!.discard.length).toBe(1);
    });

    it("kill monster with soul becomes player's soul (not discarded)", async () => {
        // Use Gurdy which has a soul in the monster deck
        const gurdy = game.decks['monster']!.getCardFromSlug("b2-gurdy") as MonsterCard;
        game.decks['monster']!.addTopPosition(gurdy);
        
        game.declareAttack(player1);
        game.declareAttackOnMonster(player1, "topDeck", 0);
        
        const monster = game.monsters[0]!;
        const monsterCard = monster.card;
        
        // Verify the monster has a soul reward
        expect(monsterCard.rewards?.soul).toBeGreaterThan(0);
        
        const initialSouls = player1.totalSouls;
        const initialDiscardSize = game.decks['monster']!.discard.length;
        
        // Kill the monster
        game.kill(player1, monster, monsterCard);
        await game.resolveEntireStack();
        
        // Monster should become a soul, not be discarded
        expect(player1.totalSouls).toBe(initialSouls + (monsterCard.rewards!.soul! as number));
        expect(player1.souls).toContain(monsterCard);
        expect(game.decks['monster']!.discard.length).toBe(initialDiscardSize);
    });

    it("kill monster without soul goes to discard", async () => {
        // Get a monster with no soul reward
        const monsterCard = game.obtainCard("b2-cod_worm") as MonsterCard;
        expect(monsterCard.rewards?.soul).toBe(0);
        
        game.decks['monster']!.addTopPosition(monsterCard);
        
        const initialDiscardSize = game.decks['monster']!.discard.length;
        
        // Attack and kill the monster
        game.declareAttack(player1);
        game.declareAttackOnMonster(player1, "topDeck", 0);
        
        const monster = game.monsters[0]!;
        game.kill(player1, monster, monsterCard);
        await game.resolveEntireStack();
        
        // Monster should go to discard pile
        expect(game.decks['monster']!.discard.length).toBe(initialDiscardSize + 1);
        expect(game.decks['monster']!.discard).toContain(monsterCard);
        expect(player1.souls).not.toContain(monsterCard);
    });

    it("discard monster puts it in monster discard pile", async () => {
        const monster = game.monsters[0]!;
        const monsterCard = monster.card;
        const monsterPosition = 0;
        
        const initialDiscardSize = game.decks['monster']!.discard.length;
        
        // Discard the monster
        game.discardMonster(player1, monsterPosition);
        
        // Monster should be in discard pile
        expect(game.decks['monster']!.discard.length).toBe(initialDiscardSize + 1);
        expect(game.decks['monster']!.discard).toContain(monsterCard);
        expect(game.monsters[monsterPosition]).not.toBe(monster);
    });

    it("shop flush discards all treasure cards", async () => {
        const initialDiscardSize = game.decks['treasure']!.discard.length;
        const shopCards = [...game.shop._slots].filter(c => c !== undefined);
        const numShopCards = shopCards.length;
        
        expect(numShopCards).toBeGreaterThan(0);
        
        // Flush the shop
        game.shop.flush();
        
        // All shop cards should be in the discard
        expect(game.decks['treasure']!.discard.length).toBe(initialDiscardSize + numShopCards);
        
        for (const card of shopCards) {
            expect(game.decks['treasure']!.discard).toContain(card);
        }
    });

    it("destroy treasure does not put it in discard", async () => {
        const treasureCard = game.shop.obtainCard("b2-bobs_brain") as ItemCard;
        game.addInPlay(player1, treasureCard);
        
        const initialDiscardSize = game.decks['treasure']!.discard.length;
        const initialDestroyedSize = game.destroyedCards.length;
        
        // Destroy the treasure
        game.destroyCardsOrSouls([treasureCard]);
        
        // Card should be destroyed (not in discard)
        expect(game.decks['treasure']!.discard.length).toBe(initialDiscardSize);
        expect(game.destroyedCards.length).toBe(initialDestroyedSize + 1);
        expect(game.destroyedCards).toContain(treasureCard);
        expect(game.decks['treasure']!.discard).not.toContain(treasureCard);
        expect(player1.inPlay).not.toContain(treasureCard);
    });

    it("destroy soul does not put it in discard", async () => {
        // Give player1 a soul
        const monsterCard = game.obtainCard("b2-fly") as MonsterCard;
        monsterCard.soul = 1;
        player1.addSoul(monsterCard);
        
        const initialDiscardSize = game.decks['monster']!.discard.length;
        const initialDestroyedSize = game.destroyedCards.length;
        const initialSouls = player1.totalSouls;
        
        // Destroy the soul
        game.destroyCardsOrSouls([monsterCard]);
        
        // Card should be destroyed (not in discard)
        expect(game.decks['monster']!.discard.length).toBe(initialDiscardSize);
        expect(game.destroyedCards.length).toBe(initialDestroyedSize + 1);
        expect(game.destroyedCards).toContain(monsterCard);
        expect(game.decks['monster']!.discard).not.toContain(monsterCard);
        expect(player1.souls).not.toContain(monsterCard);
        expect(player1.totalSouls).toBe(initialSouls - monsterCard.soul);
    });
});