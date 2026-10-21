import type { ItemCard, LootCard, RoomCard } from "@/models/cards";
import { BsoulCard, createCardFromJson } from "@/models/cards";
import { CARD_SETS } from "@/models/handlers/cardHandler";
import { bSoulEffectParser } from "@/models/effects/bonusSoulEffects";
import { beforeEach, describe, expect, it } from "bun:test";
import { Player } from "../../models/entities/player";
import { Game } from "../../models/game";
import { DamageOnStack } from "../../models/stackElement";
import { setupTestGame } from "../testHelpers";


describe("Requiem Rooms", () => {
    let game: Game;
    let player1: Player;
    let player2: Player;
    
    beforeEach(async () => {
        const setup = await setupTestGame({
                        characters: ["fsp2-guppy", "b2-lilith"],
                        monsters: ["b2-fly", "b2-fatty"],
                        monsterDeck: ["b2-red_host", "b2-pooter","b2-cod_worm","b2-spider","b2-conjoined_fatty", "b2-dip","b2-leech","b2-gurdy"],
                        treasureDeck: ["b2-boomerang", "b2-guppys_head", "b2-blank_card", "b2-tech_x", "b2-the_battery", "b2-lucky_foot", "b2-mini_mush", "b2-spoon_bender"],
                        bonusSouls: [],
                        playerCount: 2,
                        rooms: true,
                    });
        game = setup.game;
        player1 = setup.player1;
        player2 = setup.player2!;
        game.resetStack();
        game.resetCallbacks();
    });
    it("no duplicate in treasure", async () => {
        for(const [card, idx] of game.decks.treasure.cards.map((c, idx) => [c, idx] as const))
        {
            if(game.decks.treasure.cards.findIndex(c => c.slug === card.slug) !== idx)
                console.log(card.slug, idx, game.decks.treasure.cards.map(c => c.slug).indexOf(card.slug));
        }
    });

    it("no duplicate in monsters", async () => {
        for(const [card, idx] of game.decks.monster.cards.map((c, idx) => [c, idx] as const))
        {
            if(game.decks.monster.cards.findIndex(c => c.slug === card.slug) !== idx)
                console.log(card.slug, idx, game.decks.monster.cards.map(c => c.slug).indexOf(card.slug));
        }
    });

    it("no duplicate in loot", async () => {
        for(const [card, idx] of game.decks.loot.cards.map((c, idx) => [c, idx] as const))
        {
            if(game.decks.loot.cards.findIndex(c => c.slug === card.slug) !== idx)
                console.log(card.slug, idx, game.decks.loot.cards.map(c => c.slug).indexOf(card.slug));
            expect(game.decks.loot.cards.findIndex(c => c.slug === card.slug) !== idx).toBe(false);
        }
    });

    it("All cards can have their effects attached.", async () => {
        const failures: { slug: string, error: string }[] = [];
        let globalId = 1_000_000;
        const originalLog = console.log;
        let lastParsingFailure = "";
        // attachEffectsToCard logs every card it parses: silence it, but keep the passive parsing failure message.
        console.log = (...args: unknown[]) => {
            const msg = args.map(String).join(" ");
            if (msg.startsWith("Effect parsing failed"))
                lastParsingFailure = msg;
        };
        try {
            for (const set of Object.values(CARD_SETS)) {
                for (const template of set.cards) {
                    // Fresh copy so the shared card sets are not mutated.
                    const card = createCardFromJson(0, globalId++, template.json);
                    lastParsingFailure = "";
                    try {
                        if (card instanceof BsoulCard)
                            bSoulEffectParser(card, game)();
                        else {
                            game.cardHandler.attachEffectsToCard(card, true);
                            // A passive effect that fails to parse returns early without marking the card.
                            if (!game.cardHandler["_effectsAttached"].has(card))
                                failures.push({ slug: card.slug, error: lastParsingFailure || "passive effect could not be parsed" });
                        }
                    } catch (err) {
                        failures.push({ slug: card.slug, error: err instanceof Error ? err.message : String(err) });
                    }
                }
            }
        } finally {
            console.log = originalLog;
        }
        if (failures.length > 0)
            console.log(`${failures.length} card(s) failed to attach their effects:\n` + failures.map(f => `${f.slug}: ${f.error}`).join("\n"));
        expect(failures.map(f => f.slug)).toEqual([]);
    });
});