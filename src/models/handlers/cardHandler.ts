import {
    BsoulCard,
    Card,
    CharacterCard,
    Deck,
    Hand,
    ItemCard,
    LoadDecks,
    LootCard,
    LootCardEffect,
    MonsterCard,
    MonsterType,
    TreasureCard,
    createEmptyDecksCollection,
    isDeckType,
    isSameSlug
} from "@/models/cards";
import {
    selectEternalAmongX
} from "@/models/effects/activeEffect";
import { effectParser } from "@/models/effects/parsing/effectParser";
import { Entity } from "@/models/entities/entity";
import { Monster } from "@/models/entities/monster";
import { Player } from "@/models/entities/player";
import { DiceRoll } from "@/models/stackElement";
import type { DeckType, DeckTypeToCardType, DecksCollection, EffectType, TargetsSelector } from "@/models/types/cardTypes";
import { EffectData } from "@/models/types/cardTypes";
import { type RechargeReason } from '@/models/types/eventTypes';
import { Effect } from '../effects/effects';
import { CARDS, Game } from "../game";
import { TargetBuilder } from "../targetBuilder";
import { bSoulEffectParser } from "../effects/bonusSoulEffects";
// Type representing sources of damage - either a card ability or a dice roll
export type DamageSource = Card | DiceRoll;

export class CardHandler {
  private _game: Game;

  private _decks: DecksCollection;
  private _outsideGameCards: Card[] = [];
  private _bonusSouls: BsoulCard[] | undefined = undefined;
  private _cardMapping: Map<number, Card> = new Map();
  private _nextCardGlobalId: number = 0;
  
  constructor(game: Game) {
      this._game = game;
      this._decks = createEmptyDecksCollection(this.game.random);
  }
  get game() {
    return this._game;
  }
  get decks(): DecksCollection {
    return this._decks;
  }
  get outsideGameCards(): Card[] {
    return this._outsideGameCards;
  }
  putOutsideGame(card: Card): void {
    this._outsideGameCards.push(card);
  }
  get cardMapping(): ReadonlyMap<number, Card> {
    return this._cardMapping;
  }
  get soulsOwned(): Card[] {
    let souls: Card[] = [];
    for (const player of this.game.players) {
      souls.push(...player.souls);
    }
    return souls;
  }

  get inPlayItems(): { player: Player; card: ItemCard }[] {
    return this.game.players.flatMap(p => p.inPlay.map(c => ({player: p, card: c})));
  }

  get inPlayCurses(): { player: Player; card: MonsterCard }[] {this.game.players.flatMap(p => p.curses.map(c => ({player: p, card: c})));
    return this.game.players.flatMap(p => p.curses.map(c => ({player: p, card: c})));
  }

  /**
   * this.game function returns all visible treasure and trinkets: each players inPlay and the shop items.
   */
  get visibleItems(): ItemCard[] {
    let result: ItemCard[] = this.game.inPlayItems.map(({ card }) => card);
    result.push(
      ...this.game.shop.itemsInShop.filter((c): c is ItemCard => c instanceof ItemCard)
    );
    return result;
  }
  /**
   * this.game function returns the cards owned by a player (his hand and in-play, non-eternal cards), and game owned cards (shop and encounters).
   * @param player 
   */
  playerCardsAndGameOwnedCards(player: Player): Card[] {
    // player's hand
    const cards: Card[] = [];
    cards.push(...player.hand._hand);
    // player's inPlay
    cards.push(...this.inPlayTargetableCards(player));
    // player's curses
    cards.push(...player.curses);
    // shop
    cards.push(...this.game.shop.itemsInShop.filter((c) => c !== undefined));
    // events and monsters not in combat
    cards.push(...this.game.encounters.nonEngagedInCombat);
    return cards;
  }
  /**
   * Finds the owner of a soul or in-play item card.
   */
  getOwner(item: Card, type: "inplay" | "soul" | "any" = "any"): Player | null {
    if(type === "inplay" || type === "any") {
      if(item instanceof ItemCard)
        for (const player of this.game.players) {
          if (player.inPlay.includes(item)) {
            return player;
          }
        }
    }
    if(type === "soul" || type === "any") {
      for (const player of this.game.players) {
        if (player.souls.includes(item)) {
          return player;
        }
      }
    }
    return null;
  }
  /**
   * Transfers a soul card from a target player to another player.
   */
  stealSoul(player: Player, target: Player, soul: Card) {
    if (!target.souls.includes(soul)) {
      throw new Error("Target player does not have the specified soul.");
    }
    this.removeSoul(target, soul);
    this.addSoul(player, soul);
  }

  /**
   * Applies post-death monster card destination (soul or discard).
   */
  obtainMonsterSoulOrDiscard(monster: Monster): void {
    const card = monster.card;
    if(card.afterEffect === "handled" || card.afterEffect === "nothing")
      return; // Card is already handled by its afterEffect, so do nothing here.
    if (card.rewards?.soul !== undefined) {
      if (typeof card.rewards?.soul !== "number")
        throw new Error("Monster soul reward must be a number.");
      card.soul = card.rewards?.soul;
      this.game.addAnimation({
        id: this.game.nextAnimationId,
        type: "obtainMonsterSoul",
        card: card.jsonAPI,
        player: this.game.currentPlayer.id,
      });
      this.addSoul(this.game.currentPlayer, card);
    } else this.discard(card);
    this.game.dispatch();
  }

