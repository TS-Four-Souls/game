import {
  getAttackRollEffect,
  targetGetCoinRollEffect,
  targetGetLootRollEffect,
  targetGetTreasureRollEffect
} from "@/models/effects/activeEffect";
import { bSoulEffectParser } from "@/models/effects/bonusSoulEffects";
import {
  BsoulCard,
  Card,
  CharacterCard,
  Deck,
  Effect,
  EffectOnStack,
  EternalCard,
  Hand,
  ItemCard,
  LoadDecks,
  LootCard,
  LootCardEffect,
  MonsterCard,
  MonsterType,
  RoomCard,
  TreasureCard,
  assertCardMatchesDeck,
  createCardFromJson,
  createEmptyDecksCollection,
  isDeckType,
  isSameSlug
} from "@/models/cards";
import { generateAnimationId } from "@/utils/random";
import { effectParser } from "@/models/effects/effectParser";
import { Entity, Animated } from "@/models/entity";
import { Monster } from "@/models/monster";
import { DamageOnStack, DeathOnStack, DiceRoll, Player } from "@/models/player";
import { Encounters, Shop, AnimatedList, Rooms } from "@/models/slots";
import { Stack, type StackElement } from "@/models/stack";
import { TargetBuilder } from "@/models/targetBuilder";
import type { DeckType, DeckTypeToCardType, DecksCollection, EffectType, TargetsSelector } from "@/models/types/cardTypes";
import {EffectData} from "@/models/types/cardTypes";
import { type TriggerEvent } from '@/models/types/eventTypes';
import type { Capability, DetailedState, Issuer, SelectionItem, StackElementJson, Animation, GameParametersJson} from "@/shared/api";
import { shuffle } from "@/utils/auxiliary";
import { loadCards } from "@/utils/loadCards";
import { Signal, type ReadableSignal } from "micro-signals";
import { GameEventEmitter } from "./eventEmmitter";
import { GameParameters } from "./gameParameters";
import { HistoricHandler, type HistoricEntry } from "./historyHandler";
import { TurnHandler } from "./turnHandler";
import { edenGame, miniDraft } from "./variants";
import { CurrentPlayerDecidesToChangeRoom } from "@/models/effects/roomEffects"
import { addPassiveEffectToStack } from "./effects/passiveEffect";
import type { ServerRoomBroadcast } from "./roomBroadcast";
// Type representing sources of damage - either a card ability or a dice roll
export type DamageSource = Card | DiceRoll;

const LOG_GAME = false;
export const cards = await loadCards(process.cwd() + "/data/cards");

/*
 * The Game class is the central hub of the game logic, managing the state of the game, players, monsters, decks, shop, encounters, stack, and more. 
 * It also handles all player actions such as declaring attacks, dealing damage, resolving deaths, and managing the game history. 
 */
export class Game {
  private _players: Player[] = [];
  private _turnHandler: TurnHandler = new TurnHandler();
  private _random: () => number = () => {throw new Error("Random generator not initialized yet.");};
  private _seed: string = "";
  private _decks: DecksCollection;
  private _ongoingAttack: { player: Player; monster: Monster } | null = null;
  private _shop!: Shop;
  private _encounters!: Encounters;
  private _rooms!: Rooms;
  private _stack: Stack = new Stack();
  private _destroyedCards: Card[] = [];
  private _emitter: GameEventEmitter;
  private _bonusSouls: BsoulCard[] | undefined = undefined;
  private _stackSubsetCallbacks: {stackIds: number[], callback: () => void}[] = [];
  private _historicHandler: HistoricHandler = new HistoricHandler();
  private _cardMapping: Map<number, Card> = new Map();
  private _nextCardGlobalId: number = 0;
  private _monsterDiedThisTurn: boolean = false;
  private _animatedList: AnimatedList = new AnimatedList();
  private _isWon: boolean = false;
  readonly gameParameters = new GameParameters(() => this._onStateChange.dispatch());

  private _onStateChange: Signal<void> = new Signal();
  onStateChange: ReadableSignal<void> = this._onStateChange.readOnly();

  private _onRoomBroadcast: Signal<ServerRoomBroadcast> = new Signal();
  onRoomBroadcast: ReadableSignal<ServerRoomBroadcast> = this._onRoomBroadcast.readOnly();

  constructor(seed: string = "") {
    this.seed = seed; // if seed is empty, it will be set to a random value.
    this._decks = createEmptyDecksCollection(this.random);
    this._emitter = new GameEventEmitter();
  }
/*
 * Check if that game is started.
 */
  get isStarted(): boolean {
    return this._turnHandler.isInitialized;
  }
  get players(): Player[] {
    return this._players;
  }
  get emitter(): GameEventEmitter {
    return this._emitter;
  }
  get monsters(): Monster[] {
    return this._encounters.monsters;
  }
  get monsterDiedThisTurn(): boolean {
    return this._monsterDiedThisTurn;
  }
  set monsterDiedThisTurn(value: boolean) {
    this._monsterDiedThisTurn = value;
  }
  get turnHandler(): TurnHandler {
    return this._turnHandler;
  }
  get decks(): DecksCollection {
    return this._decks;
  }
  get shop(): Shop {
    return this._shop;
  }
  get encounters(): Encounters {
    return this._encounters;
  }
  get destroyedCards(): Card[] {
    return this._destroyedCards;
  }
  get cardMapping(): ReadonlyMap<number, Card> {
    return this._cardMapping;
  }
  get stack() {
    return this._stack;
  }
  get soulsOwned(): Card[] {
    let souls: Card[] = [];
    for (const player of this.players) {
      souls.push(...player.souls);
    }
    return souls;
  }
  get Entities(): Entity[] {
    return [
      ...this.players,
      ...this.monsters.filter((m): m is Monster => m !== undefined),
    ];
  }

  get EntitiesAndAnimated(): Entity[] {
    return [
      ...this.Entities,
      ...this.animatedList.all
    ];
  }

  get currentPlayer(): Player {
    return this.turnHandler.current;
  }

  getPlayerToThe(direction: "left" | "right"): Player {
    return this.turnHandler.getPlayerTo(this.currentPlayer, direction);
  }

  /**
   * This function returns the game history, excluding private data entries
   */
  get history(): StackElementJson[] {
    return this._historicHandler.history;
  }
  /**
   * This function returns the game history, including private data entries
   */
  get log(): HistoricEntry[] {
    return this._historicHandler.log(this);
  }

  getRollbackLog(player: Player): HistoricEntry[] {
    if(!this.gameParameters.allowCheatOptions.value && this._historicHandler.lastUserRequestIssuer === player.id)
      throw new Error("Cheat options are not allowed in this game. You can only rollback other players' actions.");
    return this._historicHandler.rollbackLog;
  }

  set seed(seed: string) {
    if (seed === "") {
      seed = crypto.randomUUID(); // generate a random seed if none is provided
    }
    this._seed = seed;
    this._historicHandler.addToHistory({ private: true, type: "randomSeed", seed: seed });
    this._random = require("seedrandom")(this._seed);
  }
  /**
   * Seeded random number generator for reproducible randomness in effects, dice rolls and shuffling.
   */
  random = (): number => {
    return this._random();
  }

  /**
   * Returns the active RNG seed used to initialize the current game generator.
   */
  get seed(): string {
    return this._seed;
  }

  /**
   * Appends an entry to the game history/log handler.
   */
  addToHistory(entry: HistoricEntry): void {
    this._historicHandler.addToHistory(entry);
  }

  /**
   * Load history after loading a game.
   */
  loadHistory(logs: HistoricEntry[]): void {
    this._historicHandler.loadHistory(logs);
  }

  get inPlayItems(): { player: Player; card: ItemCard }[] {
    return this.players.flatMap(p => p.inPlay.map(c => ({player: p, card: c})));
  }

  get inPlayCurses(): { player: Player; card: MonsterCard }[] {this.players.flatMap(p => p.curses.map(c => ({player: p, card: c})));
    return this.players.flatMap(p => p.curses.map(c => ({player: p, card: c})));
  }

  get animatedList(): AnimatedList {
    return this._animatedList;
  }
  addAnimated(animated: Animated): void {
    this._animatedList.add(animated);
  }
  removeAnimated(animated: Animated): void {
    this._animatedList.remove(animated);
  }

  get attackableEntities(): Entity[] {
    return [...this.Entities.filter(e => e.attackable), ...this.animatedList.all.filter(e => e.attackable)];
  }
  /**
   * This function returns all visible treasure and trinkets: each players inPlay and the shop items.
   */
  get visibleItems(): ItemCard[] {
    let result: ItemCard[] = this.inPlayItems.map(({ card }) => card);
    result.push(
      ...this.shop.itemsInShop.filter((c): c is ItemCard => c instanceof ItemCard)
    );
    return result;
  }
  /**
   * This function returns the cards owned by a player (his hand and in-play, non-eternal cards), and game owned cards (shop and encounters).
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
    cards.push(...this.shop.itemsInShop.filter((c) => c !== undefined));
    // events and monsters not in combat
    cards.push(...this.encounters.nonEngagedInCombat);
    return cards;
  }

  /**
   * This function allows a player to discard a card. 
   * It is not part of the game, but can be used to debug situations.
   * A player can discard: any card owned by the game (shop and encounters) and any card that he owns (hand and inPlay).
   */
  debugRemoveCards(player: Player, cards: Card[]): void {
    if(!this.gameParameters.allowCheatOptions.value)
      throw new Error("Cheat options are not allowed in this game.");
    // verify that the cards are actually owned by the player or in the shop/encounters.
    for (const card of cards) {
      if (!this.playerCardsAndGameOwnedCards(player).some(c => c === card)) {
        throw new Error(`Card ${card.name} is not owned by player ${player.id}`);
      }
    }
    for (const card of cards) {
      switch(card.type)
      {
        case "loot":
          const loot = card as LootCard;
          if(!loot)
            throw new Error(`Card ${card.name} is not a LootCard.`);
          this.removeCardFromHand(player, loot);
          if(loot.trinket)
            this.removeInPlay(player, loot);
          this.discard(loot);
          break;
        case "treasure":
          const treasure = card as TreasureCard;
          if(!treasure)
            throw new Error(`Card ${card.name} is not a TreasureCard.`);
          if(this.shop.itemsInShop.includes(treasure))
            this.shop.removeCard(treasure);
          else
            this.removeInPlay(player, treasure);
          this.discard(treasure);
          break;
        case "monster":
          const monster = card as MonsterCard;
          if(!monster)            
            throw new Error(`Card ${card.name} is not a MonsterCard.`);
          if(monster.isCurse)
            this.removeCurse(player, monster);
          else
          {
            const toDiscard = this.encounters.obtainCard(monster.slug, monster.globalId);
            if(toDiscard)
              this.discard(toDiscard);
          }
          break;
        default:
          throw new Error(`Card ${card.name} is of type ${card.type} which cannot be removed with debugRemoveCards.`);
      }
    }
    this._onStateChange.dispatch();
    this._onRoomBroadcast.dispatch({
      type: "warning",
      title: `${player.id} used a cheat to discard ${cards.length} card(s).`,
      message: `They discarded ${cards.map((c) => c.name).join(", ")}.`,
      players: this.players.map((p) => p.id),
    });
  }

  debugGainTreasures(player: Player, treasures: ItemCard[]): void {
    if(!this.gameParameters.allowCheatOptions.value)
      throw new Error("Cheat options are not allowed in this game.");
    for (const card of treasures) {
      const targetCard = this.obtainCard(card.slug, card.globalId)!;
      if (targetCard instanceof ItemCard === false)
        throw new Error(`Card ${targetCard.name} is not an ItemCard`);
      this.addInPlay(player, targetCard);
    }
    this._onRoomBroadcast.dispatch({
      type: "warning",
      title: `${player.id} used a cheat to gain ${treasures.length} treasure(s).`,
      message: `They obtained ${treasures.map((t) => t.name).join(", ")}.`,
      players: this.players.map((p) => p.id),
    });
  }

  debugGainCoins(player: Player, coins: number): void {
    if(!this.gameParameters.allowCheatOptions.value)
      throw new Error("Cheat options are not allowed in this game.");
    this.gainCoins(player, coins, "gift");
    this._onRoomBroadcast.dispatch({
      type: "warning",
      title: `${player.id} used a cheat to gain ${coins} coin(s).`,
      message: `They obtained ${coins} coin(s).`,
      players: this.players.map((p) => p.id),
    });
  }

