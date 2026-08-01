import { beforeEach, describe, expect, it } from "bun:test";
import { Game } from "../../models/game";
import { Player } from "../../models/entities/player";
import { setupTestGame } from "../testHelpers";

describe("Four Souls+2 Attack Requirements", () => {
    let game: Game;
    let player1: Player;
    let player2: Player;

    beforeEach(async () => {
        const setup = await setupTestGame({
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
        const source = player1.character!;
        game.entityHandler.playerMustAttack(player1, "any", source, false);
        game.entityHandler.playerMustAttack(player1, "any", source, false);
        game.entityHandler.playerMustAttack(player1, "topDeck", source, false);
        expect(game.actions.canEndTurn(player1, false)).not.toBe(true);
        game.actions.declareAttack(player1);
        expect(player1.canAttackThisEntity("topDeck")).toBe(true);
        expect(player1.canAttackThisEntity(game.monsters[0]!)).not.toBe(true);
        await game.actions.declareAttackOnEntity(player1, "topDeck", 0);
        game.entityHandler.endCombat();
        expect(player1.hasMandatoryAttackRequirement).toBe(true);
        expect(game.actions.canEndTurn(player1, false)).not.toBe(true);
        expect(player1.canAttackThisEntity("topDeck")).toBe(true);
        expect(player1.canAttackThisEntity(game.monsters[0]!)).toBe(true);
        expect(player1.canAttackThisEntity(game.monsters[1]!)).toBe(true);
    });

    it("If must attack top deck and must attack any, player can only attack top deck.", async () => {
        const source = player1.character!;
        game.entityHandler.playerMustAttack(player1, "any", source, false);
        game.entityHandler.playerMustAttack(player1, "topDeck", source, false);
        expect(game.actions.canEndTurn(player1, false)).not.toBe(true);
        game.actions.declareAttack(player1);
        expect(player1.canAttackThisEntity("topDeck")).toBe(true);
        expect(player1.canAttackThisEntity(game.monsters[0]!)).not.toBe(true);
        await game.actions.declareAttackOnEntity(player1, "topDeck", 0);
        game.entityHandler.endCombat();
        expect(game.actions.canEndTurn(player1, false)).toBe(true);
    });

    it("If must attack 2 different monsters, they can be attacked in any order 1", async () => {
        const source = player1.character!;
        const mob1 = game.monsters[0]!;
        const mob2 = game.monsters[1]!;
        game.entityHandler.playerMustAttack(player1, [mob1], source, false);
        game.entityHandler.playerMustAttack(player1, [mob2], source, false);
        game.actions.declareAttack(player1);
        expect(player1.canAttackThisEntity("topDeck")).not.toBe(true);
        expect(player1.canAttackThisEntity(mob1)).toBe(true);
        expect(player1.canAttackThisEntity(mob2)).toBe(true);
        await game.actions.declareAttackOnEntity(player1, mob1);
        game.entityHandler.endCombat();
        game.actions.declareAttack(player1);
        expect(game.actions.canEndTurn(player1, false)).not.toBe(true);
        expect(player1.canAttackThisEntity(mob1)).not.toBe(true);
        expect(player1.canAttackThisEntity(mob2)).toBe(true);
        await game.actions.declareAttackOnEntity(player1, mob2);
        game.entityHandler.endCombat();
        expect(game.actions.canEndTurn(player1, false)).toBe(true);
    });

    it("removes monsters from a forced choice set when they leave play", async () => {
        const source = player1.character!;
        const mob1 = game.monsters[0]!;
        const mob2 = game.monsters[1]!;
        game.entityHandler.playerMustAttack(player1, [mob1, mob2], source, false);

        game.encounters.discardTop(0);

        expect(player1.canAttackThisEntity(mob2)).toBe(true);
    });

    it("must attack set", async () => {
        const source = player1.character!;
        const mob1 = game.monsters[0]!;
        const mob2 = game.monsters[1]!;
        game.entityHandler.playerMustAttack(player1, [mob1, mob2], source, false);
        game.actions.declareAttack(player1);
        expect(game.actions.canDeclareAttackOnEntity(player1, mob1)).toBe(true);
        expect(game.actions.canDeclareAttackOnEntity(player1, mob2)).toBe(true);
        expect(game.actions.canDeclareAttackOnEntity(player1, "topDeck")).not.toBe(true);
        game.actions.declareAttackOnEntity(player1, mob1);
        game.entityHandler.endCombat();
        expect(game.actions.canEndTurn(player1, false)).toBe(true);
    });
});

