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

    it("Attack a player.", async () => {
        player2.attackable = true;
        player2.evasion = 3;
        game.declareAttack(player1);
        game.random = () => 0.6;
        game.declareAttackOnEntity(player1, player2);
        game.attackRoll(player1);
        await game.resolveStack(); // dice
        await game.resolveStack(); // damage
        expect(player1.currentHealthPoints).toBe(2);
        expect(player2.currentHealthPoints).toBe(1);
    });

    it("Attack a player and take damage.", async () => {
        player2.attackable = true;
        player2.evasion = 3;
        game.declareAttack(player1);
        game.random = () => 0.1;
        game.declareAttackOnEntity(player1, player2);
        game.attackRoll(player1);
        await game.resolveStack(); // dice
        await game.resolveStack(); // damage
        expect(player1.currentHealthPoints).toBe(1);
        expect(player2.currentHealthPoints).toBe(2);
    });
});

