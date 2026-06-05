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
  LoadsCardSets,
  LootCard,
  LootCardEffect,
  MonsterCard,
  MonsterType,
  TreasureCard,
  createCardFromJson,
  createEmptyDecksCollection,
  isDeckType,
  isSameSlug
} from "@/models/cards";
import {
  targetGetCoinRollEffect,
  targetGetLootRollEffect,
  targetGetTreasureRollEffect
} from "@/models/effects/activeEffect";
import { bSoulEffectParser } from "@/models/effects/bonusSoulEffects";
import { effectParser } from "@/models/effects/effectParser";
import { CurrentPlayerDecidesToChangeRoom } from "@/models/effects/roomEffects";
import { Animated } from "@/models/entities/animated";
import { Entity } from "@/models/entities/entity";
import { Monster } from "@/models/entities/monster";
import { Player } from "@/models/entities/player";
import { Stack, type StackElement } from "@/models/stack";
import { DamageOnStack, DeathOnStack, DiceRoll } from "@/models/stackElement";
import type { DeckType, DeckTypeToCardType, DecksCollection, EffectType } from "@/models/types/cardTypes";
import { EffectData } from "@/models/types/cardTypes";
import { type TriggerEvent } from '@/models/types/eventTypes';
import type { Animation, DetailedState, GameParametersJson, Issuer, StackElementJson } from "@/shared/api";
import { shuffle } from "@/utils/auxiliary";
import { loadCards } from "@/utils/loadCards";
import { generateAnimationId } from "@/utils/random";
import { Signal, type ReadableSignal } from "micro-signals";
import { addPassiveEffectToStack } from "./effects/passiveEffect";
import { AnimatedList } from "./entities/animated";
import { GameEventEmitter } from "./eventEmmitter";
import { GameParameters } from "./gameParameters";
import { GameStateSerializer } from "./gameStateSerializer";
import { ActionHandler } from "./handlers/actionHandler";
import { AssertHandler } from "./handlers/assertHandler";
import { HistoricHandler, type HistoricEntry } from "./historyHandler";
import type { ServerRoomBroadcast } from "./roomBroadcast";
import { SelectionHandler, type PendingSelection } from "./selection";
import { Encounters } from "./slots/encounters";
import { Rooms } from "./slots/rooms";
import { Shop } from "./slots/shop";
import { TurnHandler } from "./turnHandler";
import { edenGame, miniDraft } from "./variants";
import { DeathPenaltyValues } from "./handlers/deathHandler";
import type { GenericCardType } from "@/types/cardTypes";
// Type representing sources of damage - either a card ability or a dice roll
export type DamageSource = Card | DiceRoll;

const LOG_GAME = false;
export const CARDS = await loadCards(process.cwd() + "/data/cards");
export const {nextGlobalId, cardSets: CARD_SETS} = LoadsCardSets(CARDS);
/*
 * The Game class is the central hub of the game logic, managing the state of the game, players, monsters, decks, shop, encounters, stack, and more. 
 * It also handles all player actions such as declaring attacks, dealing damage, resolving deaths, and managing the game history. 
 */
export class Game extends SelectionHandler {
  private _players: Player[] = [];
  private _turnHandler: TurnHandler = new TurnHandler();
  private _random: () => number = () => {throw new Error("Random generator not initialized yet.");};
  private _seed: string = "";
  private _decks: DecksCollection;
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
  private _entitiesInCombat: Entity[] = [];
  private _gameStateSerializer: GameStateSerializer;
  private _assertHandler: AssertHandler = new AssertHandler(this);
  readonly gameParameters = new GameParameters(() => this.dispatch());
  readonly _actionHandler = new ActionHandler(this);

  private _onStateChange: Signal<void> = new Signal();
  onStateChange: ReadableSignal<void> = this._onStateChange.readOnly();

  private _onRoomBroadcast: Signal<ServerRoomBroadcast> = new Signal();
  onRoomBroadcast: ReadableSignal<ServerRoomBroadcast> = this._onRoomBroadcast.readOnly();