  /**
   * @param slug 
   * @param globalId 
   * @returns 
   */
  obtainCardFromOutsideGame(slug: string, globalId?: number): Card | undefined {
    const card = this._outsideGameCards.find((c) =>
      c.slug === slug && (globalId === undefined || c.globalId === globalId)
    );
    if (card) {
      this._outsideGameCards.splice(this._outsideGameCards.indexOf(card), 1);
      return card;
    }
    return undefined;
  }
  /**
   * Finds and removes a card by slug from all reachable game zones.
   * If a global ID is provided, it is used to disambiguate duplicate slugs.
   * Otherwise, the first matching card found in the search order is removed and returned.
   * Note that the search order is: shop, encounters, decks, players' hands, players' in-play areas. 
   * this.game means that if there are multiple cards with the same slug, the one in the shop will be removed first, then the one in encounters, then in decks and finally in players' possession.
   * Only tests should not provide a global ID.
   */
  obtainCard(slug: string, globalId?: number, type?: DeckType): Card | undefined {
    // Search in all players' hands and in-play areas
    for (const player of this.game.players) {
      if(type === "loot")
      {
        const handCard = player.hand.cards.find((c) =>
          c.slug === slug && (globalId === undefined || c.globalId === globalId)
        );
        if (handCard) {
          player.hand.removeCard(handCard);
          return handCard;
        }
      }

      const inPlayCard = player.inPlay.find((c) =>
        c.slug === slug && (globalId === undefined || c.globalId === globalId)
      );
      if (inPlayCard) {
        this.removeInPlay(player, inPlayCard);
        return inPlayCard;
      }
    }

    for (const slot of [this.game.shop, this.game.encounters, this.game.rooms]) {
        if(slot === undefined)
          continue;
        if(type !== undefined && type !== slot._deck._type)
          continue;
        const card = slot.obtainCard(slug, globalId);
        if (card) 
          {
            return card;
          }
    }
    // Search in all decks
    for (const deckKey in this.decks) {
        if(!isDeckType(deckKey))
          throw new Error(`Invalid deck type: ${deckKey}`);
        if(type !== undefined && type !== deckKey)
          continue;
        const deck = this.decks[deckKey]!;
        const card = deck.getCardFromSlug(slug, globalId);
        if (card) return card;
    }
    return undefined;
  }

  /**
   * Returns a reference to the copied card.
   * @param issuer 
   * @param gainer 
   * @param toCopy 
   * @returns 
   */
  gainAbilities(issuer: Player, gainer: ItemCard, toCopy: ItemCard): ItemCard {
    // Implementation for gaining abilities
    if(gainer.tags.copiedCards === undefined)
        gainer.tags.copiedCards = [];
    // console.log("Gaining abilities from ", toCopy.name, " to ", gainer.name);
    const copiedSelector: TargetsSelector = {
        description: "Select a card granted by this.game effect.",
        selector: (player: Player) => ((gainer.tags.copiedCards as ItemCard[]).filter((c) => c.activeEffectList.length > 0)),
        min: 1,
        max: 1,
    };
    // Create an active effect selecting one of the copied cards and one of its effects.
    if(!(gainer.hasTapEffect()))
    {
      gainer.canBeActivated = true;
        gainer.addEffect(new Effect("Use a card effect.",
            "active",
            gainer,
            async (effectData: EffectData) => {
              const effectIssuer = effectData.issuer;
                if(effectIssuer instanceof Player === false)
                    throw new Error("Effect issuer must be a player.");
                if(effectIssuer.inPlay.includes(gainer) === false)
                  return false; // the card must be still in play to use its effect.
                const card = effectData.next;
                card.owner = effectIssuer;
                if(!(card instanceof ItemCard)) {
                    throw new Error("gainAbilitiesUntilEffect target must be an ItemCard.");
                }
                if(!(gainer.tags.copiedCards as ItemCard[]).includes(card)) {
                  return false;
                    throw new Error("You can only choose cards granted by this.game effect.");
                }
                const effectsWithValidTargets = card.activeEffectList.filter(e => {
                    if(TargetBuilder.validTargetExists(this.game, effectIssuer, card, e.index) !== true) return false;
                    return (e.index === "tap" || TargetBuilder.verifyPaiementCanBeMade(this.game, effectIssuer, card, e.description) === true);
                });
                if(effectsWithValidTargets.length === 0)
                    return false;
                const effectDescriptionId = (await effectData.selectAndRecord(this.game, effectIssuer, 1, 1, effectsWithValidTargets.map(e => e.description), "Select an effect to use.", true)).selected[0]!;
                const effectId = card.activeEffectList.find(e => e.description === effectDescriptionId)?.index;
                if(effectId === undefined) {
                    throw new Error(`Selected effect "${effectDescriptionId}" not found on the card ${card.name}.`);
                }
                const targets =  await TargetBuilder.buildTargetsOnResolve(this.game, effectIssuer, card, effectId);
                card.recharge();
                const effectOnStack = await card.tryActivateEffect(targets, effectId);
                this.game.addToStack(effectOnStack);
                return true;
            }
        ,[copiedSelector]
    ));
    }
    const copied = this.copyCard(toCopy, issuer) as ItemCard;
    gainer.tags.copiedCards.push(copied);
    copied.onAddInPlay(() => issuer);
    gainer.cleaners.push(() => {
      // console.log("Cleaning up copied card: ", copied.name);
      copied.cleanup();
      gainer.tags.copiedCards = (gainer.tags.copiedCards as ItemCard[]).filter(c => c !== copied);
    });
    return copied;
  }