  debugLoot(player: Player, lootCards: LootCard[]): void {
    if(!this.gameParameters.allowCheatOptions.value)
      throw new Error("Cheat options are not allowed in this game.");
    for (const card of lootCards) {
      const targetCard = this.obtainCard(card.slug, card.globalId)! as LootCard;
      this.addCardToHand(player, targetCard);
    }
    this._onRoomBroadcast.dispatch({
      type: "warning",
      title: `${player.id} used a cheat to loot ${lootCards.length} loot card(s).`,
      message: `They obtained ${lootCards.map((c) => c.name).join(", ")}.`,
      players: this.players.map((p) => p.id),
    });
  }
  debugPutMonsterCardInSlot(player: Player, card: MonsterCard, index: number): void {
    if (!card) {
      throw new Error("Card not found in the game.");
    }
    this.addTopPosition("monster", card);
    this.encounters.draw(index);
    this._onStateChange.dispatch();
    this._onRoomBroadcast.dispatch({
      type: "warning",
      title: `${player.id} used a cheat to summon a monster card.`,
      message: `They put ${card.name} in the monster slot ${index + 1}.`,
      players: this.players.map((p) => p.id),
    });
  }
  /**
   * Finds the owner of a soul or in-play item card.
   */
  getOwner(item: Card): Player | null {
    if(item instanceof ItemCard)
      for (const player of this.players) {
        if (player.inPlay.includes(item)) {
          return player;
        }
      }
    for (const player of this.players) {
      if (player.souls.includes(item)) {
        return player;
      }
    }
    return null;
  }
  /**
   * Removes a specific element from the stack, wherever it is.
   */
  cancelStackElement(element: StackElement): void {
    this.stack.cancelElement(element);
  }
  /**
   * Load settings from json if the game has not started yet.
   * @param settings 
   */
  loadSettingsFromJson(settings: GameParametersJson): void {
    if(this.isStarted)
      throw new Error("Cannot load game parameters after the game has started.");
    this.gameParameters.loadFromJson(settings);
  }
  /**
   * Transfers a soul card from a target player to another player.
   */
  stealSoul(player: Player, target: Player, soul: Card) {
    if (!target.souls.includes(soul)) {
      throw new Error("Target player does not have the specified soul.");
    }
    target.removeSoul(soul);
    this.addSoul(player, soul);
  }

  /**
   * Asynchronously selects items to lose as a death penalty.
   * This is separated from the main deathPenalty function to allow it to be overridden by specific passive effects that modify the item loss penalty without affecting the rest of the death penalty sequence.
   */
  async deathPenaltyItems(player: Player): Promise<ItemCard[]> {
    const setOfLosableItems = player.inPlay.filter(
      (c) =>
        (c instanceof TreasureCard || (c instanceof LootCard && c.trinket)) &&
      c.eternal === false
    );
    if (this.gameParameters.deathPenaltyItem.value > 0 && setOfLosableItems.length > 0) {
      const numberOfItemsToLose = Math.min(this.gameParameters.deathPenaltyItem.value, setOfLosableItems.length);
      return (
        await this.select(player, numberOfItemsToLose, numberOfItemsToLose, setOfLosableItems, this.gameParameters.deathPenaltyItem.value > 1
            ? "Select items to lose."
            : "Select an item to lose.", true)
      ).selected;
    }
    return [];
  }
  /**
   * Applies all death penalties configured for a player.
   * It can be override by a specific passive effect.
   */
  async deathPenalty(player: Player): Promise<void> {
    // remove coins.
    // obtain set of items that can be lost.
    
    
    const lostCoins = this.loseCoins(player, this.gameParameters.deathPenaltyCoins.value, true);
    let lootCardsToLose: LootCard[] = [];
    let itemsToLose: ItemCard[] = await this.deathPenaltyItems(player);
    // If at least one item can be lost, ask the player to select one.
    
    // lose loot cards
    if (this.gameParameters.deathPenaltyLoot.value > 0 && player.hand.cards.length > 0) {
      lootCardsToLose = (
        await this.select(player, this.gameParameters.deathPenaltyLoot.value, this.gameParameters.deathPenaltyLoot.value, player.hand.cards, this.gameParameters.deathPenaltyLoot.value > 1
            ? "Select loot cards to lose."
            : "Select a loot card to lose.", true)
      ).selected;
    }
    // discharge every items. 
    for (const item of player.inPlay)
      if (item.hasTapEffect()) item.charged = false;
    const deathPenaltyData = {
      eventIssuer: player,
      coinsLost: lostCoins,
      itemsLost: itemsToLose,
      lootCardsLost: lootCardsToLose,
    };
    this.emit("on:death:penalty", deathPenaltyData);

    // Replacement effects may alter the effective penalties during on:death:penalty emission.
    itemsToLose = deathPenaltyData.itemsLost;
    lootCardsToLose = deathPenaltyData.lootCardsLost;
    
    if (itemsToLose && itemsToLose.length > 0) {
      for (const item of itemsToLose) {
        if(!(item instanceof ItemCard))
          throw new Error("Selected card is not an ItemCard.");
        this.removeInPlay(player, item);
        this.destroyCardsOrSouls([item]);
      }
    }
    if (lootCardsToLose && lootCardsToLose.length > 0) {
      for (const loot of lootCardsToLose) {
        this.discardFromHandAtIndex(player, player.hand._hand.indexOf(loot));
      }
    }
    this._onStateChange.dispatch();
  }

  /**
   * Queues a death resolution sequence for an entity.
   */
  death(receiver: Entity, from: Entity, source: DamageSource): void {
    this.assertGameStarted();
    this.assertEntityIsInPlay(receiver);
    if (receiver.isDead) return;

    const deathOnStack = new DeathOnStack(receiver, from, source, this);
    this.addToStack(deathOnStack);
    this.emit("on:death:would-death", {
      eventIssuer: receiver,
      target: from,
      source: source,
      deathOnStack: deathOnStack,
    });
  }

  /**
   * Grants coin/loot/treasure rewards when a monster dies to the current player.
   */
  entityRewards(entity: Monster | Animated): void {
    const rewards = entity.rewards;
    if(rewards === undefined)
      return;

    const adders =  {
      "coin": (player: Player, amount: number) => this.gainCoins(player, amount, entity.card),
      "loot": (player: Player, amount: number) => this.loot(player, amount),
      "treasure": (player: Player, amount: number) => this.gainTreasure(player, amount),
    }
    const onDice = {
      "coin": targetGetCoinRollEffect(this),
      "loot": targetGetLootRollEffect(this),
      "treasure": targetGetTreasureRollEffect(this),
    }
    for(const rewardType of ["coin", "loot", "treasure"] as const)
      if(rewards[rewardType] !== undefined)
      {
        const allPlayers = rewards[rewardType] instanceof Object && "all" in rewards[rewardType] && rewards[rewardType].all
        const amount = (rewards[rewardType] instanceof Object && "all" in rewards[rewardType]) ? rewards[rewardType].count : rewards[rewardType] as number | "roll";
        const receivers = allPlayers ? this.players : [this.currentPlayer];
        for(const receiver of receivers)
        {
          if (amount === "roll") {
            const roll = this.rollDice(receiver, false, entity.card);
            roll.attachEffect(onDice[rewardType], entity.card, [
              receiver,
            ]);
          } else if (typeof amount === "number") {
            adders[rewardType](receiver, amount);
          }
        }
      }
  }

  /**
   * Applies post-death monster card destination (soul or discard).
   */
  obtainMonsterSoulOrDiscard(monster: Monster): void {
    const card = monster.card;
    if(card.afterEffect === "nothing")
      return; // Card is already handled by its afterEffect, so do nothing here.
    if (card.rewards?.soul !== undefined) {
      if (typeof card.rewards?.soul !== "number")
        throw new Error("Monster soul reward must be a number.");
      card.soul = card.rewards?.soul;
      this.addAnimation({
        id: this.nextAnimationId,
        type: "obtainMonsterSoul",
        card: card.jsonAPI,
        player: this.currentPlayer.id,
      });
      this.addSoul(this.currentPlayer, card);
    } else this.discard(card);
    this._onStateChange.dispatch();
  }

  /**
   * Resolves a pending death and its before/after trigger windows.
   * Should only be called by DeathOnStack objects.
   */
  resolveDeath(receiver: Entity, from: Entity, source: DamageSource): void {
    const stackIds = this.stack.elements.map(e => e.stackId);

    this.emit("on:death:before-penalty", {
      eventIssuer: receiver,
      target: from,
      source: source,
    });
    receiver.die();
    void this.executeWhenStackSubset(stackIds, async () => {
      const stackIds = this.stack.elements.map(e => e.stackId);
      if (receiver.isEngagedInCombat) {
        this.endCombat();
      }
      if (receiver instanceof Player) {
        receiver.clearAttackRequirement(); // clear any forced attack constraints on this player.
        await this.deathPenalty(receiver);
      } else if (receiver instanceof Monster) {
        // Clear any forced attack constraints on this monster
        for (const player of this.players) {
          player.clearAttackRequirement(receiver);
        }
        this.emit("on:death:monster", {
          eventIssuer: receiver,
          target: from,
          source: source,
        });
        this.monsterDiedThisTurn = true;
        this.entityRewards(receiver);
        void this.executeWhenStackSubset(stackIds, async () => {
          this.encounters.kill(receiver); // should only kill once its effects are resolved: should be moved in the resolvewhenstackempty
          this.obtainMonsterSoulOrDiscard(receiver);
        }).catch((error) => {
          console.error("Failed to finish monster death resolution", error);
        });
      }else if (receiver instanceof Animated) {
        // Clear any forced attack constraints on this animated entity
        for (const player of this.players) {
          player.clearAttackRequirement(receiver);
        }
        this.emit("on:death:animated", {
          eventIssuer: receiver,
          target: from,
          source: source,
        });
        this.entityRewards(receiver);
      }
      this.emit("on:death:after-penalty", {
        eventIssuer: receiver,
        target: from,
        source: source,
      });
      this._onStateChange.dispatch();
      // if(receiver instanceof Player && this.currentPlayer === receiver)
      //   this.executeWhenStackEmpty(() => {this.endTurn();});
    }).catch((error) => {
      console.error("Failed to resolve death follow-up", error);
    });
  }

  /**
   * Validates whether a player can declare an attack right now.
   */
  canDeclareAttack(player: Player, shouldThrow: boolean = false): Capability {
    try {
      this.assertCurrentTurnIsPlayerTurn(player);
      this.assertNoOngoingAttack();
      this.assertCurrentPlayerIsNotEngagedInPurchase();
      this.assertIsAlive(player);
      this.assertNoPendingSelection();

      if (player.isEngagedInCombat) {
        throw new Error("You are already engaged in combat.");
      }
      if (player.attackThisTurn <= 0 && !player.hasAttackRequirement && !player.hasFreeAttackRemaining)
        throw new Error("You have no remaining attacks this turn.");

      const canDeclareAttackData = {
        eventIssuer: player,
        canDeclare: [true],
        reason: [""],
      };
      this.emit("on:can:declare:attack", canDeclareAttackData, false);
      if (!canDeclareAttackData.canDeclare[0]) {
        throw new Error(canDeclareAttackData.reason[0]);
      }
    } catch (e) {
      if (shouldThrow) throw e;
      if (e instanceof Error) {
        return e.message;
      }
      return "Unknown reason";
    }
    return true;
  }

  /**
   * Declares combat intent for the current player.
   * Note that the player first declare an attack, and then select what to attack.
   * This let other players react to the attack declaration before the target is selected.
   */
  declareAttack(player: Player): void {
    this.canDeclareAttack(player, true);

    player.engageInCombat();
    this.emit("on:attack:declared", { eventIssuer: player });
    this._onStateChange.dispatch();
  }

  /**
   * Validates whether a specific monster/top-deck can be attacked.
   */
  canDeclareAttackOnEntity(player: Player,
    entity: Entity | "topDeck", shouldThrow: boolean = false): Capability {
    try {
      if (entity !== "topDeck" && !entity.attackable) {
        throw new Error("This entity cannot be attacked.");
      }
      this.assertCurrentTurnIsPlayerTurn(player);
      this.assertNoOngoingAttack();
      this.assertIsAlive(player);
      if (!player.isEngagedInCombat) {
        throw new Error("You have not declared an attack.");
      }
      const isCombatOngoing = this.attackableEntities.filter(
        (e) => e !== undefined && e.isEngagedInCombat
      ).length >= 2;
      if (isCombatOngoing) {
        throw new Error("Another entity is already engaged in combat.");
      }
      if (!player.canAttackThisEntity(entity)) {
        throw new Error(`You must attack a specific entity.`);
      }
    } catch (e) {
      if (shouldThrow) throw e;
      if (e instanceof Error) {
        return e.message;
      }
      return "Unknown reason"
    }
    return true;
  }


  /**
   * Binds the current attack to a monster target (or top-deck draw slot).
   */
  async declareAttackOnEntity(
    player: Player,
    target: Entity | "topDeck",
    drawInIndex: number = -1
  ): Promise<void> {
    const attackTopDeck = target === "topDeck";
    const attacked = [target];
    if(target instanceof Monster)
      this.emit("on:attack:declared:monster", { eventIssuer: player, monster:attacked });
    if(target instanceof Animated)
      this.emit("on:attack:declared:animated", { eventIssuer: player, animated:attacked });
    await this.executeWhenStackEmpty(() => {
      target = attacked[0]!; // in case the monster is modified by the event.
      if (drawInIndex !== -1 && target !== "topDeck")
        throw new Error(
          "drawInIndex can only be specified when drawing from topDeck"
        );
      if (drawInIndex === -1 && target === "topDeck")
        throw new Error(
          "drawInIndex must be specified when drawing from topDeck"
        );
      this.canDeclareAttackOnEntity(player, target, true);
      player.registerAttackDeclaration(target);
      if (target === "topDeck") {
        this.drawMonster(player, drawInIndex);
        if (
          this.encounters.monsterIn(drawInIndex) === undefined ||
          !this.encounters.monsterIn(drawInIndex)!.attackable
        ) {
          player.clearAttackRequirement(target);
          player.clearAttackRequirement("any");
          this.endCombat();
          return; // drawn event.
        }
        target = this.encounters.monsterIn(drawInIndex)!;
      }
      player.clearAttackRequirement(target);
      player.clearAttackRequirement("any");
      this.assertIsAlive(target);
      target.engageInCombat();
      if (target.isEngagedInCombat === false)
        throw new Error("Monster should be engaged in combat now.");
      
      if(attackTopDeck)
        this.emit("on:attack:declared:topdeck", { eventIssuer: player, drawInIndex });
      this._onStateChange.dispatch();
    });
  }

