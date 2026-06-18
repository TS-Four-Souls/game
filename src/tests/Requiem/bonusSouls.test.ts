import type { LootCard } from "@/models/cards";
import { beforeEach, describe, expect, it } from "bun:test";
import { Game } from "../../models/game";
import { Player } from "../../models/entities/player";
import { setupTestGame } from "../testHelpers";

async function setupBonusSoulsTestGame(soulSlug: string) {
    const setup = await setupTestGame({
                    characters: ["fsp2-guppy", "b2-lilith"],
                    monsters: ["b2-fly", "b2-fatty"],
                    monsterDeck: ["b2-red_host", "b2-pooter","b2-cod_worm","b2-spider","b2-conjoined_fatty", "b2-dip","b2-leech","b2-gurdy"],
                    treasureDeck: ["b2-boomerang", "b2-guppys_head", "b2-no", "b2-blank_card"],
                    bonusSouls: [soulSlug, "b2-soul_of_gluttony", "b2-soul_of_greed"],
                    playerCount: 2
                });
    const game = setup.game;
    const player1 = setup.player1;
    const player2 = setup.player2!;
    return { game, player1, player2 };
}

describe("Four Souls+2 Loot Cards", () => {
    let game: Game;
    let player1: Player;
    let player2: Player;

    beforeEach(() => {
    });
    
    it("Soul of Envy - the first time a player controls their 3rd soul, the active player chooses a player who controls the fewest souls or tied for fewest. that player gains this soul.", async () => {
        ({ game, player1, player2 } = await setupBonusSoulsTestGame("r-soul_of_envy"));
        const soul1 = game.obtainCard("b2-lost_soul")! as LootCard;
        const soul2 = game.cardHandler.copyCard(soul1) as LootCard;
        const soul3 = game.cardHandler.copyCard(soul1) as LootCard;
        game.entityHandler.addLootPlay(player1, 2);
        game.select = async (player: Player, min: number, max: number, Options: any[]) => {
            expect(Options.length).toBe(1);
                return { selected: [Options[0]], remaining: [] } as any;
            };
        game.cardHandler.addCardToHand(player1, soul1);
        game.cardHandler.addCardToHand(player1, soul2);
        game.cardHandler.addCardToHand(player1, soul3);
        game.actions.playCard(player1, 0, []);
        await game.actions.resolveStack();
        expect(player1.totalSouls).toBe(1);
        expect(player1.souls.map(c => c.slug)).not.toContain("r-soul_of_envy");
        expect(player2.totalSouls).toBe(0);
        expect(player2.souls.map(c => c.slug)).not.toContain("r-soul_of_envy");

        game.actions.playCard(player1, 0, []);
        await game.actions.resolveStack();
        expect(player1.totalSouls).toBe(2);
        expect(player1.souls.map(c => c.slug)).not.toContain("r-soul_of_envy");
        expect(player2.totalSouls).toBe(0);
        expect(player2.souls.map(c => c.slug)).not.toContain("r-soul_of_envy");

        game.actions.playCard(player1, 0, []);
        await game.actions.resolveStack();
        expect(player1.totalSouls).toBe(3);
        expect(player1.souls.map(c => c.slug)).not.toContain("r-soul_of_envy");
        await game.actions.resolveStack(); // Resolve any stack effects
        expect(player2.totalSouls).toBe(1);
        expect(player2.souls.map(c => c.slug)).toContain("r-soul_of_envy");
    });

it("Soul of Lust - each time a player kills a monster, put a counter on this. - 6 counters", async () => {
        ({ game, player1, player2 } = await setupBonusSoulsTestGame("r-soul_of_lust"));
        for (const monster of ["b2-red_host", "b2-pooter","b2-cod_worm","b2-spider","b2-conjoined_fatty", "b2-dip"]) {
            game.cardHandler.addTopPosition("monster", game.obtainCard(monster)!);
        }
        for(let i=0; i<6; i++) {
            game.entityHandler.kill(player1, game.monsters[0]!, player1.inPlay[0]!);
            await game.actions.resolveStack();
            expect(game.currentPlayer.totalSouls).toBe((i === 5 ? 1 : 0));
            await game.endTurn();
        await game.actions.resolveStack(); // resolve effect
        }
        await game.endTurn();
        await game.actions.resolveStack(); // resolve effect
        expect(game.currentPlayer.souls.map(c => c.slug)).toContain("r-soul_of_lust");
    });

    it("Soul of Pride - each time a player gains a treasure, put a counter on this. - 6 counters", async () => {
        ({ game, player1, player2 } = await setupBonusSoulsTestGame("r-soul_of_pride"));
        for(let i=0; i<6; i++) {
            game.gainTreasure(player1, 1);
            expect(game.currentPlayer.totalSouls).toBe((i === 5 ? 1 : 0));
        }
        expect(game.currentPlayer.souls.map(c => c.slug)).toContain("r-soul_of_pride");
    });

it("Soul of Wrath - each time a player dies, put a counter on this. - 6 counters", async () => {
        ({ game, player1, player2 } = await setupBonusSoulsTestGame("r-soul_of_wrath"));

        for(let i=0; i<6; i++) {
            game.entityHandler.kill(player1, game.currentPlayer, player1.inPlay[0]!);
            await game.actions.resolveStack();
            expect(game.currentPlayer.totalSouls).toBe((i === 5 ? 1 : 0));
            await game.endTurn();
            await game.actions.resolveStack(); // resolve effect
        }
        await game.endTurn();
        expect(game.currentPlayer.souls.map(c => c.slug)).toContain("r-soul_of_wrath");

    });

it("Soul of Sloth - the first time a player controls 4 items, the active player chooses a player who controls the fewest items or tied for fewest. that player gains this soul.", async () => {
        ({ game, player1, player2 } = await setupBonusSoulsTestGame("r-soul_of_sloth"));
        for(let i=0; i<4; i++) {
            game.gainTreasure(player1, 1);
            expect(player2.totalSouls).toBe((i === 4 ? 1 : 0));
        }
        
        function wait(ms: number) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }
        await game.actions.resolveStack(); // Resolve any stack effects
        expect(player2.souls.map(c => c.slug)).toContain("r-soul_of_sloth");
    });
});

