import {Game} from "@/models/game.ts";
import type {DeckType, TargetsSelector} from "@/models/types/cardTypes.ts";
import {
    activeEntitySelector,
    anotherPlayerSelector,
    deckSelector,
    inAnotherplayItemSelector,
    inplayCurseSelector,
    inplayItemSelector,
    inplayUnchargedItemSelector,
    itemAndSoulSelector,
    playerSelector,
    rollSelector,
    stackElementSelector,
    topAnyDiscardSelector,
    visibleItemSelector,
    YourItemSelector
} from "@/models/targetSelector.ts";
import {Card, ItemCard, MonsterCard} from "@/models/cards.ts";
import { EffectOnStack, LootCardEffect } from '@/models/stackElement';
import {Player} from "@/models/entities/player.ts";
import {DiceRoll} from "@/models/stackElement.ts";

/**
 * Helper function to create a TargetsSelector with default values.
 */
const createSelector = (
    description: string,
    selector: (player: Player, card: Card) => any[],
    min: number = 1,
    max: number = 1,
): TargetsSelector => ({description, selector, min, max});
export const noTargets: TargetsSelector[] = [];
export const selectPlayer = (game: Game, min: number = 1, max: number = min): TargetsSelector[] =>
    [createSelector("Choose a player", playerSelector(() => true, game), min, max)];
export const selectAlivePlayer = (game: Game, min: number = 1, max: number = min): TargetsSelector[] =>
    [createSelector("Choose a player", playerSelector((player) => !player.isDead, game), min, max)];
export const selectXCardsFromDiscard = (game: Game, type: DeckType, min: number = 1, max: number = min, filter?: (card: Card) => boolean): TargetsSelector[] =>
    [createSelector(`Choose ${min === max ? min : `up to ${max}`} ${type} card${max > 1 ? "s" : ""} in discard`, (issuer: Player) => {
        return game.decks[type].discard.filter(card => filter ? filter(card) : true);
    })];
export const selectAliveNonActivePlayer = (game: Game, min: number = 1, max: number = min): TargetsSelector[] =>
    [createSelector("Choose a player", playerSelector((player) => !player.isDead && player !== game.currentPlayer, game), min, max)];
export const selectAnotherPlayer = (game: Game, min: number = 1, max: number = min): TargetsSelector[] =>
    [createSelector("Choose another player", anotherPlayerSelector(() => true, game), min, max)];
export const selectMonsterBeingAttacked = (game: Game, min: number = 1, max: number = min): TargetsSelector[] =>
    [createSelector("Choose a monster being attacked", (issuer: Player) => game.monsters.filter(m => m.isEngagedInCombat), min, max)];
export const selectMonsterNotBeingAttacked = (game: Game, min: number = 1, max: number = min): TargetsSelector[] =>
    [createSelector("Choose a monster not being attacked", (issuer: Player) => game.monsters.filter(m => !m.isEngagedInCombat), min, max)];
export const selectMonster = (game: Game, min: number = 1, max: number = min): TargetsSelector[] =>
    [createSelector("Choose a monster", (issuer: Player) => game.monsters, min, max)];
export const selectAttackableMonster = (game: Game, min: number = 1, max: number = min): TargetsSelector[] =>
    [createSelector("Choose a monster", (issuer: Player) => game.monsters.filter(m => m.attackable), min, max)];
export const selectPassiveAbilityOrMonsterAbility = (game: Game, min: number = 1, max: number = min): TargetsSelector[] =>
    [createSelector("Choose a triggered ability of a monster or non-eternal item.", (issuer: Player) => {
        return game.stack.elements.filter(e =>
            e instanceof EffectOnStack
            && ((e.data.it instanceof ItemCard && e.type === "passive" && !e.data.it.eternal) || (e.data.it instanceof MonsterCard && e.type !== "event")))
    }, min, max)];
export const selectCardInPlayOrLootBeingPlayed = (game: Game, min: number = 1, max: number = min): TargetsSelector[] =>
    [createSelector("Choose a card in play or a loot being played", (issuer: Player) => {
        const inPlayCards = game.players.flatMap(p => p.inPlay);
        const lootOnStack = game.stack.elements.filter(e => e.json.type === "LootCardEffect");
        return [...inPlayCards, ...lootOnStack];
    }, min, max)];
