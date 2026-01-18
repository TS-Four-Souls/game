import { Monster } from "@/models/monster";
import { DamageOnStack, DeathOnStack, DiceRoll, Player } from "@/models/player";
import { TargetBuilder } from "@/models/targetBuilder";
import type {
  Issuer,
} from "@/types/types";
import { setTimeout } from "timers/promises";
import { loadCards } from "@/utils/loadCards";
import {
  Card,
  CardSet,
  Deck,
  Hand,
  LoadsCardSets,
  LoadDecks,
  randomCardFromSet,
  isSameSlug,
  CharacterCard,
  MonsterCard,
  ItemCard,
  LootCard,
  LootCardEffect,
  EffectOnStack,
  InplayType,
  treasureCard,
  BsoulCard,
  Effect,
  EffectData,
  type EffectType,
  type TargetsSelector,
  eternalCard,
  createCardFromJson,
  MonsterType,
} from "@/models/cards";
import { Stack, type StackElement } from "@/models/stack";
import { effectParser, type ParsedEffect } from "@/models/effectParser";
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
import { preventNextDamageUpToEffect } from "@/models/passiveEffect";
import { bSoulEffectParser } from "@/models/bonusSoulHandling";
import { ca, pl } from "zod/locales";
import type { TriggerEvent } from "@/types/triggers";
import { set } from "zod";
import type { DetailedState, SelectionItem } from "@/shared/api";
import { HistoricHandler, type HistoricEntry, type UserRequest } from "./historyHandler";

// Type representing sources of damage - either a card ability or a dice roll
export type DamageSource = Card | DiceRoll;

const LOG_GAME = false;
export const cards = await loadCards(process.cwd() + "/data/cards");
const cardSets: { [key: string]: CardSet } = LoadsCardSets(cards);

// for(const card of cardSets["monster"]!.cards.toSorted((a, b) => a.slug.localeCompare(b.slug)) as MonsterCard[]){
//   // if((card as LootCard).trinket)
//   // for (const cardEffect of card.json.rewards) {
//     console.log(card.slug, card.json.rewards);
// }
export const gameParameters = {
  nbItemsInShop: 2,
  nbEncounters: 2,
  deathPenaltyCoins: 2,
  deathPenaltyItem: 1,
  deathPenaltyLoot: 1,
  treasuresOnStart: 0,
  lootOnStart: 3,
  coinsOnStart: 3,
  shopPrice: 10,
  nbPlayerCardRestriction: false, // only cards with minimum player requirement satisfied in decks.
};
export class Game {
  private _players: Player[] = [];
  private _monsters: Monster[] = [];
  private _turnHandler: TurnHandler = new TurnHandler();
  private _decks: { [key: string]: Deck } = {};
  private _ongoingAttack: { player: Player; monster: Monster } | null = null;
  private _shop!: Shop;
  private _encounters!: Encounters;
  private _stack: Stack = new Stack();
  private _destroyedCards: Card[] = [];
  private _emitter: GameEventEmitter;
  private _bonusSouls: BsoulCard[] = [];
  private _stackEmptyCallbacks: (() => void)[] = [];
  private _historicHandler: HistoricHandler = new HistoricHandler();

  private _onStateChange: Signal<void> = new Signal();
  onStateChange: ReadableSignal<void> = this._onStateChange.readOnly();

