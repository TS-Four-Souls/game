import {
  BsoulCard,
  Card,
  ItemCard,
  LootCard,
  MonsterCard,
  TreasureCard
} from "@/models/cards";
import { EffectOnStack } from './stackElement';
import { CurrentPlayerDecidesToChangeRoom } from "@/models/effects/roomEffects";
import { Entity } from "@/models/entities/entity";
import { Monster } from "@/models/entities/monster";
import { Player } from "@/models/entities/player";
import { Stack, type StackElement } from "@/models/stack";
import { DiceRoll, LootStepOnStack } from "@/models/stackElement";
import type { DeckType, DecksCollection } from "@/models/types/cardTypes";
import { EffectData } from "@/models/types/cardTypes";
import { type LoseCoinsReason, type TriggerEvent } from '@/models/types/eventTypes';
import type { Animation, DetailedState, StackElementJson, Team } from "@/shared/api";
import { shuffle } from "@/utils/auxiliary";
import { generateAnimationId } from "@/utils/random";
import { Signal, type ReadableSignal } from "micro-signals";
import { addPassiveEffectToStack } from "./effects/passiveEffect";
import { AnimatedList } from "./entities/animated";
import { GameEventEmitter } from "./eventEmmitter";
import { GameParameters } from "./gameParameters";
import { GameStateSerializer } from "./gameStateSerializer";
import { ActionHandler } from "./handlers/actionHandler";
import { AssertHandler } from "./handlers/assertHandler";
import { CardHandler } from "./handlers/cardHandler";
import { EntityHandler } from "./handlers/entityHandler";
import { HistoricHandler, type HistoricEntry } from "./handlers/historyHandler";
import type { ServerRoomBroadcast } from "./roomBroadcast";
import { SelectionHandler, type PendingSelection } from "./handlers/selectionHandler";
import { Encounters } from "./slots/encounters";
import { Rooms } from "./slots/rooms";
import { Shop } from "./slots/shop";
import { TurnHandler } from "./handlers/turnHandler";
import { miniDraft } from "./variants";

/*
 * The Game class is the central hub of the game logic, managing the state of the game, players, monsters, decks, shop, encounters, stack, and more. 
 * It also handles all player actions such as declaring attacks, dealing damage, resolving deaths, and managing the game history. 
 */
export class Game extends SelectionHandler {
  private _turnHandler: TurnHandler = new TurnHandler();
  private _random: () => number = () => {throw new Error("Random generator not initialized yet.");};
  private _seed: string = "";
  private _shop!: Shop;
  private _encounters!: Encounters;
  private _rooms!: Rooms;
  private _stack: Stack = new Stack();
  private _emitter: GameEventEmitter;
  private _stackSubsetCallbacks: {stackIds: number[], callback: () => void}[] = [];
  private _historicHandler: HistoricHandler = new HistoricHandler();
  private _isWon: boolean = false;
  private _gameStateSerializer: GameStateSerializer;
  readonly gameParameters = new GameParameters(() => this.dispatch());
  readonly _assertHandler: AssertHandler = new AssertHandler(this);
  readonly _actionHandler = new ActionHandler(this);
  private _entityHandler = new EntityHandler(this);
  private _cardHandler = new CardHandler(this);

  private _onStateChange: Signal<void> = new Signal();
  onStateChange: ReadableSignal<void> = this._onStateChange.readOnly();

  private _onRoomBroadcast: Signal<ServerRoomBroadcast> = new Signal();
  onRoomBroadcast: ReadableSignal<ServerRoomBroadcast> = this._onRoomBroadcast.readOnly();