export const selectPlayerOrMonster = (game: Game, min: number = 1, max: number = min): TargetsSelector[] =>
    [createSelector("Choose a player or monster", activeEntitySelector(() => true, game), min, max)];
export const selectDeck = (game: Game, min: number = 1, max: number = min, filter?: (name: string) => boolean): TargetsSelector[] =>
    [createSelector("Choose a deck", deckSelector(filter || ((): boolean => true), game), min, max)];
export const selectTopAnyDiscard = (game: Game, min: number = 1, max: number = min): TargetsSelector[] =>
    [createSelector("Choose the top card of any discard pile", topAnyDiscardSelector(() => true, game), min, max)];
export const selectRoll = (game: Game, min: number = 1, max: number = min): TargetsSelector[] =>
    [createSelector("Choose a dice roll", rollSelector(() => true, game), min, max)];
export const selectRollAndNumber = (game: Game, numbers: number[], min: number = 1, max: number = min, rollType: "attack" | "non-attack" | "any" = "any"): TargetsSelector[] =>
    [createSelector("Choose a dice roll", rollSelector((roll: DiceRoll) => {
        if (roll.attackRoll && rollType === "non-attack" ||
            !roll.attackRoll && rollType === "attack") {
            return false;
        }
        return true;
    }, game), min, max),
        createSelector("Choose a number", () => {
            return numbers;
        }, min, max)];
export const selectItem = (game: Game, min: number = 1, max: number = min): TargetsSelector[] =>
    [createSelector("Choose a rechargeable item", inplayUnchargedItemSelector(game), min, max)];
export const selectCurse = (game: Game, min: number = 1, max: number = min): TargetsSelector[] =>
    [createSelector("Choose a curse", inplayCurseSelector((player, card) => true, game), min, max)];
export const selectNonEternalItem = (game: Game, min: number = 1, max: number = min): TargetsSelector[] =>
    [createSelector("Choose a non-eternal item", inplayItemSelector((player: Player, card: ItemCard) => card.eternal === false, game), min, max)];
export const selectTapItem = (game: Game, min: number = 1, max: number = min): TargetsSelector[] =>
    [createSelector("Choose a tap item", inplayItemSelector((player: Player, card: ItemCard) => card.hasTapEffect(), game), min, max)];
export const selectCharacterCardFromOutside = (game: Game, min: number = 1, max: number = min): TargetsSelector[] =>
    [createSelector("Choose a character card from outside the game", () => game.decks.character.cards, min, max)];
export const selectShopItem = (game: Game, min: number = 1, max: number = min): TargetsSelector[] =>
    [createSelector("Choose an item in the shop", (issuer: Player) => game.shop.itemsInShop.filter((slot) => slot !== undefined) as ItemCard[], min, max)];
export const selectNonEternalItemOrASoul = (game: Game, min: number = 1, max: number = min): TargetsSelector[] =>
    [createSelector("Choose a non-eternal item or a soul", itemAndSoulSelector((player: Player, card: ItemCard) => card.eternal === false, game), min, max)];
export const selectNonEternalTapItem = (game: Game, min: number = 1, max: number = min): TargetsSelector[] =>
    [createSelector("Choose a non-eternal item", visibleItemSelector((card: ItemCard, issuer: Player) => card.eternal === false && card.activeEffectList.length > 0 && card.hasTapEffect() && card.slug != "b2-placebo", false, game), min, max)];
export const selectAnyTapItem = (game: Game, min: number = 1, max: number = min): TargetsSelector[] =>
    [createSelector("Choose any tap item", visibleItemSelector((card: ItemCard, issuer: Player) => card.activeEffectList.length > 0 && card.hasTapEffect(), false, game), min, max)];
export const selectAnotherPlayerNonEternalItem = (game: Game, min: number = 1, max: number = min): TargetsSelector[] =>
    [createSelector("Choose another player's non-eternal item", inAnotherplayItemSelector((player: Player, card: ItemCard) => card.eternal === false, game), min, max)];
export const selectNonEternalPassiveItem = (game: Game, min: number = 1, max: number = min): TargetsSelector[] =>
    [createSelector("Choose a non-eternal passive item", visibleItemSelector((card: ItemCard, issuer: Player) => card.eternal === false && card.activeEffectList.length === 0, false, game), min, max)];