  /**
   * Computes current monster attack after replacement/modifier effects.
   */
  getAttack(entity: Entity): number {
    let baseStat = [entity.attackPoints];
    if(entity instanceof Monster)
      this.emit(
        "on:get:monster:attackPoints",
        {
          eventIssuer: entity,
          stat: baseStat,
        },
        false
      );
    return baseStat[0]!;
  }

  /**
   * Computes current monster evasion/DC clamped to [1, 6].
   */
  getDC(entity: Entity): number {
    let baseStat = [entity.evasion];
    if(entity instanceof Monster)
      this.emit(
        "on:get:monster:evasion",
        {
          eventIssuer: entity,
          stat: baseStat,
        },
        false
      );
    return Math.max(1, Math.min(6, baseStat[0]!));
  }

  /**
   * Finds and removes a card by slug from all reachable game zones.
   * If a global ID is provided, it is used to disambiguate duplicate slugs.
   * Otherwise, the first matching card found in the search order is removed and returned.
   * Note that the search order is: shop, encounters, decks, players' hands, players' in-play areas. 
   * This means that if there are multiple cards with the same slug, the one in the shop will be removed first, then the one in encounters, then in decks and finally in players' possession.
   * Only tests should not provide a global ID.
   */
  obtainCard(slug: string, globalId?: number): Card | undefined {
    for (const slot of [this.shop, this.encounters, this._rooms]) {
      try {
        if(slot === undefined)
          continue;
        const card = slot.obtainCard(slug, globalId);
        if (card) return card;
      } catch {
        // Card not found 
      }
    }
    
    // Search in all decks
    for (const deckKey in this.decks) {
      try {
        if(!isDeckType(deckKey))
            throw new Error(`Invalid deck type: ${deckKey}`);
        const deck = this.decks[deckKey]!;
        const card = deck.getCardFromSlug(slug, globalId);
        if (card) return card;
      } catch {
        // Card not found in this deck, continue searching
      }
    }

    // Search in all players' hands and in-play areas
    for (const player of this.players) {
      const handCard = player.hand.cards.find((c) =>
        c.slug === slug && (globalId === undefined || c.globalId === globalId)
      );
      if (handCard) {
        player.hand.removeCard(handCard);
        return handCard;
      }

      const inPlayCard = player.inPlay.find((c) =>
        c.slug === slug && (globalId === undefined || c.globalId === globalId)
      );
      if (inPlayCard) {
        player.removeInPlay(inPlayCard);
        return inPlayCard;
      }
    }

    return undefined;
  }

  /**
   * Validates whether the player can perform a combat attack roll.
   */
  canRollDice(player: Player, shouldThrow: boolean = false): Capability {
    try {
      this.assertCurrentTurnIsPlayerTurn(player);
      this.assertIsAlive(player);
      this.assertNoPendingSelection();
      this.assertCurrentPlayerIsEngagedInCombat();
      this.assertEmptyStack();
      
      const entity = [...this.attackableEntities].find(
        (e) => e !== undefined && e.isEngagedInCombat && e !== player
      );
      if (!entity) {
        throw new Error("No entity is currently engaged in combat.");
      }
    } catch (e) {
      if (shouldThrow) throw e;
      if (e instanceof Error) {
        return e.message;
      }
      return "Unknown reason";
    }
    return true;
  }



  /**
   * Creates and configures an attack dice roll for the current combat.
   */
  attackRoll(player: Player, target: Entity | undefined = undefined): void {
    if(target === undefined)
      this.canRollDice(player, true);
    
    if(target === undefined)
      target = [...this.attackableEntities].find(
        (m) => m !== undefined && m.isEngagedInCombat && m !== player
      );
    if (!target) {
      throw new Error("No monster is currently engaged in combat.");
    }
    if(!target.isEngagedInCombat)
      throw new Error("The selected target is not engaged in combat.");
    // damageDealt and damageReceived will be increased by the attack
    // of the dealer and receiver respectively in getAttackRollEffect.
    const damageDealt = [0];
    const damageReceived = [0];
    const evasion = [this.getDC(target)];
    const dice = this.rollDice(player, true);

    this.emit("on:attack:roll", {
      eventIssuer: player,
      target: target,
      dice,
      damageDealt,
      damageReceived,
      evasion,
    });
    if (player.attackRollThisTurn === 1)
      this.emit("on:attack:roll:first-time-each-turn", {
        eventIssuer: player,
        target: target,
        dice,
        damageDealt,
        damageReceived,
        evasion,
      });

    dice.attachEffect(
      getAttackRollEffect(
        damageDealt[0]!,
        damageReceived[0]!,
        evasion[0]!,
        this
      ),
      target.card,
      [target]
    );
  }

  /**
   * Routes combat damage through triggers then queues stack damage.
   */
  dealCombatDamage(
    dealer: Entity,
    receiver: Entity,
    source: DamageSource,
    damage: number
  ): void {
    if (damage <= 0 || receiver.isDead) return;
    const content = {
        eventIssuer: dealer, // The dealer is the one dealing combat damage
        target: receiver,
        source: source,
        damage,
      }
    this.dealDamage(dealer, receiver, source, damage);
    this.emit("on:combatdamage:dealt", content);
    if (receiver instanceof Player) {
      this.emit("on:combatdamage:dealt:to-player", content);
    } else if (receiver instanceof Monster) {
      this.emit("on:combatdamage:dealt:to-monster", content);
    }
  }

  // on health loss trigger can be added here. Be careful, in case of pay HP to verify that all the HP are actually lost.
  /**
   * Applies raw damage to an entity's health pool.
   */
  healthLoss(
    dealer: Entity,
    receiver: Entity,
    source: DamageSource,
    damage: number
  ): boolean {
    return receiver.receiveDamage(damage, dealer, source);
  }

  /**
   * Resolves queued damage and emits taken-damage/death triggers.
   */
  resolveDamage(
    dealer: Entity,
    receiver: Entity,
    source: DamageSource,
    damage: number
  ): void {
    if(receiver.isDead) return;
    this.healthLoss(dealer, receiver, source, damage);

    if(damage > 0){
        if (receiver.damageTakenThisTurn.length === 1)
          this.emit("on:damage:taken:first-time-each-turn", {
        eventIssuer: receiver,
          target: dealer,
          source: source,
          damage: damage,
        });
        
        this.emit("on:damage:taken", {
        eventIssuer: receiver,
        target: dealer,
        source: source,
        damage: damage,
      });
    }

    if (receiver.currentHealthPoints <= 0) {
      this.death(receiver, dealer, source);
    }
  }

  /**
   * Heals an entity by a fixed amount.
   */
  heal(receiver: Entity, amount: number): void {
    receiver.heal(amount);
  }
  /**
   * Pushes damage on stack and opens the "would take damage" window.
   */
  dealDamage(
    dealer: Entity,
    receiver: Entity,
    source: DamageSource,
    damage: number,
    callback?: (data: EffectData) => boolean,
    callbackTargets: any[] = []
  ): void {
    if (damage <= 0 || receiver.isDead) return;

    const damageArray = [damage];

    const damageOnStack = new DamageOnStack(
      dealer,
      receiver,
      damageArray,
      source,
      this
    );
    if (callback) {
      damageOnStack.attachEffect(callback, source, callbackTargets);
    }
    this.addToStack(damageOnStack);
    this.emit("on:damage:would-take", {
      eventIssuer: receiver,
      target: dealer,
      source: source,
      damageArray: damageArray,
    });
  }

  /**
   * Swaps two in-play items between their owners.
   */
  swapItems(item1: ItemCard, item2: ItemCard): boolean {
    const owner1 = this.getOwner(item1);
    const owner2 = this.getOwner(item2);
    if (owner1 && owner2) {
      owner1.removeInPlay(item1);
      owner2.removeInPlay(item2);
      owner1.addInPlay(item2);
      owner2.addInPlay(item1);
      return true;
    }
    return false;
  }

  makePlayerAttackable(player: Player, evasion: number): void {
    player.attackable = true;
    player.evasion = evasion;
  }

  makePlayerUnattackable(player: Player): void {
    player.attackable = false;
    player.evasion = 0;
  }

  /**
   * Adds a new player before game start.
   */
  addPlayer(newPlayer: Player): void {
    this.assertPlayerIdAvailable(newPlayer.id);
    this.assertGameNotStarted();
    this.players.push(newPlayer);
    this._onStateChange.dispatch();
  }

  /**
   * Lets a player choose treasure cards from a candidate set.
   */
  async gainTreasureAmongs(
    player: Player,
    amount: number,
    treasures: TreasureCard[]
  ): Promise<{ selected: TreasureCard[]; remaining: TreasureCard[] }> {
    const selection = await this.select(player, amount, amount, treasures, "Select treasures to gain", true);
    for (const card of selection.selected) {
      this.addInPlay(player, card);
    }
    return selection;
  }

  get nextAnimationId(): string {
    return generateAnimationId();
  }
  addAnimation(animation: Animation): void {
    for(const player of this.players)
      player.addAnimation(animation);
  }
  // Pending selection tracking for multiplayer (handles both single and multiple selections)
  private pendingMultipleSelections: Map<
    string,
    {
      playerId: string;
      options: any[];
      min: number;
      max: number;
      requestId: string;
      description: string;
      canUseOnBoardSelection: boolean;
      resolve: (selection: any[]) => void;
    }
  > = new Map();

  get hasPendingSelections(): boolean {
    return this.pendingMultipleSelections.size > 0;
  }

  /** Select is used to obtain a selection from a single player
   * If n=1 and only one option is available, it is automatically selected
   * The player must select between min and max options.
   * Returns a Promise that resolves to an object containing the selected and remaining options
  */
  async select<T>(
      player: Player,
      min: number,
      max: number,
      Options: T[],
      description: string = "UNDEFINED SHOULD NOT HAPPEN",
      skippable: boolean = true,
      canUseOnBoardSelection: boolean = true,
  ): Promise<{ selected: T[]; remaining: T[] }> {
    if (min < 0 || min > max) {
      throw new Error(`Invalid selection bounds: min (${min}) must be between 0 and max (${max}).`);
    }

    if ((min === max && Options.length === max && skippable) || Options.length < min) {
      return {
        selected: Options,
        remaining: [],
      };
    }
    if (Options.length === 0) return { selected: [], remaining: [] };
    
    const results = await this.selectMultiple([
      {
        player,
        min: min,
        max: max,
        options: Options,
        description: description,
        skippable,
        canUseOnBoardSelection,
      },
    ]);
    return results.find(r => r.playerId === player.id)!;
  }

  // Select from multiple players in parallel (useful for voting)
  // Method to submit a selection from the client
  /**
   * Submits a player's answer for a pending selection request.
   */
  submitSelection(
    player: Player,
    requestId: string,
    selectedIdentifiers: SelectionItem[]
  ): void {
    // Check if this is from a selectMultiple() call
    const pending = this.pendingMultipleSelections.get(requestId);
    if (pending && pending.playerId === player.id) {
      // Validate selection count
      if (selectedIdentifiers.length !== pending.max && pending.min === pending.max) {
        throw new Error(`Must select exactly ${pending.max} option(s)`);
      }
      else if (selectedIdentifiers.length > pending.max) {
        throw new Error(`Must select at most ${pending.max} option(s)`);
      }
      else if (selectedIdentifiers.length < pending.min) {
        throw new Error(`Must select at least ${pending.min} option(s)`);
      }

      // Resolve identifiers back to actual options
      const selected = selectedIdentifiers.map((id) => {
        const option = TargetBuilder["resolveIdentifier"](id, pending.options);
        if (option === undefined) {
          throw new Error(`Invalid selection identifier: ${id.payload}`);
        }
        return option;
      });

      // Resolve the pending promise
      pending.resolve(selected);
      this._onStateChange.dispatch();
      return;
    }
    this._onStateChange.dispatch();
    // No matching pending selection found
    throw new Error("No pending selection found for this request ID");
  }

  /**
   * Opens multiple simultaneous selection prompts and waits for all.
   * @param skippable is not implemented yet.
   */
  async selectMultiple<T>(
    selections: Array<{
      player: Player;
      min: number;
      max: number;
      options: T[];
      description: string;
      skippable?: boolean;
      canUseOnBoardSelection: boolean;
    }>
  ): Promise<Array<{ playerId: string; selected: T[]; remaining: T[] }>> {
    // In multiplayer mode: create promises for all players
    const promises = selections.map((sel) => {
      return new Promise<{
        playerId: string;
        selected: T[];
        remaining: T[];
      }>((resolve) => {
        // Non-seeded random used here for requestId generation since it doesn't affect game logic and just needs to be unique enough to avoid collisions.
        const requestId = `${sel.player.id}_${Date.now()}_${Math.random()}`;
        this.pendingMultipleSelections.set(requestId, {
          playerId: sel.player.id,
          options: sel.options,
          min: sel.min,
          max: sel.max,
          description: sel.description,
          requestId,
          canUseOnBoardSelection: sel.canUseOnBoardSelection,
          resolve: (selection: any[]) => {
            const remaining = sel.options.filter(
              (opt) => !selection.includes(opt)
            );
            resolve({
              playerId: sel.player.id,
              selected: selection,
              remaining,
            });
            this.pendingMultipleSelections.delete(requestId);
          },
        });
      });
    });

    this._onStateChange.dispatch();

    // Wait for all selections to complete
    return Promise.all(promises);
  }