  /**
   * Swaps two in-play items between their owners.
   */
  swapItems(item1: ItemCard, item2: ItemCard): boolean {
    const owner1 = this.game.getOwner(item1);
    const owner2 = this.game.getOwner(item2);
    if (owner1 && owner2 && item1.eternal === false && item2.eternal === false) {
      this.removeInPlay(owner1, item1);
      this.removeInPlay(owner2, item2);
      this.addInPlay(owner1, item2);
      this.addInPlay(owner2, item1);
      return true;
    }
    return false;
  }

  get deckNames(): DeckType[] {
    const names = ["loot", "treasure", "monster"] as DeckType[];
    if(this.game.rooms !== undefined)
      names.push("room");
    return names;
  }
  get playersWithMostSouls(): Player[] {
    let maxSouls = Math.max(...this.game.players.map((player) => player.totalSouls));
    return this.game.players.filter((player) => player.totalSouls === maxSouls);
  }
  /**
   * Gives a soul card to a player.
   */
  addSoul(player: Player, soulCard: Card): void {
    if (soulCard instanceof BsoulCard && soulCard.granted === false)
    {
      this.game.addAnimation({
        id: this.game.nextAnimationId,
        type: "obtainBonusSoul",
        card: soulCard.jsonAPI,
        player: player.id,
      });
      soulCard.granted = true;
    }
    const eventData = { eventIssuer: player, soul: soulCard };
    this.game.emit("on:soul:gained:before", eventData);
    if(eventData.soul === null)
      return;
    player.addSoul(soulCard);
    this.game.emit("on:soul:gained", eventData);
    this.game.dispatch();
  }

  handleLootCardEffectResolution(elem: LootCardEffect): void {
    if(this.decks["loot"].discard.includes(elem.card))
      return;
    if(elem.card.afterEffect === "discard")
    {
      this.discard(elem.card);
    }
    if(elem.card.afterEffect === "addInPlay")
      {
        if(!(elem.card.owner instanceof Player))
          throw new Error("Trinket can only be owned by a player");
        this.addInPlay(elem.card.owner, elem.card);
      }
    if(elem.card.afterEffect === "discardNextTime")
      elem.card.afterEffect = "discard";
    }

  /**
   * Returns all player hands paired with their owner.
   */
  allHands(): { player: Player; hand: Hand }[] {
    return this.game.players.map((player) => ({ player, hand: player.hand }));
  }
  
  /**
   * Recharges every in-play item for a player.
   */
  rechargeMultiple(player: Player, reason: RechargeReason = "other", items: ItemCard[] | undefined = undefined): void {
    if(items === undefined)
      items = player.unchargedItems;
    for (const card of items) {
      this.recharge(card, reason);
    }
  }

  /**
   * Recharges a single item.
   */
  recharge(item: ItemCard, reason: RechargeReason = "other"): void {
    const data = { eventIssuer: null, card: item, reason, shouldRecharge: true};
    this.game.emit("on:recharge", data);
    if(data.shouldRecharge)
      item.recharge();
  }

  /**
   * Deactivates a single item.
   */
  deactivateItem(item: ItemCard): void {
    item.deactivate();
    this.game.dispatch();
  }

  async replaceCharacter(player: Player, newCharacter: CharacterCard): Promise<void> {
     // Remove the current character + starting item (both are eternal, so we cannot use removeInPlay()).
    const oldCharacter = player.character;
    const oldStartingItem = player.inPlay[1]!;
    
    const copyNewChara = this.copyCard(newCharacter) as CharacterCard;
    copyNewChara.onAddInPlay(() => player);
    
    oldCharacter.cleanup();
    if(oldStartingItem !== undefined && oldStartingItem.eternal === true)
    {
      oldStartingItem.cleanup();
    }
    player.inPlay[0] = copyNewChara;
    
    const newStartingItemSlug = newCharacter.eternalCard;
    const newStartingItem =
      newStartingItemSlug === null
        ? undefined
        : this.copyCard(this.decks.eternal.cards.find((card) => card.slug === newStartingItemSlug)!) as ItemCard;

    if(newStartingItem === undefined)
    {
      await selectEternalAmongX(this.game, 3)(new EffectData(newCharacter, () => player, []));
      player.inPlay[1] = player.inPlay[player.inPlay.length - 1]!;
      player.inPlay.pop();
    } else{
      newStartingItem.onAddInPlay(() => player);
      player.inPlay[1] = newStartingItem!;
    }
  }

