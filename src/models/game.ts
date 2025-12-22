import { Monster } from "@/models/monster";
import { DamageOnStack, DeathOnStack, DiceRoll, Player } from "@/models/player";
import type {
  DetailedState,
  DiscardCards,
  Issuer,
  MonsterPiles,
  State,
} from "@/types/types";
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
  type EffectData,
  type EffectType,
  type TargetsSelector,
  eternalCard,
  createCardFromJson,
} from "@/models/cards";
import { Stack, type StackElement } from "@/models/stack";
import {
  effectParser,
  targetSelectorParser
} from "@/models/effectParser";
import { getAttackRollEffect } from "@/models/activeEffect"
import { Shop, Encounters } from "@/models/slots";
import { Entity } from "@/models/entity";
import { TurnHandler } from "./turnHandler";
import { type ReadableSignal, Signal } from "micro-signals";
import { GameEventEmitter } from "./eventEmmitter";
import { preventNextDamageUpToEffect } from "@/models/passiveEffect";
import { bSoulEffectParser } from "@/models/bonusSoulHandling";
import { ca, pl } from "zod/locales";

const LOG_GAME = false;
export const cards = await loadCards(process.cwd() + "/data/cards");
const cardSets: { [key: string]: CardSet } = LoadsCardSets(cards);

