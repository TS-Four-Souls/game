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
  InplayType,
  treasureCard,
} from "@/models/cards";
import { type Ability } from "./abilityRegistry";
import { Stack, type StackElement } from "@/models/stack";
import {
  effectParser,
  getAttackRollEffect,
  targetSelectorParser,
} from "@/models/effect";
import { Shop, Encounters } from "@/models/slots";
import { Entity } from "@/models/entity";
import { TurnHandler } from "./turnHandler";
import { type ReadableSignal, Signal } from "micro-signals";
import { GameEventEmitter } from "./eventEmmitter";
import { AbilityRegistry } from "./abilityRegistry";
import { preventNextDamageUpToEffect } from "@/models/abilities";

const LOG_GAME = false;
export const cards = await loadCards(process.cwd() + "/data/cards");
const cardSets: { [key: string]: CardSet } = LoadsCardSets(cards);

// for(const card of cardSets["loot"]!.cards.toSorted((a, b) => a.slug.localeCompare(b.slug))){
//   if((card as LootCard).trinket)
//     console.log(card.slug);
// }
const defaultParameters = { nbItemsInShop: 2, nbEncounters: 2 };
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
  private _abilityRegistry: AbilityRegistry;

  private _onStateChange: Signal<void> = new Signal();
  onStateChange: ReadableSignal<void> = this._onStateChange.readOnly();

  constructor() {
    this._emitter = new GameEventEmitter();
    this._abilityRegistry = new AbilityRegistry(this._emitter);
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
  get abilityRegistry(): AbilityRegistry {
    return this._abilityRegistry;
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
    p.loseCoins(2, true);
    const itemToLose = this.select(
      p,
      1,
      p.inPlay.filter((c) => c.eternal === false)
    ).selected[0];
    if (itemToLose) {
      this.removeInPlay(p, itemToLose);
      this.decks[itemToLose.type]!.addDiscardTop(itemToLose);
    }
    const lootToLose = this.select(p, 1, p.hand.cards).selected[0];
    if (lootToLose) {
      this.discardFromHand(p, p.hand._hand.indexOf(lootToLose));
      p.hand.removeCard(lootToLose);
      this.decks[lootToLose.type]!.addDiscardTop(lootToLose);
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
      this.deathPenalty(receiver);
    } else if (receiver instanceof Monster) {
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
    if (player.isEngagedInCombat || player.attackThisTurn === 0) {
      player.attackThisTurn -= 1;
      player.engageInCombat();
      this.emitter.emit("on:attack:declared", { eventIssuer: player });
    }
  }

  declareAttackOnMonster(player: Player, monster: Monster): void {
    if (player.isEngagedInCombat) {
      monster.engageInCombat();
    }
  }

  attackRoll(player: Player, monster: Monster): void {
    const damageDealt = [player.attackPoints];
    const damageReceived = [monster.attackPoints];
    const evasion = [monster.evasion];
    this.emitter.emit("on:attack:roll", {
      eventIssuer: player,
      target: monster,
      damageDealt,
      damageReceived,
      evasion,
    });
    if (player.attackRollThisTurn === 0)
      this.emitter.emit("on:attack:roll:first-time-each-turn", {
        eventIssuer: player,
        target: monster,
        damageDealt,
        damageReceived,
        evasion,
      });

    const dice = this.rollDice(player, true);
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
        eventIssuer: receiver,
        target: dealer,
        abilityCard: usingAbilityFrom,
        damage,
      });
    } else if (receiver instanceof Monster) {
      this.emitter.emit("on:combatdamage:dealt:to-monster", {
        eventIssuer: receiver,
        target: dealer,
        abilityCard: usingAbilityFrom,
        damage,
      });
    }
  }

  resolveDamage(
    dealer: Entity,
    receiver: Entity,
    usingAbilityFrom: Card,
    damage: number
  ): void {
    receiver.receiveDamage(damage);

    this.emitter.emit("on:damage:taken", {
      eventIssuer: receiver,
      target: dealer,
      abilityCard: usingAbilityFrom,
      damage: damage,
    });
    this.emitter.emit("on:damage:taken:first-time-each-turn", {
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
    callback?: (it: Card, issuer: Player, targets: any[]) => boolean
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
      damageOnStack.attachEffect(callback, usingAbilityFrom, []);
    }
    this.addToStack(damageOnStack);

    this.emitter.emit("on:damage:would-take", {
      eventIssuer: receiver,
      target: dealer,
      abilityCard: usingAbilityFrom,
      damageArray: damageArray,
    });
  }

  swapItems(item1: ItemCard, item2: ItemCard): void {
    const owner1 = this.getOwner(item1);
    const owner2 = this.getOwner(item2);
    if (owner1 && owner2) {
      owner1.removeInPlay(item1);
      owner2.removeInPlay(item2);
      owner1.addInPlay(item2);
      owner2.addInPlay(item1);
    }
  }

  addPlayer(newPlayer: Player): void {
    this.assertPlayerIdAvailable(newPlayer.id);
    this.assertGameNotStarted();
    this.players.push(newPlayer);
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
    if (elem instanceof LootCard) elem.onResolve();
    else if (elem instanceof DiceRoll) this.resolveDiceRoll(elem);
    else if (elem instanceof DeathOnStack) elem.onResolve();
    else if (elem instanceof DamageOnStack) elem.onResolve();
    this._onStateChange.dispatch();
  }

  cancelStack(): void {
    this.stack.cancel();
  }

  cancelPreviousNonRoll(): void {
    this.stack.cancelPreviousNonRoll();
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
      if (p === this.currentPlayer) {
        p.remainingLootPlay = 1;
      }
    });
    const player = this.currentPlayer;
    this.emitter.emit("on:turn:start", { eventIssuer: player });
    this.lootStep();
    this.emitter.emit("on:your:turn", { eventIssuer: player });
  }

  endTurn(): void {
    const player = this.assertIssuerSecret(this.currentPlayer);
    this.assertCurrentTurnIsPlayerTurn(player);
    this.assertNoOngoingAttack();
    this.healEveryone();
    this.emitter.emit("on:turn:end", { eventIssuer: player });
    for (const player of this.players) {
      player.resetTurnFlags();
    }
    this.turnHandler.endTurn();
    this.startTurn();
  }

  // temporary method to play a card from hand to in-play area.
  playCard(issuer: Issuer, index: number): string {
    this.assertGameStarted();
    const player = this.assertIssuerSecret(issuer);
    this.assertPlayerIsAlive(player);
    this.assertPositiveNumber(index);
    if (index < 1 || index > player.hand.cards.length) {
      return "Invalid card position.";
    }
    const playedCard: LootCard = player.hand.playCard(index - 1) as LootCard;
    playedCard.onPlay(player);
    this.addToStack(playedCard);
    // this.addInPlay(player, playedCard);

    this._onStateChange.dispatch();

    return `You have played the card: ${playedCard.name} to your in-play area.\n`;
  }

  start(issuer: Issuer): void {
    this.assertIssuerSecret(issuer);
    this.assertGameNotStarted();
    this.assertMinimumPlayerCount();

    this.turnHandler.initialize(this.players);
    this._decks = LoadDecks(cardSets, this.players.length);
    this.joinEffectsToCards();
    this.assignCharactersToPlayers();
    this._shop = new Shop(
      defaultParameters.nbItemsInShop,
      this.decks["treasure"]!
    );
    this._encounters = new Encounters(
      defaultParameters.nbEncounters,
      this.decks["monster"]!
    );
    this.emitter.emit("on:game:start:before", {});
    this.emitter.emit("on:game:start", {});
    this.healEveryone();
    // this.startTurn();
  }

  assignCharactersToPlayers(): void {
    const characterDeck = this.decks["character"];
    if (!characterDeck) {
      throw new Error("No character deck found");
    }
    this.players.forEach((player) => {
      const character: CharacterCard = characterDeck.draw() as CharacterCard;
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
    player.addInPlay(card);
  }

  activateItem(player: Player, item: ItemCard): boolean {
    if (player.activateItem(item)) {
      this.emitter.emit("on:item:activated", {
        eventIssuer: player,
        item: item,
      });
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
    this._abilityRegistry = new AbilityRegistry(this._emitter);
  }

  nextTurn(issuer: Issuer): string {
    const roundIndex = this.assertGameStarted();
    const player = this.assertIssuerSecret(issuer);
    this.assertCurrentTurnIsPlayerTurn(player);
    this.assertNoOngoingAttack();
    this.healEveryone();

    console.log(roundIndex);
    this.endTurn();
    return `It's ${this.currentPlayer!.id}'s turn. Round ${roundIndex}.\n`;
  }

  private joinEffectsToCards(): void {
    const deck = this.decks["loot"]!;
    deck.cards.forEach((card: Card) => {
      const lootCard = card as LootCard;
      if (!lootCard.effectOutcomes || lootCard.effectOutcomes.length === 0) {
        console.log(
          "WARNING: No effect outcomes for loot card:",
          lootCard.name
        );
      } else {
        lootCard.effect = effectParser(lootCard.effectOutcomes[0]!, this);
        lootCard.targetSelector = targetSelectorParser(
          lootCard.effectOutcomes[0]!,
          this
        );
      }
    });
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

  addAttackDiceModifier(e: Entity, value: number): void {
    e.addDiceModifier(value);
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
  preventDeath(player: Player): void {
    this.stack.cancelPreviousDeath(player);
    if (player.currentHealthPoints === 0) player.addHealthPoints(1);
  }
  gainTreasure(issuer: Issuer, number: number = 1): string {
    this.assertGameStarted();
    const player = this.assertIssuerSecret(issuer);
    this.assertPlayerIsAlive(player);
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
    cards.forEach((card) => {
      this.players.forEach((player) => {
        player.removeInPlay(card);
      });
    });
    this.destroyedCards.push(...cards);
    cards.forEach((card) => {
      this.players.forEach((player) => {
        player.removeSoul(card);
      });
    });
    this.destroyedCards.push(...cards);
    this.emitter.emit("on:item:destroyed", { issuer: null, cards: cards });
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

    console.log(player.attackPoints);

    const res: DetailedState = {
      me: {
        name: player.id,
        hand: player.hand.cards.map((c) => c.json),
        inPlay: player.inPlay.map((c) => c.json),
        souls: player.souls.map((c) => c.json),
        coins: player.coins,
        currentAttackPoints: player.attackPoints,
        currentHealthPoints: player.currentHealthPoints,
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
    };

    return JSON.stringify(res);
  }

  purchase(issuer: Issuer, index: number): string {
    this.assertGameStarted();
    const player = this.assertIssuerSecret(issuer);
    this.assertPlayerIsAlive(player);
    this.assertPositiveNumber(index);
    this.emitter.emit("on:item:purchase", { eventIssuer: player });

    if (this.shop.purchase(player, index)) {
      return `Purchase successful. You have now ${player.coins} coins.\n`;
    } else {
      return `Purchase failed. You still have ${player.coins} coins.\n`;
    }
  }
  loot(issuer: Issuer, number: number = 1): string {
    this.assertGameStarted();
    const player = this.assertIssuerSecret(issuer);
    this.assertPositiveNumber(number);

    const lootDeck: Deck = this.decks["loot"]!;
    for (let i = 0; i < number; i++) {
      const drawnCard: Card = lootDeck.draw()!;
      player.hand.addToHand(drawnCard);
    }

    this._onStateChange.dispatch();

    return `You have drawn ${number} loot card(s).\n`;
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
    this.players.forEach((p) => {
      if (p !== player) {
        if (p.inPlay.includes(target)) {
          p.inPlay.splice(p.inPlay.indexOf(target), 1);
          this.addInPlay(player, target);
          return true;
        }
      }
    });
    return false;
  }
  stealCoins(issuer: Issuer, target: Player, amount: number): string {
    this.assertGameStarted();
    const player = this.assertIssuerSecret(issuer);
    this.assertPlayerIsAlive(player);
    this.assertPositiveNumber(amount);

    const stolenCoins = target.loseCoins(amount, true);
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

    const stolenCard: Card = target.hand.removeFromHandByPos(position);
    player.hand.addToHand(stolenCard);

    return `You have stolen the card: ${stolenCard.name} from ${target.id}.\n`;
  }

  reroll(owner: Player, card: Card): void {
    if (!(card instanceof ItemCard)) {
      throw new Error("Can only reroll with an item card.");
    }
    if (!owner.inPlay.includes(card)) {
      throw new Error("Owner does not have the specified card in play.");
    }
    const treasureDeck: Deck = this.decks["treasure"]!;
    treasureDeck.addDiscardTop(card);
    owner.removeInPlay(card);
    this.gainTreasure(owner);
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
  kill(issuer: Issuer, entity: Entity): void {
    entity.die();
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
    this.assertPlayerIsAlive(player);
    const position = player.hand.cards.indexOf(card);
    this.assertPositiveNumber(position);

    if (position < 0 || position > player.hand.cards.length) {
      throw new Error("Invalid card position.");
    }

    return player.hand.removeFromHandByPos(position - 1);
  }

  discardFromHand(issuer: Issuer, position: number): string {
    this.assertGameStarted();
    const player = this.assertIssuerSecret(issuer);
    this.assertPositiveNumber(position);

    const hand = player.hand;
    if (position < 1 || position > hand.cards.length) {
      return "Invalid card position.";
    }

    const discardedCard: Card = hand.removeFromHandByPos(position - 1);
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
    this.assertPlayerIsAlive(player);
    this.assertPositiveNumber(coins);

    return player.loseCoins(coins, asMany);
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