  moveOutsideCards(): void {
    for (const key in this.decks) {
      const deck = this.decks[key as DeckType]!;
      for (const card of deck.cards) {
        if (card.outsideGame) {
          const obtainedCard = deck.getCardFromSlug(card.slug);
          if(!obtainedCard)
            throw new Error(`Card with slug ${card.slug} not found in deck.`);
          this.putOutsideGame(obtainedCard);
        }
      }
    }
  }
  /**
   * Creates decks and attaches parsed effects to all cards.
   */
  setupDecks(): void {
    if(this._decks["character"]._order!.length !== 0)
      return;
    this._decks = LoadDecks(
      CARDS
      // .filter((c) => c.slug.includes("fsp2") || (c.type !== "treasure" && c.type !== "monster"))
      ,
      this.game.players.length,
      this.game.gameParameters,
      this.game.random
    );
    this.rebuildCardMapping();
    this.joinEffectsToCards();
    this.moveOutsideCards();
  }

  /**
   * Note that any character card taken is duplicated with its eternal item if it has one. 
   * That allows several players to have the same character.
   * @param slugs set of character card slugs or "random" in the players order.
   * @returns set of character cards in the same order
   */
  getCharactersFromSlugs(slugs: string[]): CharacterCard[] {
    this.setupDecks();
    const characters: CharacterCard[] = [];
    for (const slug of slugs) {
      if(slug === "random")
      {
        characters.push(null as any);
        continue;
      }
      const cardFromSet = this._decks["character"]._set.cards.find(c => c.slug === slug);
      if(!cardFromSet)
        throw new Error(`Character card with slug ${slug} not found in character deck.`);
      const card = this.copyCard(cardFromSet) as CharacterCard;
      if (card) {
        this.addBottomPosition("character", card);
        if(card.eternalCard !== null)
        {
          const eternalCardFromSet = this._decks["eternal"]._set.cards.find(c => c.slug === card.eternalCard) as ItemCard;
          const eternalCard = this.copyCard(eternalCardFromSet) as ItemCard;
          this.addBottomPosition("eternal", eternalCard);
        }
        characters.push(card);
      }
    }
    for (let index = 0; index < characters.length; index++) {
      if (characters[index] === null) {
        const randomCard = this._decks["character"].draw();
        characters[index] = randomCard;
      }
    }
    return characters;
  }

  /**
   * Transfers a card between players when legal.
   */
  give(from: Player, to: Player, card: Card): boolean {
    if (from.souls.includes(card)) {
      this.removeSoul(from, card);
      this.addSoul(to, card);
      return true;
    }
    
    if (card instanceof ItemCard) 
      if (from.inPlay.includes(card) && !card.eternal) {
        this.removeInPlay(from, card);
        this.addInPlay(to, card);
        return true;
      }
      // loot card must be looked at the end, as it can be a trinket in play, or a soul.
    if (card instanceof LootCard) {
      return this.giveCard(from, to, card);
    }
    return false;
  }

  /**
   * Transfers a loot card from one hand to another.
   */
  giveCard(from: Player, to: Player, card: LootCard): boolean {
    if (!from.hand.cards.includes(card)) {
      return false;
    }
    this.game.addAnimation({
      id: this.game.nextAnimationId,
      type: "transferLoot",
      sender: from.id,
      recipient: to.id,
      card: card.jsonAPI,
    });

    this.removeCardFromHand(from, card);
    this.addCardToHand(to, card);
    if(to.hand.cards.some(c => this.decks.loot.cards.includes(c)))
        throw new Error("Cafsd be given to the player for eachOtherPlayerLootsAndYouLootEffect");
    return true;
  }

  /**
   * Add a card to a player's hand and emit the appropriate event.
   * this.game is the centralized method for all hand additions.
   */
  addCardToHand(player: Player, card: LootCard): void {
    card.owner = player;
    player.hand.addToHand(card);

    this.game.dispatch();
    this.game.emit("on:loot:added:after", { eventIssuer: player, card });
    this.game.dispatch();
  }

  /**
   * Remove a card from a player's hand and emit the appropriate event.
   * this.game is the centralized method for all hand removals.
   */
  removeCardFromHand(player: Player, card: LootCard): void {
    player.hand.removeCard(card);
    this.game.dispatch();
    this.game.emit("on:loot:removed:after", { eventIssuer: player, card });
    this.game.dispatch();
  }

  /**
   * Draws random character cards and assigns them to players.
   */
  assignRandomCharacterToPlayers(): void {
    this.setupDecks();
    const characterDeck = this.decks["character"];
    if (!characterDeck) {
      throw new Error("No character deck found");
    }
    
    const characters: CharacterCard[] = characterDeck.drawSeveral(
      this.game.players.length
    );
    this.assignCharactersToPlayers(characters);
  }

  /**
   * Assigns provided character cards (and matching eternals) to players.
   */
  assignCharactersToPlayers(characters: CharacterCard[]): void {
    const characterDeck = this.decks["character"];
    if (!characterDeck) {
      throw new Error("No character deck found");
    }
    if (characters.length !== this.game.players.length) {
      throw new Error("Number of characters does not match number of players");
    }
    this.game.players.forEach((player, index) => {
      const character = characters[index]!;
      this.addInPlay(player, character);
      const eternalDeck = this.decks["eternal"];
      if (!eternalDeck) {
        throw new Error("No eternal deck found");
      }
      if (character.eternalCard) {
        const cardName = character.eternalCard;
        const card = eternalDeck.getCard((card: Card) =>
          isSameSlug(cardName, card)
        );
        if (!card) {
          eternalDeck?.cards.forEach((card) => {
            console.log("Available eternal card:", card.slug);
          });
          throw new Error("No eternal card with slug " + cardName + " found");
        }
        if (card.slug !== cardName) {
          throw new Error(
            "Eternal card slug mismatch: expected " +
            cardName +
            ", got " +
            card.slug
          );
        }
        this.addInPlay(player, card);
      }
    });
  }

