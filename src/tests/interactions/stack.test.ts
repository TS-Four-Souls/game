import { Game } from "../../models/game";
import type { ItemCard, LootCard, TreasureCard } from "@/models/cards";
import { MonsterCard } from "@/models/cards";
import { beforeEach, describe, expect, it } from "bun:test";
import { Player } from "../../models/entities/player";
import { DeathOnStack } from "../../models/stackElement";
import { setupTestGame } from "../testHelpers";

describe("stack interactions", () => {
    let game: Game; let player1: Player; let player2: Player;
    beforeEach(async () => {
        const setup = await setupTestGame({
            characters: ["fsp2-guppy", "b2-isaac"],
            monsters: ["b2-fly", "b2-fatty"],
            monsterDeck: ["b2-red_host", "b2-pooter", "b2-cod_worm", "b2-spider", "b2-conjoined_fatty", "b2-dip", "b2-leech", "b2-gurdy"],
            treasureDeck: ["b2-boomerang", "b2-guppys_head", "b2-no", "b2-blank_card"],
            playerCount: 2
        });
        game = setup.game; player1 = setup.player1; player2 = setup.player2!;
    });

    async function playTopLootCardWithGlitterBombs(): Promise<LootCard> {
        const item = game.obtainCard("box-glitter_bombs") as ItemCard;
        game.cardHandler.addInPlay(player1, item);
        const nickel = game.decks.loot.getCardFromSlug("b2-a_nickel") as LootCard;
        game.decks.loot.addTopPosition(nickel);
        await game.activateItem(player1, item, [], "tap");
        await game.actions.resolveStack();
        game.actions.playCard(player1, "topLootCard", []);
        return nickel;
    }

    it("Glitter Bombs: playing the top loot card takes it off the loot deck", async () => {
        const nickel = await playTopLootCardWithGlitterBombs();
        expect(game.decks.loot.cards.includes(nickel)).toBe(false);
        // Looting in response does not draw the card being played.
        game.loot(player2, 1);
        expect(player2.hand.cards.includes(nickel)).toBe(false);
        await game.actions.resolveStack();
        expect(game.decks.loot.discard.includes(nickel)).toBe(true);
        expect(game.decks.loot.cards.includes(nickel)).toBe(false);
    });

    it("Glitter Bombs: a cancelled top loot card is only in the discard", async () => {
        const nickel = await playTopLootCardWithGlitterBombs();
        game.stack.cancel();
        expect(game.decks.loot.cards.includes(nickel)).toBe(false);
        expect(game.decks.loot.discard.includes(nickel)).toBe(true);
    });

    it("cancelling everything during a start-of-turn trigger does not skip the turn structure", async () => {
        const javon = game.obtainCard("rwz-javon") as MonsterCard;
        game.encounters.forceSetMonsterAtSlot(0, javon);
        const waterBottle = game.obtainCard("rwz-water_bottle") as TreasureCard;
        game.cardHandler.addInPlay(player1, waterBottle);
        const events: string[] = [];
        game.emitter.on("on:turn:start", ({ eventIssuer }) => { if (eventIssuer === player2) events.push("on:turn:start"); });
        game.emitter.on("on:your:turn", ({ eventIssuer }) => { if (eventIssuer === player2) events.push("on:your:turn"); });
        await game.endTurn();
        let n = 0;
        while (game.currentPlayer !== player2 && n++ < 10) await game.actions.resolveStack();
        // Javon's "at the start of each turn" trigger is on the stack (as:turn:start).
        expect(game.stack.elements.some(e => e.debugLogs.includes("Javon"))).toBe(true);
        await game.activateItem(player1, waterBottle, [], "tap");
        game.random = () => 0.99; // 6: cancel everything that hasn't resolved
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        while (!game.stack.isEmpty()) await game.actions.resolveStack();
        expect(game.currentPlayer).toBe(player2);
        expect(game.turnStep).toBe("on:your:turn");
        expect(player2.remainingLootPlay).toBe(game.gameParameters.lootPlayPerTurn.value);
        expect(events).toEqual(["on:turn:start", "on:your:turn"]);
    });

    it("ending your own turn by cancelling everything at its start skips its remaining steps", async () => {
        const javon = game.obtainCard("rwz-javon") as MonsterCard;
        game.encounters.forceSetMonsterAtSlot(0, javon);
        const waterBottle = game.obtainCard("rwz-water_bottle") as TreasureCard;
        game.cardHandler.addInPlay(player2, waterBottle);
        const events: string[] = [];
        game.emitter.on("on:your:turn", ({ eventIssuer }) => { events.push(eventIssuer.id); });
        await game.endTurn();
        let n = 0;
        while (game.currentPlayer !== player2 && n++ < 10) await game.actions.resolveStack();
        await game.activateItem(player2, waterBottle, [], "tap");
        game.random = () => 0.99;
        n = 0;
        while (!game.stack.isEmpty() && n++ < 30) await game.actions.resolveStack();
        expect(game.currentPlayer).toBe(player1);
        expect(events).toEqual([player1.id]);
        expect(player1.remainingLootPlay).toBe(game.gameParameters.lootPlayPerTurn.value);
    });

    it("cancelling the loot step cancels its loot but not the loot plays", async () => {
        await game.endTurn();
        let n = 0;
        while (!game.stack.elements.some(e => e.json.type === "lootStep") && n++ < 10) await game.actions.resolveStack();
        const hand = player2.hand.length;
        game.stack.cancel();
        await game.resolveCallbacks();
        expect(game.stack.isEmpty()).toBe(true);
        expect(player2.hand.length).toBe(hand);
        expect(player2.remainingLootPlay).toBe(game.gameParameters.lootPlayPerTurn.value);
        expect(game.turnStep).toBe("on:your:turn");
    });

    it("cancelling everything before penalties are paid cancels the death", async () => {
        const penny = game.obtainCard("b2-bloody_penny") as TreasureCard;
        game.cardHandler.addInPlay(player1, penny);
        const impostor = game.obtainCard("rwz-the_impostor") as MonsterCard;
        game.encounters.forceSetMonsterAtSlot(1, impostor);
        const waterBottle = game.obtainCard("rwz-water_bottle") as TreasureCard;
        game.cardHandler.addInPlay(player1, waterBottle);
        game.gainCoins(player2, 5, "gift");
        const coins = player2.coins;
        const deaths = player2.stats.nbDeaths;
        const afterPenalty: Player[] = [];
        game.emitter.on("on:death:after-penalty", ({ eventIssuer }) => { afterPenalty.push(eventIssuer as Player); });
        game.entityHandler.kill(player1, player2, { card: penny, visualEffectBox: null as any });
        await game.actions.resolveStack(); // the death resolves: Bloody Penny triggers before penalties
        expect(game.stack.elements.some(e => e.debugLogs.includes("Bloody Penny"))).toBe(true);
        await game.activateItem(player1, waterBottle, [], "tap");
        game.random = () => 0.99;
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player2.isDead).toBe(false);
        expect(player2.currentHealthPoints).toBe(1);
        expect(player2.coins).toBe(coins);
        expect(player2.stats.nbDeaths).toBe(deaths);
        expect(afterPenalty).toEqual([]);
        expect(game.hasPendingSelections).toBe(false); // The Impostor does not start a vote
    });

    it("a cancelled death on the stack leaves the entity alive with 1 HP", async () => {
        const penny = game.obtainCard("b2-bloody_penny") as TreasureCard;
        game.entityHandler.dealDamage(player1, player2, { card: penny, visualEffectBox: undefined }, 100);
        let n = 0;
        while (!game.stack.elements.some(e => e instanceof DeathOnStack) && n++ < 5) await game.actions.resolveStack();
        expect(game.stack.peek()).toBeInstanceOf(DeathOnStack);
        game.stack.cancel();
        expect(player2.isDead).toBe(false);
        expect(player2.currentHealthPoints).toBe(1);
    });

    it("a cancelled kill at full HP leaves the entity alive with 1 HP", async () => {
        const penny = game.obtainCard("b2-bloody_penny") as TreasureCard;
        game.entityHandler.addHealth(player2, 2, "other");
        expect(player2.currentHealthPoints).toBeGreaterThan(1);
        game.entityHandler.kill(player1, player2, { card: penny, visualEffectBox: undefined });
        expect(game.stack.peek()).toBeInstanceOf(DeathOnStack);
        game.stack.cancel();
        expect(player2.isDead).toBe(false);
        expect(player2.currentHealthPoints).toBe(1);
    });

    it("rolling extra dice (Cursed Lil Haunt) does not count as extra attack rolls (Mom's Lipstick)", async () => {
        const haunt = game.obtainCard("r-cursed_lil_haunt") as MonsterCard;
        game.encounters.forceSetMonsterAtSlot(1, haunt);
        const lipstick = game.obtainCard("box-moms_lipstick") as TreasureCard;
        game.cardHandler.addInPlay(player1, lipstick);
        game.actions.declareAttack(player1);
        await game.actions.declareAttackOnEntity(player1, game.monsters[0]!);
        game.random = () => 1 / 6 - 0.01;
        await game.actions.attackRoll(player1);
        const dice = game.stack.elements.find(e => (e as any).attackRoll) as any;
        let n = 0;
        while (!game.stack.isEmpty() && n++ < 20) await game.actions.resolveStack();
        expect(player1.attackRollThisTurn).toBe(1);
        expect(player1.rollThisTurn).toBe(1);
        expect(dice.value).toBe(2);
    });

    it("Seraphim: a removed attack roll still counts, the next one is the 2nd", async () => {
        const seraphim = game.obtainCard("box-seraphim") as TreasureCard;
        game.cardHandler.addInPlay(player1, seraphim);
        const monster = game.monsters[0]!;
        game.actions.declareAttack(player1);
        await game.actions.declareAttackOnEntity(player1, monster);
        game.random = () => 1 / 6 - 0.01;
        await game.actions.attackRoll(player1);
        // The monster dies before the 1st roll resolves: the roll is removed.
        game.entityHandler.kill(player2, monster, { card: seraphim, visualEffectBox: null as any });
        while (!game.stack.isEmpty()) await game.actions.resolveStack();
        (player1 as any)._attackThisTurn = 1;
        game.actions.declareAttack(player1);
        await game.actions.declareAttackOnEntity(player1, game.monsters[1]!);
        await game.actions.attackRoll(player1);
        const dice = game.stack.elements.find(e => (e as any).attackRoll) as any;
        let n = 0;
        while (!game.stack.isEmpty() && n++ < 20) await game.actions.resolveStack();
        expect(player1.attackRollThisTurn).toBe(2);
        expect(dice.value).toBe(1);
    });
});

