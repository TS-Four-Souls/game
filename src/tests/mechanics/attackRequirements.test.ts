    import { describe, it, expect, beforeEach } from "bun:test";
import { Game } from "../../models/game";
import { DamageOnStack, DiceRoll, Player } from "../../models/player";
import { pl } from "zod/locales";
import type { LootCard, ItemCard, TreasureCard, TargetsSelector, EffectOnStack } from "@/models/cards";
import { InplayType, MonsterCard, CharacterCard } from "@/models/cards";
import { dischargeEachItemsAndRemoveCoins, emptyHands, mockGameSelections, setupTestGame } from "../testHelpers";
import type { Target } from "bun";

describe("Four Souls+2 Attack Requirements", () => {
    let game: Game;
    let player1: Player;
    let player2: Player;

    beforeEach(() => {
        const setup = setupTestGame({
                    characters: ["fsp2-guppy", "b2-samson"],
                    monsters: ["b2-fly", "b2-fatty"],
                    monsterDeck: ["b2-red_host", "b2-pooter","b2-cod_worm","b2-spider","b2-conjoined_fatty", "b2-dip","b2-leech","b2-gurdy"],
                    treasureDeck: ["b2-boomerang", "b2-guppys_head", "b2-no", "b2-blank_card"],
                    playerCount: 2
                });
        game = setup.game;
        player1 = setup.player1;
        player2 = setup.player2!;
    });

    it("If must attack top deck and 2 must attack any, player must attack top deck first then any.", async () => {
        const source = player1.inPlay[0]!;
        game.playerMustAttack(player1, "any", source);
        game.playerMustAttack(player1, "any", source);
        game.playerMustAttack(player1, "topDeck", source);
        expect(game.canEndTurn(player1, false)).not.toBe(true);
        game.declareAttack(player1);
        expect(player1.canAttackThisMonster("topDeck")).toBe(true);
        expect(player1.canAttackThisMonster(game.monsters[0]!)).toBe(false);
        await game.declareAttackOnMonster(player1, "topDeck", 0);
        game.endCombat();
        expect(player1.hasAttackRequirement).toBe(true);
        expect(game.canEndTurn(player1, false)).not.toBe(true);
        expect(player1.canAttackThisMonster("topDeck")).toBe(true);
        expect(player1.canAttackThisMonster(game.monsters[0]!)).toBe(true);
        expect(player1.canAttackThisMonster(game.monsters[1]!)).toBe(true);
    });

    it("If must attack top deck and must attack any, player can only attack top deck.", async () => {
        const source = player1.inPlay[0]!;
        game.playerMustAttack(player1, "any", source);
        game.playerMustAttack(player1, "topDeck", source);
        expect(game.canEndTurn(player1, false)).not.toBe(true);
        game.declareAttack(player1);
        expect(player1.canAttackThisMonster("topDeck")).toBe(true);
        expect(player1.canAttackThisMonster(game.monsters[0]!)).toBe(false);
        await game.declareAttackOnMonster(player1, "topDeck", 0);
        game.endCombat();
        expect(game.canEndTurn(player1, false)).toBe(true);
    });

    it("If must attack 2 different monsters, they can be attacked in any order 1", async () => {
        const source = player1.inPlay[0]!;
        const mob1 = game.monsters[0]!;
        const mob2 = game.monsters[1]!;
        game.playerMustAttack(player1, [mob1], source);
        game.playerMustAttack(player1, [mob2], source);
        game.declareAttack(player1);
        expect(player1.canAttackThisMonster("topDeck")).toBe(false);
        expect(player1.canAttackThisMonster(mob1)).toBe(true);
        expect(player1.canAttackThisMonster(mob2)).toBe(true);
        await game.declareAttackOnMonster(player1, mob1);
        game.endCombat();
        game.declareAttack(player1);
        expect(game.canEndTurn(player1, false)).not.toBe(true);
        expect(player1.canAttackThisMonster(mob1)).toBe(false);
        expect(player1.canAttackThisMonster(mob2)).toBe(true);
        await game.declareAttackOnMonster(player1, mob2);
        game.endCombat();
        expect(game.canEndTurn(player1, false)).toBe(true);
    });

    it("removes monsters from a forced choice set when they leave play", async () => {
        const source = player1.inPlay[0]!;
        const mob1 = game.monsters[0]!;
        const mob2 = game.monsters[1]!;
        game.playerMustAttack(player1, [mob1, mob2], source);

        game.encounters.discardTop(0);

        expect(player1.canAttackThisMonster(mob2)).toBe(true);
    });

    it("must attack set", async () => {
        const source = player1.inPlay[0]!;
        const mob1 = game.monsters[0]!;
        const mob2 = game.monsters[1]!;
        game.playerMustAttack(player1, [mob1, mob2], source);
        game.declareAttack(player1);
        expect(game.canDeclareAttackOnMonster(player1, mob1)).toBe(true);
        expect(game.canDeclareAttackOnMonster(player1, mob2)).toBe(true);
        expect(game.canDeclareAttackOnMonster(player1, "topDeck")).not.toBe(true);
        game.declareAttackOnMonster(player1, mob1);
        game.endCombat();
        expect(game.canEndTurn(player1, false)).toBe(true);
    });
});

