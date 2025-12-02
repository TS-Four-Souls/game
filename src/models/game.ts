import type { Monster } from "@/models/monster";
import type { Player } from "@/models/player";
import type { Issuer } from "@/types";
import { loadCards } from '@/utils/loadCards';
import { Card, CardSet, Deck, Hand, LoadsCardSets, LoadDecks, randomCardFromSet, isSameSlug } from "@/models/cards";
import { Shop, Encounters } from "@/models/slots";

const cards = await loadCards();
const cardSets: { [key: string]: CardSet } = LoadsCardSets(cards);

const defaultParameters = {"nbItemsInShop": 2, "nbEncounters": 2};
export class Game {
  private players: Player[] = [];
  private monsters: Monster[] = [];
  private turnIndex: number | null = null;
  private decks: {[key: string]: any} = {};
  private ongoingAttack: { player: Player; monster: Monster } | null = null;
  private shop!: Shop;
  private encounters!: Encounters;

  constructor() {}

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
    if(this.turnIndex !== null){
    result += `Monsters:\n`;
    let i:number = 0;
    result += ` |- ${i++} top deck\n`;
    result +=
      this.encounters._slots
        .map(
          (m) =>
            ` |- ${i++} ${m[m.length - 1]!.name}`
        )
        .join("\n") + "\n\n";
    result += `Shop:\n`;
    i = 0;
    result += ` |- ${i++} top deck\n`;
    result +=
      this.shop._slots
        .map(
          (m) =>
            ` |- ${i++} ${m!.name}`
        )
        .join("\n") + "\n\n";
      }
    result += this.turnIndex === null ? "Game not started\n" : "Game started\n";
    if (this.turnIndex !== null) {
      result += `It's ${this.players[this.turnIndex]!.id}'s turn\n`;
    }