  // Called when client provides selection to continue paused resolution
  /**
   * Legacy helper to resolve pending selections by player id.
   */
  provideSelection(playerId: string, selection: any[]): void {
    // Check if this is a parallel selection
    for (const [
      requestId,
      pending,
    ] of this.pendingMultipleSelections.entries()) {
      if (pending.playerId === playerId) {
        pending.resolve(selection);
        return;
      }
    }

    throw new Error("Not waiting for selection");
  }
  
  get deckNames(): DeckType[] {
    const names = ["loot", "treasure", "monster"] as DeckType[];
    if(this._rooms !== undefined)
      names.push("room");
    return names;
  }
  get monsterSlots(): Encounters {
    return this.encounters;
  }
  get playersWithMostSouls(): Player[] {
    let maxSouls = Math.max(...this.players.map((player) => player.totalSouls));
    return this.players.filter((player) => player.totalSouls === maxSouls);
  }
  /**
   * Adds an element to the stack and enriches reordering metadata when needed.
   */
  addToStack(item: StackElement): void {
    if (item instanceof EffectOnStack && !item.data.issuer) {
      throw new Error("EffectOnStack must have an issuer.");
    }
//  EffectOnStack can be reordered on the stack by their owner.
    if (item instanceof EffectOnStack) {
      const emissionContext = this.emitter.getCurrentEmissionContext();
      if (emissionContext) {
        item.reordering = {
          ...(item.reordering ?? { groupId: "" }),
          event: emissionContext.event,
          listenerId: emissionContext.listenerId,
        };
      }
    }

    this.stack.push(item);
    this._onStateChange.dispatch();
  }

  /**
   * Gives a soul card to a player.
   */
  addSoul(player: Player, soulCard: Card): void {
    if (soulCard instanceof BsoulCard && soulCard.granted === false)
    {
      this.addAnimation({
        id: this.nextAnimationId,
        type: "obtainBonusSoul",
        card: soulCard.jsonAPI,
        player: player.id,
      });
      soulCard.granted = true;
    }
    player.addSoul(soulCard);
    this.emit("on:soul:gained", { eventIssuer: player, soul: soulCard });
    this._onStateChange.dispatch();
  }

  /**
   * Resolves the top stack element, then triggers follow-up callbacks.
   */
  async resolveStack(): Promise<void> {
    if(this.stack.peek() instanceof DiceRoll)
      return this.resolveDiceRoll();
    const elem = this.stack.resolve();
    if (!elem) return;

    await elem.onResolve();
    // Add to history
    this.addToHistory(elem.json);
    if (elem instanceof LootCardEffect && elem.card instanceof LootCard)
      this.handleLootCardEffectResolution(elem);
    this._onStateChange.dispatch();
    await this.resolveCallbacks();
  }

  async resolveDiceRoll(): Promise<void> {
    const stackIds = this.stack.elements.map(e => e.stackId);
    const elem = this.stack.peek() as DiceRoll;
    if (!elem || !(elem instanceof DiceRoll)) return;

    const prevValue = elem.value;
    elem.readyToResolve = true;
    this.emit("on:dice:would-roll", { eventIssuer: elem.issuer, diceRoll: elem });
    await this.executeWhenStackSubset(stackIds, async () => {
      // If the value has changed, the roll stays in the stack.
      
      if (elem.readyToResolve === false)
        {
          this._onStateChange.dispatch();
          return;
        }
        this.stack.resolve();
        await elem.onResolve();
        // Add to history
        this.addToHistory(elem.json);
        this._onStateChange.dispatch();
        await this.resolveCallbacks();
        this.emit("on:dice:resolved", { eventIssuer: elem.issuer, diceRoll: elem });
        await this.resolveCallbacks();
    });
  }

  handleLootCardEffectResolution(elem: LootCardEffect): void {
    if(this.destroyedCards.includes(elem.card))
      return;
    if(elem.card.afterEffect === "discard")
        this.discard(elem.card);
    if(elem.card.afterEffect === "addInPlay")
      {
        if(!(elem.card.owner instanceof Player))
          throw new Error("Trinket can only be owned by a player");
        this.addInPlay(elem.card.owner, elem.card);
      }
    }

  /**
   * Resolves stack elements until the stack is empty.
   */
  async resolveEntireStack(): Promise<void> {
    while (!this.stack.isEmpty()) {
      await this.resolveStack();
    }
  }

  /**
   * Schedules a callback to run once the stack becomes empty.
   */
  async executeWhenStackEmpty(
    callback: () => void | Promise<void>
  ): Promise<void> {
    await this.executeWhenStackSubset([], callback);
  }

  /**
   * Schedules a callback once only the provided stack ids remain.
   * It is used to "wait" for additional effects to resolve before executing the callback, without needing to know exactly what those effects are.
   * Example: A monster dies, it has an on death effect. To trigger, the monster must be dead, and when a monster dies, its card is dicarded (usually).
   * But we want to keep the card in the slot while its death effect is not resolved. It is possible to do so with this function.
   */
  async executeWhenStackSubset(
    ids: number[],
    callback: () => void | Promise<void>
  ): Promise<void> {
    this._stackSubsetCallbacks.push({stackIds: ids, callback});
    await this.resolveCallbacks();
  }

  /**
   * Executes stack-subset callbacks whose condition is currently met.
   */
  async resolveCallbacks(): Promise<void> {
    if (this.hasPendingSelections)
      return;
    const callbacksToExecute: {stackIds: number[], callback: () => void | Promise<void>}[] = [];
    for(let i = this._stackSubsetCallbacks.length - 1; i >= 0; i--){
      const e = this._stackSubsetCallbacks[i]!;
      if (this.stack.elements.every((el) => e.stackIds.includes(el.stackId))) {
        callbacksToExecute.push(e);
        this._stackSubsetCallbacks.splice(i, 1);
      }
    }
    // Execute collected callbacks
    for (const cb of callbacksToExecute) {
      if (this.hasPendingSelections) {
        this._stackSubsetCallbacks.push(cb);
        continue;
      }
      await cb.callback();
      this._onStateChange.dispatch();
    }
  }

  resetCallbacks(): void {
    this._stackSubsetCallbacks = [];
  }

  /**
   * Cancels the current top stack element.
   */
  cancelStack(): void {
    this.stack.cancel();
  }

  /**
   * Removes one stack element at a specific stack index.
   */
  cancelAt(index: number): void {
    this.stack.removeAt(index);
  }

  /**
   * Clears the full stack state.
   */
  resetStack(): void {
    this.stack.clear();
  }

  /**
   * Returns all player hands paired with their owner.
   */
  allHands(): { player: Player; hand: Hand }[] {
    return this.players.map((player) => ({ player, hand: player.hand }));
  }

  /**
   * Executes the standard loot step at turn start.
   */
  lootStep(): void {
    const player = this.currentPlayer;
    this.emit("on:loot:step", { eventIssuer: player });
    this.loot(player, 1);
  }

  /**
   * Initializes turn counters and emits turn-start triggers.
   */
  startTurn(): void {
    this.players.forEach((p) => {
      p.initializeTurnCounters(p === this.currentPlayer, this.gameParameters.lootPlayPerTurn.value);
    });
    this.monsterDiedThisTurn = false;
    const player = this.currentPlayer;
    const itemsToRecharge = player.unchargedItems;
    const eventData = { eventIssuer: player, itemsToRecharge: itemsToRecharge }
    this.emit("on:turn:start:before:recharge:step", eventData);
    void this.executeWhenStackEmpty(() => {
      this.rechargeMultiple(player, eventData.itemsToRecharge);
      this.emit("on:turn:start", { eventIssuer: player });
      void this.executeWhenStackEmpty(() => {
        this.lootStep();
        this.emit("on:your:turn", { eventIssuer: player });
      }).catch((error) => {
        console.error("Failed to finish deferred turn-start loot step", error);
      });
    }).catch((error) => {
      console.error("Failed to finish deferred turn-start recharge step", error);
    });
  }

  /**
   * Discards a shop card at a given slot index.
   */
  discardFromShop(index: number): void {
    return this.shop.discardTop(index);
  }

  /**
   * Recharges every in-play item for a player.
   */
  rechargeMultiple(player: Player, items: ItemCard[] | undefined = undefined): void {
    if(items === undefined)
      items = player.unchargedItems;
    for (const card of items) {
      this.recharge(card);
    }
  }

  /**
   * Recharges a single item.
   */
  recharge(item: ItemCard): void {
    item.recharge();
  }

  /**
   * Deactivates a single item.
   */
  deactivateItem(item: ItemCard): void {
    item.deactivate();
    this._onStateChange.dispatch();
  }

  /**
   * Ends combat for all currently engaged entities.
   */
  endCombat(): void {
    const engagedEntities = [... this.players, ...this.attackableEntities].filter(
      (e) => e !== undefined && e.isEngagedInCombat
    ) as Entity[];
    for (const entity of engagedEntities) {
      if (entity.isEngagedInCombat) {
        entity.combatEnded();
      }
    }
    this.emit("on:combat:end", { eventIssuer: engagedEntities.filter(e => e instanceof Player)[0] });
    this._onStateChange.dispatch();
  }

  /**
   * Enforces max-hand-size discard rules for a player.
   */
  async verifyHandSize(player: Player): Promise<void> {
    const toDiscard = player.hand.cards.length - this.gameParameters.maxHandSize.value;
    if (toDiscard > 0){
      const selection = await this.select(player, toDiscard, toDiscard, player.hand.cards, `You must discard ${toDiscard} card(s) to reach your maximum hand size of ${this.gameParameters.maxHandSize.value}.`, true);
      for (const card of selection.selected) {
        this.discardFromHandAtIndex(player, player.hand._hand.indexOf(card));
      }
    }
  }

  handleRoomChange(): void {
    if(this.rooms === undefined) return;
    if(!this.monsterDiedThisTurn) return;
    if(this.rooms.activeRooms.every((room) => room.canBeDiscarded === false)) return;
    const data:EffectData = new EffectData(this.rooms.activeRooms[0]!, () => this.currentPlayer, []);
    addPassiveEffectToStack(this, CurrentPlayerDecidesToChangeRoom(this), data, "A monster died this turn, you can choose to put a room card into discard.");
    }


  /**
   * Runs turn-end sequence, then advances to next turn.
   */
  async endTurn(): Promise<void> {
    const player = this.currentPlayer;
    this.canEndTurn(player, true);
    this.emit("on:turn:end", { eventIssuer: player });
    this.handleRoomChange();
    await this.executeWhenStackEmpty(async () => {
      this.emit("till:turn:end", { eventIssuer: player });
      await this.verifyHandSize(player);
      this.healEveryone();
      for (const player of this.players) {
        player.resetTurnFlags();
      }
      for (const monster of this.monsters) {
        monster.resetEntityFlags();
      }
      this.turnHandler.endTurn();
      this._onStateChange.dispatch();
      this.startTurn();
    });
  }
  /**
   * End the turn of the current player if issuer is the current player and all conditions are satisfied.
   */
  async nextTurn(player: Player): Promise<void> {
    const roundIndex = this.assertGameStarted();
    this.canEndTurn(player, true);
    await this.endTurn();
  }

  /**
   * Validates if the active player can legally end the turn.
   */
  canEndTurn(player: Player, shouldThrow: boolean = false): Capability {
    try {
      this.assertGameStarted();
      this.assertCurrentTurnIsPlayerTurn(player);
      this.assertCurrentPlayerIsNotEngagedInPurchase();
      this.assertNoEntityIsEngagedInCombat();
      this.assertCurrentPlayerIsNotEngagedInCombat();
      this.assertEmptyStack();
      this.assertNoOngoingAttack();
      this.assertForcedAttackSatisfied(player);
      this.assertNoPendingSelection();
    }
    catch (e) {
      if (shouldThrow) throw e;
      if (e instanceof Error) {
        return e.message;
      }
      return "Unknown reason";
    }
    return true;
  }
  // Get target selectors for a card that a player wants to play
  getSelectors(player: Player, card: LootCard): TargetsSelector[] {
    return card.getTargetSelectors();
  }

  /**
   * Validates whether issuer can play a loot card.
   */
  canPlayCard(player: Player, shouldThrow: boolean = false): Capability {
    try {
      this.assertGameStarted();
      this.assertNoPendingSelection();
      if (!player.canIUseLootThisTurn) {
        throw new Error(`You cannot play loot cards during ${this.currentPlayer.id}'s turn.`);
      }
      if (player.remainingLootPlay <= 0) {
        throw new Error("You have no remaining loot play this turn.");
      }
    } catch (e) {
      if (shouldThrow) throw e;
      if (e instanceof Error) {
        return e.message;
      }
      return "Unknown reason";
    }
    return true;
  }