export const selectItemYouControl = (game: Game, min: number = 1, max: number = min): TargetsSelector[] =>
    [createSelector("Choose an item you control", YourItemSelector((player: Player, card: ItemCard) => true, false, game), min, max)];
export const selectNonEternalItemYouControl = (game: Game, min: number = 1, max: number = min): TargetsSelector[] =>
    [createSelector("Choose a non-eternal item you control", YourItemSelector((player: Player, card: ItemCard) => card.eternal === false, false, game), min, max)];
export const selectEternalItemYouControl = (game: Game, min: number = 1, max: number = min): TargetsSelector[] =>
    [createSelector("Choose an eternal item you control", YourItemSelector((player: Player, card: ItemCard) => card.eternal === true, false, game), min, max)];
export const selectAnotherItemYouControl = (game: Game, min: number = 1, max: number = min): TargetsSelector[] =>
    [createSelector("Choose another item you control", YourItemSelector((player: Player, card: ItemCard) => card.eternal === false, true, game), min, max)];
export const selectSoulYouControl = (game: Game, min: number = 1, max: number = min): TargetsSelector[] =>
    [createSelector("Destroy a soul you control", (issuer: Player) => issuer.souls, min, max)];
export const selectNonEternalItemFromAnywhere = (game: Game, min: number = 1, max: number = min): TargetsSelector[] =>
    [createSelector("Choose a non-eternal item from a player or from the shop", visibleItemSelector((card: ItemCard, issuer: Player) => card.eternal === false, false, game), min, max)];
export const selectAnotherNonEternalItemFromAnywhere = (game: Game, min: number = 1, max: number = min): TargetsSelector[] =>
    [createSelector("Choose another non-eternal item from a player or from the shop", visibleItemSelector((card: ItemCard, issuer: Player) => card.eternal === false, true, game), min, max)];
export const selectAnotherItemFromAnywhere = (game: Game, min: number = 1, max: number = min): TargetsSelector[] =>
    [createSelector("Choose another item from a player or from the shop", visibleItemSelector((card: ItemCard, issuer: Player) => true, true, game), min, max)];
export const selectPlayerWithMostSouls = (game: Game, min: number = 1, max: number = min): TargetsSelector[] =>
    [createSelector("Choose a player with the most souls or tied for the most", playerSelector((p) => p.souls.length === Math.max(...game.players.map(p => p.souls.length)), game), min, max)];
export const selectRollAddOrSubtract = (game: Game, x: number): TargetsSelector[] => [
    createSelector("Choose a dice roll", rollSelector(() => true, game)),
    createSelector(`Choose whether to add or to subtract ${x}`, (issuer: Player) => [x, -x])
];
export const selectLootInYourHand = (game: Game, min: number = 1, max: number = min, selectionOnResolve: boolean = false): TargetsSelector[] =>
    selectionOnResolve ? noTargets :
        [createSelector("Choose a loot card in your hand", (issuer: Player) => issuer.hand.cards, min, max)];
export const selectUsableAbilityStackElement = (game: Game, min: number = 1, max: number = min): TargetsSelector[] =>
    [createSelector("Choose the ↷ or $ ability of an item", stackElementSelector((element) => element instanceof EffectOnStack && element.data.it instanceof ItemCard && (element.type === "active" || element.type === "paid"), game), min, max)];
export const selectStackElementOrLoot = (game: Game, min: number = 1, max: number = min): TargetsSelector[] =>
    [createSelector("Choose the ↷ or $ ability of an item or a loot card on the stack", stackElementSelector((element) => element instanceof LootCardEffect || (element instanceof EffectOnStack && element.data.it instanceof ItemCard && (element.type === "active" || element.type === "paid")), game), min, max)];
export const selectLootOnStack = (game: Game, min: number = 1, max: number = min): TargetsSelector[] =>
    [createSelector("Choose a loot card on the stack", stackElementSelector((element) => element instanceof LootCardEffect, game), min, max)];
export const selectNumber1to6 = (): TargetsSelector[] =>
    [createSelector("Choose a number", () => [1, 2, 3, 4, 5, 6], 1, 1)];

export function decideEntitySelector(s: string, game: Game): TargetsSelector[] {
    let selector = selectMonster(game);
    if (s.includes("player")) {
        selector = selectPlayer(game);
        if (s.includes("monster"))
            selector = selectPlayerOrMonster(game);
    }
    return selector;
}