import type { Card, ItemCard, LootCard, MonsterCard, TreasureCard } from "@/models/cards";
import { beforeEach, describe, expect, it } from "bun:test";
import { Player } from "../models/entities/player";
import { Game } from "../models/game";
import { DiceRoll } from "../models/stackElement";
import { setupTestGame } from "./testHelpers";

type Reveal = { player: Player; options: Card[] };

/**
 * Records every reveal (a selection with nothing to pick) going through game.selectMultiple,
 * then lets the current implementation (mocked or real) answer it.
 */
function spyReveals(game: Game): Reveal[] {
    const reveals: Reveal[] = [];
    const inner = game.selectMultiple.bind(game);
    game.selectMultiple = (async (selections: any[]) => {
        for (const sel of selections)
            if (sel.max === 0)
                reveals.push({ player: sel.player, options: [...sel.options] });
        return inner(selections);
    }) as any;
    return reveals;
}

/** Restores the real selection handler instead of the test mock. */
function useRealSelectMultiple(game: Game): void {
    delete (game as any).selectMultiple;
}

/** Lets pending promise continuations run. */
async function flush(): Promise<void> {
    for (let i = 0; i < 10; i++)
        await new Promise(resolve => setImmediate(resolve));
}

/** Each player acknowledges every reveal pending for them. */
function acknowledgeReveals(game: Game, players: Player[] = game.players): void {
    for (const pending of [...game.pendingMultipleSelections.values()]) {
        expect(pending.max).toBe(0);
        const player = game.entityHandler.getPlayerById(pending.playerId);
        if (players.includes(player))
            game.submitSelection(player, pending.requestId, []);
    }
}

describe("CardHandler.reveal", () => {
    let game: Game;
    let player1: Player;
    let player2: Player;
    let player3: Player;

    beforeEach(async () => {
        const setup = await setupTestGame({ playerCount: 3, characters: ["b2-isaac", "b2-judas", "b2-samson"], monsters: ["b2-fly", "b2-fatty"] });
        game = setup.game;
        player1 = setup.player1;
        player2 = setup.player2!;
        player3 = setup.player3!;
        await game.actions.resolveStack();
        expect(game.stack.isEmpty()).toBe(true);
        expect(game.hasPendingSelections).toBe(false);
        useRealSelectMultiple(game);
    });

    it("shows the cards to the given players only, with nothing to pick", () => {
        const cards = game.decks.loot.drawSeveral(2);
        const promises = game.cardHandler.reveal(cards, "death", [player2, player3]);
        expect(promises.length).toBe(2);
        const pending = [...game.pendingMultipleSelections.values()];
        expect(pending.map(p => p.playerId)).toEqual([player2.id, player3.id]);
        for (const p of pending) {
            expect(p.min).toBe(0);
            expect(p.max).toBe(0);
            expect(p.options).toEqual(cards);
            expect(p.canUseOnBoardSelection).toBe(false);
            expect(p.description).toEqual({ key: "pending.cardsRevealed" });
        }
        expect(game.detailedStateJSON(player1).me.pendingSelection).toBeUndefined();
        expect(game.detailedStateJSON(player2).me.pendingSelection).toBeDefined();
    });

    it("reveals to every player by default", () => {
        const cards = game.decks.loot.drawSeveral(1);
        expect(game.cardHandler.reveal(cards, "death").length).toBe(3);
        expect([...game.pendingMultipleSelections.values()].map(p => p.playerId)).toEqual(game.players.map(p => p.id));
    });

    it("reveals nothing when there is no card", () => {
        expect(game.cardHandler.reveal([], "death")).toEqual([]);
        expect(game.hasPendingSelections).toBe(false);
    });

    it("resolves each player's promise when that player has seen the cards", async () => {
        const cards = game.decks.loot.drawSeveral(1);
        const seen: Player[] = [];
        const promises = game.cardHandler.reveal(cards, "death");
        promises.forEach((promise, i) => promise.then(() => seen.push(game.players[i]!)));

        acknowledgeReveals(game, [player2]);
        await flush();
        expect(seen).toEqual([player2]);
        expect(game.hasPendingSelections).toBe(true);

        acknowledgeReveals(game);
        await Promise.all(promises);
        expect(seen.length).toBe(3);
        expect(game.hasPendingSelections).toBe(false);
    });

    it("holds the game while a reveal is pending", async () => {
        const promises = game.cardHandler.reveal(game.decks.loot.drawSeveral(1), "death", [player2]);
        expect(game.hasPendingSelections).toBe(true);
        expect(game.actions.canEndTurn(player1, false)).not.toBe(true);
        acknowledgeReveals(game);
        await Promise.all(promises);
        expect(game.hasPendingSelections).toBe(false);
    });
});