  /**
   * Validates whether stack resolution is currently allowed.
   */
  canResolve(shouldThrow: boolean = false): Capability {
    try {
      this.assertGameStarted();
      this.assertStackNotEmpty();
      this.assertNoPendingSelection();
    } catch (e) {
      if (shouldThrow) throw e;
      if (e instanceof Error) {
        return e.message;
      }
      return "Unknown reason";
    }
    return true;
  }

  win(player: Player): void {
    if(this._isWon)
      return;
    this._isWon = true;
    for(const p of this.players)
    {
      const isWinner = p.id === player.id;
      this._onRoomBroadcast.dispatch({
        type: "victory",
        title: isWinner ? "YOU WON!" : `${player.id} won, BUT MORE IMPORTANTLY, YOU LOST!`,
        message: isWinner ? "Congratulations!" : `Next time, cheat!`,
        players: [p.id],
      });
    }
  }

  /**
   * Plays one loot card from hand and pushes its effect on stack.
   */
  playCard(player: Player, index: number, targets: any[] = []): string {
    this.canPlayCard(player, true);
    this.assertPositiveNumber(index);
    if (index < 0 || index > player.hand.cards.length) {
      return "Invalid card position.";
    }
    const playedCard: LootCard = player.hand.playCard(index);

    if (targets.length === 0) {
      if (playedCard.getTargetSelectors().length === 1)
        if (playedCard.getTargetSelectors()[0]?.selector(player).length === 1)
          targets = playedCard.getTargetSelectors()[0]!.selector(player)[0];
    }
    const lootCardEffect = new LootCardEffect(player, playedCard, targets);
    this.addAnimation({
      id: this.nextAnimationId,
      type: "playLoot",
      card: playedCard.jsonAPI,
      player: player.id,
    });
    this.addToStack(lootCardEffect);
    player.remainingLootPlay -= 1;
    this.emit("on:loot:played", {
      eventIssuer: player,
      card: playedCard,
      targets: targets,
    });
    return `You have played the card: ${playedCard.name} to your in-play area.\n`;
  }

  /**
   * Draws and initializes the three bonus soul cards.
   */
  initializeBonusSouls(): void {
    if(this.decks["bsoul"]._order!.length !== 0) {
      this._bonusSouls = this.decks["bsoul"]!.drawSeveral(3);
      for (const soul of this._bonusSouls) {
        soul.cleanup = bSoulEffectParser(soul, this);
      }
    }
  }

  initializeWinningCondition(): void {
    let offSoulGained: (() => void) | null = null;
        offSoulGained = this.emitter.on("on:soul:gained", async ({ eventIssuer }) => {
          if(eventIssuer.totalSouls >= 4)
          {
              this.win(eventIssuer);
              offSoulGained!();
              offSoulGained = null;
          }
      });
    }
  /**
   * Creates decks and attaches parsed effects to all cards.
   */
  setupGame(): void {
    if(this._decks["character"]._order!.length !== 0)
      return;
    this._decks = LoadDecks(
      cards
      // .filter((c) => c.slug.includes("fsp2") || (c.type !== "treasure" && c.type !== "monster"))
      ,
      this.players.length,
      this.gameParameters,
      this.random
    );
    this.rebuildCardMapping();
    this.joinEffectsToCards();
  }