  constructor(seed: string = "", gameParameters?: GameParameters) {
    super();
    this.seed = seed; // if seed is empty, it will be set to a random value.
    this._emitter = new GameEventEmitter();
    this._gameStateSerializer = new GameStateSerializer(this);
    if(gameParameters !== undefined)
      this.gameParameters.loadFromJson(gameParameters.toJson());
  }
////////////////////////////////////// Getters //////////////////////////////////////

/*
 * Check if that game is started.
 */
  get isStarted(): boolean {
    return this._turnHandler.isInitialized;
  }
  /**
   * Returns the list of entities currently engaged in combat. 
   */
  get entitiesInCombat(): readonly Entity[] {
    // Return a defensive copy so external code cannot mutate combat state.
    return this.entityHandler.entitiesInCombat;
  }
  get entityHandler(): EntityHandler {
    return this._entityHandler;
  }
  get cardHandler(): CardHandler {
    return this._cardHandler;
  }
  get turnHandler(): TurnHandler {
    return this._turnHandler;
  }
  get actions(): ActionHandler {
    return this._actionHandler;
  }
  get players(): Player[] {
    return this.entityHandler.players;
  }
  get emitter(): GameEventEmitter {
    return this._emitter;
  }
  get monsters(): Monster[] {
    return this._encounters.monsters;
  }
  get decks(): DecksCollection {
    return this.cardHandler.decks;
  }
  get shop(): Shop {
    return this._shop;
  }
  get encounters(): Encounters {
    return this._encounters;
  }
  get rooms(): Rooms | undefined {
    return this._rooms;
  }
  get outsideGameCards(): Card[] {
    return this.cardHandler.outsideGameCards;
  }
  get cardMapping(): ReadonlyMap<number, Card> {
    return this.cardHandler.cardMapping;
  }
  get stack(): Stack {
    return this._stack;
  }
  get soulsOwned(): Card[] {
    const souls: Card[] = [];
    for (const player of this.players) {
      souls.push(...player.souls);
    }
    return souls;
  }
  get playersAndMonsters(): Entity[] {
    return this.entityHandler.playersAndMonsters;
  }

  get assert(): AssertHandler {
    return this._assertHandler;
  }

  get entities(): Entity[] {
    return this.entityHandler.entities;
  }

  get currentPlayer(): Player {
    return this.turnHandler.current;
  }
  /**
   * @param direction the direction to look for a player
   * @returns the player to the left or right of the current player
   */
  getPlayerToThe(direction: "left" | "right"): Player {
    return this.turnHandler.getPlayerTo(this.currentPlayer, direction);
  }
  /**
   * @returns the game history, excluding private data entries
   */
  get history(): StackElementJson[] {
    return this._historicHandler.history;
  }
  /**
   * @returns the game history, including private data entries
   */
  get log(): HistoricEntry[] {
    return this._historicHandler.log(this);
  }
  /**
   * @returns the active RNG seed used to initialize the current game generator.
   */
  get seed(): string {
    return this._seed;
  }

  get inPlayItems(): { player: Player; card: ItemCard }[] {
    return this.players.flatMap(p => p.inPlay.map(c => ({player: p, card: c})));
  }

  get inPlayCurses(): { player: Player; card: MonsterCard }[] {this.players.flatMap(p => p.curses.map(c => ({player: p, card: c})));
    return this.players.flatMap(p => p.curses.map(c => ({player: p, card: c})));
  }
  /**
   * @returns the list of animated entities in the game.
   * This includes alive entities that are not monsters nor players.
   */
  get animatedList(): AnimatedList {
    return this.entityHandler.animatedList;
  }

  get attackableEntities(): Entity[] {
    return [...this.playersAndMonsters.filter(e => e.attackable === true), ...this.animatedList.all.filter(e => e.attackable)];
  }
  /**
   * @returns all visible treasure and trinkets: each players inPlay and the shop items.
   */
  get visibleItems(): ItemCard[] {
    return this.cardHandler.visibleItems;
  }
  get nextAnimationId(): string {
    return generateAnimationId();
  }
  get deckNames(): DeckType[] {
    return this.cardHandler.deckNames;
  }
  get monsterSlots(): Encounters {
    return this.encounters;
  }
  get playersWithMostSouls(): Player[] {
    return this._entityHandler.playersWithMostSouls
  }
  get bonusSouls(): BsoulCard[] | undefined {
    return this.cardHandler.bonusSouls;
  }
  get pendingMultipleSelections(): Map<string, PendingSelection> {
    return this._pendingMultipleSelections;
  }
  getRollbackLog(player: Player): HistoricEntry[] {
    if(!this.gameParameters.allowCheatOptions.value && this._historicHandler.lastUserRequestIssuer === player.id)
      throw new Error("Cheat options are not allowed in this game. You can only rollback other players' actions.");
    return this._historicHandler.rollbackLog;
  }
  /**
   * Finds the owner of a soul or in-play item card.
   */
  getOwner(item: Card, type: "inplay" | "soul" | "any" = "any"): Player | null {
    return this.cardHandler.getOwner(item, type);
  }

