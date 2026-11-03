import { describe, expect, it } from "bun:test";
import type { ItemCard, RoomCard, TreasureCard } from "@/models/cards";
import { setupTestGame } from "../testHelpers";

describe("Copy abilities", () => {
    it("birthright copying glitch keeps ATK and stays in play when gained abilities expire", async () => {
        const setup = await setupTestGame({
            characters: ["r-the_capricious", "b2-samson"],
            monsters: ["b2-fly", "b2-fatty"],
            monsterDeck: ["b2-red_host", "b2-pooter", "b2-gurdy"],
            playerCount: 2,
        });
        const { game, player1 } = setup;
        const player2 = setup.player2!;
        const brimstone = game.obtainCard("b2-brimstone") as TreasureCard; // +1 [ATK]
        game.shop._slots = [[brimstone]];
        game.select = async (_issuer, min, _max, opts) => ({ selected: opts.slice(0, Math.max(min, 1)), remaining: [] });
        await game.resolveEntireStack();
        const glitch = player1.inPlay[0]!;
        expect(glitch.slug).toBe("r-glitch");
        const baseAttack = game.entityHandler.getAttack(player1) - 1; // glitch gained brimstone

        const birthright = game.obtainCard("r-birthright") as ItemCard;
        game.cardHandler.addInPlay(player1, birthright);
        game.cardHandler.recharge(birthright);
        await game.activateItem(player1, birthright, [glitch], "tap");
        await game.resolveEntireStack();
        expect(birthright.slug).toBe("r-glitch");
        expect(birthright.eternal).toBe(false);

        // Turn end: both glitches gain brimstone until the start of player1's next turn.
        await game.endTurn();
        await game.resolveEntireStack();
        expect(game.currentPlayer).toBe(player2);
        expect(player1.inPlay).toContain(birthright);
        expect(game.entityHandler.getAttack(player1)).toBe(baseAttack + 2);

        // Player1's turn starts: the gained abilities expire, new ones are gained.
        await game.endTurn();
        await game.resolveEntireStack();
        expect(game.currentPlayer).toBe(player1);
        expect(player1.inPlay).toContain(birthright);
        expect(game.entityHandler.getAttack(player1)).toBe(baseAttack + 2);
        expect((birthright.tags.copiedCards as ItemCard[]).length).toBe(1);

        // Turn end: start-of-turn copies expire, end-of-turn copies are gained.
        await game.endTurn();
        await game.resolveEntireStack();
        expect(player1.inPlay).toContain(birthright);
        expect(game.entityHandler.getAttack(player1)).toBe(baseAttack + 2);
        expect((birthright.tags.copiedCards as ItemCard[]).length).toBe(1);
        // The gainer-side cleaners don't pile up each turn.
        const cleanersCount = birthright.cleaners.length;
        await game.endTurn();
        await game.resolveEntireStack();
        await game.endTurn();
        await game.resolveEntireStack();
        expect(birthright.cleaners.length).toBe(cleanersCount);
        expect(game.entityHandler.getAttack(player1)).toBe(baseAttack + 2);
    });

    it("removing a gained copy restores the gainer's counters and stats, and keeps other copies", async () => {
        const setup = await setupTestGame({
            characters: ["b2-isaac", "b2-samson"],
            monsters: ["b2-fly", "b2-fatty"],
            playerCount: 2,
        });
        const { game, player1 } = setup;
        const gainer = game.obtainCard("b2-blank_card") as ItemCard;
        const passive = game.obtainCard("b2-brimstone") as ItemCard;
        const other = game.obtainCard("b2-ipecac") as ItemCard;
        game.cardHandler.addInPlay(player1, gainer);
        const statsBefore = gainer.json.stats;
        const attack = game.entityHandler.getAttack(player1);
        const copied1 = game.cardHandler.gainAbilities(player1, gainer, passive);
        const copied2 = game.cardHandler.gainAbilities(player1, gainer, other);
        expect(game.entityHandler.getAttack(player1)).toBe(attack + 2);
        const cleanersCount = gainer.cleaners.length;
        game.cardHandler.removeGainedAbilities(copied1);
        game.cardHandler.removeGainedAbilities(copied1); // idempotent
        expect(gainer.cleaners.length).toBe(cleanersCount - 1);
        expect(gainer.tags.copiedCards).toEqual([copied2]);
        expect(game.entityHandler.getAttack(player1)).toBe(attack + 1);
        expect(player1.inPlay).toContain(gainer);
        game.cardHandler.removeGainedAbilities(copied2);
        expect(game.entityHandler.getAttack(player1)).toBe(attack);
        expect(gainer.json.stats).toEqual(statsBefore);
    });

    it("becomesCopyOf doesn't mutate the source card json", async () => {
        const setup = await setupTestGame({
            characters: ["b2-isaac", "b2-samson"],
            monsters: ["b2-fly", "b2-fatty"],
            playerCount: 2,
        });
        const { game } = setup;
        const source = game.obtainCard("b2-brimstone") as ItemCard;
        const target = game.obtainCard("b2-boomerang") as ItemCard;
        const sourceJson = structuredClone(source.json);
        const { restore } = target.becomesCopyOf(source);
        expect(source.json).toEqual(sourceJson);
        expect(target.json).not.toBe(source.json);
        (target.json as any).flip = { slug: "mutated" };
        expect(source.json).toEqual(sourceJson);
        restore();
        expect(target.slug).toBe("b2-boomerang");
    });

    it("becomesCopyOf copies and restores item kind (active/passive, guppy)", async () => {
        const setup = await setupTestGame({
            characters: ["b2-isaac", "b2-samson"],
            monsters: ["b2-fly", "b2-fatty"],
            playerCount: 2,
        });
        const { game } = setup;
        const guppyItem = game.obtainCard("b2-guppys_head") as ItemCard;
        const passive = game.obtainCard("b2-brimstone") as ItemCard;
        expect(guppyItem.isGuppy()).toBe(true);
        expect(guppyItem.isActiveItem()).toBe(true);
        const { restore } = passive.becomesCopyOf(guppyItem);
        expect(passive.isGuppy()).toBe(true);
        expect(passive.isActiveItem()).toBe(true);
        restore();
        expect(passive.isGuppy()).toBe(false);
        expect(passive.isActiveItem()).toBe(false);
    });

    for (const { picked, expected } of [{ picked: "nothing", expected: 0 }, { picked: "the maximum", expected: 1 }])
    it(`recharge limiter: picking ${picked} recharges ${expected} item(s), never everything`, async () => {
        const setup = await setupTestGame({
            characters: ["b2-isaac", "b2-samson"],
            monsters: ["b2-fly", "b2-fatty"],
            playerCount: 2,
            rooms: true,
        });
        const { game, player1 } = setup;
        game.resetStack();
        const room = game.obtainCard("r-heavy_is_the_head") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        for (const slug of ["b2-boomerang", "b2-guppys_head", "b2-the_d6"])
            game.cardHandler.addInPlay(player1, game.obtainCard(slug) as ItemCard);
        // The player may recharge fewer items than the limit, down to none.
        game.select = async (_issuer, min, max, opts) => ({ selected: opts.slice(0, expected === 0 ? min : max), remaining: [] });
        await game.endTurn();
        await game.resolveEntireStack();
        // The character card is recharged separately from the items.
        const tapItems = player1.inPlay.filter(c => c.hasTapEffect());
        expect(tapItems.length).toBeGreaterThan(1);
        for (const item of tapItems)
            item.deactivate();
        await game.endTurn();
        await game.resolveEntireStack();
        expect(game.currentPlayer).toBe(player1);
        expect(tapItems.filter(c => c.charged).length).toBe(expected);
    });
});