// for(const card of cardSets["monster"]!.cards.toSorted((a, b) => a.slug.localeCompare(b.slug))){
//   // if((card as LootCard).trinket)
//   for (const cardEffect of card.effectOutcomes)
//     console.log(card.slug, [cardEffect]);
// }
export const gameParameters = { 
  nbItemsInShop: 2, 
  nbEncounters: 2,
  deathPenaltyCoins: 2,
  deathPenaltyItem: 1,
  deathPenaltyLoot: 1,
  treasuresOnStart: 0,
  shopPrice: 10
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

  private _onStateChange: Signal<void> = new Signal();
  onStateChange: ReadableSignal<void> = this._onStateChange.readOnly();

  constructor() {
    this._emitter = new GameEventEmitter();
  }

  get stateJson(): State {
    return {
      players: this._players.map((p) => ({
        name: p.id,
        inPlay: p.inPlay.map((c) => ({ slug: c.slug })),
      })),
    };
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

  get state(): string {
    let result = "";
    result += `Players:\n`;
    for (const p of this.players) {
      result += ` |- ${p.id}: ${p.currentHealthPoints} HP, ${p.attackPoints} ATK, ${p.coins} Coins, ${p.score} Souls\n`;
      result += `      In-Play Cards:\n`;
      const inPlayCards = p.inPlay;
      for (let j = 0; j < inPlayCards.length; j++) {
        const card = inPlayCards[j]!;
        result += `       Card ${j + 1}: ${card.name}\n`;
      }
    }
    result += "\n";
    if (this.turnHandler.isInitialized) {
      result += `Monsters:\n`;
      let i: number = 0;
      result += ` |- ${i++} top deck\n`;
      result +=
        this.encounters._slots
          .map((m) => ` |- ${i++} ${m[m.length - 1]!.name}`)
          .join("\n") + "\n\n";
      result += `Shop:\n`;
      i = 0;
      result += ` |- ${i++} top deck\n`;
      result +=
        this.shop._slots.map((m) => ` |- ${i++} ${m!.name}`).join("\n") +
        "\n\n";
    }
    result += this.turnHandler.isInitialized
      ? "Game started\n"
      : "Game not started\n";
    if (this.turnHandler.isInitialized) {
      result += `It's ${this.currentPlayer.id}'s turn\n`;
    }

    return result;
  }

  get currentPlayer(): Player {
    return this.turnHandler.current;
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
  deathPenalty(p: Player): void {

    this.loseCoins(p, gameParameters.deathPenaltyCoins, true);
    const setOfLosableItems = (p.inPlay).filter((c) => (c instanceof treasureCard || (c instanceof LootCard && c.trinket))
      && c.eternal === false)
    if (gameParameters.deathPenaltyItem > 0) {
      const itemToLose = this.select(
        p,
        gameParameters.deathPenaltyItem,
        setOfLosableItems
      ).selected[0];
      if (itemToLose) {
        this.removeInPlay(p, itemToLose);
        this.decks[itemToLose.type]!.addDiscardTop(itemToLose);
      }
    }
    if(gameParameters.deathPenaltyLoot > 0) {
      const lootToLose = this.select(p, gameParameters.deathPenaltyLoot, p.hand.cards).selected[0];
      if (lootToLose) {
        this.discardFromHand(p, p.hand._hand.indexOf(lootToLose));
        this.removeCardFromHand(p, lootToLose);
        this.decks[lootToLose.type]!.addDiscardTop(lootToLose);
      }
    }
  }

  death(receiver: Entity, from: Entity, usingAbilityFrom: Card): void {
    const deathOnStack = new DeathOnStack(
      receiver,
      from,
      usingAbilityFrom,
      this
    );
    this.addToStack(deathOnStack);
    this.emitter.emit("on:death:would-death", {
      eventIssuer: receiver,
      target: from,
      abilityCard: usingAbilityFrom,
      deathOnStack: deathOnStack,
    });
  }

  // Should only be called by DeathOnStack objects.
  resolveDeath(receiver: Entity, from: Entity, usingAbilityFrom: Card): void {
    this.emitter.emit("on:death:before-penalty", {
      eventIssuer: receiver,
      target: from,
      abilityCard: usingAbilityFrom,
    });
    receiver.die();
    if (receiver instanceof Player) {
      receiver.mustAttackMonster = null;
      this.deathPenalty(receiver);
    } else if (receiver instanceof Monster) {
      // Clear any forced attack constraints on this monster
      for (const player of this.players) {
        if (player.mustAttackMonster === receiver) {
          player.mustAttackMonster = null;
        }
      }
      this.encounters.kill(receiver);
      this.emitter.emit("on:monster:died", {
        eventIssuer: receiver,
        target: from,
        abilityCard: usingAbilityFrom,
      });
    }
    this.emitter.emit("on:death:after-penalty", {
      eventIssuer: receiver,
      target: from,
      abilityCard: usingAbilityFrom,
    });
  }

  declareAttack(player: Player): void {
    if (player.isEngagedInCombat || player.attackThisTurn > 0) {
      player.attackThisTurn -= 1;
      player.engageInCombat();
      this.emitter.emit("on:attack:declared", { eventIssuer: player });
    }
  }


  declareAttackOnMonster(player: Player, monster: Monster): void {
    if (player.isEngagedInCombat) {
      monster.engageInCombat();
      // Clear forced attack constraint if this is the forced monster
      if (player.mustAttackMonster === monster) {
        player.mustAttackMonster = null;
      }
    }
  }

  getMonsterStat(monster: Monster, stat: "attackPoints" | "evasion"): number {
    let baseStat = [stat === "attackPoints" ? monster.attackPoints : monster.evasion];
    if (stat === "evasion")
      this.emitter.emit("on:get:monster:evasion", {
        player: this.currentPlayer,
        eventIssuer: monster,
        target: monster,
        evasion: baseStat});
    return baseStat[0]!;
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
      const handCard = player.hand.cards.find(c => c.slug === slug);
      if (handCard) return handCard;
      
      const inPlayCard = player.inPlay.find(c => c.slug === slug);
      if (inPlayCard) return inPlayCard;
    }
    
    return undefined;
  }

  attackRoll(player: Player, monster: Monster): void {
    const damageDealt = [player.attackPoints];
    const damageReceived = [monster.attackPoints];
    const evasion = [this.getMonsterStat(monster, "evasion")];
    const dice = this.rollDice(player, true);

    this.emitter.emit("on:attack:roll", {
      eventIssuer: player,
      target: monster,
      dice,
      damageDealt,
      damageReceived,
      evasion,
    });
    if (player.attackRollThisTurn === 1)
      this.emitter.emit("on:attack:roll:first-time-each-turn", {
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
    usingAbilityFrom: Card,
    damage: number
  ): void {
    if (damage <= 0 || receiver.isDead) return;
    if (receiver instanceof Player) {
      this.emitter.emit("on:combatdamage:dealt:to-player", {
        eventIssuer: dealer,  // The dealer is the one dealing combat damage
        target: receiver,
        abilityCard: usingAbilityFrom,
        damage,
      });
    } else if (receiver instanceof Monster) {
      this.emitter.emit("on:combatdamage:dealt:to-monster", {
        eventIssuer: dealer,  // The dealer is the one dealing combat damage
        target: receiver,
        abilityCard: usingAbilityFrom,
        damage,
      });
    }
    this.dealDamage(dealer, receiver, usingAbilityFrom, damage);
  }

// on health loss trigger can be added here. Be careful, in case of pay HP to verify that all the HP are actually lost.
  healthLoss(dealer: Entity,
    receiver: Entity,
    usingAbilityFrom: Card,
    damage: number
  ): boolean {
    return receiver.receiveDamage(damage, dealer, usingAbilityFrom);
  }

  resolveDamage(
    dealer: Entity,
    receiver: Entity,
    usingAbilityFrom: Card,
    damage: number
  ): void {
    this.healthLoss(dealer, receiver, usingAbilityFrom, damage);
    
    if(receiver.damageTakenThisTurn.length === 1)
      this.emitter.emit("on:damage:taken:first-time-each-turn", {
        eventIssuer: receiver,
        target: dealer,
        abilityCard: usingAbilityFrom,
        damage: damage,
      });

    this.emitter.emit("on:damage:taken", {
      eventIssuer: receiver,
      target: dealer,
      abilityCard: usingAbilityFrom,
      damage: damage,
    });

    if (receiver.currentHealthPoints <= 0) {
      this.death(receiver, dealer, usingAbilityFrom);
    }
  }

  dealDamage(
    dealer: Entity,
    receiver: Entity,
    usingAbilityFrom: Card,
    damage: number,
    callback?: (data:EffectData) => boolean,
    callbackTargets: any[] = []
  ): void {
    if (damage <= 0 || receiver.isDead) return;

    const damageArray = [damage];

    const damageOnStack = new DamageOnStack(
      dealer,
      receiver,
      damageArray,
      usingAbilityFrom,
      this
    );
    if (callback) {
      damageOnStack.attachEffect(callback, usingAbilityFrom, callbackTargets);
    }
      this.addToStack(damageOnStack);

    this.emitter.emit("on:damage:would-take", {
      eventIssuer: receiver,
      target: dealer,
      abilityCard: usingAbilityFrom,
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

  gainTreasureAmongs(player: Player, amount: number, treasures: treasureCard[]): { selected: treasureCard[]; remaining: treasureCard[] } {
      const selection = this.select(player, amount, treasures)
      for(const card of selection.selected){
        this.addInPlay(player, card);
      }
      this._onStateChange.dispatch();
      return selection;
  }

  select(
    player: Player,
    n: number,
    Options: any[],
    anyNumber: boolean = false
  ): { selected: any[]; remaining: any[] } {
    // TODO: implement player choice
    return { selected: Options.slice(0, n), remaining: Options.slice(n) };
  }

  get monsterSlots(): Encounters {
    return this.encounters;
  }
  get playersWithMostSouls(): Player[] {
    let maxSouls = Math.max(...this.players.map((player) => player.totalSouls));
    return this.players.filter((player) => player.totalSouls === maxSouls);
  }
  addToStack(item: StackElement): void {
    this.stack.push(item);
  }

  addSoul(player: Player, soulCard: Card): void {
    player.addSoul(soulCard);
  }

  resolveStack() {
    let elem = this.stack.resolve();
    if (!elem) return;
    if (elem instanceof LootCardEffect) elem.onResolve();
    else if (elem instanceof DiceRoll) this.resolveDiceRoll(elem);
    else if (elem instanceof DeathOnStack) elem.onResolve();
    else if (elem instanceof DamageOnStack) elem.onResolve();
    else if (elem instanceof EffectOnStack) elem.onResolve();
    this._onStateChange.dispatch();
  }

  cancelStack(): void {
    this.stack.cancel();
  }

  cancelAt(index: number): void {
    this.stack.removeAt(index);
  }

  resetStack(): void {
    this.stack.clear();
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
    // this.emitter.emit("on:loot:step:before", { eventIssuer: player });
    this.emitter.emit("on:loot:step", { eventIssuer: player });
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
    this.emitter.emit("on:turn:start", { eventIssuer: player });
    this.lootStep();
    this.emitter.emit("on:your:turn", { eventIssuer: player });
    this._onStateChange.dispatch();
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

  endTurn(): void {
    const player = this.assertIssuerSecret(this.currentPlayer);
    this.assertCurrentTurnIsPlayerTurn(player);
    this.assertNoOngoingAttack();
    this.assertForcedAttackSatisfied(player);
    this.healEveryone();
    this.emitter.emit("on:turn:end", { eventIssuer: player });
    for (const player of this.players) {
      player.resetTurnFlags();
    }
    for (const monster of this.monsters) {
      monster.resetEntityFlags();
    }
    this.turnHandler.endTurn();
    this._onStateChange.dispatch();
    this.startTurn();
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
    this.assertPlayerIsAlive(player);
    this.assertPositiveNumber(index);
    if (index < 0 || index > player.hand.cards.length) {
      return "Invalid card position.";
    }
    const playedCard: LootCard = player.hand.playCard(index - 1) as LootCard;
    
    if(targets.length === 0)
    {
      if(playedCard.getTargetSelectors().length === 1)
        if (playedCard.getTargetSelectors()[0]?.selector(player).length === 1)
          targets = playedCard.getTargetSelectors()[0]!.selector(player)[0];
    }
    const resolveFunction = playedCard.onPlay(player, targets);
    const lootCardEffect = new LootCardEffect(playedCard, resolveFunction);
    this.addToStack(lootCardEffect);
    
    this._onStateChange.dispatch();
    this.emitter.emit("on:loot:played", { eventIssuer: player, card: playedCard, targets: targets });
    
    return `You have played the card: ${playedCard.name} to your in-play area.\n`;
  }

  initializeBonusSouls(): void {
    this._bonusSouls = this.decks["bsoul"]!.drawSeveral(3) as BsoulCard[];
    for (const soul of this._bonusSouls) {
        soul.cleanup = bSoulEffectParser(soul, this);
    }
  }
  setupGame(): void {
    this._decks = LoadDecks(cards, this.players.length);
    this.joinEffectsToCards();
  }
  
  start(issuer: Issuer, characters: CharacterCard[] | null = null): void {
    this.assertIssuerSecret(issuer);
    this.assertGameNotStarted();
    this.assertMinimumPlayerCount();
    
    if(this._decks["character"] === undefined){
      this.setupGame();
    }
    this.turnHandler.initialize(this.players);
    if (characters && characters.length > 0) {
      this.assignCharactersToPlayers(characters);
    } else
    {
      this.assignRandomCharacterToPlayers();
    }
    this.initializeBonusSouls();
    this._shop = new Shop(
      gameParameters.nbItemsInShop,
      this.decks["treasure"]!
    );
    this._encounters = new Encounters(
      gameParameters.nbEncounters,
      this.decks["monster"]!
    );
    this.emitter.emit("on:game:start:before", {});
    this.emitter.emit("on:game:start", {});
    this.healEveryone();
    // this.startTurn();
  }

  give(from: Player, to: Player, card: Card): boolean {
    if(card instanceof LootCard){
      return this.giveCard(from, to, card);
    }
    if(from.inPlay.includes(card) && !(card.eternal)){
      from.removeInPlay(card);
      to.addInPlay(card);
      return true;
    }
    return false;
  }


  giveCard(from: Player, to: Player, card: LootCard): boolean {
    if(!from.hand.cards.includes(card)){
      return false
    }
    this.removeCardFromHand(from, card);
    this.addCardToHand(to, card);
    return true;
  }

  /**
   * Add a card to a player's hand and emit the appropriate event.
   * This is the centralized method for all hand additions.
   */
  addCardToHand(player: Player, card: LootCard): void {
    player.hand.addToHand(card);
    this.emitter.emit("on:loot:added:after", { eventIssuer: player, card });
  }

  /**
   * Remove a card from a player's hand and emit the appropriate event.
   * This is the centralized method for all hand removals.
   */
  removeCardFromHand(player: Player, card: LootCard): void {
    player.hand.removeCard(card);
    this.emitter.emit("on:loot:removed:after", { eventIssuer: player, card });
  }

  assignRandomCharacterToPlayers(): void {
    const characterDeck = this.decks["character"];
    if (!characterDeck) {
      throw new Error("No character deck found");
    }
    // const characters: CharacterCard[] = characterDeck.drawSeveral(this.players.length) as CharacterCard[];
    const characters: CharacterCard[] = characterDeck.drawSeveral(this.players.length) as CharacterCard[];
    this.assignCharactersToPlayers(characters);
  }

  assignCharactersToPlayers(characters: CharacterCard[]): void {
    const characterDeck = this.decks["character"];
    if (!characterDeck) {
      throw new Error("No character deck found");
    }
    if(characters.length !== this.players.length){
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
  reset(issuer: Issuer): void {
    this.assertIssuerSecret(issuer);
    this.debugReset();
  }

  addInPlay(player: Player, card: Card): void {
    this.emitter.emit("on:enter:play", { eventIssuer: player, card: card });
    if(card instanceof CharacterCard || card instanceof eternalCard || card instanceof treasureCard){
      card.onAddInPlay(player);
    }
    player.addInPlay(card);
    this.emitter.emit("on:enter:play:after", { eventIssuer: player, card: card });
  }

  activateItemAtIndex(player: Player, index: number, targets: any[] = [], effectId: number | "tap" = "tap"): boolean {
    const item = player.inPlay[index-1];
    if(!item || !(item instanceof ItemCard)) {
      return false;
    }
    return this.activateItem(player, item, targets, effectId);
  }
  activateItem(player: Player, item: ItemCard, targets: any[] = [], effectId: number | "tap" = "tap" ): boolean {
    const effectOnStack = player.activateItem(item, targets, effectId);
    if (effectOnStack) {
      this.addToStack(effectOnStack);
      if (effectId === "tap") {
        this.emitter.emit("on:item:activated", {
          eventIssuer: player,
          item: item,
        });
      }
      return true;
    }
    return false;
  }

    debugReset(): void {
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
  }

  nextTurn(issuer: Issuer): string {
    const roundIndex = this.assertGameStarted();
    const player = this.assertIssuerSecret(issuer);
    this.assertCurrentTurnIsPlayerTurn(player);
    this.assertNoOngoingAttack();
    this.healEveryone();
    if(player === this.currentPlayer){
      this.endTurn();
    }
    return `It's ${this.currentPlayer!.id}'s turn. Round ${roundIndex}.\n`;
  }

  private getEffectTypeFromOutcome(outcome: string, card:Card): EffectType {
    let type:EffectType = "passive";
    if(outcome.startsWith("[Tap Effect]") || card.type === "loot")
            type = "active";
    else if (outcome.startsWith("[Paid Effect]"))
      type = "paid";
    return type;
  }

  /**
   * Parses and attaches all effects from a card's effect outcomes.
   * @param card - The card to attach effects to
   */
  attachEffectsToCard(card: Card): void {
    if (!card.effectOutcomes || card.effectOutcomes.length === 0) {
      console.log(
        "WARNING: No effect outcomes for card:",
        card.name
      );
      return;
    }

    for (const outcome of card.effectOutcomes) {
      const effectType = this.getEffectTypeFromOutcome(outcome, card);
      
      // Handle paid effects separately to extract payment and effect functions
      if (effectType === "paid") {
        const s2 = outcome.replace("[paid effect] ", "").replace("[Paid Effect] ", "").trim();
        const idx = s2.indexOf(":");
        
        if (idx === -1) {
          throw new Error(`Invalid paid effect format (missing ':'): ${outcome}`);
        }
        
        const paymentString = s2.substring(0, idx).trim();
        const effectString = s2.substring(idx + 1).trim();
        
        const paymentFunction = effectParser(paymentString, this);
        const effectFunction = effectParser(effectString, this);
        
        const effect: Effect = new Effect(
          outcome,
          effectType,
          effectFunction,
          targetSelectorParser(outcome, this),
          paymentFunction
        );
        card.addEffect(effect);
      } else {
        // Regular effects (passive/active)
        const effect: Effect = new Effect(
          outcome,
          effectType,
          effectParser(outcome, this),
          targetSelectorParser(outcome, this)
        );
        card.addEffect(effect);
      }
    }
  }

  private joinEffectsToCards(): void {
    for(const deckName of ["loot", "bsoul", "character", "eternal", "treasure"])
    {
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

  addAttackThisTurn(e: Entity, value: number): void {
    if (e instanceof Player) {
      e.addAttackThisTurn(value);
    }
  }

  addHealth(e: Entity, value: number): void {
    e.addHealthPoints(value);
  }

  addLootPlay(e: Player, value: number): void {
    e.addLootPlay(value);
  }

  addCanSeeTopOfTreasureDeck(e: Player, value: number): void {
    e.addCanSeeTopOfTreasureDeck(value);
  }

  addAttackDiceModifier(e: Entity, value: number): void {
    e.addDiceModifier(value);
  }

  addPurchaseThisTurn(p: Player, value: number): void {
    p.remainingPurchaseThisTurn += value;
  }

  addDCmuliplier(e: Entity, value: number): void {
    this.encounters.addDcModifier(value);
  }

  gainCoins(issuer: Issuer, coins: number): string {
    this.assertGameStarted();
    const player = this.assertIssuerSecret(issuer);
    this.assertPositiveNumber(coins);
    if (coins > 0) {
      const amount = [coins];
      this.emitter.emit("on:coin:gained", {
        eventIssuer: player,
        coinGained: amount,
      });
      player.gainCoins(amount[0]!);
      this.emitter.emit("on:coin:gained:after", { eventIssuer: player, coinGained: amount });

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
    this.emitter.emit("on:priority:passes", { eventIssuer: this.currentPlayer, order });
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
    this._onStateChange.dispatch();
    return `You have drawn ${number} treasure card(s).\n`;
  }

  destroyCardsOrSouls(cards: Card[]): boolean {
    if (cards.length === 0 || cards.every((card) => card === undefined))
      return false;
    cards.forEach((card) => {
      this.players.forEach((player) => {
        player.removeInPlay(card);
      });
    });
    cards.forEach((card) => {
      this.players.forEach((player) => {
        player.removeSoul(card);
      });
    });
    this.destroyedCards.push(...cards);
    this.emitter.emit("on:item:destroyed", { eventIssuer: null, cards: cards });
    return true;
  }

  detailedState(issuer: Issuer): string {
    this.assertGameStarted();
    const player = this.assertIssuerSecret(issuer);

    let result = "";
    result += `Your hand contains the following cards:\n`;
    const handCards = player.hand.cards;
    for (let i = 0; i < handCards.length; i++) {
      const card = handCards[i]!;
      result += `Card ${i + 1}: ${card}\n`;
    }
    result += `Players:\n`;
    let i: number = 0;
    for (const p of this.players) {
      result += ` |- ${p.id}: ${p.currentHealthPoints} HP, ${p.attackPoints} ATK, ${p.coins} Coins, ${p.score} Souls\n`;
      result += `      In-Play Cards:\n`;
      const inPlayCards = p.inPlay;
      for (let j = 0; j < inPlayCards.length; j++) {
        const card = inPlayCards[j]!;
        result += `       Card ${j + 1} ${card}\n`;
      }
    }
    result += "\n\n";
    if (this.turnHandler.isInitialized) {
      result += `Monsters:\n`;
      i = 0;
      result += ` |- ${i++} top deck\n`;
      result +=
        this.encounters._slots
          .map((m) => ` |- ${i++} ${m[m.length - 1]!}`)
          .join("\n") + "\n\n";
      result += `Shop:\n`;
      i = 0;
      result += ` |- ${i++} top deck\n`;
      result +=
        this.shop._slots.map((m) => ` |- ${i++} ${m!}`).join("\n") + "\n\n";
    }
    if (this.turnHandler.isInitialized) {
      result += `It's ${this.currentPlayer.id}'s turn\n`;
    }
    return result;
  }

  detailedStateJSON(issuer: Issuer): string {
    this.assertGameStarted();
    const player = this.assertIssuerSecret(issuer);

    const res: DetailedState = {
      me: {
        name: player.id,
        hand: player.hand.cards.map((c) => c.json),
        inPlay: player.inPlay.map((c) => c.json),
        souls: player.souls.map((c) => c.json),
        coins: player.coins,
        currentAttackPoints: player.attackPoints,
        currentHealthPoints: player.currentHealthPoints,
        remainingLootPlay: player.remainingLootPlay,
      },
      players: this.players
        .filter((p) => p.id !== player.id)
        .map((p) => ({
          name: p.id,
          handSize: p.hand.cards.length,
          inPlay: p.inPlay.map((c) => c.json),
          souls: p.souls.map((c) => c.json),
          coins: p.coins,
          currentAttackPoints: p.attackPoints,
          currentHealthPoints: p.currentHealthPoints,
          remainingLootPlay: p.remainingLootPlay,
        })),
      topDiscards: {
        loot: this.decks["loot"]!.discard[0]
          ? this.decks["loot"]!.discard[0]!.json
          : undefined,
        treasure: this.decks["treasure"]!.discard[0]
          ? this.decks["treasure"]!.discard[0]!.json
          : undefined,
        monster: this.decks["monster"]!.discard[0]
          ? this.decks["monster"]!.discard[0]!.json
          : undefined,
      },
      monsters: this.encounters._slots.map((m) => m[m.length - 1]!.json),
      shop: this.shop._slots.map((m) => m!.json),
      turn: this.currentPlayer.id,
      stack: this.stack.elements.map((el) => {
        if (el instanceof LootCard) {
          return el.slug;
        } else {
          const json = el.json;
          if (typeof json === "object") {
            return JSON.stringify(json);
          }
          return json;
        }
      }),
      firstCardTreasureDeck: player.canSeeTopOfTreasureDeck ? this.decks["treasure"]!.cards[0]?.json : undefined,
    };

    return JSON.stringify(res);
  }



  purchase(issuer: Issuer, index: number): string {
    this.assertGameStarted();
    const player = this.assertIssuerSecret(issuer);
    this.assertPlayerIsAlive(player);
    this.assertPositiveNumber(index);
    const price = [gameParameters.shopPrice];
    this.emitter.emit("on:item:purchase", { eventIssuer: player, cost: price });
    if(player.remainingPurchaseThisTurn <= 0){
      return `Purchase failed. You have no remaining purchases this turn.\n`;
    }
    if (this.shop.purchase(player, index, price[0]!, this)) {
      player.remainingPurchaseThisTurn -= 1;
      return `Purchase successful. You have now ${player.coins} coins.\n`;
    } else {
      return `Purchase failed. You still have ${player.coins} coins.\n`;
    }
  }
  loot(issuer: Issuer, number: number = 1): string {
    this.assertGameStarted();
    const player = this.assertIssuerSecret(issuer);
    this.assertPositiveNumber(number);

    const n = [number]
    const lootDeck: Deck = this.decks["loot"]!;
    this.emitter.emit("on:loot:would", { eventIssuer: player, numberOfCards: n });
    const toLoot = n[0]!;
    if (toLoot > 0)
      for (let i = 0; i < toLoot; i++) {
        
        const drawnCard: Card = lootDeck.draw()!;
        this.addCardToHand(player, drawnCard as LootCard);
      }
      this.emitter.emit("on:loot:after", { eventIssuer: player, numberOfCards: toLoot });
      this._onStateChange.dispatch();

    return `You have drawn ${toLoot} loot card(s).\n`;
  }

  getHand(issuer: Issuer): string {
    this.assertGameStarted();
    const player = this.assertIssuerSecret(issuer);

    const cards = player.hand.cards;
    let result = "Your hand contains the following cards:\n";
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i]!;
      result += `Card ${i + 1}: ${card}\n`;
    }

    return result;
  }
  get monsterSlotsJSON(): string {
    if (!this.turnHandler.isInitialized) {
      return "Game not started";
    }
    const res: MonsterPiles = {
      cards: this.encounters._slots.map((m) => m.map((c) => c!.json)),
    };
    return JSON.stringify(res);
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
    if (index < 1 || index > inPlayCards.length) {
      throw new Error("Invalid card position.");
    }
    const discardedCard: Card = inPlayCards[index - 1]!;
    if (player.removeInPlayByIndex(index - 1)) {
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
    for (const p of this.players)
    {
      if (p !== player) {
        if (p.inPlay.includes(target)) {
          p.inPlay.splice(p.inPlay.indexOf(target), 1);
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
    this.destroyedCards.push(card);
    owner.removeInPlay(card);
    this.gainTreasure(owner);
  }

  mustAttackMonster(player: Player): any | null {
    if (player.isDead)
      player.mustAttackMonster = null;
    if (player.mustAttackMonster !== null) {
      if(this.monsters.includes(player.mustAttackMonster)){
        return player.mustAttackMonster;
      } else {
        player.mustAttackMonster = null;
      }
    }
    return null;
  }
  discardMonster(issuer: Issuer, position: number): string {
    this.assertGameStarted();
    const player = this.assertIssuerSecret(issuer);
    this.assertPlayerIsAlive(player);
    this.assertPositiveNumber(position);

    if (position < 1 || position > this.encounters._slots.length) {
      throw new Error("Invalid monster position.");
    }

    this.encounters.discardTop(position - 1);

    return `You have discarded the monster at position ${position}.\n`;
  }
  kill(issuer: Issuer, entity: Entity, usingCard: Card): void {
    this.assertGameStarted();
    const player = this.assertIssuerSecret(issuer);
    this.death(entity, player, usingCard);
  }

  discardInPlayByCard(player: Player, card: Card): void {
    const index = player.inPlay.indexOf(card);
    if (index >= 0) {
      player.inPlay.splice(index, 1);
    }
  }

  drawMonster(issuer: Issuer, position: number): string {
    this.assertGameStarted();
    const player = this.assertIssuerSecret(issuer);
    this.assertPlayerIsAlive(player);
    this.assertPositiveNumber(position);

    if (position < 1 || position > this.encounters._slots.length) {
      throw new Error("Invalid monster position.");
    }

    this.encounters.draw(position - 1);

    return `You have drawn a new monster at position ${position}.\n`;
  }
  killMonster(issuer: Issuer, position: number): string {
    this.assertGameStarted();
    const player = this.assertIssuerSecret(issuer);
    this.assertPlayerIsAlive(player);
    this.assertPositiveNumber(position);

    if (position < 1 || position > this.encounters._slots.length) {
      throw new Error("Invalid monster position.");
    }
    const monsterPosition = this.encounters._slots[position - 1]!;
    const monsterCard: Card = monsterPosition[monsterPosition.length - 1]!;
    if (monsterCard.soul > 0) player.addSoul(monsterCard);
    else this.encounters.discardTop(position - 1);
    return `You have killed the monster at position ${position}.\n`;
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

  discardFromHand(issuer: Issuer, position: number): string {
    this.assertGameStarted();
    const player = this.assertIssuerSecret(issuer);
    this.assertPositiveNumber(position);

    const hand = player.hand;
    if (position < 1 || position > hand.cards.length) {
      return "Invalid card position.";
    }

    const discardedCard: LootCard = hand.cards[position - 1] as LootCard;
    this.removeCardFromHand(player, discardedCard);
    const lootDeck: Deck = this.decks["loot"]!;
    lootDeck.addDiscardTop(discardedCard);

    return `You have discarded the card: ${discardedCard.name}.\n`;
  }

  getDiscard(deckType: string): string {
    try {
      this.assertGameStarted();
    } catch {
      return "Game not started";
    }

    const deck: Deck = this.decks[deckType]!;
    if (!deck) {
      throw new Error("Invalid deck type.");
    }
    const discardCards: DiscardCards = {
      cards: deck.discard.map((c) => c!.json),
    };
    return JSON.stringify(discardCards);
  }

  loseCoins(issuer: Issuer, coins: number, asMany: boolean): number {
    this.assertGameStarted();
    const player = this.assertIssuerSecret(issuer);
    this.assertPositiveNumber(coins);

    const coinLost = player.loseCoins(coins, asMany);
    this.emitter.emit("on:coin:lost:after", { eventIssuer: player, coinLost });

    return coinLost;
  }

  rollDice(issuer: Issuer, attackRoll: boolean): DiceRoll {
    this.assertGameStarted();
    const player = this.assertIssuerSecret(issuer);
    if (attackRoll) this.assertPlayerIsAlive(player);

    let diceRoll = player.rollDice(attackRoll);
    this.stack.push(diceRoll);
    this.emitter.emit("on:dice:would-roll", { eventIssuer: player, diceRoll });
    return diceRoll;
  }

  resolveDiceRoll(diceRoll: DiceRoll): void {
    diceRoll.onResolve();
    this.emitter.emit("on:dice:rolled", { diceRoll });
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

  private findWinningPlayer(): Player | null {
    const playerWithMostPoints = this.players.reduce(
      (max, p) => (p.score > max.score ? p : max),
      this.players[0]!
    );
    if (this.monsters.length === 0 || playerWithMostPoints.score >= 4) {
      return playerWithMostPoints;
    }
    return null;
  }

  private assertCurrentTurnIsPlayerTurn(player: Player): void {
    if (this.currentPlayer !== player) {
      throw new Error("Not your turn");
    }
  }

  private assertPlayerIdAvailable(id: string): void {
    if (this.players.some((p) => p.id === id)) {
      throw new Error(`Player ${id} already exists`);
    }
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
      throw new Error("An attack is already ongoing");
    }
  }

  private assertForcedAttackSatisfied(player: Player): void {
    // Check if there's a forced attack constraint
    if (player.mustAttackMonster === null) {
      return; // No constraint, all good
    }
    
    // Check if player is dead - constraint doesn't apply
    if (player.isDead) {
      player.mustAttackMonster = null;
      return;
    }
    
    // Check if monster is still in play ("if able")
    const monsterStillInPlay = this.monsters.includes(player.mustAttackMonster);
    if (!monsterStillInPlay) {
      player.mustAttackMonster = null; // Monster gone, constraint lifted
      return;
    }
    
    // Monster is still there and player is alive - constraint must be satisfied
    throw new Error("You must attack the chosen monster before ending your turn");
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