  constructor() {
    this._emitter = new GameEventEmitter();
  }
  
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
  get decks(): { [key: string]: Deck } {
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

  /* 
   * This function returns the game history, excluding private data entries
   */
  get history(): HistoricEntry[] {
    return this._historicHandler.history;
  }
  /* 
   * This function returns the game history, including private data entries
   */
  get log(): HistoricEntry[] {
    return this._historicHandler.log;
  }

  addToHistory(entry: HistoricEntry): void {
    this._historicHandler.addToHistory(entry);
  }

  get inPlayItems(): { player: Player; card: ItemCard }[] {
    const items: { player: Player; card: ItemCard }[] = [];
    for (const player of this.players) {
      for (const card of player.inPlay) {
        if (card instanceof ItemCard) {
          items.push({ player, card });
        }
      }
    }
    return items;
  }

  get inPlayCurses(): { player: Player; card: MonsterCard }[] {
    const curses: { player: Player; card: MonsterCard }[] = [];
    for (const player of this.players) {
      for (const card of player.inPlay) {
        if (card instanceof MonsterCard && card.isCurse) {
          curses.push({ player, card });
        }
      }
    }
    return curses;
  }

  get visibleItems(): ItemCard[] {
    let result: ItemCard[] = this.inPlayItems.map(({ card }) => card);
    result.push(
      ...this.shop._slots.filter((c): c is ItemCard => c instanceof ItemCard)
    );
    return result;
  }

  getOwner(item: ItemCard): Player | null {
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
  cancelStackElement(element: StackElement): void {
    this.stack.cancelElement(element);
  }

  stealSoul(player: Player, target: Player, soul: Card) {
    if (!target.souls.includes(soul)) {
      throw new Error("Target player does not have the specified soul.");
    }
    target.removeSoul(soul);
    player.addSoul(soul);
  }
  async deathPenalty(p: Player): Promise<void> {
    this.loseCoins(p, gameParameters.deathPenaltyCoins, true);
    const setOfLosableItems = p.inPlay.filter(
      (c) =>
        (c instanceof treasureCard || (c instanceof LootCard && c.trinket)) &&
        c.eternal === false
    );
    if (gameParameters.deathPenaltyItem > 0 && setOfLosableItems.length > 0) {
      const itemToLose = (
        await this.select(
          p,
          gameParameters.deathPenaltyItem,
          setOfLosableItems,
          false,
          gameParameters.deathPenaltyItem > 1
            ? "Select items to lose."
            : "Select an item to lose."
        )
      ).selected;
      if (itemToLose && itemToLose.length > 0) {
        for (const item of itemToLose) {
          this.removeInPlay(p, item);
          this.decks[item.type]!.addDiscardTop(item);
        }
      }
    }
    if (gameParameters.deathPenaltyLoot > 0 && p.hand.cards.length > 0) {
      const lootToLose = (
        await this.select(
          p,
          gameParameters.deathPenaltyLoot,
          p.hand.cards,
          false,
          gameParameters.deathPenaltyLoot > 1
            ? "Select loot cards to lose."
            : "Select a loot card to lose."
        )
      ).selected;
      if (lootToLose && lootToLose.length > 0) {
        for (const loot of lootToLose) {
          this.discardFromHandAtIndex(p, p.hand._hand.indexOf(loot));
        }
      }
    }
    for (const item of p.inPlay)
      if (item.hasActiveEffect()) item.charged = false;
    this._onStateChange.dispatch();
  }

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

  monsterRewards(monster: Monster): void {
    const rewards = monster.card.rewards;
    if (rewards?.coin) {
      if (rewards.coin === "roll") {
        const roll = this.rollDice(this.currentPlayer, false);
        roll.attachEffect(targetGetCoinRollEffect(this), monster.card, [
          this.currentPlayer,
        ]);
      } else if (typeof rewards.coin === "number") {
        this.gainCoins(this.currentPlayer, rewards.coin);
      }
    }
    if (rewards?.loot) {
      if (rewards.loot === "roll") {
        const roll = this.rollDice(this.currentPlayer, false);
        roll.attachEffect(targetGetLootRollEffect(this), monster.card, [
          this.currentPlayer,
        ]);
      } else if (typeof rewards.loot === "number")
        this.loot(this.currentPlayer, rewards.loot);
    }
    if (rewards?.treasure && typeof rewards.treasure === "number")
      this.gainTreasure(this.currentPlayer, rewards.treasure);
  }

  obtainMonsterSoulOrDiscard(monster: Monster): void {
    const card = monster.card;
    if (this.encounters._deck.cards.includes(card)) return; // monster is back in the deck and does not give his soul.
    if (card.rewards?.soul !== undefined) {
      if (typeof card.rewards?.soul !== "number")
        throw new Error("Monster soul reward must be a number.");
      card.soul = card.rewards?.soul;
      this.currentPlayer.addSoul(monster.card);
      this._onStateChange.dispatch();
    } else this.discard(monster.card);
  }

  // Should only be called by DeathOnStack objects.
  resolveDeath(receiver: Entity, from: Entity, source: DamageSource): void {
    this.emit("on:death:before-penalty", {
      eventIssuer: receiver,
      target: from,
      source: source,
    });
    this.executeWhenStackEmpty(async () => {
      receiver.die();
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
        this.executeWhenStackEmpty(async () => {
          this.obtainMonsterSoulOrDiscard(receiver);
        });
      }
      this.emit("on:death:after-penalty", {
        eventIssuer: receiver,
        target: from,
        source: source,
      });
      // if(receiver instanceof Player && this.currentPlayer === receiver)
      //   this.executeWhenStackEmpty(() => {this.endTurn();});
    });
  }

  declareAttack(player: Player): void {
    this.assertCurrentTurnIsPlayerTurn(player);
    this.assertNoOngoingAttack();
    this.assertPlayerIsAlive(player);
    this.assertNoPendingSelection();

    if (player.isEngagedInCombat) {
      throw new Error("Player is already engaged in combat.");
    }
    if (player.attackThisTurn <= 0 && !player.hasAttackRequirement)
      throw new Error("Player has no remaining attacks this turn.");

    player.attackThisTurn -= 1;
    player.engageInCombat();
    this.emit("on:attack:declared", { eventIssuer: player });
    this._onStateChange.dispatch();
  }

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
    if (monster !== "topDeck" && !monster.attackable) {
      player.clearAttackRequirement(monster);
      throw new Error("This monster cannot be attacked.");
    }
    this.assertCurrentTurnIsPlayerTurn(player);
    this.assertNoOngoingAttack();
    this.assertPlayerIsAlive(player);
    if (!player.isEngagedInCombat) {
      throw new Error("Player has not declared an attack.");
    }
    const isMonsterAlreadyEngaged = this.monsters.some(
      (m): m is Monster => m !== undefined && m.isEngagedInCombat
    );
    if (isMonsterAlreadyEngaged) {
      throw new Error("Another monster is already engaged in combat.");
    }
    if (!player.canAttackThisMonster(monster)) {
      throw new Error("Player must attack a specific monster.");
    }
    if (monster === "topDeck") {
      this.drawMonster(player, drawInIndex);
      player.clearAttackRequirement("topDeck");
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
    this.emit("on:attack:declared:monster", { eventIssuer: player, monster });
    this._onStateChange.dispatch();
  }

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

  attackRoll(player: Player): void {
    this.assertCurrentTurnIsPlayerTurn(player);
    this.assertPlayerIsAlive(player);
    this.assertNoPendingSelection();
    // todo force player to have declared attack.
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
  healthLoss(
    dealer: Entity,
    receiver: Entity,
    source: DamageSource,
    damage: number
  ): boolean {
    return receiver.receiveDamage(damage, dealer, source);
  }

  resolveDamage(
    dealer: Entity,
    receiver: Entity,
    source: DamageSource,
    damage: number
  ): void {
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

  heal(receiver: Entity, amount: number): void {
    receiver.heal(amount);
  }
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

  addPlayer(newPlayer: Player): void {
    this.assertPlayerIdAvailable(newPlayer.id);
    this.assertGameNotStarted();
    this.players.push(newPlayer);
  }

  async gainTreasureAmongs(
    player: Player,
    amount: number,
    treasures: treasureCard[]
  ): Promise<{ selected: treasureCard[]; remaining: treasureCard[] }> {
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

  async select(
    player: Player,
    n: number,
    Options: any[],
    anyNumber: boolean = false,
    description: string = "UNDEFINED SHOULD NOT HAPPEN"
  ): Promise<{ selected: any[]; remaining: any[] }> {
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
    return results[0]!;
  }

  // Select from multiple players in parallel (useful for voting)
  // Method to submit a selection from the client
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
      return;
    }

    // No matching pending selection found
    throw new Error("No pending selection found for this request ID");
  }

  async selectMultiple(
    selections: Array<{
      player: Player;
      count: number;
      options: any[];
      asMany?: boolean;
      description: string;
    }>
  ): Promise<Array<{ playerId: string; selected: any[]; remaining: any[] }>> {
    // In multiplayer mode: create promises for all players
    const promises = selections.map((sel) => {
      return new Promise<{
        playerId: string;
        selected: any[];
        remaining: any[];
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

    // Notify clients of state change (so players see the selection requests via SSE)
    await setTimeout(10); // slight delay to ensure state is updated before clients fetch it
    this._onStateChange.dispatch();

    // Wait for all selections to complete
    return Promise.all(promises);
  }

  // Called when client provides selection to continue paused resolution
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
  addToStack(item: StackElement): void {
    if (item instanceof EffectOnStack && !item.data.issuer) {
      throw new Error("EffectOnStack must have an issuer.");
    }
    this.stack.push(item);
    this._onStateChange.dispatch();
  }

  addSoul(player: Player, soulCard: Card): void {
    if (soulCard instanceof BsoulCard)
      soulCard.granted = true;
    player.addSoul(soulCard);
  }

  async resolveStack(): Promise<void> {
    let elem = this.stack.resolve();
    if (!elem) return;
    // Add to history
    this.addToHistory(elem);
    await elem.onResolve();
    this._onStateChange.dispatch();
    if (elem instanceof DiceRoll)
      this.emit("on:dice:rolled", { diceRoll: elem });

    // If stack is now empty, execute any pending callbacks
    if (this.stack.isEmpty() && this._stackEmptyCallbacks.length > 0) {
      const callbacks = [...this._stackEmptyCallbacks];
      this._stackEmptyCallbacks = [];
      for (const callback of callbacks) {
        await callback();
      }
      this._onStateChange.dispatch();
    }
  }

  async resolveEntireStack(): Promise<void> {
    while (!this.stack.isEmpty()) {
      await this.resolveStack();
    }
  }

  async executeWhenStackEmpty(
    callback: () => void | Promise<void>
  ): Promise<void> {
    if (this.stack.isEmpty()) {
      // Stack is already empty, execute immediately
      await callback();
    } else {
      // Queue the callback to be executed when stack becomes empty
      this._stackEmptyCallbacks.push(callback);
    }

    // If stack is now empty, execute any pending callbacks
    if (this.stack.isEmpty() && this._stackEmptyCallbacks.length > 0) {
      const callbacks = [...this._stackEmptyCallbacks];
      this._stackEmptyCallbacks = [];
      for (const callback of callbacks) {
        await callback();
      }
      this._onStateChange.dispatch();
    }
  }

  cancelStack(): void {
    this.stack.cancel();
  }

  cancelAt(index: number): void {
    this.stack.removeAt(index);
  }

  resetStack(): void {
    this.stack.clear();
    // this.resolveStack();
  }

  allHands(): { player: Player; hand: Hand }[] {
    return this.players.map((player) => ({ player, hand: player.hand }));
  }

  // addMonster(monster: Monster): void {
  //   this.assertMonsterIdAvailable(monster.id);
  //   this.monsters.push(monster);
  // }

  lootStep(): void {
    const player = this.currentPlayer;
    // this.emit("on:loot:step:before", { eventIssuer: player });
    this.emit("on:loot:step", { eventIssuer: player });
    this.loot(player, 1);
  }

  startTurn(): void {
    this.players.forEach((p) => {
      p.remainingLootPlay = 0;
      p.attackThisTurn = 0;
      p.remainingPurchaseThisTurn = 0;
      if (p === this.currentPlayer) {
        p.remainingLootPlay = 1;
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

  discardFromShop(index: number): void {
    return this.shop.discard(index);
  }

  rechargeEachItem(player: Player): void {
    for (const card of player.inPlay) {
      this.recharge(card);
    }
  }

  recharge(item: Card): void {
    item.recharge();
  }

  endCombat(): void {
    for (const entity of this.Entities) {
      if (entity.isEngagedInCombat) {
        entity.combatEnded();
      }
    }
    this._onStateChange.dispatch();
  }

  endTurn(): void {
    const player = this.assertIssuerSecret(this.currentPlayer);
    this.assertCurrentTurnIsPlayerTurn(player);
    this.assertCurrentPlayerIsNotEngagedInCombat();
    this.assertNoOngoingAttack();
    this.assertEmptyStack();
    this.assertForcedAttackSatisfied(player);
    this.assertNoPendingSelection();
    this.emit("on:turn:end", { eventIssuer: player });
    this.executeWhenStackEmpty(() => {
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
  nextTurn(issuer: Issuer): string {
    const roundIndex = this.assertGameStarted();
    const player = this.assertIssuerSecret(issuer);
    this.assertCurrentTurnIsPlayerTurn(player);
    this.assertCurrentPlayerIsNotEngagedInCombat();
    this.assertEmptyStack();
    this.assertNoOngoingAttack();
    this.assertForcedAttackSatisfied(player);
    this.assertNoPendingSelection();
    this.endTurn();

    return `It's ${this.currentPlayer!.id}'s turn. Round ${roundIndex}.\n`;
  }

  canEndTurn(issuer: Issuer): boolean {
    try {
      const roundIndex = this.assertGameStarted();
      const player = this.assertIssuerSecret(issuer);
      this.assertCurrentTurnIsPlayerTurn(player);
      this.assertCurrentPlayerIsNotEngagedInCombat();
      this.assertEmptyStack();
      this.assertNoOngoingAttack();
      this.assertForcedAttackSatisfied(player);
      this.assertNoPendingSelection();
    }
    catch {
      return false;
    }
    return true;
  }
  // Get target selectors for a card that a player wants to play
  getSelectors(player: Player, card: LootCard): TargetsSelector[] {
    return card.getTargetSelectors();
  }

  // temporary method to play a card from hand to in-play area.
  // targets must be explicitly provided by the caller using getSelectors()
  playCard(issuer: Issuer, index: number, targets: any[] = []): string {
    this.assertGameStarted();
    const player = this.assertIssuerSecret(issuer);
    // this.assertPlayerIsAlive(player);
    this.assertPositiveNumber(index);
    this.assertNoPendingSelection();
    if (index < 0 || index > player.hand.cards.length) {
      return "Invalid card position.";
    }
    const playedCard: LootCard = player.hand.playCard(index) as LootCard;

    if (targets.length === 0) {
      if (playedCard.getTargetSelectors().length === 1)
        if (playedCard.getTargetSelectors()[0]?.selector(player).length === 1)
          targets = playedCard.getTargetSelectors()[0]!.selector(player)[0];
    }
    const lootCardEffect = new LootCardEffect(player, playedCard, targets);
    this.addToStack(lootCardEffect);

    this.emit("on:loot:played", {
      eventIssuer: player,
      card: playedCard,
      targets: targets,
    });
    return `You have played the card: ${playedCard.name} to your in-play area.\n`;
  }

  initializeBonusSouls(): void {
    this._bonusSouls = this.decks["bsoul"]!.drawSeveral(3) as BsoulCard[];
    for (const soul of this._bonusSouls) {
      soul.cleanup = bSoulEffectParser(soul, this);
    }
  }
  setupGame(): void {
    this._decks = LoadDecks(
      cards,
      this.players.length,
      gameParameters.nbPlayerCardRestriction
    );
    this.joinEffectsToCards();
  }

  start(issuer: Issuer, characters: CharacterCard[] | null = null): void {
    this.assertIssuerSecret(issuer);
    this.assertGameNotStarted();
    this.assertMinimumPlayerCount();
    this.pendingMultipleSelections.clear();

    if (this._decks["character"] === undefined) {
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
      gameParameters.nbItemsInShop,
      this.decks["treasure"]!
    );
    this._encounters = new Encounters(
      gameParameters.nbEncounters,
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

  startOfGameSetup(): void {
    for (const player of this.players) {
      this.gainTreasure(player, gameParameters.treasuresOnStart);
      this.loot(player, gameParameters.lootOnStart);
      this.gainCoins(player, gameParameters.coinsOnStart);
    }
  }

  give(from: Player, to: Player, card: Card): boolean {
    if (from.souls.includes(card)) {
      from.removeSoul(card);
      to.addSoul(card);
      return true;
    }
    if (card instanceof LootCard) {
      return this.giveCard(from, to, card);
    }
    if (from.inPlay.includes(card) && !card.eternal) {
      from.removeInPlay(card);
      to.addInPlay(card);
      return true;
    }
    return false;
  }

  giveCard(from: Player, to: Player, card: LootCard): boolean {
    if (!from.hand.cards.includes(card)) {
      return false;
    }
    this.removeCardFromHand(from, card);
    this.addCardToHand(to, card);
    return true;
  }

  giveCoins(from: Player, to: Player, amount: number): boolean {
    if (from.coins < amount || amount <= 0) {
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
    this.emit("on:loot:added:after", { eventIssuer: player, card });
  }

  /**
   * Remove a card from a player's hand and emit the appropriate event.
   * This is the centralized method for all hand removals.
   */
  removeCardFromHand(player: Player, card: LootCard): void {
    player.hand.removeCard(card);
    this.emit("on:loot:removed:after", { eventIssuer: player, card });
  }

  assignRandomCharacterToPlayers(): void {
    const characterDeck = this.decks["character"];
    if (!characterDeck) {
      throw new Error("No character deck found");
    }
    // const characters: CharacterCard[] = characterDeck.drawSeveral(this.players.length) as CharacterCard[];
    const characters: CharacterCard[] = characterDeck.drawSeveral(
      this.players.length
    ) as CharacterCard[];
    this.assignCharactersToPlayers(characters);
  }

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

  reset(): void {
    this.turnHandler.reset();
    this._players = [];
    this._monsters = [];
    this._decks = {};
    this._ongoingAttack = null;
    this._shop = null!;
    this._encounters = null!;
    this._stack.clear();
    this._emitter = new GameEventEmitter();
    this._bonusSouls = [];
    this._destroyedCards = [];
    this.pendingMultipleSelections.clear();
  }

  addInPlay(player: Player, card: Card): void {
    this.emit("on:enter:play", { eventIssuer: player, card: card });
    if (
      card instanceof CharacterCard ||
      card instanceof eternalCard ||
      card instanceof treasureCard
    ) {
      card.onAddInPlay(player);
    }
    player.addInPlay(card);
    this.emit("on:enter:play:after", {
      eventIssuer: player,
      card: card,
    });
  }

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
      (card.type === "monster" &&
        (card as MonsterCard).encounterType === MonsterType.EVENT &&
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
        const parsed = effectParser(outcome, this);
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

  addAttack(e: Entity, value: number): void {
    e.addAttackPoints(value);
  }

  addAttackThisTurn(e: Entity, value: number = 1): void {
    if (e instanceof Player) {
      e.addAttackThisTurn(value);
    }
  }

  addHealth(e: Entity, value: number): void {
    e.addHealthPoints(value);
  }

  addAttackToEachMonster(e: Entity, value: number): void {
    this.encounters.addAttackModifier(value);
  }

  addDCToEachMonster(e: Entity, value: number): void {
    this.encounters.addDCModifier(value);
  }

  addDC(e: Entity, value: number): void {
    if (!(e instanceof Monster))
      throw new Error("DC modifier can only be added to monsters.");
    e.addEvasion(value);
  }

  addLootPlay(e: Player, value: number): void {
    e.addLootPlay(value);
  }

  addCanSeeTopOfTreasureDeck(e: Player, value: number): void {
    e.addCanSeeTopOfTreasureDeck(value);
  }

  addAttackDiceModifier(e: Entity, value: number): void {
    e.addAttackDiceModifier(value);
  }

  addDiceModifier(e: Entity, value: number): void {
    if (!(e instanceof Player))
      throw new Error("Dice modifier can only be added to players.");
    e.addDiceModifier(value);
  }

  addPurchaseThisTurn(p: Player, value: number): void {
    p.remainingPurchaseThisTurn += value;
  }

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

  getFirstCardsOfDeck(deckName: string, number: number): Card[] {
    return this.decks[deckName]!.drawSeveral(number);
  }
  addTopPosition(deckName: string, card: Card): void {
    this.decks[deckName]!.addTopPosition(card);
  }
  addBottomPosition(deckName: string, card: Card): void {
    this.decks[deckName]!.addBottomPosition(card);
  }

  addExtraTurn(player: Player): void {
    this.turnHandler.InsertPlayerAtNextTurn(player);
  }
  setHand(player: Player, hand: Hand): Hand {
    return player.setHand(hand);
  }
  priorityPasses(): Player[] {
    const order = this.turnHandler.priorityOrder;
    this.emit("on:priority:passes", {
      eventIssuer: this.currentPlayer,
      order,
    });
    // todo handle priority passing effects
    return order;
  }
  preventDeath(player: Player): void {
    this.stack.cancelPreviousDeath(player);
    if (player.currentHealthPoints === 0) player.addHealthPoints(1);
  }
  gainTreasure(issuer: Issuer, number: number = 1): string {
    this.assertGameStarted();
    const player = this.assertIssuerSecret(issuer);
    this.assertPositiveNumber(number);

    for (let i = 0; i < number; i++) {
      const treasureDeck: Deck = this.decks["treasure"]!;
      const drawnCard: Card = treasureDeck.draw()!;
      this.addInPlay(player, drawnCard);
    }
    return `You have drawn ${number} treasure card(s).\n`;
  }

  destroyCardsOrSouls(cards: Card[]): boolean {
    if (cards.length === 0 || cards.every((card) => card === undefined))
      return false;
    this.emit("on:item:destroyed", { eventIssuer: null, cards });
    cards.forEach((card) => {
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
    return true;
  }

  detailedStateJSON(issuer: Issuer): DetailedState {
    this.assertGameStarted();
    const player = this.assertIssuerSecret(issuer);

    return {
      me: {
        name: player.id,
        hand: player.hand.cards.map((c) => c.json),
        inPlay: player.inPlay.map((c) => ({
          ...c.json,
          charged: c.charged,
          effects: c.activeEffectList,
        })),
        handSize: player.hand.cards.length,
        souls: player.totalSouls,
        soulCards: player.souls.map((c) => c.json),
        coins: player.coins,
        canEndTurn: this.canEndTurn(issuer),
        currentAttackPoints: player.attackPoints,
        currentHealthPoints: player.currentHealthPoints,
        remainingLootPlay: player.remainingLootPlay,
        isEngagedInCombat: player.isEngagedInCombat,
      },
      players: this.players
        .filter((p) => p.id !== player.id)
        .map((p) => ({
          name: p.id,
          handSize: p.hand.cards.length,
          inPlay: p.inPlay.map((c) => ({ ...c.json, charged: c.charged })),
          souls: p.totalSouls,
          soulCards: p.souls.map((c) => c.json),
          coins: p.coins,
          currentAttackPoints: p.attackPoints,
          currentHealthPoints: p.currentHealthPoints,
          remainingLootPlay: p.remainingLootPlay,
          isEngagedInCombat: p.isEngagedInCombat,
        })),
      monsters:
      {
        discard: this.decks["monster"]!.discard.map((c) => ({ slug: c.slug })),
        deckSize: this.decks["monster"]!.cards.length,
        inPlay: this.encounters._slots.map((m, index) => ({ card: m[m.length - 1]!, monster: this.encounters.monsterIn(index), covered: this.encounters._slots[index]!.slice(0, -1).map(c => ({ slug: c.slug })) })).map((m) => ({

          top: {
            slug: m.card?.slug,
            name: m.card?.name,
            ...(m.monster ? {
              stats: {
                healthPoints: m.monster.currentHealthPoints,
                attackPoints: this.getAttack(m.monster),
                evasionPoints: this.getDC(m.monster),
                isEngagedInCombat: m.monster.isEngagedInCombat,
              }
            } : {})
          },
          covered: m.covered,
        })),
      },
      bonusSouls: this._bonusSouls.map((c) => ({ slug: c.slug, granted: c.granted })),
      loot:
      {
        discard: this.decks["loot"]!.discard.map((c) => ({ slug: c.slug })),
        deckSize: this.decks["loot"]!.cards.length,
      },
      treasure:
      {
        discard: this.decks["treasure"]!.discard.map((c) => ({ slug: c.slug })),
        deckSize: this.decks["treasure"]!.cards.length,
        inPlay: this.shop._slots.map((c) => ({ slug: c!.slug })),
      },
      turn: this.currentPlayer.id,
      firstCardTreasureDeck: player.canSeeTopOfTreasureDeck ? this.decks["treasure"]!.cards[0]?.json : undefined,
      stack: this.stack.elements.map((el) => el.json),
      // firstCardTreasureDeck: player.canSeeTopOfTreasureDeck
      // ? this.decks["treasure"]!.cards[0]?.json
      // : undefined,
      pendingSelection: (() => {
        // Check if player has a pending selection from selectMultiple
        for (const sel of this.pendingMultipleSelections.values()) {
          if (sel.playerId === player.id) {
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
      })(),
    };
  }

  purchase(issuer: Issuer, index: number): string {
    this.assertGameStarted();
    const player = this.assertIssuerSecret(issuer);
    this.assertPlayerIsAlive(player);
    this.assertNoPendingSelection();
    this.assertNoOngoingAttack();
    this.assertPositiveNumber(index);
    const price = [gameParameters.shopPrice];
    this.emit("on:item:purchase", { eventIssuer: player, cost: price });
    if (player.remainingPurchaseThisTurn <= 0) {
      throw new Error(
        `Purchase failed. You have no remaining purchases this turn.\n`
      );
    }
    if (this.shop.purchase(player, index, price[0]!, this)) {
      player.remainingPurchaseThisTurn -= 1;
      this._onStateChange.dispatch();
      return `Purchase successful. You have now ${player.coins} coins.\n`;
    } else {
      throw new Error(
        `Purchase failed. You need ${price[0]! - player.coins} more coins.\n`
      );
    }
  }

  loot(issuer: Issuer, number: number = 1): string {
    this.assertGameStarted();
    const player = this.assertIssuerSecret(issuer);
    this.assertPositiveNumber(number);

    const n = [number];
    const lootDeck: Deck = this.decks["loot"]!;
    this.emit("on:loot:would", {
      eventIssuer: player,
      numberOfCards: n,
    });
    const toLoot = n[0]!;
    if (toLoot > 0)
      for (let i = 0; i < toLoot; i++) {
        const drawnCard: Card = lootDeck.draw()!;
        this.addCardToHand(player, drawnCard as LootCard);
      }
    this.emit("on:loot:after", {
      eventIssuer: player,
      numberOfCards: toLoot,
    });
    this._onStateChange.dispatch();

    return `You have drawn ${toLoot} loot card(s).\n`;
  }

  emit(event: TriggerEvent, data: any = {}, dispatch: boolean = true): void {
    if (this.emitter.emit(event, data) > 0 && dispatch)
      this._onStateChange.dispatch();
  }

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

  discardInPlay(issuer: Issuer, index: number): string {
    this.assertGameStarted();
    const player = this.assertIssuerSecret(issuer);
    this.assertPlayerIsAlive(player);
    this.assertPositiveNumber(index);

    const inPlayCards = player.inPlay;
    if (index < 0 || index > inPlayCards.length - 1) {
      throw new Error("Invalid card position.");
    }
    const discardedCard: Card = inPlayCards[index]!;
    if (player.removeInPlayByIndex(index)) {
      this.decks[discardedCard.type]!.addDiscardTop(discardedCard);
      return `You have discarded the card: ${discardedCard.name} from your in-play area.\n`;
    } else {
      return `Cannot discard ${discardedCard.name} from in-play area as it is a ${discardedCard.type} card.\n`;
    }
  }

  stealItemAnywhere(issuer: Issuer, target: Card): boolean {
    this.assertGameStarted();
    const player = this.assertIssuerSecret(issuer);
    this.assertPlayerIsAlive(player);

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
  stealCoins(issuer: Issuer, target: Player, amount: number): string {
    this.assertGameStarted();
    const player = this.assertIssuerSecret(issuer);
    this.assertPlayerIsAlive(player);
    this.assertPositiveNumber(amount);

    const stolenCoins = this.loseCoins(target, amount, true);
    player.gainCoins(stolenCoins);

    return `You have stolen ${stolenCoins} coins from ${target.id}.\n`;
  }
  stealLootCard(issuer: Issuer, target: Player, card: LootCard): string {
    this.assertGameStarted();
    const player = this.assertIssuerSecret(issuer);
    this.assertPlayerIsAlive(player);

    const position = target.hand.cards.indexOf(card);
    this.assertPositiveNumber(position);

    if (position < 0 || position > target.hand.cards.length) {
      throw new Error("Invalid card position.");
    }

    this.removeCardFromHand(target, card);
    this.addCardToHand(player, card);

    return `You have stolen the card: ${card.name} from ${target.id}.\n`;
  }

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

  discardMonster(issuer: Issuer, position: number): string {
    this.assertGameStarted();
    const player = this.assertIssuerSecret(issuer);
    this.assertPositiveNumber(position);

    if (position < 0 || position > this.encounters._slots.length - 1) {
      throw new Error("Invalid monster position.");
    }

    this.encounters.discardTop(position);

    return `You have discarded the monster at position ${position}.\n`;
  }
  kill(killer: Entity, entity: Entity, source: DamageSource): void {
    this.assertGameStarted();
    this.assertEntityIsInPlay(entity);
    this.death(entity, killer, source);
  }

  drawMonster(issuer: Issuer, position: number): string {
    this.assertGameStarted();
    const player = this.assertIssuerSecret(issuer);
    this.assertPlayerIsAlive(player);
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

  getCardFromHand(issuer: Issuer, card: Card): Card {
    this.assertGameStarted();
    const player = this.assertIssuerSecret(issuer);
    const position = player.hand.cards.indexOf(card);
    this.assertPositiveNumber(position);

    if (position < 0 || position > player.hand.cards.length) {
      throw new Error("Invalid card position.");
    }

    this.removeCardFromHand(player, card as LootCard);
    return card;
  }

  playerMustAttackList(player: Player): (Monster | "topDeck")[] {
    // Check if player is dead - constraint doesn't apply
    if (player.isDead) {
      player.clearAttackRequirement();
      return [];
    }

    const mustAttackPlayers: (Monster | "topDeck")[] = player.mustAttackMonster;

    for (const req of mustAttackPlayers) {
      if (req === "topDeck") continue;
      const monster = req as Monster;
      // If any required monster is no longer in play, clear the requirement
      if (!this.monsters.includes(monster)) {
        player.clearAttackRequirement(monster);
      }
      if (monster.attackable === false) {
        player.clearAttackRequirement(monster);
      }
    }
    return player.mustAttackMonster;
  }

  discardFromHandAtIndex(issuer: Issuer, position: number): string {
    this.assertGameStarted();
    const player = this.assertIssuerSecret(issuer);
    this.assertPositiveNumber(position);

    const hand = player.hand;
    if (position < 0 || position > hand.cards.length - 1) {
      return "Invalid card position.";
    }

    const discardedCard: LootCard = hand.cards[position] as LootCard;
    this.removeCardFromHand(player, discardedCard);
    const lootDeck: Deck = this.decks["loot"]!;
    lootDeck.addDiscardTop(discardedCard);

    return `You have discarded the card: ${discardedCard.name}.\n`;
  }

  playerSkipNextTurn(player: Player): void {
    this.turnHandler.skipNextTurn(player);
  }

  loseCoins(issuer: Issuer, coins: number, asMany: boolean): number {
    this.assertGameStarted();
    const player = this.assertIssuerSecret(issuer);
    this.assertPositiveNumber(coins);

    const coinLost = player.loseCoins(coins, asMany);
    this.emit("on:coin:lost:after", { eventIssuer: player, coinLost });

    return coinLost;
  }

  rollDice(issuer: Issuer, attackRoll: boolean): DiceRoll {
    this.assertGameStarted();
    const player = this.assertIssuerSecret(issuer);
    if (attackRoll) this.assertPlayerIsAlive(player);

    let diceRoll = player.rollDice(attackRoll);
    this.addToStack(diceRoll);
    this.emit("on:dice:would-roll", { eventIssuer: player, diceRoll });
    return diceRoll;
  }

  resolveDiceRoll(diceRoll: DiceRoll): void {
    diceRoll.onResolve();
    this.emit("on:dice:rolled", { diceRoll });
  }

  inPlayTargetableCards(target: Player): ItemCard[] {
    return target.inPlay.filter(
      (card) =>
        card.type !== "eternal" &&
        card.type !== "character" &&
        card instanceof ItemCard
    ) as ItemCard[];
  }

  discard(card: Card): void {
    const deck = this.decks[card.type];
    if (!deck) {
      throw new Error("No deck found for card type: " + card.type);
    }
    deck.addDiscardTop(card);
  }

  removeInPlay(player: Player, card: Card): boolean {
    card.cleanup();
    return player.removeInPlay(card);
  }

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
      throw new Error("You cannot end your turn while engaged in combat.");
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

  // private assertMonsterIdAvailable(id: string): void {
  //   if (this.monsters.some((m) => m.id === id)) {
  //     throw new Error(`Monster ${id} already exists`);
  //   }
  // }

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

  private assertPlayerIsAlive(player: Player): void {
    if (player.isDead) {
      throw new Error("Player is already dead");
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
    if (!player.hasAttackRequirement()) {
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
      (m) => m === "topDeck" || this.monsters.includes(m as Monster)
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
  
  getPlayerByIssuer(issuer: Issuer): Player {
    this.assertIssuerSecret(issuer);
    return this.getPlayerById(issuer.id);
  }

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
