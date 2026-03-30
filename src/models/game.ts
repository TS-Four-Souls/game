import { Monster } from "@/models/monster";
import { DamageOnStack, DeathOnStack, DiceRoll, Player } from "@/models/player";
import { TargetBuilder } from "@/models/targetBuilder";
import { loadCards } from "@/utils/loadCards";
import {
  Card,
  CardSet,
  Deck,
  Hand,
  LoadsCardSets,
  LoadDecks,
  createEmptyDecksCollection,
  assertCardMatchesDeck,
  isSameSlug,
  CharacterCard,
  MonsterCard,
  ItemCard,
  LootCard,
  LootCardEffect,
  EffectOnStack,
  TreasureCard,
  BsoulCard,
  Effect,
  EternalCard,
  createCardFromJson,
  MonsterType,
  isDeckType
} from "@/models/cards";
import type { DecksCollection, DeckType, DeckTypeToCardType, EffectData, EffectType, TargetsSelector } from "@/models/types/cardTypes";
import { Stack, type StackElement } from "@/models/stack";
import { effectParser } from "@/models/effectParser";
import {
  getAttackRollEffect,
  targetGetCoinRollEffect,
  targetGetLootRollEffect,
} from "@/models/activeEffect";
import { Shop, Encounters } from "@/models/slots";
import { Entity } from "@/models/entity";
import { TurnHandler } from "./turnHandler";
import { type ReadableSignal, Signal } from "micro-signals";
import { GameEventEmitter } from "./eventEmmitter";
import { bSoulEffectParser } from "@/models/bonusSoulHandling";
import { type TriggerEvent } from '@/models/types/eventTypes';
import type { Capability, DetailedState, Issuer, SelectionItem, StackElementJson } from "@/shared/api";
import { HistoricHandler, type HistoricEntry, type UserRequest } from "./historyHandler";
import { GameParameters } from "./gameParameters";

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
  private _decks: DecksCollection = createEmptyDecksCollection();
  private _ongoingAttack: { player: Player; monster: Monster } | null = null;
  private _shop!: Shop;
  private _encounters!: Encounters;
  private _stack: Stack = new Stack();
  private _destroyedCards: Card[] = [];
  private _emitter: GameEventEmitter;
  private _bonusSouls: BsoulCard[] = [];
  private _stackSubsetCallbacks: {stackIds: number[], callback: () => void}[] = [];
  private _historicHandler: HistoricHandler = new HistoricHandler();
  readonly gameParameters = new GameParameters(() => this._onStateChange.dispatch());

  private _onStateChange: Signal<void> = new Signal();
  onStateChange: ReadableSignal<void> = this._onStateChange.readOnly();

  constructor() {
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
    return this._historicHandler.log;
  }

  /**
   * Appends an entry to the game history/log handler.
   */
  addToHistory(entry: HistoricEntry): void {
    this._historicHandler.addToHistory(entry);
  }

  get inPlayItems(): { player: Player; card: ItemCard }[] {
    return this.players.flatMap(p => p.inPlay.map(c => ({player: p, card: c})));
  }

  get inPlayCurses(): { player: Player; card: MonsterCard }[] {this.players.flatMap(p => p.curses.map(c => ({player: p, card: c})));
    return this.players.flatMap(p => p.curses.map(c => ({player: p, card: c})));

  }

  /**
   * This function returns all visible treasure and trinkets: each players inPlay and the shop items.
   */
  get visibleItems(): ItemCard[] {
    let result: ItemCard[] = this.inPlayItems.map(({ card }) => card);
    result.push(
      ...this.shop._slots.filter((c): c is ItemCard => c instanceof ItemCard)
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
    // shop
    cards.push(...this.shop._slots.filter((c) => c !== undefined));
    // events and monsters not in combat
    cards.push(...this.encounters.nonEngagedInCombat);
    return cards;
  }

  /**
   * This function allows a player to remove a cards. 
   * It is not part of the game, but can be used to debug situations.
   * A player can remove: any card owned by the game (shop and encounters) and any card that he owns (hand and inPlay).
   */
  debugRemoveCards(player: Player, cards: Card[]): void {
    // verify that the cards are actually owned by the player or in the shop/encounters.
    for (const card of cards) {
      if (!this.playerCardsAndGameOwnedCards(player).some(c => c === card)) {
        throw new Error(`Card ${card.name} is not owned by player ${player.id}`);
      }
    }
    for (const card of cards) {
      console.log(`Debug removing card ${card.name} from player ${player.id}`);
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
          if(this.shop._slots.includes(treasure))
            this.shop.removeCard(treasure);
          else
            this.removeInPlay(player, treasure);
          this.discard(treasure);
          break;
        case "monster":
          const monster = card as MonsterCard;
          if(!monster)            
            throw new Error(`Card ${card.name} is not a MonsterCard.`);
          const toDiscard = this.encounters.obtainCard(monster.slug);
          if(toDiscard)
            this.discard(toDiscard);
          break;
        default:
          throw new Error(`Card ${card.name} is of type ${card.type} which cannot be removed with debugRemoveCards.`);
          break;
      }
    }
    this._onStateChange.dispatch();
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
    target.removeSoul(soul);
    player.addSoul(soul);
  }
  /**
   * Applies all death penalties configured for a player.
   * It can be override by a specific passive effect.
   */
  async deathPenalty(player: Player): Promise<void> {
    // remove coins.
    this.loseCoins(player, this.gameParameters.deathPenaltyCoins.value, true);
    // obtain set of items that can be lost.
    const setOfLosableItems = player.inPlay.filter(
      (c) =>
        (c instanceof TreasureCard || (c instanceof LootCard && c.trinket)) &&
        c.eternal === false
    );
    // If at least one item can be lost, ask the player to select one.
    if (this.gameParameters.deathPenaltyItem.value > 0 && setOfLosableItems.length > 0) {
      const itemToLose = (
        await this.select(
          player,
          this.gameParameters.deathPenaltyItem.value,
          setOfLosableItems,
          false,
          this.gameParameters.deathPenaltyItem.value > 1
            ? "Select items to lose."
            : "Select an item to lose."
        )
      ).selected;
      if (itemToLose && itemToLose.length > 0) {
        for (const item of itemToLose) {
          if(!(item instanceof ItemCard))
            throw new Error("Selected card is not an ItemCard.");
          this.removeInPlay(player, item);
          this.discard(item);
        }
      }
    }
    // lose loot cards
    if (this.gameParameters.deathPenaltyLoot.value > 0 && player.hand.cards.length > 0) {
      const lootToLose = (
        await this.select(
          player,
          this.gameParameters.deathPenaltyLoot.value,
          player.hand.cards,
          false,
          this.gameParameters.deathPenaltyLoot.value > 1
            ? "Select loot cards to lose."
            : "Select a loot card to lose."
        )
      ).selected;
      if (lootToLose && lootToLose.length > 0) {
        for (const loot of lootToLose) {
          this.discardFromHandAtIndex(player, player.hand._hand.indexOf(loot));
        }
      }
    }
    // discharge every items. 
    for (const item of player.inPlay)
      if (item.hasTapEffect()) item.charged = false;
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
  monsterRewards(monster: Monster): void {
    const rewards = monster.card.rewards;
    if (rewards?.coin) {
      if (rewards.coin === "roll") {
        const roll = this.rollDice(this.currentPlayer, false, monster.card);
        roll.attachEffect(targetGetCoinRollEffect(this), monster.card, [
          this.currentPlayer,
        ]);
      } else if (typeof rewards.coin === "number") {
        this.gainCoins(this.currentPlayer, rewards.coin);
      }
    }
    if (rewards?.loot) {
      if (rewards.loot === "roll") {
        const roll = this.rollDice(this.currentPlayer, false, monster.card);
        roll.attachEffect(targetGetLootRollEffect(this), monster.card, [
          this.currentPlayer,
        ]);
      } else if (typeof rewards.loot === "number")
        this.loot(this.currentPlayer, rewards.loot);
    }
    if (rewards?.treasure && typeof rewards.treasure === "number")
      this.gainTreasure(this.currentPlayer, rewards.treasure);
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
      this.currentPlayer.addSoul(monster.card);
    } else this.discard(monster.card);
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
    this.executeWhenStackSubset(stackIds, async () => {
      const stackIds = this.stack.elements.map(e => e.stackId);
      if (receiver.isEngagedInCombat) {
        this.Entities.forEach((e) => e.combatEnded());
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
        this.encounters.kill(receiver); // should only kill once its effects are resolved: should be moved in the resolvewhenstackempty
        this.monsterRewards(receiver);
        this.executeWhenStackSubset(stackIds, async () => {
          this.obtainMonsterSoulOrDiscard(receiver);
        });
      }
      this.emit("on:death:after-penalty", {
        eventIssuer: receiver,
        target: from,
        source: source,
      });
      this._onStateChange.dispatch();
      // if(receiver instanceof Player && this.currentPlayer === receiver)
      //   this.executeWhenStackEmpty(() => {this.endTurn();});
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
      if (player.attackThisTurn <= 0 && !player.hasAttackRequirement)
        throw new Error("You have no remaining attacks this turn.");
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

    player.attackThisTurn -= 1;
    player.engageInCombat();
    this.emit("on:attack:declared", { eventIssuer: player });
    this._onStateChange.dispatch();
  }

  /**
   * Validates whether a specific monster/top-deck can be attacked.
   */
  canDeclareAttackOnMonster(player: Player,
    monster: Monster | "topDeck", shouldThrow: boolean = false): Capability {
    try {
      if (monster !== "topDeck" && !monster.attackable) {
        throw new Error("This monster cannot be attacked.");
      }
      this.assertCurrentTurnIsPlayerTurn(player);
      this.assertNoOngoingAttack();
      this.assertIsAlive(player);
      if (!player.isEngagedInCombat) {
        throw new Error("You have not declared an attack.");
      }
      const isMonsterAlreadyEngaged = this.monsters.some(
        (m): m is Monster => m !== undefined && m.isEngagedInCombat
      );
      if (isMonsterAlreadyEngaged) {
        throw new Error("Another monster is already engaged in combat.");
      }
      if (!player.canAttackThisMonster(monster)) {
        throw new Error("You must attack a specific monster.");
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
  declareAttackOnMonster(
    player: Player,
    monster: Monster | "topDeck",
    drawInIndex: number = -1
  ): void {
    if (drawInIndex !== -1 && monster !== "topDeck")
      throw new Error(
        "drawInIndex can only be specified when drawing from topDeck"
      );
    if (drawInIndex === -1 && monster === "topDeck")
      throw new Error(
        "drawInIndex must be specified when drawing from topDeck"
      );
    this.canDeclareAttackOnMonster(player, monster, true);
    if (monster === "topDeck") {
      this.drawMonster(player, drawInIndex);
      player.clearAttackRequirement("topDeck");
      player.attackThisId("topDeck");
      if (
        this.encounters.monsterIn(drawInIndex) === undefined ||
        !this.encounters.monsterIn(drawInIndex)!.attackable
      ) {
        player.combatEnded();
        return; // drawn event.
      }
      monster = this.encounters.monsterIn(drawInIndex)!;
    }
    this.assertMonsterIsAlive(monster);
    monster.engageInCombat();
    if (monster.isEngagedInCombat === false)
      throw new Error("Monster should be engaged in combat now.");
    // Clear forced attack constraint if this monster satisfies it
    player.clearAttackRequirement(monster);
    player.attackThisId("monster");
    this.emit("on:attack:declared:monster", { eventIssuer: player, monster });
    this._onStateChange.dispatch();
  }

  /**
   * Computes current monster attack after replacement/modifier effects.
   */
  getAttack(monster: Monster): number {
    let baseStat = [monster.attackPoints];
    this.emit(
      "on:get:monster:attackPoints",
      {
        eventIssuer: monster,
        stat: baseStat,
      },
      false
    );
    return baseStat[0]!;
  }

  /**
   * Computes current monster evasion/DC clamped to [1, 6].
   */
  getDC(monster: Monster): number {
    let baseStat = [monster.evasion];
    this.emit(
      "on:get:monster:evasion",
      {
        eventIssuer: monster,
        stat: baseStat,
      },
      false
    );
    return Math.max(1, Math.min(6, baseStat[0]!));
  }

  /**
   * Finds and removes a card by slug from all reachable game zones.
   */
  obtainCard(slug: string): Card | undefined {
    // Search in shop
    try {
      const card = this.shop.obtainCard(slug);
      if (card) return card;
    } catch {
      // Card not found in shop, continue searching
    }

    // Search in encounters
    try {
      const card = this.encounters.obtainCard(slug);
      if (card) return card;
    } catch {
      // Card not found in encounters, continue searching
    }

    // Search in all decks
    for (const deckKey in this.decks) {
      try {
        if(!isDeckType(deckKey))
            throw new Error(`Invalid deck type: ${deckKey}`);
        const card = this.decks[deckKey]!.getCardFromSlug(slug);
        if (card) return card;
      } catch {
        // Card not found in this deck, continue searching
      }
    }

    // Search in all players' hands and in-play areas
    for (const player of this.players) {
      const handCard = player.hand.cards.find((c) => c.slug === slug);
      if (handCard) {
        player.hand.removeCard(handCard);
        return handCard;
      }

      const inPlayCard = player.inPlay.find((c) => c.slug === slug);
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
      
      const monster = [...this.monsters].find(
        (m): m is Monster => m !== undefined && m.isEngagedInCombat
      );
      if (!monster) {
        throw new Error("No monster is currently engaged in combat.");
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
  attackRoll(player: Player): void {
    this.canRollDice(player, true);
    
    const monster = [...this.monsters].find(
      (m): m is Monster => m !== undefined && m.isEngagedInCombat
    );
    if (!monster) {
      throw new Error("No monster is currently engaged in combat.");
    }
    // damageDealt and damageReceived will be increased by the attack
    // of the dealer and receiver respectively in getAttackRollEffect.
    const damageDealt = [0];
    const damageReceived = [0];
    const evasion = [this.getDC(monster)];
    const dice = this.rollDice(player, true);

    this.emit("on:attack:roll", {
      eventIssuer: player,
      target: monster,
      dice,
      damageDealt,
      damageReceived,
      evasion,
    });
    if (player.attackRollThisTurn === 1)
      this.emit("on:attack:roll:first-time-each-turn", {
        eventIssuer: player,
        target: monster,
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
      monster.card,
      [monster]
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
    if (receiver instanceof Player) {
      this.emit("on:combatdamage:dealt:to-player", {
        eventIssuer: dealer, // The dealer is the one dealing combat damage
        target: receiver,
        source: source,
        damage,
      });
    } else if (receiver instanceof Monster) {
      this.emit("on:combatdamage:dealt:to-monster", {
        eventIssuer: dealer, // The dealer is the one dealing combat damage
        target: receiver,
        source: source,
        damage,
      });
    }
    this.dealDamage(dealer, receiver, source, damage);
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
    this.assertIsAlive(receiver);
    this.healthLoss(dealer, receiver, source, damage);

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
    const selection = await this.select(
      player,
      amount,
      treasures,
      false,
      "Select treasures to gain"
    );
    for (const card of selection.selected) {
      this.addInPlay(player, card);
    }
    return selection;
  }

  // Pending selection tracking for multiplayer (handles both single and multiple selections)
  private pendingMultipleSelections: Map<
    string,
    {
      playerId: string;
      options: any[];
      count: number;
      asMany: boolean;
      requestId: string;
      description: string;
      resolve: (selection: any[]) => void;
    }
  > = new Map();

  get hasPendingSelections(): boolean {
    return this.pendingMultipleSelections.size > 0;
  }

  /** Select is used to obtain a selection from a single player
   * If n=1 and only one option is available, it is automatically selected
   * If anyNumber is true, the player can select up to n options (including 0)
   * Returns a Promise that resolves to an object containing the selected and remaining options
  */
  async select<T>(
    player: Player,
    n: number,
    Options: T[],
    anyNumber: boolean = false,
    description: string = "UNDEFINED SHOULD NOT HAPPEN"
  ): Promise<{ selected: T[]; remaining: T[] }> {
    if (n === 1 && !anyNumber && Options.length === 1) {
      return {
        selected: Options,
        remaining: [],
      };
    }
    if (Options.length === 0) return { selected: [], remaining: [] };
    
    const results = await this.selectMultiple([
      {
        player,
        count: n,
        options: Options,
        asMany: anyNumber,
        description: description,
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
    issuer: Issuer,
    requestId: string,
    selectedIdentifiers: SelectionItem[]
  ): void {
    const player = this.assertIssuerSecret(issuer);

    // Check if this is from a selectMultiple() call
    const pending = this.pendingMultipleSelections.get(requestId);
    if (pending && pending.playerId === player.id) {
      // Validate selection count
      if (!pending.asMany && selectedIdentifiers.length !== pending.count) {
        throw new Error(`Must select exactly ${pending.count} option(s)`);
      }

      if (pending.asMany && selectedIdentifiers.length > pending.count) {
        throw new Error(`Must select at most ${pending.count} option(s)`);
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
   */
  async selectMultiple<T>(
    selections: Array<{
      player: Player;
      count: number;
      options: T[];
      asMany?: boolean;
      description: string;
    }>
  ): Promise<Array<{ playerId: string; selected: T[]; remaining: T[] }>> {
    // In multiplayer mode: create promises for all players
    const promises = selections.map((sel) => {
      return new Promise<{
        playerId: string;
        selected: T[];
        remaining: T[];
      }>((resolve) => {
        const requestId = `${sel.player.id}_${Date.now()}_${Math.random()}`;
        const asMany = sel.asMany ?? false; // Use ?? instead of || to handle explicit false
        this.pendingMultipleSelections.set(requestId, {
          playerId: sel.player.id,
          options: sel.options,
          count: sel.count,
          asMany: asMany,
          description: sel.description,
          requestId,
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

  // Get all pending selections (for server to send to clients)
  /**
   * Returns all currently pending selection payloads.
   */
  getPendingSelections(): Array<{
    playerId: string;
    options: any[];
    count: number;
    asMany: boolean;
  }> {
    const pending: Array<{
      playerId: string;
      options: any[];
      count: number;
      asMany: boolean;
    }> = [];

    // Add all pending selections
    for (const selection of this.pendingMultipleSelections.values()) {
      pending.push({
        playerId: selection.playerId,
        options: selection.options,
        count: selection.count,
        asMany: selection.asMany,
      });
    }

    return pending;
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
    if (soulCard instanceof BsoulCard)
      soulCard.granted = true;
    player.addSoul(soulCard);
    this._onStateChange.dispatch();
  }

  /**
   * Resolves the top stack element, then triggers follow-up callbacks.
   */
  async resolveStack(): Promise<void> {
    let elem = this.stack.resolve();
    if (!elem) return;
    // Add to history
    this.addToHistory(elem.json);
    await elem.onResolve();
    if (elem instanceof LootCardEffect && elem.card instanceof LootCard)
    {
      if(elem.card.afterEffect === "discard")
          this.discard(elem.card);
      if(elem.card.afterEffect === "addInPlay")
        {
          if(!(elem.card.owner instanceof Player))
            throw new Error("Trinket can only be owned by a player");
          this.addInPlay(elem.card.owner, elem.card);
        }
    }
    this._onStateChange.dispatch();
    if (elem instanceof DiceRoll)
      this.emit("on:dice:rolled", { diceRoll: elem });

    await this.resolveCallbacks();
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
    this.executeWhenStackSubset([], callback);
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
    this.resolveCallbacks();
  }

  /**
   * Executes stack-subset callbacks whose condition is currently met.
   */
  async resolveCallbacks(): Promise<void> {
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
      await cb.callback();
      this._onStateChange.dispatch();
    }
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
      p.remainingLootPlay = 0;
      p.attackThisTurn = 0;
      p.remainingPurchaseThisTurn = 0;
      if (p === this.currentPlayer) {
        p.remainingLootPlay = this.gameParameters.lootPlayPerTurn.value;
        p.attackThisTurn = 1;
        p.remainingPurchaseThisTurn = 1;
      }
    });
    this.rechargeEachItem(this.currentPlayer);
    const player = this.currentPlayer;
    this.emit("on:turn:start", { eventIssuer: player });
    this.executeWhenStackEmpty(() => {
      this.lootStep();
      this.emit("on:your:turn", { eventIssuer: player });
    });
  }

  /**
   * Discards a shop card at a given slot index.
   */
  discardFromShop(index: number): void {
    return this.shop.discard(index);
  }

  /**
   * Recharges every in-play item for a player.
   */
  rechargeEachItem(player: Player): void {
    for (const card of player.inPlay) {
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
   * Ends combat for all currently engaged entities.
   */
  endCombat(): void {
    for (const entity of this.Entities) {
      if (entity.isEngagedInCombat) {
        entity.combatEnded();
      }
    }
    this._onStateChange.dispatch();
  }

  /**
   * Enforces max-hand-size discard rules for a player.
   */
  async verifyHandSize(player: Player): Promise<void> {
    const toDiscard = player.hand.cards.length - this.gameParameters.maxHandSize.value;
    if (toDiscard > 0){
      const selection = await this.select(
        player,
        toDiscard,
        player.hand.cards,
        false,
        `You must discard ${toDiscard} card(s) to reach your maximum hand size of ${this.gameParameters.maxHandSize.value}.`
      );
      for (const card of selection.selected) {
        this.discardFromHandAtIndex(player, player.hand._hand.indexOf(card));
      }
    }
  }

  /**
   * Runs turn-end sequence, then advances to next turn.
   */
  endTurn(): void {
    const player = this.assertIssuerSecret(this.currentPlayer);
    this.canEndTurn(player, true);
    this.emit("on:turn:end", { eventIssuer: player });
    this.executeWhenStackEmpty(async () => {
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
   * Alias entrypoint used by API to end current turn.
   */
  nextTurn(issuer: Issuer): void {
    const roundIndex = this.assertGameStarted();
    const player = this.assertIssuerSecret(issuer);
    this.canEndTurn(player, true);
    this.endTurn();
  }

  /**
   * Validates if the active player can legally end the turn.
   */
  canEndTurn(issuer: Issuer, shouldThrow: boolean = false): Capability {
    try {
      this.assertGameStarted();
      const player = this.assertIssuerSecret(issuer);
      this.assertCurrentTurnIsPlayerTurn(player);
      this.assertCurrentPlayerIsNotEngagedInPurchase();
      this.assertNoMonsterIsEngagedInCombat();
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
  canPlayCard(issuer: Issuer, shouldThrow: boolean = false): Capability {
    try {
      this.assertGameStarted();
      const player = this.assertIssuerSecret(issuer);
      this.assertNoPendingSelection();
      if( this.currentPlayer !== player && this.currentPlayer.otherPlayerCanUseLootOrActivateOnMyTurn === false) {
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

  /**
   * Plays one loot card from hand and pushes its effect on stack.
   */
  playCard(issuer: Issuer, index: number, targets: any[] = []): string {
    this.canPlayCard(issuer, true);
    const player = this.assertIssuerSecret(issuer);
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
    this._bonusSouls = this.decks["bsoul"]!.drawSeveral(3);
    for (const soul of this._bonusSouls) {
      soul.cleanup = bSoulEffectParser(soul, this);
    }
  }
  /**
   * Creates decks and attaches parsed effects to all cards.
   */
  setupGame(): void {
    this._decks = LoadDecks(
      cards,
      this.players.length,
      this.gameParameters.nbPlayerCardRestriction.value
    );
    this.joinEffectsToCards();
  }

  /**
   * Starts the game lifecycle and executes initial setup.
   */
  start(issuer: Issuer, characters: CharacterCard[] | null = null): void {
    this.assertIssuerSecret(issuer);
    this.assertGameNotStarted();
    this.assertMinimumPlayerCount();
    this.pendingMultipleSelections.clear();

    if (this._decks.character.length === 0) {
      this.setupGame();
    }
    this.turnHandler.initialize(this.players);

    if (characters && characters.length > 0) {
      this.assignCharactersToPlayers(characters);
    } else {
      this.assignRandomCharacterToPlayers();
    }
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
    // fill empty spot may call game.encounters, so it must be called after this._encounters initialization.
    this._encounters.fillEmptySpots(true);
    this.emit("on:game:start:before", {});
    this.emit("on:game:start", {});
    this.healEveryone();

    this.startOfGameSetup();
    this.startTurn();
  }

  /**
   * Distributes starting resources to each player.
   */
  startOfGameSetup(): void {
    for (const player of this.players) {
      this.gainTreasure(player, this.gameParameters.treasuresOnStart.value);
      this.loot(player, this.gameParameters.lootOnStart.value);
      this.gainCoins(player, this.gameParameters.coinsOnStart.value);
    }
  }

  /**
   * Transfers a card between players when legal.
   */
  give(from: Player, to: Player, card: Card): boolean {
    if (from.souls.includes(card)) {
      from.removeSoul(card);
      to.addSoul(card);
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
    this.removeCardFromHand(from, card);
    this.addCardToHand(to, card);
    return true;
  }

  /**
   * Proposes a coin transfer that target player may accept/decline.
   */
  async giveCoins(from: Player, to: Player, amount: number): Promise<boolean> {
    if(this.gameParameters.allowCoinDonation.value === false)
      throw new Error("Giving coins is not allowed in this game.");
    if (from.coins < amount || amount <= 0) {
      return false;
    }
    const response = await this.select(to, 1, ['Accept', 'Decline'], false, `${from.id} wants to give you ${amount} coins. Do you accept?`);
    if (response.selected[0] !== 'Accept') {
      return false;
    }
    this.loseCoins(from, amount, true);
    this.gainCoins(to, amount);
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
        if (cards.length > 1) {
          throw new Error("Multiple eternal cards with the same slug found");
        }
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
  reset(): void {
    this.turnHandler.reset();
    this._players = [];
    this._decks = createEmptyDecksCollection();
    this._ongoingAttack = null;
    this._shop = null!;
    this._encounters = null!;
    this._stack.clear();
    this._emitter = new GameEventEmitter();
    this._bonusSouls = [];
    this._destroyedCards = [];
    this.pendingMultipleSelections.clear();
    this.gameParameters.reset();
    this._historicHandler = new HistoricHandler();
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
      card.onAddInPlay(player);
    }
    player.addInPlay(card);
    this.emit("on:enter:play:after", {
      eventIssuer: player,
      card: card,
    });
  }

  /**
   * Adds a curse card to a player.
   */
  addCurse(player: Player, card: MonsterCard): void {
    player.addCurse(card);
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
    ];
    if (
      (!card.effectOutcomes || card.effectOutcomes.length === 0) &&
      !noEffectCards.includes(card.slug)
    ) {
      console.log("WARNING: No effect outcomes for card:", card.slug);
      return;
    }

    for (const outcome of card.effectOutcomes) {
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
    ]) {
      if(!isDeckType(deckName))
        throw new Error(`Invalid deck type: ${deckName}`);
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
    const copiedCard = createCardFromJson(-1, json);

    // Parse and attach effects to the copied card
    this.attachEffectsToCard(copiedCard);

    return copiedCard;
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
  addLootPlay(e: Player, value: number): void {
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
  gainCoins(issuer: Issuer, coins: number): string {
    this.assertGameStarted();
    const player = this.assertIssuerSecret(issuer);
    this.assertPositiveNumber(coins);
    if (coins > 0) {
      const amount = [coins];
      this.emit("on:coin:gained", {
        eventIssuer: player,
        coinGained: amount,
      });
      player.gainCoins(amount[0]!);
      this.emit("on:coin:gained:after", {
        eventIssuer: player,
        coinGained: amount,
      });
    }

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
  /** Emits priority pass ordering and returns current priority order. */
  priorityPasses(): Player[] {
    const order = this.turnHandler.priorityOrder;
    this.emit("on:priority:passes", {
      eventIssuer: this.currentPlayer,
      order,
    });
    // todo handle priority passing effects
    return order;
  }
  /** Cancels previous death entry for a player and stabilizes at 1 HP if needed. */
  preventDeath(player: Player): void {
    this.stack.cancelPreviousDeath(player);
    if (player.currentHealthPoints === 0) player.addHealthPoints(1);
  }
  /** Draws treasure cards and puts them directly in play for the player. */
  gainTreasure(issuer: Issuer, number: number = 1): void {
    this.assertGameStarted();
    const player = this.assertIssuerSecret(issuer);
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

  /** Destroys cards by removing them from in-play/soul zones and tracks destruction. */
  destroyCardsOrSouls(cards: Card[]): boolean {
    if (cards.length === 0 || cards.every((card) => card === undefined))
      return false;
    this.emit("on:item:destroyed", { eventIssuer: null, cards });
    cards.forEach((card) => {
      if(card instanceof ItemCard)
        this.players.forEach((player) => {
          this.removeInPlay(player, card);
        });
    });
    cards.forEach((card) => {
      this.players.forEach((player) => {
        this.removeSoul(player, card);
      });
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
    if(owner !== this.currentPlayer && !this.currentPlayer.otherPlayerCanUseLootOrActivateOnMyTurn) {
      return `You cannot activate cards during ${this.currentPlayer.id}'s turn.`;
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
  detailedStateJSON(issuer: Issuer): DetailedState {
    this.assertGameStarted();
    const player = this.assertIssuerSecret(issuer);
    
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
      p.mustAttackMonster.map((req) =>
        req.target === "topDeck"
          ? {
              monster: "top" as const,
              source: { name: req.source.name, slug: req.source.slug },
            }
          : {
              monster: { name: req.target.name, slug: req.target.card.slug },
              source: { name: req.source.name, slug: req.source.slug },
            },
      );

    const getPendingSelectionDetailsForPlayer = (playerId: string) => {
      for (const sel of this.pendingMultipleSelections.values()) {
        if (sel.playerId === playerId) {
          return {
            requestId: sel.requestId,
            options: TargetBuilder.convertToSelectionItems(sel.options),
            count: sel.count,
            asMany: sel.asMany,
            description: sel.description,
          };
        }
      }
      return undefined;
    };

    const mapInPlayItem = (item: ItemCard, owner: Player) => ({
      name: item.name,
      slug: item.slug,
      charged: item.charged,
      counter: getCardCounter(item),
      eternal: item.eternal,
      effects: item.activeEffectList,
      capabilities: {
        activate: this.canActivate(item, owner),
      },
    });

    const mapOtherInPlayItem = (item: ItemCard, owner: Player) => ({
      name: item.name,
      slug: item.json.slug,
      charged: item.charged,
      capabilities: {
        activate: this.canActivate(item, owner),
      },
      counter: getCardCounter(item),
      eternal: item.eternal,
    });

    const mapCurse = (curse: MonsterCard, owner: Player) => ({
      name: curse.name,
      slug: curse.slug,
      charged: true,
      counter: undefined,
      eternal: false,
      effects: curse.activeEffectList,
      capabilities: {
        activate: this.canActivate(curse, owner),
      },
    });

    return {
      me: {
        name: player.id,
        hand: player.hand.cards.map((c) => c.json),
        inPlay: player.inPlay.map((c) => mapInPlayItem(c, player)).concat(player.curses.map((c) => mapCurse(c, player))),
        handSize: player.hand.cards.length,
        souls: player.totalSouls,
        soulCards: player.souls.map((c) => c.json),
        coins: player.coins,
        attackRequirements: mapAttackRequirements(player),
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
          handSize: p.hand.cards.length,
          inPlay: p.inPlay.map((c) => mapOtherInPlayItem(c, p)).concat(p.curses.map((c) => mapCurse(c, p))),
          souls: p.totalSouls,
          soulCards: p.souls.map((c) => c.json),
          coins: p.coins,
          currentAttackPoints: p.attackPoints,
          currentHealthPoints: p.currentHealthPoints,
          temporaryEffect: p.temporaryEffects,
          remainingLootPlay: p.remainingLootPlay,
          isEngagedInCombat: p.isEngagedInCombat,
          isEngagedInPurchase: p.isEngagedInPurchase,
          attackRequirements: mapAttackRequirements(p),
          pendingSelection: this.pendingMultipleSelections.values().some(sel => sel.playerId === p.id),
        })),
      monsters:
      {
        discard: this.decks["monster"]!.discard.map((c) => ({ name: c.name, slug: c.slug })).toReversed(),
        deckSize: this.decks["monster"]!.cards.length,
        capabilities: {
          targetableDeck: this.canDeclareAttackOnMonster(player, "topDeck", false),
        },
        inPlay: this.encounters._slots.map((m, index) => ({ card: m[m.length - 1]!, monster: this.encounters.monsterIn(index), covered: this.encounters._slots[index]!.slice(0, -1).map(c => ({ name: c.name, slug: c.slug })) })).map((m) => ({

          top: {
            slug: m.card?.slug,
            name: m.card?.name,
            ...(m.monster ? {
              stats: {
                healthPoints: m.monster.currentHealthPoints,
                attackPoints: this.getAttack(m.monster),
                evasionPoints: this.getDC(m.monster),
                isEngagedInCombat: m.monster.isEngagedInCombat,
                capabilities: {
                  targetable: this.canDeclareAttackOnMonster(player, m.monster),
                },
                temporaryEffect: m.monster.temporaryEffects,

              }

            } : {})
          },
          covered: m.covered,
        })),
      },
      bonusSouls: this._bonusSouls.map((c) => ({ name: c.name, slug: c.slug, granted: c.granted })),
      loot:
      {
        discard: this.decks["loot"]!.discard.map((c) => ({ name: c.name, slug: c.slug })).toReversed(),
        deckSize: this.decks["loot"]!.cards.length,
      },
      treasure:
      {
        discard: this.decks["treasure"]!.discard.map((c) => ({ name: c.name, slug: c.slug })).toReversed(),
        deckSize: this.decks["treasure"]!.cards.length,
        inPlay: this.shop._slots.map((c) => ({ name: c!.name, slug: c!.slug })),
      },
      turn: this.currentPlayer.id,
      history: this.history,
      firstCardTreasureDeck: player.canSeeTopOfTreasureDeck ? {name: this.decks["treasure"]!.cards[0]!.name, slug: this.decks["treasure"]!.cards[0]!.slug} : undefined,
      stack: this.stack.elements.map((el) => el.json).toReversed(),
      // firstCardTreasureDeck: player.canSeeTopOfTreasureDeck
      // ? this.decks["treasure"]!.cards[0]?.json
      // : undefined,
    };
  }
  // We should implement declaring a purchase
  /** Validates whether current player can declare purchase mode. */
  canDeclarePurchase(issuer: Issuer, shouldThrow: boolean = false): Capability {
    try {
      this.assertGameStarted();
      const player = this.assertIssuerSecret(issuer);
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
      const price = [this.gameParameters.shopPrice.value];
      this.emit("on:item:purchase", { eventIssuer: player, cost: price });
      if (player.coins < price[0]!) {
        throw new Error(
          `Purchase failed. You need ${price[0]! - player.coins} more coins.\n`
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
  purchase(issuer: Issuer, index: number | "top"): string {
    this.assertGameStarted();
    const player = this.assertIssuerSecret(issuer);
    this.assertEmptyStack();
    this.assertNoPendingSelection();
    this.canPurchase(player, true);
    if (index !== "top" && (index < 0 || index >= this.shop._slots.length))
      throw new Error("Invalid shop index.");
    const price = [this.gameParameters.shopPrice.value];
    this.emit("on:item:purchase", { eventIssuer: player, cost: price });
    if (this.shop.purchase(player, index, price[0]!, this)) {
      player.purchaseEnded();
      this._onStateChange.dispatch();
      return `Purchase successful. You have now ${player.coins} coins.\n`;
    } else {
      throw new Error(
        `Purchase failed. You need ${price[0]! - player.coins} more coins.\n`
      );
    }
  }

  /** Draws loot cards for a player and emits pre/post loot triggers. */
  loot(issuer: Issuer, number: number = 1): void {
    this.assertGameStarted();
    const player = this.assertIssuerSecret(issuer);
    this.assertPositiveNumber(number);

    const n = [number];
    const lootDeck = this.decks["loot"]!;
    this.emit("on:loot:would", {
      eventIssuer: player,
      numberOfCards: n,
    });
    const toLoot = n[0]!;
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
    if(topElements.some(el => el.json.type !== "effect"))
      throw new Error("Only effects can be reordered on the stack.");
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
  insertStackElementBefore(issuer: Issuer, elementToMoveStackId: number, targetStackId: number | "start"): void {
    this.assertGameStarted();
    const player = this.assertIssuerSecret(issuer);

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

  /** Returns a readable string listing a player's in-play cards. */
  getInPlay(issuer: Issuer): string {
    this.assertGameStarted();
    const player = this.assertIssuerSecret(issuer);

    const cards = player.inPlay;
    let result = "Your in-play area contains the following cards:\n";
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i]!;
      result += `Card ${i + 1}: ${card}\n`;
    }

    return result;
  }

  /** Discards one in-play card by index when discard is legal. */
  discardInPlay(issuer: Issuer, index: number): string {
    this.assertGameStarted();
    const player = this.assertIssuerSecret(issuer);
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
  stealItemAnywhere(issuer: Issuer, target: ItemCard): boolean {
    this.assertGameStarted();
    const player = this.assertIssuerSecret(issuer);
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
  stealCoins(issuer: Issuer, target: Player, amount: number): string {
    this.assertGameStarted();
    const player = this.assertIssuerSecret(issuer);
    this.assertPositiveNumber(amount);

    const stolenCoins = this.loseCoins(target, amount, true);
    player.gainCoins(stolenCoins);

    return `You have stolen ${stolenCoins} coins from ${target.id}.\n`;
  }
  /** Steals one specific loot card from target player's hand. */
  stealLootCard(issuer: Issuer, target: Player, card: LootCard): string {
    this.assertGameStarted();
    const player = this.assertIssuerSecret(issuer);

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
  reroll(owner: Player, card: Card): void {
    if (!(card instanceof ItemCard)) {
      throw new Error("Can only reroll with an item card.");
    }
    if (!owner.inPlay.includes(card)) {
      throw new Error("Owner does not have the specified card in play.");
    }
    this.destroyCardsOrSouls([card]);
    owner.removeInPlay(card);
    this.gainTreasure(owner);
  }

  /** Discards the top monster card from an encounter slot. */
  discardMonster(issuer: Issuer, position: number): string {
    this.assertGameStarted();
    const player = this.assertIssuerSecret(issuer);
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
  drawMonster(issuer: Issuer, position: number): string {
    this.assertGameStarted();
    const player = this.assertIssuerSecret(issuer);
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
  getCardFromHand(issuer: Issuer, card: LootCard): LootCard {
    this.assertGameStarted();
    const player = this.assertIssuerSecret(issuer);
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
  playerMustAttack(player: Player, target: (Monster | "topDeck"), source: Card): void {
    // Check if player is dead - constraint doesn't apply
    if (player.isDead) {
      player.clearAttackRequirement();
    }

    const mustAttackPlayers = player.mustAttackMonster;

    for (const req of mustAttackPlayers) {
      if (req.target === "topDeck") continue;
      const monster = req.target;
      // If any required monster is no longer in play, clear the requirement
      if (!this.monsters.includes(monster)) {
        player.clearAttackRequirement(monster);
      }
      if (monster.attackable === false) {
        player.clearAttackRequirement(monster);
      }
    }
    player.mustAttack(target, source);
  }

  /** Discards one hand card by index to the loot discard pile. */
  discardFromHandAtIndex(issuer: Issuer, position: number): string {
    this.assertGameStarted();
    const player = this.assertIssuerSecret(issuer);
    this.assertPositiveNumber(position);

    const hand = player.hand;
    if (position < 0 || position > hand.cards.length - 1) {
      return "Invalid card position.";
    }

    const discardedCard: LootCard = hand.cards[position]!;
    this.removeCardFromHand(player, discardedCard);
    const lootDeck = this.decks["loot"]!;
    lootDeck.addDiscardTop(discardedCard);

    return `You have discarded the card: ${discardedCard.name}.\n`;
  }

  /** Marks a player to skip their next turn. */
  playerSkipNextTurn(player: Player): void {
    this.turnHandler.skipNextTurn(player);
  }

  /** Removes coins from a player and emits coin lost trigger. */
  loseCoins(issuer: Issuer, coins: number, asMany: boolean): number {
    this.assertGameStarted();
    const player = this.assertIssuerSecret(issuer);
    this.assertPositiveNumber(coins);

    const coinLost = player.loseCoins(coins, asMany);
    this.emit("on:coin:lost:after", { eventIssuer: player, coinLost });

    return coinLost;
  }

  /** Creates a dice roll stack element and emits pre-roll triggers. */
  rollDice(issuer: Issuer, attackRoll: boolean, card: Card | null = null): DiceRoll {
    this.assertGameStarted();
    const player = this.assertIssuerSecret(issuer);
    if (attackRoll) this.assertIsAlive(player);

    let diceRoll = player.rollDice(attackRoll, card);
    this.addToStack(diceRoll);
    this.emit("on:dice:would-roll", { eventIssuer: player, diceRoll });
    return diceRoll;
  }

  /** Resolves a dice roll immediately and emits rolled event. */
  resolveDiceRoll(diceRoll: DiceRoll): void {
    diceRoll.onResolve();
    this.emit("on:dice:rolled", { diceRoll });
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
    card.cleanup();
    return player.removeSoul(card);
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

  private assertNoMonsterIsEngagedInCombat(): void {
    if (this.monsters.some((m) => m.isEngagedInCombat)) {
      throw new Error("A monster is currently engaged in combat");
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

  private assertIssuerSecret(issuer: Issuer): Player {
    const player = this.findPlayerById(issuer.id);
    if (!player.verifySecret(issuer.secret)) {
      throw new Error("Invalid player secret");
    }
    return player;
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
    if (!this.Entities.includes(entity))
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

  private assertMonsterIsAlive(monster: Monster): void {
    if (monster.isDead) {
      throw new Error("Monster is already dead");
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
      (req) => req.target === "topDeck" || this.monsters.includes(req.target)
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
    this.assertIssuerSecret(issuer);
    return this.getPlayerById(issuer.id);
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