  /**
   * Adds an item to play and emits enter-play trigger.
   */
  addInPlay(player: Player, card: ItemCard): void {
    this.game.emit("on:enter:play", { eventIssuer: player, card: card });
    // Ensure the card knows its current owner and its effects are subscribed to that owner.
    // Previously only certain card types had onAddInPlay called; that left some items with a stale owner
    // after transfers (steal/give). Always call onAddInPlay so owner is accurate.
    card.onAddInPlay(() => player);
    player.addInPlay(card);
    this.game.emit("on:enter:play:after", {
      eventIssuer: player,
      card: card,
    });
    this.game.dispatch();
  }

  /**
   * Adds a curse card to a player.
   */
  addCurse(player: Player, card: MonsterCard): void {
    player.addCurse(card);
    card.onPlay(player, []);
    this.game.dispatch();
  }

  /**
   * Removes a curse card from a player and runs cleanup.
   */
    removeCurse(player: Player, card: MonsterCard): void {
    card.cleanup();
    player.removeCurse(card);
    this.game.dispatch();
  }

  /**
   * Activates a specific item and pushes resulting effect to stack.
   */
  async activateItem(
    player: Player,
    item: ItemCard,
    targets: any[] = [],
    effectId: number | "tap" = "tap"
  ): Promise<boolean> {
    const effectOnStack = await player.activateItem(item, targets, effectId);
    this.game.addAnimation({
      id: this.game.nextAnimationId,
      type: "activateInPlay",
      card: item.jsonAPI,
    })
    this.game.addToStack(effectOnStack);
    if (effectId === "tap") {
      this.game.emit("on:item:activated", {
        eventIssuer: player,
        item: item,
      });
    }
    return true;
  }

  // An active effect goes on the stack immediately, a passive effect register a listener.
  // A loot card is always an active effect, as even trinket goes to the stack before becoming an item.
  // An event monster card is an active effect as it goes on the stack when drawn.
  // A monster card effect is passive.
  private getEffectTypeFromOutcome(outcome: string, card: Card): EffectType {
    const normalizedOutcome = outcome.trim();
    const lowerOutcome = normalizedOutcome.toLowerCase();
    let type: EffectType = "passive";
    if (
      normalizedOutcome.startsWith("[Tap Effect]") ||
      card.type === "loot" ||
      (card instanceof MonsterCard &&
        card.encounterType === MonsterType.EVENT &&
        outcome !==
        "The active player may attack an additional time this.game turn.")
    )
      type = "active";
    else if (normalizedOutcome.startsWith("[Paid Effect]") || lowerOutcome.startsWith("[paid effect]")) type = "paid";
    return type;
  }

  attachFlipEffectsToCard(card: Card): void {
    if(card.flipData === undefined)
      throw new Error("attachFlipEffectsToCard should only be called on cards with flip data.");
    
    if(card.flipData.rewards !== undefined)
    {
      const originalRewards = card.json.rewards;
      const flippedRewards = card.flipData.rewards;
      card.addFlipEffect(() => {
          card.json.rewards = card.flipped ? flippedRewards : originalRewards;
      });
    }
    if(card.flipData.stats !== undefined && card.json.stats !== undefined) // Entity changes stats.
      {
        const originalStats = card.json.stats;
        const flippedStats = card.flipData.stats;
        const differenceHP = (flippedStats.healthPoints ?? 0) - (originalStats.healthPoints ?? 0); 
        const differenceAttack = (flippedStats.attackPoints ?? 0) - (originalStats.attackPoints ?? 0);
        const differenceEvasion = (flippedStats.evasionPoints ?? 0) - (originalStats.evasionPoints ?? 0);
        if((flippedStats.evasionPoints === undefined) !== (originalStats.evasionPoints === undefined))
          throw new Error("Cards adding or removing evasion as a stat not supported.");

        card.addFlipEffect(() => {
          if(!card.flipped)
          {
            this.game.entityHandler.addHealth(card.owner, -differenceHP, "flip");
            this.game.entityHandler.addAttack(card.owner, -differenceAttack, "flip");
            if(flippedStats.evasionPoints !== undefined && card.owner instanceof Monster)
              this.game.entityHandler.addDC(card.owner, -differenceEvasion, "flip"); 
          }
            else
            {
              this.game.entityHandler.addHealth(card.owner, differenceHP, "flip");
              this.game.entityHandler.addAttack(card.owner, differenceAttack, "flip");
              if(flippedStats.evasionPoints !== undefined && card.owner instanceof Monster)
                this.game.entityHandler.addDC(card.owner, differenceEvasion, "flip");
            }
        });
      }
      else if(card.flipData.stats !== undefined || card.json.stats !== undefined)// create animated entity.
      {
        card.addFlipEffect(() => {
          if(!card.flipped)
          {
            card.json.stats = card.json.stats;
          }
          else
          {
            card.json.stats = card.flipData!.stats!;
          }
        });
      }
    const originalEffects = card.json.effectOutcome || [];
    const newEffects = card.flipData!.effectOutcome;
    const flipData = card.flipData;
    card.flipData = undefined; // to avoid confusion, as the json is not updated on flip after initialization.
    card.swapEffectInterfaces();
    card.effectOutcomes = newEffects;
    this.attachEffectsToCard(card);
    card.effectOutcomes = originalEffects;
    card.flipData = flipData;
    card.swapEffectInterfaces();
    card.addFlipEffect(() => {
      card.effectOutcomes = card.flipped ? newEffects : originalEffects;
      card.cleanup();
      card.swapEffectInterfaces();
      card.onAddInPlay(() => card.owner);
    });
  }