  /**
   * Note that any character card taken is duplicated with its eternal item if it has one. 
   * That allows several players to have the same character.
   * @param slugs set of character card slugs or "random" in the players order.
   * @returns set of character cards in the same order
   */
  getCharactersFromSlugs(slugs: string[]): CharacterCard[] {
    this.setupGame();
    const characters: CharacterCard[] = [];
    for (const slug of slugs) {
      if(slug === "random")
      {
        characters.push(null as any);
        continue;
      }
      const card = this._decks["character"].getCardFromSlug(slug);
      if (card) {
        const copy = this.copyCard(card);
        this.addBottomPosition("character", card);
        this.addBottomPosition("character", copy);
        if(card.eternalCard !== null)
        {
          const eternalCard = this._decks["eternal"].getCardFromSlug(card.eternalCard)!;
          const copy2 = this.copyCard(eternalCard);
          this.addBottomPosition("eternal", eternalCard);
          this.addBottomPosition("eternal", copy2);
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

  assignColorsToPlayers(): void {
    const colors = [
      "#E6E420", "#AE6DFA", "#17E6C9", "#FF6B2D"];
    if(this.players.length > colors.length)
      throw new Error("Too many players for the available colors.");
    for (let i = 0; i < this.players.length; i++) {
      this.players[i]!.color = colors[i % colors.length]!;
    }
  }

  /**
   * Starts the game lifecycle and executes initial setup.
   */
  start(characters: CharacterCard[] | null = null, shufflePlayerOrder: boolean = true): void{
    this.assertGameNotStarted();
    this.assertMinimumPlayerCount();
    this.pendingMultipleSelections.clear();
    if (shufflePlayerOrder) {
      shuffle(this.random, this.players);
    }
    if (this._decks.character.length === 0) {
      this.setupGame();
    }
    this.turnHandler.initialize(this.players);
    if(this.gameParameters.edenVariant.value === true)
      characters = edenGame(this);
    if (characters && characters.length > 0) {
      this.assignCharactersToPlayers(characters);
    } else {
      this.assignRandomCharacterToPlayers();
    }
    this._historicHandler.recordInitialGameState(this);
    
    this.initializeWinningCondition();
    this.initializeBonusSouls();
    this._shop = new Shop(
      this.gameParameters.nbItemsInShop.value,
      this.decks["treasure"]!
    );
    this._encounters = new Encounters(
      this.gameParameters.nbEncounters.value,
      this.decks["monster"]!,
      this
    );
    this.gameParameters.playWithRooms.value = this.gameParameters.playWithRooms.value && this.decks["room"] !== undefined && this.decks["room"]._order!.length > 0;
    if(this.gameParameters.playWithRooms.value === true)
    {
      this._rooms = new Rooms(
        this.gameParameters.nbRooms.value,
        this.decks["room"]!,
        this
      );
    }
    // fill empty spot may call game.encounters, so it must be called after this._encounters initialization.
    this._encounters.fillEmptySpots(true);
    this.emit("on:game:start:before", {});
    this.assignColorsToPlayers();
    this.emit("on:game:start", {});
    this.healEveryone();
    
    void this.startOfGameSetup().catch((error) => {
      console.error("Failed to complete game start setup", error);
    });
    this.startTurn();
  }

  /**
   * Distributes starting resources to each player.
   */
  async startOfGameSetup(): Promise<void> {
    for (const player of this.players) {
      this.gainTreasure(player, this.gameParameters.treasuresOnStart.value);
      this.loot(player, this.gameParameters.lootOnStart.value);
      this.gainCoins(player, this.gameParameters.coinsOnStart.value, "gift");
    }
    if(this.gameParameters.miniDraft.value)
      await miniDraft(this);
  }

  /**
   * Transfers a card between players when legal.
   */
  give(from: Player, to: Player, card: Card): boolean {
    if (from.souls.includes(card)) {
      from.removeSoul(card);
      this.addSoul(to, card);
      return true;
    }
    if (card instanceof LootCard) {
      return this.giveCard(from, to, card);
    }
    if (card instanceof ItemCard) 
      if (from.inPlay.includes(card) && !card.eternal) {
        this.removeInPlay(from, card);
        this.addInPlay(to, card);
        return true;
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
    this.addAnimation({
      id: this.nextAnimationId,
      type: "transferLoot",
      sender: from.id,
      recipient: to.id,
      card: card.jsonAPI,
    });
    this.removeCardFromHand(from, card);
    this.addCardToHand(to, card);
    return true;
  }

  /**
   * Proposes a coin transfer that target player may accept/decline.
   */
  async giveCoins(from: Player, to: Player, amount: number, forced: boolean = false): Promise<boolean> {
    if(this.gameParameters.allowCoinDonation.value === false)
      throw new Error("Giving coins is not allowed in this game.");
    if (from.coins < amount || amount <= 0) {
      return false;
    }
    if(!forced) {
      const response = await this.select(to, 1, 1, ['Accept', 'Decline'], `${from.id} wants to give you ${amount} coins.`);
      if (response.selected[0] !== 'Accept') {
        return false;
      }
    }
    this.addAnimation({
      id: this.nextAnimationId,
      type: "giveCoins",
      sender: from.id,
      recipient: to.id,
      count: amount
    });
    this.loseCoins(from, amount, true);
    this.gainCoins(to, amount, "gift");
    this.emit("on:coin:given", { eventIssuer: from, target: to, amount, forced });
    this._onStateChange.dispatch();
    return true;
  }

  /**
   * Add a card to a player's hand and emit the appropriate event.
   * This is the centralized method for all hand additions.
   */
  addCardToHand(player: Player, card: LootCard): void {
    player.hand.addToHand(card);
    this._onStateChange.dispatch();
    this.emit("on:loot:added:after", { eventIssuer: player, card });
    this._onStateChange.dispatch();
  }

  /**
   * Remove a card from a player's hand and emit the appropriate event.
   * This is the centralized method for all hand removals.
   */
  removeCardFromHand(player: Player, card: LootCard): void {
    player.hand.removeCard(card);
    this._onStateChange.dispatch();
    this.emit("on:loot:removed:after", { eventIssuer: player, card });
    this._onStateChange.dispatch();
  }

  /**
   * Draws random character cards and assigns them to players.
   */
  assignRandomCharacterToPlayers(): void {
    const characterDeck = this.decks["character"];
    if (!characterDeck) {
      throw new Error("No character deck found");
    }
    
    const characters: CharacterCard[] = characterDeck.drawSeveral(
      this.players.length
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
    if (characters.length !== this.players.length) {
      throw new Error("Number of characters does not match number of players");
    }
    this.players.forEach((player, index) => {
      const character = characters[index]!;
      if (LOG_GAME) {
        console.log(
          "Assigning character",
          character.name,
          "to player",
          player.id
        );
      }
      this.addInPlay(player, character);
      const eternalDeck = this.decks["eternal"];
      if (!eternalDeck) {
        throw new Error("No eternal deck found");
      }
      if (character.eternalCard) {
        const cardName = character.eternalCard;
        const cards = eternalDeck.getCards((card: Card) =>
          isSameSlug(cardName, card)
        );
        // if (cards.length > 1) {
        //   throw new Error("Multiple eternal cards with the same slug found");
        // }
        if (cards.length === 0) {
          eternalDeck?.cards.forEach((card) => {
            console.log("Available eternal card:", card.slug);
          });
          throw new Error("No eternal card with slug " + cardName + " found");
        }
        if (cards[0]?.slug !== cardName) {
          throw new Error(
            "Eternal card slug mismatch: expected " +
            cardName +
            ", got " +
            cards[0]?.slug
          );
        }
        this.addInPlay(player, cards[0]!);
      }
    });
  }

  /**
   * Resets the full game state to a fresh pre-start state.
   */
  reset(newSeed: boolean = true): void {
    this._historicHandler = new HistoricHandler();
    this.turnHandler.reset();
    this.monsterDiedThisTurn = false;
    this._players = [];
    this._decks = createEmptyDecksCollection(this.random);
    this._ongoingAttack = null;
    this._shop = null!;
    this.seed = (newSeed ? "" : this.seed); // If newSeed is true, set to a random value in the setter.
    this._encounters = null!;
    this._stack.clear();
    this._emitter = new GameEventEmitter();
    this._bonusSouls = undefined;
    this._destroyedCards = [];
    this._cardMapping.clear();
    this._nextCardGlobalId = 0;
    this.pendingMultipleSelections.clear();
    this.gameParameters.reset();
    this._animatedList.reset();
  }

  /**
   * Adds an item to play and emits enter-play trigger.
   */
  addInPlay(player: Player, card: ItemCard): void {
    this.emit("on:enter:play", { eventIssuer: player, card: card });
    if (
      card instanceof CharacterCard ||
      card instanceof EternalCard ||
      card instanceof TreasureCard
    ) {
      card.onAddInPlay(() => player);
    }
    player.addInPlay(card);
    this.emit("on:enter:play:after", {
      eventIssuer: player,
      card: card,
    });
    this._onStateChange.dispatch();
  }

  get rooms(): Rooms | undefined {
    return this._rooms;
  }

  /**
   * Adds a curse card to a player.
   */
  addCurse(player: Player, card: MonsterCard): void {
    player.addCurse(card);
    card.onPlay(player, []);
    this._onStateChange.dispatch();
  }

  /**
   * Removes a curse card from a player and runs cleanup.
   */
    removeCurse(player: Player, card: MonsterCard): void {
    card.cleanup();
    player.removeCurse(card);
    this._onStateChange.dispatch();
  }

  /**
   * Activates a player item by in-play index.
   */
  async activateItemAtIndex(
    player: Player,
    index: number,
    choices: any[] = [],
    effectId: number | "tap" = "tap"
  ): Promise<boolean> {
    this.assertNoPendingSelection();
    const item = player.inPlay[index];
    if (!item || !(item instanceof ItemCard)) {
      throw new Error("Player does not own the specified item.");
    }
    if (!item.activeEffectList.map((e) => e.index).includes(effectId))
      throw new Error("Item does not have the specified effect ID.");

    return await this.activateItem(player, item, choices, effectId);
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
    this.addAnimation({
      id: this.nextAnimationId,
      type: "activateInPlay",
      card: item.jsonAPI,
    })
    this.addToStack(effectOnStack);
    if (effectId === "tap") {
      this.emit("on:item:activated", {
        eventIssuer: player,
        item: item,
      });
    }
    return true;
  }

  async activateRoom(player: Player,
    room: RoomCard,
    targets: any[] = [],
    effectId: number | "tap" = "tap"
  ): Promise<boolean> {
    if(!this._rooms || !(room instanceof RoomCard) || (player !== this.currentPlayer))
      return false;
    if (!room.targetStillValid(player, effectId, targets))
      throw new Error("Targets are not valid for this effect.");

    const effectOnStack = await room.tryActivateEffect(targets, effectId);
    this.addToStack(effectOnStack);
    return true;
  }

  // An active effect goes on the stack immediately, a passive effect register a listener.
  // A loot card is always an active effect, as even trinket goes to the stack before becoming an item.
  // An event monster card is an active effect as it goes on the stack when drawn.
  // A monster card effect is passive.
  private getEffectTypeFromOutcome(outcome: string, card: Card): EffectType {
    let type: EffectType = "passive";
    if (
      outcome.startsWith("[Tap Effect]") ||
      card.type === "loot" ||
      (card instanceof MonsterCard &&
        card.encounterType === MonsterType.EVENT &&
        outcome !==
        "The active player may attack an additional time this turn.")
    )
      type = "active";
    else if (outcome.startsWith("[Paid Effect]")) type = "paid";
    return type;
  }

  /**
   * Parses and attaches all effects from a card's effect outcomes.
   * @param card - The card to attach effects to
   */
  attachEffectsToCard(card: Card): void {
    const noEffectCards = [
      "b2-fly",
      "b2-cod_worm",
      "b2-spider",
      "b2-conjoined_fatty",
      "b2-little_horn",
      "b2-red_host",
      "b2-pooter",
      "b2-gurdy",
      "b2-fat_bat",
      "b2-squirt",
      "b2-clotty",
      "b2-dip",
      "b2-leech",
      "b2-monstro",
      "b2-fatty",
      "b2-trite",
      "b2-pale_fatty",
      "fsp2-nerve_ending",
      "fsp2-widow",
    ];
    if (
      (!card.effectOutcomes || card.effectOutcomes.length === 0) &&
      !noEffectCards.includes(card.slug)
    ) {
      console.log("WARNING: No effect outcomes for card:", card.slug);
      return;
    }
    for (let outcome of card.effectOutcomes) {
      if(card.subtype === "curse" && !outcome.startsWith("[Curse]"))
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

        const paymentParsed = effectParser(paymentString, this);
        const effectParsed = effectParser(effectString, this);

        const effect: Effect = new Effect(
          outcome,
          effectType,
          effectParsed.effectFunction,
          [...paymentParsed.targetSelectors, ...effectParsed.targetSelectors],
          paymentParsed.effectFunction
        );
        card.addEffect(effect);
      } else {
        // Regular effects (passive/active)
        const parsed = effectParser(outcome, this, (data:EffectData) => {return true;}, card instanceof MonsterCard);
        const effect: Effect = new Effect(
          outcome,
          effectType,
          parsed.effectFunction,
          parsed.targetSelectors
        );
        card.addEffect(effect);
      }
    }
  }

  private joinEffectsToCards(): void {
    for (const deckName of [
      "loot",
      "bsoul",
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
  copyCard(card: Card): Card {
    const json = card.json;

    // Create the appropriate card type using the helper function
    this.decks[card.type]._set.addCard(json, this.allocateCardGlobalId());
    const copiedCard = this.decks[card.type]._set.get(this.decks[card.type]._set.length - 1);
    // Parse and attach effects to the copied card
    this.attachEffectsToCard(copiedCard);
    this.registerCard(copiedCard);

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

  private allocateCardGlobalId(): number {
    return this._nextCardGlobalId++;
  }

  /** Adds a temporary/permanent attack modifier to an entity. */
  addAttack(e: Entity, value: number): void {
    e.addAttackPoints(value);
  }

  /** Increases the number of attacks available this turn for a player. */
  addAttackThisTurn(e: Entity, value: number = 1): void {
    if (e instanceof Player) {
      e.addAttackThisTurn(value);
      this._onStateChange.dispatch();
    }
  }

  /** Adds max/current health points to an entity according to entity logic. */
  addHealth(e: Entity, value: number): void {
    e.addHealthPoints(value);
  }

  /** Applies a global attack modifier to encounter monsters. */
  addAttackToEachMonster(e: Entity, value: number): void {
    this.encounters.addAttackModifier(value);
  }

  /** Applies a global evasion/DC modifier to encounter monsters. */
  addDCToEachMonster(e: Entity, value: number): void {
    this.encounters.addDCModifier(value);
  }

  /** Adds an evasion/DC modifier to a monster entity. */
  addDC(e: Entity, value: number): void {
    if (!(e instanceof Monster))
      throw new Error("DC modifier can only be added to monsters.");
    e.addEvasion(value);
  }

  /** Grants extra loot plays this turn. */
  addLootPlay(e: Entity, value: number): void {
    if(!(e instanceof Player))
      throw new Error("Loot play modifier can only be added to players.");
    e.addLootPlay(value);
  }

  /** Toggles/updates permission to see the treasure deck top card. */
  addCanSeeTopOfTreasureDeck(e: Player, value: number): void {
    e.addCanSeeTopOfTreasureDeck(value);
  }

  /** Applies attack-roll specific dice modifier to an entity. */
  addAttackDiceModifier(e: Entity, value: number): void {
    e.addAttackDiceModifier(value);
  }

  /** Applies generic dice modifier to a player. */
  addDiceModifier(e: Entity, value: number): void {
    if (!(e instanceof Player))
      throw new Error("Dice modifier can only be added to players.");
    e.addDiceModifier(value);
  }

  /** Grants additional purchases for the current turn. */
  addPurchaseThisTurn(p: Player, value: number): void {
    p.remainingPurchaseThisTurn += value;
  }

  /** Grants coins to a player and emits coin gained triggers. */
  gainCoins(player: Player, coins: number, source: Card | "gift"): string {
    this.assertGameStarted();
    this.assertPositiveNumber(coins);
    if (coins > 0) {
      const amount = [coins];
      this.emit("on:coin:gained", {
        eventIssuer: player,
        coinGained: amount,
        source: source,
      });
      player.gainCoins(amount[0]!);
      this.emit("on:coin:gained:after", {
        eventIssuer: player,
        coinGained: amount,
        source: source,
      });
    }
    this._onStateChange.dispatch();
    return `New amount of coins: ${player.coins} coins.\n`;
  }

  /** Draws the first N cards from a typed deck. */
  getFirstCardsOfDeck<T extends DeckType>(deckName: T, number: number): DeckTypeToCardType[T][] {
    return this.decks[deckName]!.drawSeveral(number) as DeckTypeToCardType[T][];
  }
  /** Inserts a card on top of a typed deck. */
  addTopPosition<T extends DeckType>(deckName: T, card: Card): void {
    assertCardMatchesDeck(deckName, card);
    this.decks[deckName]!.addTopPosition(card as any);
  }
  /** Inserts a card at the bottom of a typed deck. */
  addBottomPosition<T extends DeckType>(deckName: T, card: Card): void {
    assertCardMatchesDeck(deckName, card);
    this.decks[deckName]!.addBottomPosition(card as any);
  }

  /** Schedules an extra turn for a player. */
  addExtraTurn(player: Player): void {
    this.turnHandler.InsertPlayerAtNextTurn(player);
  }
  /** Replaces a player's hand and returns the previous one. */
  setHand(player: Player, hand: Hand): Hand {
    return player.setHand(hand);
  }
  /** Cancels previous death entry for a player and stabilizes at 1 HP if needed. */
  preventDeath(entity: Entity): void {
    this.stack.cancelPreviousDeath(entity);
    if (entity.currentHealthPoints === 0) entity.heal(1);
  }
  /** Draws treasure cards and puts them directly in play for the player. */
  gainTreasure(player: Player, number: number = 1): void {
    this.assertGameStarted();
    this.assertPositiveNumber(number);

    for (let i = 0; i < number; i++) {
      const treasureDeck = this.decks["treasure"]!;
      const drawnCard: TreasureCard = treasureDeck.draw()!;
      this.addInPlay(player, drawnCard);
    }
  }

  /** Removes curse cards from players and marks them destroyed. */
  destroyCurse(cards: MonsterCard[]): boolean {
    this.players.forEach((player) => {
      player.curses.forEach((card) => {
        if (cards.includes(card)) {
          this.removeCurse(player, card);
          this.destroyedCards.push(card);
        }
      })
    });
    this._onStateChange.dispatch();
    return true;
  }

  /** Destroys cards by removing them from in-play/soul zones and shop and tracks destruction. */
  destroyCardsOrSouls(cards: Card[]): boolean {
    if (cards.length === 0 || cards.every((card) => card === undefined))
      return false;
    this.emit("on:item:destroyed", { eventIssuer: null, cards });
    cards.forEach((card) => {
      this.obtainCard(card.slug, card.globalId);
    });
    cards.forEach((card) => {
      this.players.forEach((player) => {
        this.removeSoul(player, card);
      });
    });
    cards.forEach((card) => {
      if(card instanceof ItemCard)
        this.shop.removeCard(card);
    });
    this.destroyedCards.push(...cards);
    this._onStateChange.dispatch();
    return true;
  }

  /** Validates whether a card can currently be activated by its owner. */
  canActivate(card: Card, owner: Player): Capability {
    if (card instanceof ItemCard && card.activeEffectList.length === 0) {
      return "This card has no active effects, there is nothing to activate.";
    }
    if(card instanceof MonsterCard && card.encounterType === MonsterType.EVENT) {
      return "You can not activate monster cards.";
    }
    if (!owner.canIActivateThisTurn) {
      return `You cannot activate cards this turn.`;
    }
    if (card.charged === false && card.activeEffectList.every(e => e.index === "tap")) {
      return "This card is not charged, it cannot be activated.";
    }

    if(card instanceof ItemCard)
      {
        if(card.activeEffectList.length === 1){
          return TargetBuilder.validTargetExists(this, owner, card, card.activeEffectList[0]!.index);
        }
        else if(!card.activeEffectList.some(e => TargetBuilder.validTargetExists(this, owner, card, e.index) === true && (card.charged || e.index !== "tap")))
          return "No valid target for this card's effects, it cannot be activated.";
      }
    return true;
  }

  /** Builds a full player-scoped game state payload for API/UI clients. */
  detailedStateJSON(player: Player): DetailedState {
    this.assertGameStarted();
    const players = [...this.players];

    // Rotate the array until the player is at the front
    const playerIndex = players.findIndex(p => p.id === player.id);
    for (let i = 0; i < playerIndex; i++) {
      players.push(players.shift()!);
    }
    
    const otherPlayers = players.slice(1);

    const getCardCounter = (card: ItemCard | MonsterCard): number | undefined =>
      (card.tags["counters"] === undefined ? card.tags["levels"] : card.tags["counters"]) as number | undefined;

    const mapAttackRequirements = (p: Player) =>
      p.requirementListJSON;

    const getPendingSelectionDetailsForPlayer = (playerId: string) => {
      for (const sel of this.pendingMultipleSelections.values()) {
        if (sel.playerId === playerId) {
          return {
            requestId: sel.requestId,
            options: TargetBuilder.convertToSelectionItems(sel.options),
            min: sel.min,
            max: sel.max,
            description: sel.description,
            canUseOnBoardSelection: sel.canUseOnBoardSelection,
          };
        }
      }
      return undefined;
    };

    const mapInPlayItem = (item: ItemCard, owner: Player) => ({
      name: item.name,
      slug: item.slug,
      globalId: item.globalId,
      charged: item.charged,
      counter: getCardCounter(item),
      eternal: item.eternal,
      effects: item.activeEffectList,
      capabilities: {
        activate: this.canActivate(item, owner),
      },
      ...(item.entity ? {
              stats: {
                healthPoints: item.entity.currentHealthPoints,
                attackPoints: this.getAttack(item.entity),
                evasionPoints: this.getDC(item.entity),
                isEngagedInCombat: item.entity.isEngagedInCombat,
                capabilities: {
                  targetable: this.canDeclareAttackOnEntity(player, item.entity, false),
                },
                temporaryEffect: item.entity.temporaryEffects,
              }
            } : {})
    });

    const mapOtherInPlayItem = (item: ItemCard, owner: Player) => ({
      name: item.name,
      slug: item.json.slug,
      globalId: item.globalId,
      charged: item.charged,
      capabilities: {
        activate: this.canActivate(item, owner),
      },
      counter: getCardCounter(item),
      eternal: item.eternal,
      ...(item.entity ? {
              stats: {
                healthPoints: item.entity.currentHealthPoints,
                attackPoints: this.getAttack(item.entity),
                evasionPoints: this.getDC(item.entity),
                isEngagedInCombat: item.entity.isEngagedInCombat,
                capabilities: {
                  targetable: this.canDeclareAttackOnEntity(player, item.entity, false),
                },
                temporaryEffect: item.entity.temporaryEffects,
              }
            } : {})
    });

    const mapCurse = (curse: MonsterCard, owner: Player) => ({
      name: curse.name,
      slug: curse.slug,
      globalId: curse.globalId,
      charged: true,
      counter: undefined,
      eternal: false,
      effects: curse.activeEffectList,
      capabilities: {
        activate: this.canActivate(curse, owner),
      },
      ...(curse.entity ? {
              stats: {
                healthPoints: curse.entity.currentHealthPoints,
                attackPoints: this.getAttack(curse.entity),
                evasionPoints: this.getDC(curse.entity),
                isEngagedInCombat: curse.entity.isEngagedInCombat,
                capabilities: {
                  targetable: this.canDeclareAttackOnEntity(player, curse.entity, false),
                },
                temporaryEffect: curse.entity.temporaryEffects,
              }
            } : {})
    });

    return {
      me: {
        name: player.id,
        color: player.color,
        hand: player.hand.cards.map((c) => c.jsonAPI),
        inPlay: player.inPlay.map((c) => mapInPlayItem(c, player)).concat(player.curses.map((c) => mapCurse(c, player))),
        handSize: player.hand.cards.length,
        souls: player.totalSouls,
        soulCards: player.souls.map((c) => c.jsonAPI),
        coins: player.coins,
        attackRequirements: player.requirementListJSON(this),
        currentAttackPoints: player.attackPoints,
        currentHealthPoints: player.currentHealthPoints,
        remainingLootPlay: player.remainingLootPlay,
        isEngagedInCombat: player.isEngagedInCombat,
        temporaryEffect: player.temporaryEffects,
        isEngagedInPurchase: player.isEngagedInPurchase,
        numberOfCardsOverMaxHandSize: Math.max(0, player.hand.cards.length - this.gameParameters.maxHandSize.value),
        pendingSelection: getPendingSelectionDetailsForPlayer(player.id),
        capabilities: {
          endTurn: this.canEndTurn(player),
          declareAttack: this.canDeclareAttack(player),
          declarePurchase: this.canDeclarePurchase(player),
          rollDice: this.canRollDice(player),
          buyTreasure: this.canPurchase(player),
          useLoot: this.canPlayCard(player),
          resolve: this.canResolve(),
          canDonateCoins: this.gameParameters.allowCoinDonation.value ? true : "Giving coins is not allowed in this game.",
        }
      },
      players: otherPlayers
        .map((p) => ({
          name: p.id,
          color: p.color,
          handSize: p.hand.cards.length,
          hand: p.handRevealed ? p.hand.cards.map((c) => c.jsonAPI) : undefined,
          inPlay: p.inPlay.map((c) => mapOtherInPlayItem(c, p)).concat(p.curses.map((c) => mapCurse(c, p))),
          souls: p.totalSouls,
          soulCards: p.souls.map((c) => c.jsonAPI),
          coins: p.coins,
          currentAttackPoints: p.attackPoints,
          currentHealthPoints: p.currentHealthPoints,
          temporaryEffect: p.temporaryEffects,
          remainingLootPlay: p.remainingLootPlay,
          isEngagedInCombat: p.isEngagedInCombat,
          isEngagedInPurchase: p.isEngagedInPurchase,
          attackRequirements: p.requirementListJSON(this),
          pendingSelection: this.pendingMultipleSelections.values().some(sel => sel.playerId === p.id),
          targetable: this.canDeclareAttackOnEntity(player, p, false),
        })),
      monsters:
      {
        discard: this.decks["monster"]!.discard.map((c) => c.jsonAPI).toReversed(),
        deckSize: this.decks["monster"]!.cards.length,
        capabilities: {
          targetableDeck: this.canDeclareAttackOnEntity(player, "topDeck", false),
        },
        inPlay: this.encounters._slots.map((m, index) => ({ card: m[m.length - 1]!, monster: this.encounters.monsterIn(index), covered: this.encounters._slots[index]!.slice(0, -1).map(c => c.jsonAPI) })).map((m) => ({

          top: {
            slug: m.card?.slug,
            name: m.card?.name,
            globalId: m.card?.globalId,
            ...(m.monster ? {
              stats: {
                healthPoints: m.monster.currentHealthPoints,
                attackPoints: this.getAttack(m.monster),
                evasionPoints: this.getDC(m.monster),
                isEngagedInCombat: m.monster.isEngagedInCombat,
                capabilities: {
                  targetable: this.canDeclareAttackOnEntity(player, m.monster, false),
                },
                temporaryEffect: m.monster.temporaryEffects,
              }

            } : {})
          },
          covered: m.covered,
        })),
      },
      ...(this.rooms ? { room: {
            discard: this.decks["room"]!.discard.map((c) => c.jsonAPI).toReversed(),
            deckSize: this.decks["room"]!.cards.length,
            inPlay: this.rooms!.activeRooms.map((c) => c!.jsonAPI),
            }
          } : {}),
      bonusSouls: this._bonusSouls !== undefined ? this._bonusSouls.map((c) => c.jsonAPI) : undefined,
      loot:
      {
        discard: this.decks["loot"]!.discard.map((c) => c.jsonAPI).toReversed(),
        deckSize: this.decks["loot"]!.cards.length,
      },
      treasure:
      {
        discard: this.decks["treasure"]!.discard.map((c) => c.jsonAPI).toReversed(),
        deckSize: this.decks["treasure"]!.cards.length,
        inPlay: this.shop.itemsInShop.map((c) => c!.jsonAPI),
      },
      turn: this.currentPlayer.id,
      history: this.history,
      firstCardTreasureDeck: player.canSeeTopOfTreasureDeck ? this.decks["treasure"]!.cards[0]!.jsonAPI : undefined,
      stack: this.stack.elements.map((el) => el.json).toReversed(),
      animations: player.animations(true)
    };
  }
  // We should implement declaring a purchase
  /** Validates whether current player can declare purchase mode. */
  canDeclarePurchase(player: Player, shouldThrow: boolean = false): Capability {
    try {
      this.assertGameStarted();
      this.assertCurrentTurnIsPlayerTurn(player);
      this.assertIsAlive(player);
      this.assertCurrentPlayerIsNotEngagedInCombat();
      this.assertEmptyStack();
      this.assertNoPendingSelection();
      if (player.remainingPurchaseThisTurn <= 0) {
        throw new Error(
          `Purchase failed. You have no remaining purchases this turn.\n`
        );
      } 
    } catch (error) {
      if (shouldThrow) throw error;
      if (error instanceof Error) {
        return error.message;
      }
      return "Unknown reason";
    }
    return true;
  }

  /** Enters purchase mode and consumes one purchase allowance. */
  declarePurchase(player: Player): void {
    this.canDeclarePurchase(player, true);

    player.remainingPurchaseThisTurn -= 1;
    player.engageInPurchase();
    this._onStateChange.dispatch();
  }

  /** Cancels purchase mode when purchasing is no longer valid. */
  cancelPurchase(player: Player): void {
    if(this.canPurchase(player, false) !== true)
      {
        player.purchaseEnded();
        this._onStateChange.dispatch();
      }
    else 
      throw new Error("You have to purchase an item.");
  }

  // We should implement declaring a purchase
  /** Validates whether the active player can buy from the shop now. */
  canPurchase(player: Player, shouldThrow: boolean = false): Capability {
    try {
      this.assertGameStarted();
      this.assertCurrentTurnIsPlayerTurn(player);
      this.assertIsAlive(player);
      this.assertCurrentPlayerIsEngagedInPurchase();
      const price = this.gameParameters.shopPrice.value + player.priceModifier;
      if (player.coins < price!) {
        throw new Error(
          `Purchase failed. You need ${price! - player.coins} more coins.\n`
        );
      }
    } catch (error) {
      if (shouldThrow) throw error;
      if (error instanceof Error) {
        return error.message;
      }
      return "Unknown reason";
    }
    return true;
  }

  /** Purchases a shop slot (or top deck) item if affordable. */
  purchase(player: Player, index: number | "top"): string {
    this.assertGameStarted();
    this.assertEmptyStack();
    this.assertNoPendingSelection();
    this.canPurchase(player, true);
    if (index !== "top" && (index < 0 || index >= this.shop.itemsInShop.length))
      throw new Error("Invalid shop index.");
    const price = Math.max(0, this.gameParameters.shopPrice.value + player.priceModifier);
      if (player.coins < price!) {
        throw new Error(
          `Purchase failed. You need ${price! - player.coins} more coins.\n`
        );
      }
    const purchasedCard = index === "top" ? this.decks["treasure"]!.cards[0]! : this.shop.itemsInShop[index]!;
    if (this.shop.purchase(player, index, price, this)) {
      this.addAnimation({
        id: this.nextAnimationId,
        type: index === "top" ? "buyTopDeckTreasure" : "buyShopTreasure",
        player: player.id,
        card: purchasedCard.jsonAPI,
      })
      this.emit("on:purchase:success", {
        eventIssuer: player,
        price: price,
        index: index,
      });
      player.purchaseEnded();
      this._onStateChange.dispatch();
      return `Purchase successful. You have now ${player.coins} coins.\n`;
    } else {
      throw new Error(
        `Purchase failed. You need ${price - player.coins} more coins.\n`
      );
    }
  }

  /** Draws loot cards for a player and emits pre/post loot triggers. */
  loot(player: Player, number: number = 1): void {
    this.assertGameStarted();
    this.assertPositiveNumber(number);

    const n = [number];
    const lootDeck = this.decks["loot"]!;
    this.emit("on:loot:would", {
      eventIssuer: player,
      numberOfCards: n,
    });
    const toLoot = n[0]!;
    this.addAnimation({
      id: this.nextAnimationId,
      type: "drawLoot",
      nb: toLoot,
      player: player.id,
    })
    if (toLoot > 0)
      for (let i = 0; i < toLoot; i++) {
        const drawnCard: LootCard = lootDeck.draw()!;
        this.addCardToHand(player, drawnCard);
      }
    this.emit("on:loot:after", {
      eventIssuer: player,
      numberOfCards: toLoot,
    });
    this._onStateChange.dispatch();
  }

  /** Emits a game trigger event and schedules stack reordering if needed. */
  emit(event: TriggerEvent, data: any = {}, dispatch: boolean = true): void {
    const count = this.emitter.emit(event, data);
    if (count > 0 && dispatch)
      this._onStateChange.dispatch();
    // If count > 1 calls stack reordering. 
    // Players can reorder their own effects if they have multiple. 
    // Current player can also reorder game effects if multiple are triggered at the same time.
    // Game effects are always resolved before player effects, and player effects are resolved in turn order starting from the current player.
    if(count > 2)
      this.reorderStack(count);
  }

  /** Tags simultaneously-added top stack effects into reorderable owner groups. */
  async reorderStack(count: number): Promise<void> {
    const topElements = this.stack.elements.slice(-count);
    if(topElements.some(el => el.json.type !== "effect")) // Only effects can be reordered.
      return;
    // Group by issuer
    const groups: {[issuer: string]: StackElement[]} = {};
    const playerIds = this.players.map(p => p.id);
    topElements.forEach((el) => {
      const effect = el as EffectOnStack;
      const issuerId = playerIds.includes(effect.json.issuer.name) ? effect.json.issuer.name: "game";
      if (!groups[issuerId]) {
        groups[issuerId] = [];
      }
      groups[issuerId].push(el); 
    });

    const batchMarker = `batch-${Date.now()}-${topElements[0]?.stackId ?? 0}`;
    Object.entries(groups).forEach(([issuerId, elements]) => {
      if (elements.length <= 1) {
        elements.forEach((el) => {
          el.reordering = null;
        });
        return;
      }
      // Game effects can be reordered by the current player.
      const ownerId = issuerId === "game" ? this.currentPlayer.id : issuerId;
      const groupId = `${batchMarker}:${issuerId}`;
      elements.forEach((el) => {
        el.reordering = {
          ...(el.reordering ?? { groupId }),
          groupId,
          ownerId,
        };
      });
    });
    
  }

  /** Moves one stack element before another within the same reordering group. */
  insertStackElementBefore(player: Player, elementToMoveStackId: number, targetStackId: number | "start"): void {
    this.assertGameStarted();

    const elementToMove = this.stack.elements.find((el) => el.stackId === elementToMoveStackId);
    const targetElement = 
      targetStackId === "start"
        ? this.stack.elements.filter((el) => el.reordering?.groupId === elementToMove?.reordering?.groupId).at(-1)
        : this.stack.elements.find((el) => el.stackId === targetStackId);
    if (!elementToMove || !targetElement) {
      throw new Error("Stack elements to reorder were not found.");
    }

    const moveInfo = elementToMove.reordering;
    const targetInfo = targetElement.reordering;
    if (!moveInfo || !targetInfo) {
      throw new Error("Both stack elements must be reorderable.");
    }
    if (moveInfo.groupId !== targetInfo.groupId) {
      throw new Error("Cannot reorder stack elements from different groups.");
    }
    if (!moveInfo.ownerId || moveInfo.ownerId !== player.id) {
      throw new Error("You are not allowed to reorder this trigger group.");
    }

    // If the target is the start of the group, we first put the element to move second, and then swap with the first.
    this.stack.insertStackElementBefore(elementToMove, targetElement);
    if(targetStackId === "start")
      this.stack.insertStackElementBefore(targetElement, elementToMove);
    const event = moveInfo.event;
    if (!event) {
      this._onStateChange.dispatch();
      return;
    }

    const orderedListenerIds = this.stack.elements
      .filter((el) => el.reordering?.groupId === moveInfo.groupId)
      .map((el) => el.reordering?.listenerId)
      .filter((id): id is number => typeof id === "number");

    if (orderedListenerIds.length > 1) {
      this.emitter.reorderListenersBySubset(event as TriggerEvent, orderedListenerIds);
    }

    this._onStateChange.dispatch();
  }

  /** Discards one in-play card by index when discard is legal. */
  discardInPlay(player: Player, index: number): string {
    this.assertGameStarted();
    this.assertIsAlive(player);
    this.assertPositiveNumber(index);

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
    this.assertGameStarted();
    this.assertIsAlive(player);

    if (this.shop.removeCard(target)) {
      this.addInPlay(player, target);
      return true;
    }
    for (const p of this.players) {
      if (p !== player) {
        if (p.inPlay.includes(target)) {
          this.removeInPlay(p, target);
          this.addInPlay(player, target);
          return true;
        }
      }
    }
    return false;
  }
  /** Steals up to the requested number of coins from target player. */
  stealCoins(player: Player, target: Player, amount: number): string {
    this.assertGameStarted();
    this.assertPositiveNumber(amount);

    const stolenCoins = this.loseCoins(target, amount, true);
    player.gainCoins(stolenCoins);

    return `You have stolen ${stolenCoins} coins from ${target.id}.\n`;
  }
  /** Steals one specific loot card from target player's hand. */
  stealLootCard(player: Player, target: Player, card: LootCard): string {
    this.assertGameStarted();

    const position = target.hand.cards.indexOf(card);
    this.assertPositiveNumber(position);

    if (position < 0 || position > target.hand.cards.length) {
      throw new Error("Invalid card position.");
    }

    this.removeCardFromHand(target, card);
    this.addCardToHand(player, card);

    return `You have stolen the card: ${card.name} from ${target.id}.\n`;
  }

  /** Destroys an owned item and replaces it by gaining treasure. */
  reroll(card: Card): void {
    const owner = this.getOwner(card);
    if (!(card instanceof ItemCard)) {
      throw new Error("Can only reroll with an item card.");
    }
    if (owner && !owner.inPlay.includes(card)) {
      throw new Error("Owner does not have the specified card in play.");
    }
    this.destroyCardsOrSouls([card]);
    if(owner)
    {
      owner.removeInPlay(card);
      this.gainTreasure(owner);
    }
  }

  /** Discards the top monster card from an encounter slot. */
  discardMonster(player: Player, position: number): string {
    this.assertGameStarted();
    this.assertPositiveNumber(position);

    if (position < 0 || position > this.encounters._slots.length - 1) {
      throw new Error("Invalid monster position.");
    }

    player.clearAttackRequirement(this.monsters[position]!);
    this.encounters.discardTop(position);
    return `You have discarded the monster at position ${position}.\n`;
  }
  /** Shortcut to queue death for an entity from a given source. */
  kill(killer: Entity, entity: Entity, source: DamageSource): void {
    this.assertGameStarted();
    this.assertEntityIsInPlay(entity);
    this.death(entity, killer, source);
  }

  /** Draws a new monster into the chosen encounter slot during combat. */
  drawMonster(player: Player, position: number): string {
    this.assertGameStarted();
    this.assertIsAlive(player);
    this.assertPositiveNumber(position);
    this.assertCurrentTurnIsPlayerTurn(player);
    this.assertNoPendingSelection();

    if (!player.isEngagedInCombat) {
      throw new Error("You must be engaged in combat to draw a monster.");
    }

    if (position < 0 || position > this.encounters._slots.length) {
      throw new Error("Invalid monster position.");
    }

    this.encounters.draw(position);

    return `You have drawn a new monster at position ${position}.\n`;
  }

  /** Removes and returns a specific loot card from issuer hand. */
  getCardFromHand(player: Player, card: LootCard): LootCard {
    this.assertGameStarted();
    const lootCard = card;
    const position = player.hand.cards.indexOf(lootCard);
    this.assertPositiveNumber(position);

    if (position < 0 || position > player.hand.cards.length) {
      throw new Error("Invalid card position.");
    }

    this.removeCardFromHand(player, card);
    return card;
  }

  /** Adds or refreshes a forced-attack requirement for a player. */
  playerMustAttack(player: Player, target: (Monster[] | "topDeck" | "any"), source: Card): void {
    // Check if player is dead - constraint doesn't apply
    if (player.isDead) {
      player.clearAttackRequirement();
      return;
    }

    const mustAttackMonster = player.mustAttackMonster;

    for (const req of mustAttackMonster) {
      if (req.target === "topDeck") continue;
      if (req.target === "any") continue;
      if(req.target.every(m => !this.monsters.includes(m) || m.attackable === false)) {
        player.clearAttackRequirement(req.target[0]);
      }
    }
    player.mustAttack(target, source);
    this._onStateChange.dispatch();
  }

  /** Discards one hand card by index to the loot discard pile. */
  discardFromHandAtIndex(player: Player, position: number): string {
    this.assertGameStarted();
    this.assertPositiveNumber(position);

    const hand = player.hand;
    if (position < 0 || position > hand.cards.length - 1) {
      return "Invalid card position.";
    }

    const discardedCard: LootCard = hand.cards[position]!;
    this.removeCardFromHand(player, discardedCard);
    const lootDeck = this.decks["loot"]!;
    this.addAnimation({
      id: this.nextAnimationId,
      type: "discardLoot",
      player: player.id,
      card: discardedCard.jsonAPI,
    })
    lootDeck.addDiscardTop(discardedCard);

    return `You have discarded the card: ${discardedCard.name}.\n`;
  }

  /** Marks a player to skip their next turn. */
  playerSkipNextTurn(player: Player): void {
    this.turnHandler.skipNextTurn(player);
  }

  /** Removes coins from a player and emits coin lost trigger. */
  loseCoins(player: Player, coins: number, asMany: boolean): number {
    this.assertGameStarted();
    this.assertPositiveNumber(coins);

    const coinLost = player.loseCoins(coins, asMany);
    this.emit("on:coin:lost:after", { eventIssuer: player, coinLost });

    return coinLost;
  }

  /** Creates a dice roll stack element and emits pre-roll triggers. */
  rollDice(player: Player, attackRoll: boolean, card: Card | null = null): DiceRoll {
    this.assertGameStarted();
    if (attackRoll) this.assertIsAlive(player);

    let diceRoll = player.rollDice(this.random, attackRoll, card);
    this.addAnimation({
      id: this.nextAnimationId,
      type: "diceRoll",
      player: player.id,
      diceRoll: diceRoll.value,
    })
    this.addToStack(diceRoll);
    this.emit("on:dice:being-rolled", { eventIssuer: player, diceRoll });
    return diceRoll;
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
    this.obtainCard(card.slug, card.globalId); // make sure the card is removed from other places.
    const deck: Deck<Card> = this.decks[card.type];
    deck.addDiscardTop(card);
  }

  /** Removes an in-play card from player and runs cleanup triggers. */
  removeInPlay(player: Player, card: ItemCard): boolean {
    card.cleanup();
    return player.removeInPlay(card);
  }

  /** Applies the current turn player's loot/activation restriction to all other players. */
  applyLootOrActivateRestrictionForCurrentTurn(player: Player, value: number = 1): void {
    for (const p of this.players) {
      if(p !== player)
      {
        p.addToCanIActivateThisTurn(value);
        p.addToCanIUseLootThisTurn(value);
      }
    }
    this._onStateChange.dispatch();
  }

  /** Removes a soul card from player and runs cleanup triggers. */
  removeSoul(player: Player, card: Card): boolean {
    card.cleanup();
    return player.removeSoul(card);
  }

  getCharacterAndEternalPairs(): {
    character: { slug: string; name: string; globalId: number };
    eternal: string | null;
  }[] {
    this.setupGame();
    return this.decks["character"]!._set.cards.map((card) => ({
      character: card.jsonAPI,
      eternal: card.eternalCard,
    }));
  }
  
  /* PRIVATE METHODS */

  private removeMonster(monster: Monster): void {
    const index = this.findMonsterIndex(monster.id);
    this.monsters.splice(index, 1);
  }

  private healEveryone(): void {
    this.players.forEach((p) => p.heal());
    this.monsters.forEach((m) => m.heal());
  }

  /* ASSERTIONS AND UTILS */

  private findPlayerById(id: string): Player {
    const player = this.players.find((p) => p.id === id);
    if (!player) {
      throw new Error("Player not found");
    }
    return player;
  }

  private findMonsterById(id: string): Monster {
    const monster = this.monsters.find((m) => m.id === id);
    if (!monster) {
      throw new Error("Monster not found");
    }
    return monster;
  }

  private findMonsterIndex(id: string): number {
    const index = this.monsters.findIndex((m) => m.id === id);
    if (index === -1) {
      throw new Error("Monster not found");
    }
    return index;
  }

  private findPlayerIndex(id: string): number {
    const index = this.players.findIndex((p) => p.id === id);
    if (index === -1) {
      throw new Error("Player not found");
    }
    return index;
  }

  private assertCurrentTurnIsPlayerTurn(player: Player): void {
    if (this.currentPlayer !== player) {
      throw new Error("Not your turn");
    }
  }

  private assertCurrentPlayerIsNotEngagedInCombat(): void {
    if (this.currentPlayer!.isEngagedInCombat) {
      throw new Error("You are currently engaged in combat");
    }
  }

  private assertCurrentPlayerIsEngagedInCombat(): void {
    if (!this.currentPlayer!.isEngagedInCombat) {
      throw new Error("You are not currently engaged in combat");
    }
  }

  private assertNoEntityIsEngagedInCombat(): void {
    if (this.attackableEntities.some((e) => e.isEngagedInCombat)) {
      throw new Error("An entity is currently engaged in combat");
    }
  }

  private assertCurrentPlayerIsEngagedInPurchase(): void {
    if (!this.currentPlayer!.isEngagedInPurchase) {
      throw new Error("You are not currently engaged in purchase");
    }
  }

  private assertCurrentPlayerIsNotEngagedInPurchase(): void {
    if (this.currentPlayer!.isEngagedInPurchase) {
      throw new Error("You are currently engaged in purchase");
    }
  }
  private assertPlayerIdAvailable(id: string): void {
    if (this.players.some((p) => p.id === id)) {
      throw new Error(`Player ${id} already exists`);
    }
  }

  private assertEmptyStack(): void {
    if (this._stack.size > 0) throw new Error(`Stack is not empty.`);
  }

  private assertGameNotStarted(): void {
    if (this.turnHandler.isInitialized) {
      throw new Error("Game already started");
    }
  }

  private assertStackNotEmpty(): void {
    if (this._stack.size === 0) {
      throw new Error("The stack is empty");
    }
  }

  private assertGameStarted(): number {
    if (!this.turnHandler.isInitialized) {
      throw new Error("Game not started");
    }
    return this.turnHandler.round;
  }
  private assertEntityIsInPlay(entity: Entity) {
    if (!this.EntitiesAndAnimated.includes(entity))
      throw new Error("Entity is not currently in play.");
  }

  private assertCardTargetsAvailable(player: Player, card: ItemCard, effectId: "tap" | number): void {
    const valid = TargetBuilder.validTargetExists(this, player, card, effectId);
    if(valid !== true)
      throw new Error(valid);
  }

  private assertMinimumPlayerCount(): void {
    if (this.players.length < 2) {
      throw new Error("At least 2 players are required to start the game");
    }
  }

  private assertIsAlive(ent: Entity): void {
    if (ent.isDead) {
      throw new Error(`${ent.id} is already dead`);
    }
  }

  private assertPositiveNumber(nb: number): void {
    if (nb < 0) {
      throw new Error("Number is negative.");
    }
  }

  private assertNoOngoingAttack(): void {
    if (this._ongoingAttack !== null) {
      throw new Error("An attack is ongoing");
    }
    this.monsters.forEach((e) => {
      if (e.isEngagedInCombat) throw new Error("An attack is ongoing");
    });
  }

  assertNoPendingSelection(): void {
    if (this.hasPendingSelections)
      throw new Error("Pending selection need to be resolved");
  }

  private assertForcedAttackSatisfied(player: Player): void {
    // Check if there's a forced attack constraint
    if (!player.hasAttackRequirement) {
      return; // No constraint, all good
    }

    // Check if player is dead - constraint doesn't apply
    if (player.isDead) {
      player.clearAttackRequirement();
      return;
    }

    const requirement = player.mustAttackMonster!;

    // Filter monsters that are still in play
    const validMonsters = requirement.filter(
      (req) => req.target === "topDeck" || req.target === "any" || req.target.some(target => this.monsters.includes(target))
    );

    if (validMonsters.length === 0) {
      player.clearAttackRequirement(); // All monsters gone, constraint lifted
      return;
    }

    // At least one monster constraint remains - must be satisfied
    throw new Error(
      "You must attack the required monster(s) before ending your turn"
    );
  }

  /** Resolves a player from issuer credentials. */
  getPlayerByIssuer(issuer: Issuer): Player {
    return this.getPlayerById(issuer);
  }

  /** Finds a player by id or throws. */
  getPlayerById(id: string): Player {
    for (const p of this.players) {
      if (p.id === id) {
        return p;
      }
    }
    throw new Error("Player not found");
  }
  private assertNoOtherOngoingAttack(player: Player, monster: Monster): void {
    if (this._ongoingAttack === null) return;
    if (
      this._ongoingAttack.player.id !== player.id ||
      this._ongoingAttack.monster.id !== monster.id
    ) {
      throw new Error("An attack is already ongoing");
    }
  }
}