    return result;
  }

  addPlayer(newPlayer: Player): void {
    this.assertPlayerIdAvailable(newPlayer.id);
    this.assertGameNotStarted();
    this.players.push(newPlayer);
  }

  addMonster(monster: Monster): void {
    this.assertMonsterIdAvailable(monster.id);
    this.monsters.push(monster);
  }

  start(issuer: Issuer): void {
    this.assertIssuerSecret(issuer);
    this.assertGameNotStarted();
    this.assertMinimumPlayerCount();
    this.decks = LoadDecks(cardSets, this.players.length);
    this.assignCharactersToPlayers();
    this.healEveryone();
    this.shop = new Shop(defaultParameters.nbItemsInShop, this.decks["treasure"]);
    this.encounters = new Encounters(defaultParameters.nbEncounters, this.decks["monster"]);
    this.turnIndex = 0;
  }

  assignCharactersToPlayers(): void {
    const characterDeck = this.decks["character"];
    if (!characterDeck) {
      throw new Error("No character deck found");
    }
    this.players.forEach((player) => {
      const characterCard = characterDeck.draw();
      console.log("Assigning character", characterCard.name, "to player", player.id);
      player.addInPlay(characterCard);
      if (characterCard.eternalCard){
        const cardName = characterCard.eternalCard;
        const cards = this.decks["eternal"].getCards((card: Card) => isSameSlug(cardName, card));
        if(cards.length > 1){
          throw new Error("Multiple eternal cards with the same slug found");
        }
        if(cards.length === 0){
          throw new Error("No eternal card with slug "+ cardName + " found");
        }
        player.addInPlay(cards[0]!);
      }
    });
  }
  reset(issuer: Issuer): void {
    this.assertIssuerSecret(issuer);
    this.turnIndex = null;
    this.players = [];
    this.monsters = [];
  }

  nextTurn(issuer: Issuer): string {
    const turnIndex = this.assertGameStarted();
    const player = this.assertIssuerSecret(issuer);
    this.assertCurrentTurnIsPlayerTurn(player);
    this.assertNoOngoingAttack();
    this.healEveryone();

    const winningPlayer = this.findWinningPlayer();
    if (winningPlayer) {
      console.log(
        "Game over",
        winningPlayer.id,
        "wins with",
        winningPlayer.score,
        "points"
      );
      this.turnIndex = null;
      return `Game over, ${winningPlayer.id} wins with ${winningPlayer.score} points`;
    } else {
      console.log(turnIndex);
      this.turnIndex = (turnIndex + 1) % this.players.length;
      return `It's ${this.players[this.turnIndex]!.id}'s turn`;
    }
  }

  gainCoins(issuer: Issuer, coins: number): string {
    this.assertGameStarted();
    const player = this.assertIssuerSecret(issuer);
    this.assertPlayerIsAlive(player);
    this.assertPositiveNumber(coins);

    player.addCoins(coins);
    
    return `New amount of coins: ${player.coins} coins.\n`;
  }

  gainTreasure(issuer: Issuer): string {
    this.assertGameStarted();
    const player = this.assertIssuerSecret(issuer);
    this.assertPlayerIsAlive(player);

    const treasureDeck: Deck = this.decks["treasure"];
    const drawnCard: Card = treasureDeck.draw()!;
    player.addInPlay(drawnCard);
    return `You have drawn the treasure card: ${drawnCard.name}.\nDescription: ${drawnCard}\n`;
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
    if (this.turnIndex !== null) {
      result += `Monsters:\n`;
      i = 0;
      result += ` |- ${i++} top deck\n`;
      result +=
        this.encounters._slots
          .map(
            (m) =>
              ` |- ${i++} ${m[m.length - 1]!}`
          )
          .join("\n") + "\n\n";
      result += `Shop:\n`;
      i = 0;
      result += ` |- ${i++} top deck\n`;
      result +=
        this.shop._slots
          .map(
            (m) =>
              ` |- ${i++} ${m!}`
          )
          .join("\n") + "\n\n";
    }
    if (this.turnIndex !== null) {
      result += `It's ${this.players[this.turnIndex]!.id}'s turn\n`;
    }
    return result;
  }

  purchase(issuer: Issuer, index: number): string {
    this.assertGameStarted();
    const player = this.assertIssuerSecret(issuer);
    this.assertPlayerIsAlive(player);
    this.assertPositiveNumber(index);

    if(this.shop.purchase(player, index)) {
      return `Purchase successful. You have now ${player.coins} coins.\n`;
    } else {
      return `Purchase failed. You still have ${player.coins} coins.\n`;
    }
  }
  loot(issuer: Issuer): string {
    this.assertGameStarted();
    const player = this.assertIssuerSecret(issuer);
    this.assertPlayerIsAlive(player);
    
    const lootDeck: Deck = this.decks["loot"];
    const drawnCard: Card = lootDeck.draw()!;
    player.hand.addToHand(drawnCard);

    return `You have drawn the loot card: ${drawnCard.name}.\nDescription: ${drawnCard}\n`;

  }

  getHand(issuer: Issuer): string {
    this.assertGameStarted();
    const player = this.assertIssuerSecret(issuer);

    const cards = player.hand.cards;
    let result = 'Your hand contains the following cards:\n';
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i]!;
      result += `Card ${i + 1}: ${card}\n`;
    }

    return result;
  }
  
  getInPlay(issuer: Issuer): string {
    this.assertGameStarted();
    const player = this.assertIssuerSecret(issuer);

    const cards = player.inPlay;
    let result = 'Your in-play area contains the following cards:\n';
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
    if(index < 1 || index > inPlayCards.length) {
      throw new Error("Invalid card position.");
    }
    const discardedCard: Card = inPlayCards[index - 1]!;
    if(player.discardInPlay(index - 1)) {
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

    if(position < 1 || position > this.encounters._slots.length) {
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

    if(position < 1 || position > this.encounters._slots.length) {
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

    if(position < 1 || position > this.encounters._slots.length) {
      throw new Error("Invalid monster position.");
    }
    const monsterPosition = this.encounters._slots[position - 1]!;
    const monsterCard: Card = monsterPosition[monsterPosition.length - 1]!;
    this.encounters.discardTop(position - 1);

    return `You have killed the monster at position ${position}.\n`;
  }
  discardFromHand(issuer: Issuer, position: number): string {
    this.assertGameStarted();
    const player = this.assertIssuerSecret(issuer);
    this.assertPlayerIsAlive(player);
    this.assertPositiveNumber(position);

    const hand = player.hand;
    if(position < 1 || position > hand.cards.length) {
      throw new Error("Invalid card position.");
    }

    const discardedCard: Card = hand.removeFromHand(position - 1);
    const lootDeck: Deck = this.decks["loot"];
    lootDeck.addDiscardTop(discardedCard);

    return `You have discarded the card: ${discardedCard.name}.\n`;
  }

  getDiscard(issuer: Issuer, deckType: string): string {
    this.assertGameStarted();
    this.assertIssuerSecret(issuer);

    const deck: Deck = this.decks[deckType];
    if(!deck) {
      throw new Error("Invalid deck type.");
    }
    
    const discardCards = deck.discard;
    let result = `The discard pile for the ${deckType} deck contains the following cards:\n`;
    for (let i = 0; i < discardCards.length; i++) {
      const card = discardCards[i]!;
      result += `Card ${i + 1}: ${card}\n`;
    }

    return result;
  }

  loseCoins(issuer: Issuer, coins: number, asMany: boolean): string {
    this.assertGameStarted();
    const player = this.assertIssuerSecret(issuer);
    this.assertPlayerIsAlive(player);
    this.assertPositiveNumber(coins);

    let success = player.loseCoins(coins, asMany);
    if(success){
      return `Success.\nNew amount of coins: ${player.coins} coins.\n`;
    }
    else if(!asMany){
      return `Fail.\nTransaction canceled.`;
    }
    return `Fail.\nPlayer has now ${player.coins} coins.`;
  }

  rollDice(issuer: Issuer): string {
    this.assertGameStarted();
    const player = this.assertIssuerSecret(issuer);
    this.assertPlayerIsAlive(player);
    let diceRoll = player.rollDice();
    return `You rolled a ${diceRoll}.`;
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

    const attackRoll = player.rollDice();
    if (attackRoll < monster.evasionPoints) {
      player.receiveDamage(monster.attackPoints);
      result += `You attack ${monster.id} with a roll of ${attackRoll}. You lose ${monster.attackPoints} HP\n`;
    } else {
      monster.receiveDamage(player.attackPoints);
      result += `You attack ${monster.id} with a roll of ${attackRoll}. The monster loses ${player.attackPoints} HP\n`;
    }

    if (player.isDead) {
      result += `You are dead\n`;
      this.ongoingAttack = null;
    } else if (monster.isDead) {
      result += `${monster.id} is dead, ${player.id} gains ${monster.rewardPoints} Souls\n`;
      player.addScore(monster.rewardPoints);
      this.removeMonster(monster);
      this.ongoingAttack = null;
    } else {
      result += `You can attack again\n`;
      this.ongoingAttack = { player, monster };
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
    if (this.turnIndex !== this.findPlayerIndex(player.id)) {
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
    if (this.turnIndex !== null) {
      throw new Error("Game already started");
    }
  }

  private assertGameStarted(): number {
    if (this.turnIndex === null) {
      throw new Error("Game not started");
    }
    return this.turnIndex;
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
    if(nb < 0) {
      throw new Error("Number is negative.");
    }
  }

  private assertNoOngoingAttack(): void {
    if (this.ongoingAttack !== null) {
      throw new Error("An attack is already ongoing");
    }
  }

  private assertNoOtherOngoingAttack(player: Player, monster: Monster): void {
    if (this.ongoingAttack === null) return;
    if (
      this.ongoingAttack.player.id !== player.id ||
      this.ongoingAttack.monster.id !== monster.id
    ) {
      throw new Error("An attack is already ongoing");
    }
  }
}