  /**
   * Parses and attaches all effects from a card's effect outcomes.
   * @param card - The card to attach effects to
   * @param attachFlip - Whether to attach flip effects. Set to false only by parsing flipped cards.
   */
  attachEffectsToCard(card: Card): void {
    const flipped = card.flipped;
    for (let idx in card.effectOutcomes) {
      let outcome = card.effectOutcomes[idx]!;
      if(card.subtype === "curse" && !outcome.startsWith("[Curse]") && idx === "0")
        outcome = "[Curse] " + outcome;
      const effectType = this.getEffectTypeFromOutcome(outcome, card);
      // Handle paid effects separately to extract payment and effect functions
      if (effectType === "paid") {
        const s2 = outcome
          .replace("[paid effect] ", "")
          .replace("[Paid Effect] ", "")
          .trim();
        const idx = s2.indexOf(":");

        if (idx === -1) {
          throw new Error(
            `Invalid paid effect format (missing ':'): ${outcome}`
          );
        }

        const paymentString = s2.substring(0, idx).trim();
        const effectString = s2.substring(idx + 1).trim();

        const paymentParsed = effectParser(paymentString, this.game);
        const effectParsed = effectParser(effectString, this.game);

        const effect: Effect = new Effect(
          outcome,
          effectType,
          card,
          effectParsed.effectFunction,
          [...paymentParsed.targetSelectors, ...effectParsed.targetSelectors],
          paymentParsed.effectFunction
        );
        card.addEffect(effect);
      } else {
        // Regular effects (passive/active)
        const parsed = effectParser(outcome, this.game, card instanceof MonsterCard);
        const effect: Effect = new Effect(
          outcome,
          effectType,
          card,
          parsed.effectFunction,
          parsed.targetSelectors
        );
        card.addEffect(effect);
      }
    }
    
    if(card.flipData !== undefined)
      this.attachFlipEffectsToCard(card);
  }

  private joinEffectsToCards(): void {
    for (const deckName of [
      "loot",
      // "bsoul",
      "character",
      "eternal",
      "treasure",
      "monster",
      "room",
    ]) {
      if(!isDeckType(deckName))
        throw new Error(`Invalid deck type: ${deckName}`);
      if(deckName === "room" && this.decks["room"] === undefined)
        continue;
      const deck = this.decks[deckName]!;
      deck.cards.forEach((card: Card) => {
        this.attachEffectsToCard(card);
      });
    }
  }

  /**
   * Creates a copy of a card by reconstructing it from its JSON definition.
   * The copy is built from scratch with all effects parsed and attached.
   * @param card - The card to copy
   * @returns A new card instance with the same properties and effects
   */
  copyCard(card: Card, owner: Player | null = null): Card {
    const json = card.json;

    // Create the appropriate card type using the helper function
    this.decks[card.type]._set.addCard(json, this.allocateCardGlobalId());
    const copiedCard = this.decks[card.type]._set.get(this.decks[card.type]._set.length - 1);
    // Parse and attach effects to the copied card
    this.attachEffectsToCard(copiedCard);
    this.registerCard(copiedCard);
    if(owner) {
      copiedCard.owner = owner;
    }
    return copiedCard;
  }

  getCardByGlobalId(globalId: number): Card | undefined {
    return this._cardMapping.get(globalId);
  }

  private registerCard(card: Card): void {
    if (this._cardMapping.has(card.globalId)) {
      throw new Error(`Duplicate global card id detected: ${card.globalId}.`);
    }
    this._cardMapping.set(card.globalId, card);
    this._nextCardGlobalId = Math.max(this._nextCardGlobalId, card.globalId + 1);
  }

  private rebuildCardMapping(): void {
    this._cardMapping.clear();
    this._nextCardGlobalId = 0;
      Object.values(this.decks).forEach((deck) => deck.cards.forEach((card) => this.registerCard(card)));
  }

  addToCounter(issuer: Entity, item: Card, counterName: string, value: number): void {
    if (!item.tags[counterName]) {
      item.tags[counterName] = 0;
    }
    const oldValue = item.tags[counterName];
    item.tags[counterName] = Math.max(0, item.tags[counterName] + value);
    this.game.emit("on:counter:modified", { eventIssuer: issuer, card: item, counterName: counterName, previousValue: oldValue, newValue: item.tags[counterName] });
  }

  private allocateCardGlobalId(): number {
    return this._nextCardGlobalId++;
  }

