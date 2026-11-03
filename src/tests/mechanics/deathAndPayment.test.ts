import { beforeEach, describe, expect, it } from "bun:test";
import { Game } from "../../models/game";
import { Player } from "../../models/entities/player";
import { DeathOnStack } from "../../models/stackElement";
import { EffectData } from "../../models/types/cardTypes";
import { payHealthEffect } from "../../models/effects/activeEffect";
import { setupTestGame } from "../testHelpers";

describe("Death, HP payment and attack requirements", () => {
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
        game.resetStack();
        game.resetCallbacks();
    });

    it("An entity with a pending death does not get a second one.", async () => {
        let wouldDeathCount = 0;
        game.emitter.on("on:death:would-death", ({ eventIssuer }) => {
            if (eventIssuer === player2) wouldDeathCount++;
        });
        const source = { card: player1.character!, visualEffectBox: undefined };
        game.entityHandler.kill(player1, player2, source);
        game.entityHandler.kill(player1, player2, source);
        expect(wouldDeathCount).toBe(1);
        expect(game.stack.elements.filter(e => e instanceof DeathOnStack).length).toBe(1);
    });

    it("A cancelled death does not prevent a later death.", async () => {
        const source = { card: player1.character!, visualEffectBox: undefined };
        game.entityHandler.kill(player1, player2, source);
        expect(game.entityHandler.preventDeath(player2)).toBe(true);
        expect(game.stack.elements.filter(e => e instanceof DeathOnStack).length).toBe(0);
        game.entityHandler.kill(player1, player2, source);
        expect(game.stack.elements.filter(e => e instanceof DeathOnStack).length).toBe(1);
        await game.actions.resolveStack();
        expect(player2.isDead).toBe(true);
    });

    it("Paying more HP than available fails without losing HP.", async () => {
        const hp = player1.currentHealthPoints;
        const data = new EffectData(player1.character!, () => player1, []);
        expect(payHealthEffect(game, hp + 1)(data)).toBe(false);
        expect(player1.currentHealthPoints).toBe(hp);
        expect(game.stack.isEmpty()).toBe(true);
    });

    it("Paying HP is not damage.", async () => {
        const hp = player1.currentHealthPoints;
        const data = new EffectData(player1.character!, () => player1, []);
        expect(payHealthEffect(game, 1)(data)).toBe(true);
        expect(player1.currentHealthPoints).toBe(hp - 1);
        expect(player1.damageTakenThisTurn.length).toBe(0);
    });

    it("Unreachable attack requirements are removed without touching the others.", async () => {
        const fly = game.monsters[0]!;
        const fatty = game.monsters[1]!;
        const source = player1.character!;
        player1.mustAttack([fly], source, false);
        player1.mustAttack([fly, fatty], source, false);
        player1.mustAttack([fly], source, false);
        fly.attackable = false;
        game.entityHandler.playerMustAttack(player1, [fatty], source, false);
        // Both [fly] requirements are gone, [fly, fatty] and the new [fatty] remain.
        expect(player1.mustAttackEntity.map(req => req.targets)).toEqual([[fly, fatty], [fatty]]);
    });
});