  getCardByGlobalId(globalId: number): Card | undefined {
    return this.cardHandler.getCardByGlobalId(globalId);
  }
////////////////////////////////////// Seeded random //////////////////////////////////////

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

////////////////////////////////////// Dice Roll //////////////////////////////////////
/** Creates a dice roll stack element and emits pre-roll triggers. */
  rollDice(player: Player, attackRoll: boolean, card: Card | null = null): DiceRoll {
    this.assert.gameStarted();
    if (attackRoll) this.assert.isAlive(player);

    const diceRoll = player.rollDice(this.random, attackRoll, card);
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

////////////////////////////////////// Game Initialization, Win and Reset //////////////////////////////////////

  /**
   * Starts the game lifecycle and executes initial setup.
   */
  async start(players: { issuer: string; character: string; user?: string, team: Team }[], shufflePlayerOrder: boolean = true): Promise<void>{
    this.assert.gameNotStarted();
    for (const p of players) 
      this.entityHandler.addPlayer(new Player(p.issuer, p.team));
    const chara = this.cardHandler.getCharactersFromSlugs(players.map((p) => p.character));
    this.cardHandler.assignCharactersToPlayers(chara);

    this.assert.minimumPlayerCount();
    this._pendingMultipleSelections.clear();
    if (shufflePlayerOrder) {
      shuffle(this.random, this.players);
    }

    this.startOfGameSetup();
    
    this.emit("on:game:start", {});
    if(this.gameParameters.miniDraft.value)
      await miniDraft(this);
    await this.executeWhenStackEmpty(async () => {
      await this.startTurn();
    });
  }

  initializeTeams(): void{
    for(const player of this.players)
    {
      const soulOwner = this.players.find(p => p.team === player.team);
      player.soulsInCommonWith(soulOwner!);
    }
  }

  initializeWinningCondition(): void {
    let offSoulGained: (() => void) | null = null;
        offSoulGained = this.emitter.on("on:soul:gained", ({ eventIssuer }) => {
          if(eventIssuer.totalSouls >= this.gameParameters.nbSoulsToWin.value)
          {
              this.win(eventIssuer);
              offSoulGained!();
              offSoulGained = null;
          }
      });
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
   * Distributes starting resources to each player.
   */
  startOfGameSetup(): void {
    this.turnHandler.initialize(this.players);
    this.initializeTeams();
    this._historicHandler.recordInitialGameState(this);
    
    this.initializeWinningCondition();
    this.cardHandler.initializeBonusSouls();
    this._shop = new Shop(
      this.gameParameters.nbItemsInShop.value,
      this.decks["treasure"]
    );
    this._encounters = new Encounters(
      this.gameParameters.nbEncounters.value,
      this.decks["monster"],
      this
    );
    this.gameParameters.playWithRooms.value = this.gameParameters.playWithRooms.value && this.decks["room"] !== undefined && this.decks["room"]._order!.length > 0;
    // fill empty spot may call game.encounters, so it must be called after this._encounters initialization.
    this._encounters.fillEmptySpots(true);
    // initialize resources here so room laser eye does not deal damage before the first turn starts.
    for (const player of this.players) {
      this.gainTreasure(player, this.gameParameters.treasuresOnStart.value);
      this.loot(player, this.gameParameters.lootOnStart.value);
      this.gainCoins(player, this.gameParameters.coinsOnStart.value, "gift");
    }
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
    this.entityHandler.healEveryone();
  } 

  win(player: Player | null): void {
    if(this._isWon)
      return;
    this._isWon = true;
    if(player === null)
    {
      this._onRoomBroadcast.dispatch({
        type: "victory",
        title: `TIME'S UP! EVERYBODY LOSES!`,
        message: `You can keep playing, but you won't see the MAGNIFICIENT VICTORY POPUP!`,
        players: this.players.map(p => p.id),
      });
    }
    else 
      for(const p of this.players)
      {
        const isWinner = p.team === player.team;

        this._onRoomBroadcast.dispatch({
          type: "victory",
          title: isWinner ? "YOU WON!" : `AHAH! YOU LOST!`,
          message: isWinner ? "Congratulations!" : `Next time, cheat!`,
          players: [p.id],
        });
      }
  }

  /**
   * Resets the full game state to a fresh pre-start state.
   */
  reset(newSeed: boolean = true): void {
    this._historicHandler = new HistoricHandler();
    this._turnHandler = new TurnHandler();
    this._entityHandler = new EntityHandler(this);
    this._cardHandler = new CardHandler(this);
    this.seed = (newSeed ? "" : this.seed); // If newSeed is true, set to a random value in the setter.
    this._shop = undefined!;
    this._encounters = undefined!;
    this._rooms = undefined!;
    this.resetStack();
    this._emitter = new GameEventEmitter();
    this._pendingMultipleSelections = new Map();
    this._stackSubsetCallbacks = [];
    this._isWon = false;
  }

////////////////////////////////////// Turn Structure //////////////////////////////////////

  /**
   * Initializes turn counters and emits turn-start triggers.
   */
  async startTurn(): Promise<void> {
    this.players.forEach((p) => {
      p.initializeTurnCounters(p === this.currentPlayer, this.gameParameters.lootPlayPerTurn.value);
    });
    this.entityHandler.monsterDiedThisTurn = false;
    const player = this.currentPlayer;
    const itemsToRecharge = player.unchargedItems;
    const eventData = { eventIssuer: player, itemsToRecharge: itemsToRecharge }
    this.emit("on:turn:start:before:recharge:step", eventData);
    await this.executeWhenStackEmpty(async () => {
      this.cardHandler.rechargeMultiple(player, "rechargeStep", eventData.itemsToRecharge);
      this.emit("on:turn:start", { eventIssuer: player });
      await this.executeWhenStackEmpty(async () => {
        const eventData = { eventIssuer: this.currentPlayer, numberToLoot: 1 };
        this.emit("on:loot:step", eventData);
        this.addToStack(new LootStepOnStack(eventData.eventIssuer, eventData.numberToLoot, this));
      });
    });
  }
  
  /**
   * Executes the standard loot step at turn start.
   */
  lootStep(player: Player, numberToLoot: number): void {
    this.loot(player, numberToLoot, "lootStep");
    this.emit("on:your:turn", { eventIssuer: player });
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
      this.entityHandler.healEveryone();
      for (const player of this.players) {
        player.resetTurnFlags();
      }
      for (const monster of this.monsters) {
        monster.resetEntityFlags();
      }
      this.turnHandler.endTurn();
      if(this.gameParameters.timer.value > 0 && this.turnHandler.round > this.gameParameters.timer.value)
        this.win(null);
      this.dispatch();
      await this.startTurn();
    });
  }