describe("next roll modifier", () => {
    it("Spelunking Pack: +1 to your next roll is not used by another player's roll and lasts after the turn", async () => {
        const setup = await setupTestGame({
            characters: ["rwz-guy_spelunky", "b2-lilith"],
            monsters: ["b2-fly", "b2-fatty"],
            monsterDeck: ["b2-red_host", "b2-pooter", "b2-gurdy"],
            treasureDeck: ["b2-blank_card"],
            playerCount: 2
        });
        const game = setup.game, player1 = setup.player1, player2 = setup.player2!;
        const pack = player1.inPlay[0]! as ItemCard; // Spelunking Pack, Guy Spelunky's starting item
        expect(pack.slug).toBe("rwz-spelunking_pack");
        await game.activateItem(player1, pack, ["+1 to your next roll"], 0);
        await game.resolveEntireStack();
        game.random = () => 1 / 6 - 0.01;
        let dice = game.rollDice(player2, pack);
        await game.resolveEntireStack();
        expect(dice.value).toBe(1);
        await game.endTurn();
        let n = 0;
        while (!game.stack.isEmpty() && n++ < 10) await game.actions.resolveStack();
        expect(game.currentPlayer).toBe(player2);
        dice = game.rollDice(player1, pack);
        await game.resolveEntireStack();
        expect(dice.value).toBe(2);
        expect(player1.diceModifier).toBe(0);
        expect(player1.temporaryEffects.length).toBe(0);
    });
});