  /** Draws the first N cards from a typed deck. */
  getFirstCardsOfDeck<T extends DeckType>(deckName: T, number: number): DeckTypeToCardType[T][] {
    return this.decks[deckName]!.drawSeveral(number) as DeckTypeToCardType[T][];
  }
  /** Inserts a card on top of a typed deck. */
  addTopPosition<T extends DeckType>(deckName: T, card: Card): void {
    this.game.assert.cardMatchesDeck(deckName, card);
    this.decks[deckName]!.addTopPosition(card as any);
  }
  /** Inserts a card at the bottom of a typed deck. */
  addBottomPosition<T extends DeckType>(deckName: T, card: Card): void {
    this.game.assert.cardMatchesDeck(deckName, card);
    this.decks[deckName]!.addBottomPosition(card as any);
  }

  /**
   * Draws and initializes the three bonus soul cards.
   */
  initializeBonusSouls(): void {
    if(this.decks["bsoul"]._order!.length !== 0 && this.game.gameParameters.playWithBonusSouls.value) {
      this._bonusSouls = this.decks["bsoul"]!.drawSeveral(3);
      for (const soul of this._bonusSouls) {
        soul.cleanup = bSoulEffectParser(soul, this.game);
      }
    }
  }
  /** Replaces a player's hand and returns the previous one. */
  setHand(player: Player, hand: Hand): Hand {
    return player.setHand(hand);
  }
  /** Draws treasure cards and puts them directly in play for the player. */
  gainTreasure(player: Player, nb: number = 1): void {
    this.game.assert.gameStarted();
    this.game.assert.positiveNumber(nb);
    const eventData = { eventIssuer: player, amount: nb };
    this.game.emit("on:item:gained", eventData);

    for (let i = 0; i < eventData.amount; i++) {
      const treasureDeck = this.decks["treasure"]!;
      try {
        const drawnCard: TreasureCard = treasureDeck.draw()!;
        this.addInPlay(player, drawnCard);
      } catch (err: any) {
        // Treat empty-deck as a recoverable condition during randomized tests
        // Log for diagnostics and stop attempting further treasure draws.
        if (err && typeof err.message === 'string' && err.message.includes('has only 0 cards')) {
          // console.warn('gainTreasure: treasure deck empty, skipping remaining treasure draws.');
          return;
        }
        throw err;
      }
    }
  }

  /** Removes curse cards from players and marks them destroyed. */
  destroyCurse(cards: MonsterCard[]): boolean {
    this.game.players.forEach((player) => {
      player.curses.forEach((card) => {
        if (cards.includes(card)) {
          this.removeCurse(player, card);
          this.discard(card);
        }
      })
    });
    this.game.dispatch();
    return true;
  }

  /** Destroys cards by removing them from in-play/soul zones and shop and tracks destruction.
   * Note that loot cards can not be destroyed.
   */
  destroyCardsOrSouls(cards: Card[]): boolean {
    if (cards.length === 0 || cards.some((card) => card === undefined) || cards.some((card) => card.eternal === true) || cards.some((card) => card.type === "loot" && card.soul === 0 && (card as LootCard).trinket === false))
      return false;

    // console.log("Destroying cards:", cards.map(c => c.name));
    const eventData = { eventIssuer: null, cards };
    this.game.emit("on:item:destroyed", eventData);
    cards = eventData.cards;
    if(cards.length === 0)
      return true;
    cards.forEach((card) => {
      if(card instanceof ItemCard)
        if(this.game.shop.removeCard(card)) {
        }
      });
      cards.forEach((card) => {
      const rest = this.game.obtainCard(card.slug, card.globalId, card.type);
    });
    cards.forEach((card) => {
      this.game.players.forEach((player) => {
        this.removeSoul(player, card);
      });
    });
    
    cards.forEach((card) => {
      this.discard(card);
    });

    this.game.dispatch();
    return true;
  }

  /** Draws loot cards for a player and emits pre/post loot triggers. */
  loot(player: Player, number: number = 1, reason: "lootStep" | "other" = "other"): void {
    this.game.assert.gameStarted();
    this.game.assert.positiveNumber(number);

    const n = [number];
    const lootDeck = this.decks["loot"]!;
    this.game.emit("on:loot:would", {
      eventIssuer: player,
      numberOfCards: n,
      reason
    });
    const toLoot = n[0]!;
    this.game.addAnimation({
      id: this.game.nextAnimationId,
      type: "drawLoot",
      nb: toLoot,
      player: player.id,
    })
    if (toLoot > 0)
      for (let i = 0; i < toLoot; i++) {
        const drawnCard: LootCard = lootDeck.draw()!;
        this.addCardToHand(player, drawnCard);
      }
    this.game.emit("on:loot:after", {
      eventIssuer: player,
      numberOfCards: toLoot,
    });
    this.game.dispatch();
  }

  /** Discards one in-play card by index when discard is legal. */
  discardInPlay(player: Player, index: number): string {
    this.game.assert.gameStarted();
    this.game.assert.isAlive(player);
    this.game.assert.positiveNumber(index);

    const inPlayCards = player.inPlay;
    if (index < 0 || index > inPlayCards.length - 1) {
      throw new Error("Invalid card position.");
    }
    const discardedCard: Card = inPlayCards[index]!;
    if (player.removeInPlayByIndex(index)) {
      this.discard(discardedCard);
      return `You have discarded the card: ${discardedCard.name} from your in-play area.\n`;
    } else {
      return `Cannot discard ${discardedCard.name} from in-play area as it is a ${discardedCard.type} card.\n`;
    }
  }