  /**
   * Enforces max-hand-size discard rules for a player.
   */
  async verifyHandSize(player: Player): Promise<void> {
    const toDiscard = player.hand.cards.length - this.gameParameters.maxHandSize.value;
    if (toDiscard > 0){
      const selection = await this.select(player, toDiscard, toDiscard, player.hand.cards, `You must discard ${toDiscard} card(s) to reach your maximum hand size of ${this.gameParameters.maxHandSize.value}.`, true);
      for (const card of selection.selected) {
        this.cardHandler.discardFromHandAtIndex(player, player.hand._hand.indexOf(card), "overload");
      }
    }
  }

  handleRoomChange(): void {
    if(this.rooms === undefined) return;
    if(!this.entityHandler.monsterDiedThisTurn) return;
    if(this.rooms.activeRooms.every((room) => room.canBeDiscarded === false)) return;
    const data:EffectData = new EffectData(this.rooms.activeRooms[0]!, () => this.currentPlayer, []);
    addPassiveEffectToStack(this, CurrentPlayerDecidesToChangeRoom(this), data, "A monster died this turn, you can choose to put a room card into discard.");
  }

////////////////////////////////////// Handlers shortcuts //////////////////////////////////////
  /**
   * Activates a specific item and pushes resulting effect to stack.
   */
  async activateItem(
    player: Player,
    item: ItemCard,
    targets: any[] = [],
    effectId: number | "tap" = "tap"
  ): Promise<boolean> {
    return await this.cardHandler.activateItem(player, item, targets, effectId);
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
  
  /** Builds a full player-scoped game state payload for API/UI clients. */
  detailedStateJSON(player: Player): DetailedState {
    this.assert.gameStarted();
    return this._gameStateSerializer.detailedStateJSON(player);
  }

  
  /** Draws loot cards for a player and emits pre/post loot triggers. */
  loot(player: Player, number: number = 1, reason: "lootStep" | "other" = "other"): void {
    return this.cardHandler.loot(player, number, reason);
  }

  gainTreasure(player: Player, nb: number = 1): void {
    return this.cardHandler.gainTreasure(player, nb);
  }
  /** Marks a player to skip their next turn. */
  playerSkipNextTurn(player: Player): void {
    this.turnHandler.skipNextTurn(player);
  }

  /** Schedules an extra turn for a player. */
  addExtraTurn(player: Player): void {
    this.turnHandler.InsertPlayerAtNextTurn(player);
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
  /**
   * Dispatch a message to specific players in the game.
   */
  toast(payload: ServerRoomBroadcast): void {
    this._onRoomBroadcast.dispatch(payload);
  }
  /**
   * Load history after loading a game.
   */
  loadHistory(logs: HistoricEntry[]): void {
    this._historicHandler.loadHistory(logs);
  }

  /**
   * This function returns the cards owned by a player (his hand and in-play, non-eternal cards), and game owned cards (shop and encounters).
   * @param player 
   */
  playerCardsAndGameOwnedCards(player: Player): Card[] {
   return this.cardHandler.playerCardsAndGameOwnedCards(player);
  }
  
  /**
   * Removes a specific element from the stack, wherever it is.
   */
  cancelStackElement(element: StackElement): void {
    this.stack.cancelElement(element);
  }
  /**
   * @param slug 
   * @param globalId 
   * @returns 
   */
  obtainCardFromOutsideGame(slug: string, globalId?: number): Card | undefined {
    return this.cardHandler.obtainCardFromOutsideGame(slug, globalId);
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
    return this.cardHandler.obtainCard(slug, globalId, type);
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
   * Resolves stack elements until the stack is empty.
   */
  async resolveEntireStack(): Promise<void> {
    while (!this.stack.isEmpty()) {
      await this.actions.resolveStack();
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
    this.resetCallbacks();
  }

////////////////////////////////////// Coin handler //////////////////////////////////////
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

  /** Removes coins from a player and emits coin lost trigger. */
  canLoseCoins(player: Player, coins: number, asMany: boolean, reason: LoseCoinsReason = "other"): boolean {
    this.assert.gameStarted();
    this.assert.positiveNumber(coins);

    const eventData = { eventIssuer: player, coinToLose: coins, reason };
    this.emit("on:coin:lost:before", eventData);
    coins = eventData.coinToLose;
    return coins <= player.coins || asMany;
  }
  /** Removes coins from a player and emits coin lost trigger. */
  loseCoins(player: Player, coins: number, asMany: boolean, reason: LoseCoinsReason = "other"): number {
    this.assert.gameStarted();
    this.assert.positiveNumber(coins);

    const eventData = { eventIssuer: player, coinToLose: coins, reason };
    this.emit("on:coin:lost:before", eventData);
    coins = eventData.coinToLose;
    // console.log(`Player ${player.id} is about to lose ${coins} coins for reason ${reason} with ${player.coins} coins.`);
    if(coins <= 0) return 0;
    const coinLost = player.loseCoins(coins, asMany);
    this.emit("on:coin:lost:after", { eventIssuer: player, coinLost });
    if(coinLost === 0 && reason === "paiement" && asMany === false && coins > 0)
      return -1; // signal that the player cannot pay the cost.
    
    return coinLost;
  }


  /** Steals up to the requested number of coins from target player. */
  stealCoins(player: Player, target: Player, amount: number): string {
    this.assert.gameStarted();
    this.assert.positiveNumber(amount);

    const stolenCoins = this.loseCoins(target, amount, true, "effect");
    player.gainCoins(stolenCoins);

    return `You have stolen ${stolenCoins} coins from ${target.id}.\n`;
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
   return this.forceGiveCoins(from, to, amount, forcedBy);
  }

  forceGiveCoins(from: Player, to: Player, amount: number, forcedBy: Card | null = null): boolean {
    if (from.coins < amount || amount <= 0) {
      return false;
    }
    this.addAnimation({
      id: this.nextAnimationId,
      type: "giveCoins",
      sender: from.id,
      recipient: to.id,
      count: amount
    });
    this.loseCoins(from, amount, true, "gift");
    this.gainCoins(to, amount, forcedBy ? forcedBy : "gift");
    this.emit("on:coin:given", { eventIssuer: from, target: to, amount, forcedBy });
    this.dispatch();
    return true;
  }
  ////////////////////////////////////// Misc //////////////////////////////////////

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

  /** Moves one stack element before another within the same reordering group. */
  insertStackElementBefore(player: Player, elementToMoveStackId: number, targetStackId: number | "start"): void {
    this.assert.gameStarted();
    const {event, orderedListenerIds} = this.stack.insertStackElement(player, elementToMoveStackId, targetStackId);
    if (orderedListenerIds.length > 1) {
      this.emitter.reorderListenersBySubset(event as TriggerEvent, orderedListenerIds);
    }
    this.dispatch();
  }
  /** Add a new animation to the game. */
  addAnimation(animation: Animation): void {
    for(const player of this.players)
      player.addAnimation(animation);
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
  ////////////////////////////////////// Callbacks and Pending selection //////////////////////////////////////

  /**
   * Schedules a callback to run once the stack becomes empty.
   */
  executeWhenStackEmpty(
    callback: () => void | Promise<void>
  ): Promise<void> {
    return this.executeWhenStackSubset([], callback);
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
}