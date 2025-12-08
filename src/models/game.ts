import type { Monster } from "@/models/monster";
import type { Player } from "@/models/player";
import type { DetailedState, DiscardCards, Issuer, MonsterPiles, State } from "@/types";
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
  LootCard,
} from "@/models/cards";
import { Stack, type StackElement } from "@/models/stack";
import { Shop, Encounters } from "@/models/slots";
import { ItemCard } from "@/models/cards";

import { TurnHandler } from "./turnHandler";

export const cards = await loadCards(process.cwd() + "/data/cards");
const cardSets: { [key: string]: CardSet } = LoadsCardSets(cards);

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

  constructor() {}

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
  get monsters(): Monster[] {
    return this._monsters;
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
    result += this.turnHandler.isInitialized ? "Game started\n" : "Game not started\n";
    if (this.turnHandler.isInitialized) {
      result += `It's ${this.currentPlayer.id}'s turn\n`;
    }

    return result;
  }

  get currentPlayer(): Player {
    return this.currentPlayer;
  }

  get inPlayItems(): {player: Player, card: ItemCard}[] {
    const items: {player: Player, card: ItemCard}[] = [];
    for (const player of this.players) {
      for (const card of player.inPlay) {
        if (card instanceof ItemCard) {
          items.push({ player, card });
        }
      }
    }
    return items;
  }

  get visibleItems(): ItemCard[] {
    let result: ItemCard[] = this.inPlayItems.map(({ card }) => card);
    result.push(...this.shop._slots.filter((c): c is ItemCard => c instanceof ItemCard));
    return result;
  }

  addPlayer(newPlayer: Player): void {
    this.assertPlayerIdAvailable(newPlayer.id);
    this.assertGameNotStarted();
    this.players.push(newPlayer);
  }

  select(player: Player, n: number, Options: any[], anyNumber: boolean = false): { "selected": any[], "remaining": any[]} {
// TODO: implement player choice
    return { "selected": Options.slice(0, n), "remaining": Options.slice(n) };
  }

  get monsterSlots(): Encounters {
    return this.encounters;
  }
  get playersWithMostSouls(): Player[] {
    let maxSouls = Math.max(...this.players.map(player => player.totalSouls));
    return this.players.filter(player => player.totalSouls === maxSouls);
  }
  addToStack(item: StackElement): void {
    this.stack.push(item);
  }

  resolveStack() {
    // let elem = this.stack.resolve();
    // if (elem !== undefined) elem.onResolve();
  }

  cancelStack(): void {
    this.stack.cancel();
  }

  isTopStackNumber(): boolean {
    return this.stack.isTopElementNumber();
  }

  resetStack(): void {
    this.stack.clear();
  }

  allHands(): {player: Player, hand: Hand }[] {
    return this.players.map((player) => ({ player, hand: player.hand }));
  }

  addMonster(monster: Monster): void {
    this.assertMonsterIdAvailable(monster.id);
    this.monsters.push(monster);
  }

  endTurn(): void {
    const player = this.assertIssuerSecret(this.currentPlayer);
    this.assertCurrentTurnIsPlayerTurn(player);
    this.assertNoOngoingAttack();
    this.healEveryone();

    this.turnHandler.endTurn();
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
    // playedCard.onPlay(player);
    // this.addToStack(playedCard);
    player.addInPlay(playedCard);

    return `You have played the card: ${playedCard.name} to your in-play area.\n`;
  }

  start(issuer: Issuer): void {
    this.assertIssuerSecret(issuer);
    this.assertGameNotStarted();
    this.assertMinimumPlayerCount();

this.turnHandler.initialize(this.players);
    this._decks = LoadDecks(cardSets, this.players.length);
    this.assignCharactersToPlayers();
    this.healEveryone();
    this._shop = new Shop(
      defaultParameters.nbItemsInShop,
      this.decks["treasure"]!
    );
    this._encounters = new Encounters(
      defaultParameters.nbEncounters,
      this.decks["monster"]!
    );
  }

  assignCharactersToPlayers(): void {
    const characterDeck = this.decks["character"];
    if (!characterDeck) {
      throw new Error("No character deck found");
    }
    this.players.forEach((player) => {
      const character: CharacterCard = characterDeck.draw() as CharacterCard;
      console.log(
        "Assigning character",
        character.name,
        "to player",
        player.id
      );
      player.addInPlay(character);
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
          throw new Error("No eternal card with slug " + cardName + " found");
        }
        player.addInPlay(cards[0]!);
      }
    });
  }
  reset(issuer: Issuer): void {
    this.assertIssuerSecret(issuer);
    this.turnHandler.reset();
    this._players = [];
    this._monsters = [];
    this._decks = {};
    this._ongoingAttack = null;
    this._shop = null!;
    this._encounters = null!;
    this._stack.clear();
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

  gainCoins(issuer: Issuer, coins: number): string {
    this.assertGameStarted();
    const player = this.assertIssuerSecret(issuer);
    this.assertPlayerIsAlive(player);
    this.assertPositiveNumber(coins);

    player.gainCoins(coins);

    return `New amount of coins: ${player.coins} coins.\n`;
  }

  getFirstCardsOfDeck(deckName: string, number: number): Card[]{
    return this.decks[deckName]!.drawSeveral(number);
  }
  addTopPosition(deckName: string, card: Card): void{
    this.decks[deckName]!.addTopPosition(card);
  }
  addBottomPosition(deckName: string, card: Card): void{
    this.decks[deckName]!.addBottomPosition(card);
  }

  addExtraTurn(player: Player): void {
    this.turnHandler.InsertPlayerAtNextTurn(player);
  }

  gainTreasure(issuer: Issuer, number: number=1): string {
    this.assertGameStarted();
    const player = this.assertIssuerSecret(issuer);
    this.assertPlayerIsAlive(player);
    this.assertPositiveNumber(number);

    for(let i=0; i<number; i++){
    const treasureDeck: Deck = this.decks["treasure"]!;
    const drawnCard: Card = treasureDeck.draw()!;
    player.addInPlay(drawnCard);
    }

    return `You have drawn ${number} treasure card(s).\n`;
  }
  destroyCards(cards: Card[]): void {
    cards.forEach((card) => {
      this.players.forEach((player) => {
        player.removeInPlay(card);
      });
    });
    this.destroyedCards.push(...cards);
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
        coins: player.coins
      }
    , players: this.players.map((p) => ({
        name: p.id,
        handSize: p.hand.cards.length,
        inPlay: p.inPlay.map((c) => c.json),
        souls: p.souls.map((c) => c.json),
        coins: p.coins
      }))
      , topDiscards: {
        loot: this.decks["loot"]!.discard[0] ? this.decks["loot"]!.discard[0]!.json : undefined,
        treasure: this.decks["treasure"]!.discard[0] ? this.decks["treasure"]!.discard[0]!.json : undefined,
        monster: this.decks["monster"]!.discard[0] ? this.decks["monster"]!.discard[0]!.json : undefined,
      }
    , monsters: this.encounters._slots.map((m) =>  m[m.length - 1]!.json),
      shop: this.shop._slots.map((m) => m!.json),
      turn: this.currentPlayer.id,
    }

    return JSON.stringify(res);
  }

  purchase(issuer: Issuer, index: number): string {
    this.assertGameStarted();
    const player = this.assertIssuerSecret(issuer);
    this.assertPlayerIsAlive(player);
    this.assertPositiveNumber(index);

    if (this.shop.purchase(player, index)) {
      return `Purchase successful. You have now ${player.coins} coins.\n`;
    } else {
      return `Purchase failed. You still have ${player.coins} coins.\n`;
    }
  }
  loot(issuer: Issuer, number: number=1): string {
    this.assertGameStarted();
    const player = this.assertIssuerSecret(issuer);
    this.assertPlayerIsAlive(player);
    this.assertPositiveNumber(number);

    const lootDeck: Deck = this.decks["loot"]!;
    for(let i=0; i<number; i++){
    const drawnCard: Card = lootDeck.draw()!;
      player.hand.addToHand(drawnCard);
    }

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
    const res:MonsterPiles = {
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
    if(monsterCard.soul > 0)
      player.addSoul(monsterCard);
    else
      this.encounters.discardTop(position - 1);
    return `You have killed the monster at position ${position}.\n`;
  }
  discardFromHand(issuer: Issuer, position: number): string {
    this.assertGameStarted();
    const player = this.assertIssuerSecret(issuer);
    this.assertPlayerIsAlive(player);
    this.assertPositiveNumber(position);

    const hand = player.hand;
    if (position < 1 || position > hand.cards.length) {
      throw new Error("Invalid card position.");
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
    const discardCards:DiscardCards = {cards: deck.discard.map((c) => c!.json)};
    return JSON.stringify(discardCards);
  }

  loseCoins(issuer: Issuer, coins: number, asMany: boolean): string {
    this.assertGameStarted();
    const player = this.assertIssuerSecret(issuer);
    this.assertPlayerIsAlive(player);
    this.assertPositiveNumber(coins);

    let lostCoins = player.loseCoins(coins, asMany);
    if (lostCoins === coins) {
      return `Success.\nNew amount of coins: ${player.coins} coins.\n`;
    } else if (!asMany) {
      return `Fail.\nTransaction canceled.`;
    }
    return `Fail.\nPlayer has now ${player.coins} coins.`;
  }

  rollDice(issuer: Issuer): string {
    this.assertGameStarted();
    const player = this.assertIssuerSecret(issuer);
    this.assertPlayerIsAlive(player);

    let diceRoll = player.rollDice();
    this.stack.push(diceRoll);
    return `You rolled a ${diceRoll.value}.`;
  }

  attack(issuer: Issuer, monsterId: string): string {
    this.assertGameStarted();
    const player = this.assertIssuerSecret(issuer);
    this.assertCurrentTurnIsPlayerTurn(player);
    this.assertPlayerIsAlive(player);
    const monster = this.findMonsterById(monsterId);
    this.assertMonsterIsAlive(monster);
    this.assertNoOtherOngoingAttack(player, monster);

    let result = "Starting stats:\n";

    result += `You: ${player.currentHealthPoints} HP, ${player.attackPoints} ATK, ${player.score} Souls\n`;
    result += `${monster.id}: ${monster.currentHealthPoints} HP, ${monster.attackPoints} ATK, ${monster.evasionPoints}+ DC, +${monster.rewardPoints} Souls\n\n`;

    const attackRoll = player.rollDice().value;
    if (attackRoll < monster.evasionPoints) {
      player.receiveDamage(monster.attackPoints);
      result += `You attack ${monster.id} with a roll of ${attackRoll}. You lose ${monster.attackPoints} HP\n`;
    } else {
      monster.receiveDamage(player.attackPoints);
      result += `You attack ${monster.id} with a roll of ${attackRoll}. The monster loses ${player.attackPoints} HP\n`;
    }

    if (player.isDead) {
      result += `You are dead\n`;
      this._ongoingAttack = null;
    } else if (monster.isDead) {
      result += `${monster.id} is dead, ${player.id} gains ${monster.rewardPoints} Souls\n`;
      player.addScore(monster.rewardPoints);
      this.removeMonster(monster);
      this._ongoingAttack = null;
    } else {
      result += `You can attack again\n`;
      this._ongoingAttack = { player, monster };
    }

    result += "\nEnding stats:\n";
    result += `You: ${player.currentHealthPoints} HP, ${player.attackPoints} ATK, ${player.score} Souls\n`;
    result += `${monster.id}: ${monster.currentHealthPoints} HP, ${monster.attackPoints} ATK, ${monster.evasionPoints}+ DC, +${monster.rewardPoints} Souls\n\n`;

    return result;
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

  private assertMonsterIdAvailable(id: string): void {
    if (this.monsters.some((m) => m.id === id)) {
      throw new Error(`Monster ${id} already exists`);
    }
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