  /** Attempts to steal an item from shop or another player's in-play area. */
  stealItemAnywhere(player: Player, target: ItemCard): boolean {
    this.game.assert.gameStarted();

    if (this.game.shop.removeCard(target)) {
      this.addInPlay(player, target);
      return true;
    }
    for (const p of this.game.players) {
      if (p !== player) {
        if (p.inPlay.includes(target)) {
          if(target.eternal)
            throw new Error("Cannot steal eternal items.");
          if(this.removeInPlay(p, target)) {
            this.addInPlay(player, target);
            return true;
          }
        }
      }
    }
    return false;
  }
  /** Steals one specific loot card from target player's hand. */
  stealLootCard(player: Player, target: Player, card: LootCard): string {
    this.game.assert.gameStarted();

    const position = target.hand.cards.indexOf(card);
    this.game.assert.positiveNumber(position);

    if (position < 0 || position > target.hand.cards.length) {
      throw new Error("Invalid card position.");
    }

    this.removeCardFromHand(target, card);
    this.addCardToHand(player, card);

    return `You have stolen the card: ${card.name} from ${target.id}.\n`;
  }

  /** Destroys an owned item and replaces it by gaining treasure. */
  reroll(card: Card): void {
    const owner = this.game.getOwner(card, "inplay");
    if (!(card instanceof ItemCard)) {
      throw new Error("Can only reroll with an item card.");
    }
    if (owner && !owner.inPlay.includes(card)) {
      throw new Error("Owner does not have the specified card in play.");
    }
    const success = this.game.getOwner(card, "soul") ? false : this.destroyCardsOrSouls([card]);
    if(owner && success)
      {
        // owner.removeInPlay(card);
        this.game.gainTreasure(owner);
    }
  }

  flip(entity: Entity, card: Card): void {
    this.game.assert.gameStarted();
    if (entity instanceof Player && !(this.game.getOwner(card) === entity)) {
      return;
    }
    if (card.flipData === undefined) {
      return;
    }
    card.flip();
    this.game.emit("on:card:flipped", { eventIssuer: entity, card, recto: card.flipped });
  }

  /** Removes and returns a specific loot card from issuer hand. */
  getCardFromHand(player: Player, card: LootCard): LootCard {
    this.game.assert.gameStarted();
    const lootCard = card;
    const position = player.hand.cards.indexOf(lootCard);
    this.game.assert.positiveNumber(position);

    if (position < 0 || position > player.hand.cards.length) {
      throw new Error("Invalid card position.");
    }

    this.removeCardFromHand(player, card);
    return card;
  }

  /** Discards one hand card by index to the loot discard pile. 
   * @return true if the discard was successful.
  */
  discardFromHandAtIndex(player: Player, position: number, reason: "death" | "effect" | "overload" | "other"= "other"): boolean {
    this.game.assert.gameStarted();
    this.game.assert.positiveNumber(position);
    const hand = player.hand;
    const eventData = { eventIssuer: player, indice: [position], reason };
    position = eventData.indice[0]!;
    this.game.emit("on:loot:discard:before", eventData);
    if (position < 0 || position > hand.cards.length - 1) {
      return false;
    }
    
    const discardedCard: LootCard = hand.cards[position]!;
    this.removeCardFromHand(player, discardedCard);
    const lootDeck = this.decks["loot"]!;
    this.game.addAnimation({
      id: this.game.nextAnimationId,
      type: "discardLoot",
      player: player.id,
      card: discardedCard.jsonAPI,
    })
    lootDeck.addDiscardTop(discardedCard);

    return true;
  }
  /** Lists targetable in-play cards (excluding eternal/character). */
  inPlayTargetableCards(target: Player): ItemCard[] {
    return target.inPlay.filter(
      (card) =>
        card.type !== "eternal" &&
        card.type !== "character"
    );
  }

  /** Sends a card to its owner deck discard pile. */
  discard(card: Card): void {
    if(!card.canBeDiscarded) return;
    const eventData = { eventIssuer: null, card };
    this.game.emit("on:card:discarded:before", eventData);
    if(eventData.card === null)
      return;
    this.game.obtainCard(card.slug, card.globalId, card.type); // make sure the card is removed from other places.
    const deck: Deck<Card> = this.decks[card.type];
    deck.addDiscardTop(card);
  }

  /** Removes an in-play card from player and runs cleanup triggers. */
  removeInPlay(player: Player, card: ItemCard): boolean {
    card.cleanup();
    return player.removeInPlay(card);
  }

  /** Removes a soul card from player and runs cleanup triggers. */
  removeSoul(player: Player, card: Card): boolean {
    const result = player.removeSoul(card);
    if(result)
      {
        card.cleanup();
        this.game.emit("on:soul:removed", { eventIssuer: player, card });
      }
    return result;
  }

  get bonusSouls(): BsoulCard[] | undefined {
    return this._bonusSouls;
  }
}