  constructor(seed: string = "", gameParameters?: GameParameters) {
    super();
    this.seed = seed; // if seed is empty, it will be set to a random value.
    this._decks = createEmptyDecksCollection(this.random);
    this._emitter = new GameEventEmitter();
    this._gameStateSerializer = new GameStateSerializer(this);
    if(gameParameters !== undefined)
      this.gameParameters.loadFromJson(gameParameters.toJson());
  }
/*
 * Check if that game is started.
 */
  get isStarted(): boolean {
    return this._turnHandler.isInitialized;
  }
  /**
   * Returns the list of entities currently engaged in combat. 
   * CAREFULL IT ALSO INCLUDES ANIMATED ENTITIES.
   */
  get entitiesInCombat(): ReadonlyArray<Entity> {
    // Return a defensive copy so external code cannot mutate combat state.
    return [...this._entitiesInCombat];
  }

  /** Adds an entity to the combat list (idempotent). */
  addEntityInCombat(entity: Entity): void {
    if (!this._entitiesInCombat.includes(entity)) {
      this._entitiesInCombat.push(entity);
    }
  }

  /** Removes an entity from the combat list if present. */
  removeEntityInCombat(entity: Entity): void {
    const idx = this._entitiesInCombat.indexOf(entity);
    if (idx !== -1) {
      this._entitiesInCombat.splice(idx, 1);
    }
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
  get actions(): ActionHandler {
    return this._actionHandler;
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

  get assert(): AssertHandler {
    return this._assertHandler;
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

  dispatch(): void {
    this._onStateChange.dispatch();
  }

  toast(payload: ServerRoomBroadcast): void {
    this._onRoomBroadcast.dispatch(payload);
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
    return [...this.Entities.filter(e => e.attackable === true), ...this.animatedList.all.filter(e => e.attackable)];
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
   * Asynchronously selects items to lose as a death penalty.
   * This is separated from the main deathPenalty function to allow it to be overridden by specific passive effects that modify the item loss penalty without affecting the rest of the death penalty sequence.
   */
  async deathPenaltyItems(player: Player, nbItemsToLose: number): Promise<ItemCard[]> {
    const setOfLosableItems = player.inPlay.filter(
      (c) =>
        (c instanceof TreasureCard || (c instanceof LootCard && c.trinket)) &&
      c.eternal === false
    );
    if (nbItemsToLose > 0 && setOfLosableItems.length > 0) {
      const numberOfItemsToLose = Math.min(nbItemsToLose, setOfLosableItems.length);
      return (
        await this.select(player, numberOfItemsToLose, numberOfItemsToLose, setOfLosableItems, nbItemsToLose > 1
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
  async deathPenalty(player: Player, values: DeathPenaltyValues): Promise<void> {
    // remove coins.
    // obtain set of items that can be lost.
    
    const lostCoins = this.loseCoins(player, values.nbCoinsToLose, true);
    let lootCardsToLose: LootCard[] = [];
    let itemsToLose: ItemCard[] = await this.deathPenaltyItems(player, values.nbItemsToLose);
    // If at least one item can be lost, ask the player to select one.
    
    // lose loot cards
    if (values.nbLootCardsToLose > 0 && player.hand.cards.length > 0) {
      lootCardsToLose = (
        await this.select(player, values.nbLootCardsToLose, values.nbLootCardsToLose, player.hand.cards, values.nbLootCardsToLose > 1
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
        // this.removeInPlay(player, item);
        this.destroyCardsOrSouls([item]);
      }
    }
    if (lootCardsToLose && lootCardsToLose.length > 0) {
      for (const loot of lootCardsToLose) {
        this.discardFromHandAtIndex(player, player.hand._hand.indexOf(loot));
      }
    }
    this.dispatch();
  }

  /**
   * Queues a death resolution sequence for an entity.
   */
  death(receiver: Entity, from: Entity, source: DamageSource): void {
    this.assert.gameStarted();
    this.assert.entityIsInPlay(receiver);
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
  entityRewards(entity: Monster | Animated, player: Player | null = null): void {
    if(player === null)
      player = this.currentPlayer;
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
        const receivers = allPlayers ? this.players : [player];
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
    this.dispatch();
  }

  /**
   * Resolves a pending death and its before/after trigger windows.
   * Should only be called by DeathOnStack objects.
   */
  resolveDeath(receiver: Entity, from: Entity, source: DamageSource): void {
    try{
      this.assert.isAlive(receiver);
      this.assert.entityIsInPlay(receiver);
    }catch{
      return; // if the receiver is not alive or not in play anymore, do nothing.
    }
    const stackIds = this.stack.elements.map(e => e.stackId);
    const values: DeathPenaltyValues = new DeathPenaltyValues(this.gameParameters);

    this.emit("on:death:before-penalty", {
      eventIssuer: receiver,
      target: from,
      source: source,
      values: values,
    });
    
    receiver.die();
    void this.executeWhenStackSubset(stackIds, async () => {
      const stackIds = this.stack.elements.map(e => e.stackId);
      if (receiver.isEngagedInCombat) {
        this.endCombat();
      }
      if (receiver instanceof Player) {
        receiver.clearAttackRequirement(); // clear any forced attack constraints on this player.
        await this.deathPenalty(receiver, values);
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
      this.dispatch();
      // if(receiver instanceof Player && this.currentPlayer === receiver)
      //   this.executeWhenStackEmpty(() => {this.endTurn();});
    }).catch((error) => {
      console.error("Failed to resolve death follow-up", error);
    });
  }


  /**
   * Ends combat for all currently engaged entities.
   */
  endCombat(): void {
    const engagedEntities = this.entitiesInCombat;
    for (const entity of engagedEntities) {
      if (entity.isEngagedInCombat) {
        entity.combatEnded();
      }
    }
    this._entitiesInCombat = [];
    this.emit("on:combat:end", { eventIssuer: engagedEntities.filter(e => e instanceof Player)[0] });
    this.dispatch();
  }


  endCombatIfInvalid(player: Player): void
  {
    if(player.isEngagedInCombat && player.clearOutdatedAttackRequirements(this.attackableEntities) && this.entitiesInCombat.length === 1)
      {
        this.endCombat();
      }
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

  async resolveDiceRoll(): Promise<void> {
    const stackIds = this.stack.elements.map(e => e.stackId);
    const elem = this.stack.peek() as DiceRoll;
    if (!elem || !(elem instanceof DiceRoll)) return;

    elem.readyToResolve = true;
    this.emit("on:dice:would-roll", { eventIssuer: elem.issuer, diceRoll: elem });
    await this.executeWhenStackSubset(stackIds, async () => {
      // If the value has changed, the roll stays in the stack.
      
      if (elem.readyToResolve === false)
        {
          this.dispatch();
          return;
        }
        this.stack.resolve();
        await elem.onResolve();
        // Add to history
        this.addToHistory(elem.json);
        this.dispatch();
        await this.resolveCallbacks();
        this.emit("on:dice:resolved", { eventIssuer: elem.issuer, diceRoll: elem });
        await this.resolveCallbacks();
    });
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
  obtainCard(slug: string, globalId?: number, type?: DeckType): Card | undefined {
    // Search in all players' hands and in-play areas
    for (const player of this.players) {
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
        player.removeInPlay(inPlayCard);
        return inPlayCard;
      }
    }

    for (const slot of [this.shop, this.encounters, this._rooms]) {
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
    try{
      this.assert.isAlive(receiver);
      this.assert.entityIsInPlay(receiver);
    }catch{
      return; // if the receiver is not alive or not in play anymore, do nothing.
    }
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
      this.removeInPlay(owner1, item1);
      this.removeInPlay(owner2, item2);
      this.addInPlay(owner1, item2);
      this.addInPlay(owner2, item1);
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
    this.assert.playerIdAvailable(newPlayer.id);
    this.assert.gameNotStarted();
    this.players.push(newPlayer);
    this.dispatch();
  }

  get nextAnimationId(): string {
    return generateAnimationId();
  }
  addAnimation(animation: Animation): void {
    for(const player of this.players)
      player.addAnimation(animation);
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
   * @return the stack ID of the added element.
   */
  addToStack(item: StackElement): number {
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
    this.dispatch();
    return item.stackId;
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
    this.dispatch();
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
      await this.actions.resolveStack();
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
      this.dispatch();
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
    this.resetCallbacks();
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
    this.dispatch();
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
    this.actions.canEndTurn(player, true);
    this.emit("on:turn:end", { eventIssuer: player });
    this.handleRoomChange();
    await this.executeWhenStackEmpty(async () => {
      this.emit("till:turn:end", { eventIssuer: player });
      await this.verifyHandSize(player);
      this.healEveryone();
      for (const player of this.players) {
        player.resetTurnFlags();
      }
      this._entitiesInCombat = [];
      for (const monster of this.monsters) {
        monster.resetEntityFlags();
      }
      this.turnHandler.endTurn();
      this.dispatch();
      this.startTurn();
    });
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
   * Draws and initializes the three bonus soul cards.
   */
  initializeBonusSouls(): void {
    if(this.decks["bsoul"]._order!.length !== 0 && this.gameParameters.playWithBonusSouls.value) {
      this._bonusSouls = this.decks["bsoul"]!.drawSeveral(3);
      for (const soul of this._bonusSouls) {
        soul.cleanup = bSoulEffectParser(soul, this);
      }
    }
  }

  initializeWinningCondition(): void {
    let offSoulGained: (() => void) | null = null;
        offSoulGained = this.emitter.on("on:soul:gained", async ({ eventIssuer }) => {
          if(eventIssuer.totalSouls >= this.gameParameters.nbSoulsToWin.value)
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
      CARDS
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
  start(players: { issuer: string; character: string }[] | null = null, shufflePlayerOrder: boolean = true): void{
    this.assert.gameNotStarted();
    if (players && players.length > 0) {
      for (const p of players) 
        this.addPlayer(new Player(p.issuer));
      const chara = this.getCharactersFromSlugs(players.map((p) => p.character));
      this.assignCharactersToPlayers(chara);
    }
     else {
      this.assignRandomCharacterToPlayers();
    }
    this.assert.minimumPlayerCount();
    this._pendingMultipleSelections.clear();
    if (shufflePlayerOrder) {
      shuffle(this.random, this.players);
    }
    this.turnHandler.initialize(this.players);
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
    // fill empty spot may call game.encounters, so it must be called after this._encounters initialization.
    this._encounters.fillEmptySpots(true);
    // call startOfGameSetup here so room laser eye does not deal damage before the first turn starts.
    void this.startOfGameSetup().catch((error) => {
      console.error("Failed to complete game start setup", error);
    });
    if(this.gameParameters.playWithRooms.value === true)
    {
      this._rooms = new Rooms(
        this.gameParameters.nbRooms.value,
        this.decks["room"]!,
        this
      );
    }
    this.emit("on:game:start:before", {});
    this.assignColorsToPlayers();
    this.emit("on:game:start", {});
    this.healEveryone();
    

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
  async giveCoins(from: Player, to: Player, amount: number, forcedBy: Card | null = null): Promise<boolean> {
    if(this.gameParameters.allowCoinDonation.value === false)
      throw new Error("Giving coins is not allowed in this game.");
    if (from.coins < amount || amount <= 0) {
      return false;
    }
    if(forcedBy === null) {
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
    this.gainCoins(to, amount, forcedBy ? forcedBy : "gift");
    this.emit("on:coin:given", { eventIssuer: from, target: to, amount, forcedBy });
    this.dispatch();
    return true;
  }

  /**
   * Add a card to a player's hand and emit the appropriate event.
   * This is the centralized method for all hand additions.
   */
  addCardToHand(player: Player, card: LootCard): void {
    player.hand.addToHand(card);
    this.dispatch();
    this.emit("on:loot:added:after", { eventIssuer: player, card });
    this.dispatch();
  }

  /**
   * Remove a card from a player's hand and emit the appropriate event.
   * This is the centralized method for all hand removals.
   */
  removeCardFromHand(player: Player, card: LootCard): void {
    player.hand.removeCard(card);
    this.dispatch();
    this.emit("on:loot:removed:after", { eventIssuer: player, card });
    this.dispatch();
  }

  /**
   * Draws random character cards and assigns them to players.
   */
  assignRandomCharacterToPlayers(): void {
    this.setupGame();
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
   * Resets the full game state to a fresh pre-start state.
   */
  reset(newSeed: boolean = true): void {
    this._historicHandler = new HistoricHandler();
    this._turnHandler = new TurnHandler();
    this.monsterDiedThisTurn = false;
    this._players = [];
    this.seed = (newSeed ? "" : this.seed); // If newSeed is true, set to a random value in the setter.
    this._decks = createEmptyDecksCollection(this.random);
    this._shop = undefined!;
    this._encounters = undefined!;
    this._rooms = undefined!;
    this.resetStack();
    this._emitter = new GameEventEmitter();
    this._bonusSouls = undefined;
    this._destroyedCards = [];
    this._cardMapping = new Map();
    this._nextCardGlobalId = 0;
    this._pendingMultipleSelections = new Map();
    this._stackSubsetCallbacks = [];
    this._animatedList.reset();
    this._entitiesInCombat = [];
    this._isWon = false;
    this._monsterDiedThisTurn = false;
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
    this.dispatch();
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
    this.dispatch();
  }

  /**
   * Removes a curse card from a player and runs cleanup.
   */
    removeCurse(player: Player, card: MonsterCard): void {
    card.cleanup();
    player.removeCurse(card);
    this.dispatch();
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
    if(card.flipData.stats !== undefined)
    {
      if(card.json.stats !== undefined) // Entity changes stats.
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
            this.addHealth(card.owner, -differenceHP);
            this.addAttack(card.owner, -differenceAttack);
            if(flippedStats.evasionPoints !== undefined)
              this.addDC(card.owner, -differenceEvasion); 
          }
            else
            {
              this.addHealth(card.owner, differenceHP);
              this.addAttack(card.owner, differenceAttack);
              if(flippedStats.evasionPoints !== undefined)
                this.addDC(card.owner, differenceEvasion);
            }
        });
      }
      else // create animated entity.
      {
        card.addFlipEffect(() => {
          if(!card.flipped)
            card.json.stats = undefined;
          else
            card.json.stats = card.flipData!.stats!;
        });
      }
    }
    const originalEffects = card.json.effectOutcome || [];
    const newEffects = card.flipData!.effectOutcome;
    const flipData = card.flipData;
    card.flipData = undefined; // to avoid confusion, as the json is not updated on flip after initialization.
    card.effectOutcomes = newEffects;
    card.swapEffectInterfaces();
    this.attachEffectsToCard(card);
    card.flipData = flipData;
    card.swapEffectInterfaces();

    card.addFlipEffect(() => {
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
        const parsed = effectParser(outcome, this, () => {return true;}, card instanceof MonsterCard);
        const effect: Effect = new Effect(
          outcome,
          effectType,
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

  addToCounter(issuer: Entity, item: Card, counterName: string, value: number): void {
    if (!item.tags[counterName]) {
      item.tags[counterName] = 0;
    }
    const oldValue = item.tags[counterName];
    item.tags[counterName] = Math.max(0, item.tags[counterName] + value);
    this.emit("on:counter:modified", { eventIssuer: issuer, card: item, counterName: counterName, previousValue: oldValue, newValue: item.tags[counterName] });
  }

  private allocateCardGlobalId(): number {
    return this._nextCardGlobalId++;
  }

  /** Adds a temporary/permanent attack modifier to an entity. */
  addAttack(e: Entity, value: number): void {
    if(e.attackPoints + value < 0)
      throw new Error(`Cannot reduce attack points of entity ${e.id} below 0.`);
    e.addAttackPoints(value);
  }

  /** Increases the number of attacks available this turn for a player. 
   * If the player is engaged in combat, but has not yet chosen a target, and this would set its remaining attacks to 0, it will be set to 1 instead.
  */
  addAttackThisTurn(e: Entity, value: number = 1): void {
  
    if (e instanceof Player) {
      if(e.attackThisTurn + value === 0 && e.isEngagedInCombat && this.EntitiesAndAnimated.every((entity) => entity === e || entity.isEngagedInCombat === false))
      {
        e.addAttackThisTurn(value + 1);
      }
      else
        e.addAttackThisTurn(value);
      this.dispatch();
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
    this.assert.gameStarted();
    this.assert.positiveNumber(coins);
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
    this.dispatch();
    return `New amount of coins: ${player.coins} coins.\n`;
  }

  /** Draws the first N cards from a typed deck. */
  getFirstCardsOfDeck<T extends DeckType>(deckName: T, number: number): DeckTypeToCardType[T][] {
    return this.decks[deckName]!.drawSeveral(number) as DeckTypeToCardType[T][];
  }
  /** Inserts a card on top of a typed deck. */
  addTopPosition<T extends DeckType>(deckName: T, card: Card): void {
    this.assert.cardMatchesDeck(deckName, card);
    this.decks[deckName]!.addTopPosition(card as any);
  }
  /** Inserts a card at the bottom of a typed deck. */
  addBottomPosition<T extends DeckType>(deckName: T, card: Card): void {
    this.assert.cardMatchesDeck(deckName, card);
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
    this.assert.gameStarted();
    this.assert.positiveNumber(number);

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
    this.dispatch();
    return true;
  }

  /** Destroys cards by removing them from in-play/soul zones and shop and tracks destruction.
   * Note that loot cards can not be destroyed.
   */
  destroyCardsOrSouls(cards: Card[]): boolean {
    if (cards.length === 0 || cards.some((card) => card === undefined) || cards.some((card) => card instanceof LootCard && card.soul === 0 && card.trinket === false))
      return false;
    const eventData = { eventIssuer: null, cards };
    this.emit("on:item:destroyed", eventData);
    cards = eventData.cards;
    cards.forEach((card) => {
      if(card instanceof ItemCard)
        if(this.shop.removeCard(card)) {
        }
    });
    cards.forEach((card) => {
      const rest = this.obtainCard(card.slug, card.globalId, card.type);
    });
    cards.forEach((card) => {
      this.players.forEach((player) => {
        this.removeSoul(player, card);
      });
    });
    this.destroyedCards.push(...cards);
    this.dispatch();

    return true;
  }

  /** Builds a full player-scoped game state payload for API/UI clients. */
  detailedStateJSON(player: Player): DetailedState {
    this.assert.gameStarted();
    return this._gameStateSerializer.detailedStateJSON(player);
  }

  
  /** Draws loot cards for a player and emits pre/post loot triggers. */
  loot(player: Player, number: number = 1): void {
    this.assert.gameStarted();
    this.assert.positiveNumber(number);

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
    this.dispatch();
  }

  /** Emits a game trigger event and schedules stack reordering if needed. */
  emit(event: TriggerEvent, data: any = {}, dispatch: boolean = true): void {
    const count = this.emitter.emit(event, data);
    if (count > 0 && dispatch)
      this.dispatch();
    // If count > 1 calls stack reordering. 
    // Players can reorder their own effects if they have multiple. 
    // Current player can also reorder game effects if multiple are triggered at the same time.
    // Game effects are always resolved before player effects, and player effects are resolved in turn order starting from the current player.
    if(count > 1)
      this.stack.reorderStack(this.currentPlayer, count);
  }

  /** Tags simultaneously-added top stack effects into reorderable owner groups. */
  

  /** Moves one stack element before another within the same reordering group. */
  insertStackElementBefore(player: Player, elementToMoveStackId: number, targetStackId: number | "start"): void {
    this.assert.gameStarted();
    const {event, orderedListenerIds} = this.stack.insertStackElement(player, elementToMoveStackId, targetStackId);
    if (orderedListenerIds.length > 1) {
      this.emitter.reorderListenersBySubset(event as TriggerEvent, orderedListenerIds);
    }
    this.dispatch();
  }

  /** Discards one in-play card by index when discard is legal. */
  discardInPlay(player: Player, index: number): string {
    this.assert.gameStarted();
    this.assert.isAlive(player);
    this.assert.positiveNumber(index);

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
    this.assert.gameStarted();

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
    this.assert.gameStarted();
    this.assert.positiveNumber(amount);

    const stolenCoins = this.loseCoins(target, amount, true);
    player.gainCoins(stolenCoins);

    return `You have stolen ${stolenCoins} coins from ${target.id}.\n`;
  }
  /** Steals one specific loot card from target player's hand. */
  stealLootCard(player: Player, target: Player, card: LootCard): string {
    this.assert.gameStarted();

    const position = target.hand.cards.indexOf(card);
    this.assert.positiveNumber(position);

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

  flip(player: Player, card: Card): void {
    this.assert.gameStarted();
    if (!(this.getOwner(card) === player)) {
      throw new Error("You can only flip cards you own.");
    }
    if (card.flipData === undefined) {
      throw new Error("This card cannot be flipped.");
    }
    card.flip();
    this.emit("on:card:flipped", { eventIssuer: player, card, recto: card.flipped });
  }
  /** Discards the top monster card from an encounter slot. */
  discardMonster(player: Player, position: number): string {
    this.assert.gameStarted();
    this.assert.positiveNumber(position);

    if (position < 0 || position > this.encounters._slots.length - 1) {
      throw new Error("Invalid monster position.");
    }

    player.clearAttackRequirement(this.monsters[position]!);
    this.encounters.discardTop(position);
    return `You have discarded the monster at position ${position}.\n`;
  }
  /** Shortcut to queue death for an entity from a given source. */
  kill(killer: Entity, entity: Entity, source: DamageSource): void {
    this.assert.gameStarted();
    try{
      this.assert.isAlive(entity);
      this.assert.entityIsInPlay(entity);
    }catch{
      return; // if the receiver is not alive or not in play anymore, do nothing.
    }
    this.death(entity, killer, source);
  }

  /** Draws a new monster into the chosen encounter slot during combat. */
  drawMonster(player: Player, position: number): string {
    this.assert.gameStarted();
    this.assert.isAlive(player);
    this.assert.positiveNumber(position);
    this.assert.currentTurnIsPlayerTurn(player);
    this.assert.noPendingSelection();

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
    this.assert.gameStarted();
    const lootCard = card;
    const position = player.hand.cards.indexOf(lootCard);
    this.assert.positiveNumber(position);

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
    this.dispatch();
  }

  /** Discards one hand card by index to the loot discard pile. */
  discardFromHandAtIndex(player: Player, position: number): string {
    this.assert.gameStarted();
    this.assert.positiveNumber(position);

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
    this.assert.gameStarted();
    this.assert.positiveNumber(coins);

    const coinLost = player.loseCoins(coins, asMany);
    this.emit("on:coin:lost:after", { eventIssuer: player, coinLost });

    return coinLost;
  }
  forcedAttackSatisfied(player: Player): void {
    this.actions.canDeclareAttack(player, false);
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
  /** Creates a dice roll stack element and emits pre-roll triggers. */
  rollDice(player: Player, attackRoll: boolean, card: Card | null = null): DiceRoll {
    this.assert.gameStarted();
    if (attackRoll) this.assert.isAlive(player);

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
    this.obtainCard(card.slug, card.globalId, card.type); // make sure the card is removed from other places.
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
    this.dispatch();
  }

  /** Removes a soul card from player and runs cleanup triggers. */
  removeSoul(player: Player, card: Card): boolean {
    card.cleanup();
    const result = player.removeSoul(card);
    if(result)
      this.emit("on:soul:removed", { eventIssuer: player, card });
    return result;
  }

  /* PRIVATE METHODS */

  private healEveryone(): void {
    this.players.forEach((p) => p.heal());
    this.monsters.forEach((m) => m.heal());
  }

  get bonusSouls(): BsoulCard[] | undefined {
    return this._bonusSouls;
  }
  
  get pendingMultipleSelections(): Map<string, PendingSelection> {
    return this._pendingMultipleSelections;
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
}