describe("Cards that reveal", () => {
    let game: Game;
    let player1: Player;
    let player2: Player;
    let player3: Player;
    let reveals: Reveal[];

    beforeEach(async () => {
        const setup = await setupTestGame({ playerCount: 3, characters: ["b2-isaac", "b2-judas", "b2-samson"], monsters: ["b2-fly", "b2-fatty"] });
        game = setup.game;
        player1 = setup.player1;
        player2 = setup.player2!;
        player3 = setup.player3!;
        await game.actions.resolveStack();
        expect(game.stack.isEmpty()).toBe(true);
        reveals = spyReveals(game);
    });

    // "Each time a player rolls a ❻, reveal the top card of any deck. Put it back or put it into discard."
    it("b2-cheese_grater reveals the top card to the other players, its owner chooses", async () => {
        const item = game.obtainCard("b2-cheese_grater") as TreasureCard;
        game.cardHandler.addInPlay(player1, item);
        const deckSelections: number[] = [];
        const select = game.select;
        game.select = (async (player: Player, min: number, max: number, options: any[], ...rest: any[]) => {
            deckSelections.push(max);
            return (select as any)(player, min, max, options, ...rest);
        }) as any;
        player1.hand.addToHand(game.obtainCard("b2-pills") as LootCard);
        game.actions.playCard(player1, player1.hand.length - 1);
        await game.actions.resolveStack();
        const roll = game.stack._stack[0] as DiceRoll;
        expect(roll).toBeInstanceOf(DiceRoll);
        roll.value = 6;
        await game.resolveEntireStack();

        expect(reveals.map(r => r.player)).toEqual([player2, player3]);
        const revealed = reveals[0]!.options;
        expect(revealed.length).toBe(1);
        expect(reveals[1]!.options).toEqual(revealed);
        // The mock makes the owner put it into discard.
        expect(game.deckNames.some(name => game.decks[name].discard.includes(revealed[0] as any))).toBe(true);
    });

    // "[Tap Effect] Reveal the top 6 cards of the monster deck. Give any curse cards revealed to the player or players of your choosing. ..."
    it("fsp2-black_candle reveals the top 6 monster cards to the all players", async () => {
        const item = game.obtainCard("fsp2-black_candle") as TreasureCard;
        game.cardHandler.addInPlay(player1, item);
        const slugs = ["b2-curse_of_amnesia", "b2-red_host", "b2-cod_worm", "b2-curse_of_pain", "b2-conjoined_fatty", "b2-curse_of_loss"];
        // Take every card before stacking the deck: taking one out of a monster slot refills that slot from the deck.
        const cards = slugs.map(slug => game.obtainCard(slug) as MonsterCard);
        for (const card of cards)
            game.decks.monster.addTopPosition(card);
        await game.activateItem(player1, item, [], "tap");
        await game.actions.resolveStack();

        expect(reveals.map(r => r.player)).toEqual([player1, player2, player3]);
        for (const reveal of reveals)
            expect(reveal.options.map(c => c.slug).sort()).toEqual([...slugs].sort());
    });

    it("fsp2-black_candle waits for the other players to see the cards", async () => {
        useRealSelectMultiple(game);
        reveals = spyReveals(game);
        const item = game.obtainCard("fsp2-black_candle") as TreasureCard;
        game.cardHandler.addInPlay(player1, item);
        const cards = ["b2-curse_of_amnesia", "b2-red_host", "b2-cod_worm", "b2-curse_of_pain", "b2-conjoined_fatty", "b2-curse_of_loss"].map(slug => game.obtainCard(slug) as MonsterCard);
        for (const card of cards)
            game.decks.monster.addTopPosition(card);
        await game.activateItem(player1, item, [], "tap");
        let resolved = false;
        const resolving = game.actions.resolveStack().then(() => { resolved = true; });
        await flush();

        // The owner gave the curses while the others still look at the cards; the effect waits for them.
        expect(game.players.flatMap(p => p.curses).length).toBe(3);
        expect(game.hasPendingSelections).toBe(true);
        expect(resolved).toBe(false);

        acknowledgeReveals(game);
        await resolving;
        expect(game.hasPendingSelections).toBe(false);
        expect(game.stack.isEmpty()).toBe(true);
    });

    // "[Tap Effect] Reveal the top 4 cards of the monster deck. You may put an event card revealed this way in a monster slot not being attacked. ..."
    it("g2-ouija_board reveals the top 4 monster cards to every player", async () => {
        const item = game.obtainCard("g2-ouija_board") as TreasureCard;
        game.cardHandler.addInPlay(player1, item);
        const cards = ["b2-conjoined_fatty", "b2-chest_2", "b2-chest", "b2-spider"].map(slug => game.obtainCard(slug) as MonsterCard);
        for (const card of cards)
            game.decks.monster.addTopPosition(card);
        await game.activateItem(player1, item, [], "tap");
        await game.resolveEntireStack();

        expect(reveals.map(r => r.player)).toEqual(game.players);
        for (const reveal of reveals)
            expect(new Set(reveal.options)).toEqual(new Set(cards));
    });

    // "[Tap Effect] Choose another player. They give you a loot card. Reveal it, then you must play that loot card if able."
    it("fsp2-distant_admiration reveals the given loot card to every player but the giver", async () => {
        const item = game.obtainCard("fsp2-distant_admiration") as TreasureCard;
        game.cardHandler.addInPlay(player1, item);
        // A Dime only gives coins: playing it reveals nothing else.
        const given = game.obtainCard("b2-a_dime") as LootCard;
        game.cardHandler.addCardToHand(player2, given);
        game.loot(player2, 2);
        expect(player2.hand.cards[0]).toBe(given);
        await game.activateItem(player1, item, [player2], "tap");
        await game.actions.resolveStack();

        expect(reveals.map(r => r.player)).toEqual([player1, player3]);
        for (const reveal of reveals)
            expect(reveal.options).toEqual([given]);
    });

    // "When you gain or purchase this, reveal the top 10 cards of the loot deck. Put each card with "Bomb" in its name in your hand ..."
    it("r-bobby_bomb reveals the top 10 loot cards to every player", async () => {
        const item = game.obtainCard("r-bobby_bomb") as ItemCard;
        game.decks.loot.addTopPosition(game.obtainCard("b2-bomb") as LootCard);
        const top = game.decks.loot.cards.slice(0, 10);
        game.decks.treasure.addTopPosition(item as TreasureCard);
        game.gainTreasure(player1, 1);
        await game.actions.resolveStack();

        expect(reveals.map(r => r.player)).toEqual(game.players);
        for (const reveal of reveals)
            expect(reveal.options).toEqual(top);
        expect(player1.hand.cards.some(c => c.slug === "b2-bomb")).toBe(true);
    });

    // "When you gain or purchase this, reveal the top 10 cards of the loot deck. Put each card named Pills! in your hand ..."
    it("r-moms_bottle_of_pills reveals the top 10 loot cards to every player", async () => {
        const item = game.obtainCard("r-moms_bottle_of_pills") as ItemCard;
        game.decks.loot.addTopPosition(game.obtainCard("b2-pills") as LootCard);
        const top = game.decks.loot.cards.slice(0, 10);
        game.decks.treasure.addTopPosition(item as TreasureCard);
        game.gainTreasure(player1, 1);
        await game.actions.resolveStack();

        expect(reveals.map(r => r.player)).toEqual(game.players);
        for (const reveal of reveals)
            expect(reveal.options).toEqual(top);
    });

    it("r-moms_bottle_of_pills waits for every player to see the cards", async () => {
        useRealSelectMultiple(game);
        const item = game.obtainCard("r-moms_bottle_of_pills") as ItemCard;
        const pill = game.obtainCard("b2-pills") as LootCard;
        game.decks.loot.addTopPosition(pill);
        game.decks.treasure.addTopPosition(item as TreasureCard);
        game.gainTreasure(player1, 1);
        let resolved = false;
        const resolving = game.actions.resolveStack().then(() => { resolved = true; });
        await flush();

        // The cards are dealt, but the effect waits for every player to see them.
        expect(player1.hand.cards).toContain(pill);
        expect([...game.pendingMultipleSelections.values()].map(p => p.playerId)).toEqual(game.players.map(p => p.id));
        expect(game.actions.canEndTurn(player1, false)).not.toBe(true);
        expect(resolved).toBe(false);

        acknowledgeReveals(game, [player1, player2]);
        await flush();
        expect(resolved).toBe(false);

        acknowledgeReveals(game);
        await resolving;
        expect(game.hasPendingSelections).toBe(false);
    });

    // "Reveal cards from the top of the monster deck till you reveal 2 boss cards. ..."
    it("fsp2-boss_rush reveals every card drawn to every player", async () => {
        const card = game.obtainCard("fsp2-boss_rush") as MonsterCard;
        game.decks.monster.addTopPosition(card);
        game.actions.declareAttack(player1);
        await game.actions.declareAttackOnEntity(player1, "topDeck", 0);
        const drawn: Card[] = [];
        let nbBosses = 0;
        for (const c of game.decks.monster.cards) {
            drawn.push(c);
            if ((c as MonsterCard).subtype === "boss" && ++nbBosses === 2)
                break;
        }
        await game.actions.resolveStack();

        expect(reveals.map(r => r.player)).toEqual(game.players);
        for (const reveal of reveals)
            expect(reveal.options).toEqual(drawn);
    });
});
