import type { SerializedTranslation } from '@/shared/api';
import type { Card, CharacterCard, CounterType, ItemCard, LootCard } from '../cards';
import { Animated } from "../entities/animated";
import type { Entity } from '../entities/entity';
import type { Monster } from '../entities/monster';
import type { Player } from '../entities/player';
import { DeathPenaltyValues } from '../handlers/deathHandler';
import type { DamageSource } from '../handlers/entityHandler';
import type { DeathOnStack, DiceRoll } from '../stackElement';
// ============================================================================
// Event Data Types
// ============================================================================

export type LoseCoinsReason = "paiement" | "purchase" | "effect" | "death" | "gift" | "other";
export type RechargeReason = Card | "rechargeStep" | "other";
/** Data emitted when an entity is about to die (can be prevented) */
export interface OnDeathWouldDeathData {
  eventIssuer: Entity;
  target: Entity;
  source: DamageSource;
  deathOnStack: DeathOnStack;
}

/** Data emitted before death penalty is applied */
export interface OnDeathBeforePenaltyData {
  eventIssuer: Entity;
  target: Entity;
  source: DamageSource;
  values: DeathPenaltyValues;
}

/** Data emitted when death penalty is ongoing (choice is made) */
export interface OnDeathPenaltyData {
  eventIssuer: Entity;
  coinsLost: number;
  itemsLost: ItemCard[];
  lootCardsLost: LootCard[];
}

/** Data emitted after death penalty is applied */
export interface OnDeathAfterPenaltyData {
  eventIssuer: Entity;
  target: Entity;
  source: DamageSource;
}

/** Data emitted when a monster dies */
export interface OnDeathMonsterData {
  eventIssuer: Monster;
  target: Entity;
  source: DamageSource;
  ability?: any;
  rewardGainer: Player;
}

/** Data emitted when an animated object dies */
export interface OnDeathAnimatedData {
  eventIssuer: Animated;
  target: Entity;
  source: DamageSource;
  ability?: any;
}


/** Data emitted when damage has been taken */
export interface OnDamageTakenData {
  eventIssuer: Entity;
  target: Entity;
  source: DamageSource;
  damage: number;
}

/** Data emitted when an entity is about to take damage (can be modified) */
export interface OnDamageWouldTakeData {
  eventIssuer: Entity;
  target: Entity;
  source: DamageSource;
  damageArray: number[];
}

/** Data emitted when combat damage is dealt to a monster */
export interface OnCombatDamageDealtToMonsterData {
  eventIssuer: Entity;
  target: Monster;
  source: DamageSource;
  damage: number;
}

/** Data emitted when combat damage is dealt to a player */
export interface OnCombatDamageDealtToPlayerData {
  eventIssuer: Entity;
  target: Player;
  source: DamageSource;
  damage: number;
}

/** Data emitted when combat damage is dealt to a player */
export interface OnCombatDamageDealtData {
  eventIssuer: Entity;
  target: Entity;
  source: DamageSource;
  damage: number;
}

export interface OnCombatEndData {
  eventIssuer: Entity;
}

export interface OnCardFlippedData {
  eventIssuer: Entity;
  card: Card;
  recto: boolean;
}

/** Data emitted when a player declares an attack */
export interface OnAttackDeclaredData {
  eventIssuer: Player;
}

/** Data emitted when validating whether a player can declare an attack */
export interface OnCanDeclareAttackData {
  eventIssuer: Player;
  canDeclare: boolean[];
  reason: SerializedTranslation[];
}

/** Data emitted when a player declares an attack on a specific monster */
export interface OnAttackDeclaredMonsterData {
  eventIssuer: Player;
  monster: Monster[];
}

/** Data emitted when a player declares an attack on a specific animated object */
export interface OnAttackDeclaredAnimatedData {
  eventIssuer: Player;
  animated: Animated[];
}
/** Data emitted when a player declares an attack on the top deck */
export interface OnAttackDeclaredTopDeckData {
  eventIssuer: Player;
  drawInIndex: number;
}

/** Data emitted when a roll is made */
export interface OnRollData {
  eventIssuer: Player;
  dice: DiceRoll;
}

/** Data emitted when a soul is gained */
export interface OnSoulGainedOrRemovedData {
  eventIssuer: Player;
  soul: Card | null;
}

/** Data emitted when a purchase is successful */
export interface OnPurchaseSuccessData {
  eventIssuer: Player;
  price: number;
  index: number | "top";
}

/** Data emitted before an item is recharged. Note that eventIssuer is always null. */
export interface OnRechargeData {
  eventIssuer: Player | null;
  card: ItemCard;
  reason: RechargeReason;
  shouldRecharge: boolean;
}

/** Data emitted when a player gains items */
export interface OnCardDiscardBeforeData {
  eventIssuer: Player;
  card: Card | null;
}

/** Data emitted when a player gains items */
export interface OnItemGainedData {
  eventIssuer: Player;
  amount: number;
}

/** Data emitted when a player would have to discard loot cards (can be modified) */
export interface OnLootWouldDiscardData {
  eventIssuer: Player;
  indice: number[];
  reason: "death" | "effect" | "overload" | "other";
}

/** Data emitted when a player gains coins */
export interface OnCoinGainedData {
  eventIssuer: Player;
  coinGained: number[];
  source: Card | "gift";
}

/** Data emitted after a player loses coins */
export interface OnCoinLostAfterData {
  eventIssuer: Player;
  coinLost: number;
}

/** Data emitted lose a player loses coins */
export interface OnCoinsLostBeforeData {
  eventIssuer: Player;
  coinToLose: number;
  reason: LoseCoinsReason;
}

/** Data emitted when a dice is rolled */
export interface OnDiceBeingRolledData {
  diceRoll: DiceRoll;
  eventIssuer: Player;
}

/** Data emitted when a dice is resolved */
export interface OnDiceResolvedData {
  diceRoll: DiceRoll;
  eventIssuer: Player;
}

/** Data emitted before a dice would be rolled (can be modified) */
export interface OnDiceWouldRollData {
  eventIssuer: Player;
  diceRoll: DiceRoll;
}

/** Data emitted at the start of a player's turn */
export interface OnTurnStartData {
  eventIssuer: Player;
}

/** Data emitted at the start of a player's turn */
export interface OnBeforeRechargeStepData {
  eventIssuer: Player;
  itemsToRecharge: ItemCard[];
  charactersToRecharge: CharacterCard[];
}

/** Data emitted at the end of a player's turn */
export interface OnTurnEndData {
  eventIssuer: Player;
}

/** Data emitted during the loot step */
export interface OnLootStepData {
  eventIssuer: Player;
  numberToLoot: number;
}

/** Data emitted when a player would loot cards (can be modified) */
export interface OnLootWouldData {
  eventIssuer: Player;
  numberOfCards: number[];
  reason: "lootStep" | "other";
}

/** Data emitted after a player loots cards */
export interface OnLootAfterData {
  eventIssuer: Player;
  numberOfCards: number;
}

/** Data emitted after a loot card is added to a player's hand */
export interface OnLootAddedAfterData {
  eventIssuer: Player;
  card: LootCard;
}

/** Data emitted after a card is removed from a player's hand */
export interface OnLootRemovedAfterData {
  eventIssuer: Player;
  card: Card;
}

/** Data emitted when getting a monster's attack points (can be modified) */
export interface OnGetMonsterAttackPointsData {
  eventIssuer: Monster;
  stat: number[];
}

/** Data emitted when getting a monster's evasion value (can be modified) */
export interface OnGetMonsterEvasionData {
  eventIssuer: Monster;
  stat: number[];
}

/** Data emitted after a card enters play */
export interface OnEnterPlayAfterData {
  eventIssuer: Player;
  card: Card;
}

/** Data emitted when an item is activated */
export interface OnItemActivatedData {
  eventIssuer: Player;
  item: ItemCard;
}

/** Data emitted when a counter is added to an entity */
export interface OnCounterModifiedData {
  eventIssuer: Entity;
  card: Card;
  counterName: CounterType;
  previousValue: number;
  newValue: number;
}

/** Data emitted when priority passes */
export interface OnPriorityPassesData {
  eventIssuer: Player | null;
}

/** Data emitted when items are destroyed */
export interface OnItemDestroyedData {
  eventIssuer: Player | null;
  cards: Card[];
}

/** Data emitted when a card enters play */
export interface OnEnterPlayData {
  eventIssuer: Player;
  card: Card;
}

/** Data emitted on a player's turn */
export interface OnYourTurnData {
  eventIssuer: Player;
}

/** Data emitted when a loot card is played */
export interface OnLootPlayedData {
  eventIssuer: Player;
  card: LootCard;
  targets: any[];
  stackId: number;
}
/**
 * eventIssuer gives coins to target. 
 */
export interface OnCoinGivenData {
  eventIssuer: Player;
  target: Player;
  amount: number;
  forced: Card | null;
}

/** Data emitted before the game starts */
export type OnGameStartBeforeData = Record<string, never>;

/** Data emitted when the game starts */
export type OnGameStartData = Record<string, never>;

// ============================================================================
// Event Type Mapping
// ============================================================================

/**
 * Type mapping for event data based on trigger event type.
 * Each event type is mapped to its specific data structure that will be passed to event handlers.
 */
export interface TriggerEventDataMap {
  "on:death:would-death": OnDeathWouldDeathData;
  "on:death:before-penalty": OnDeathBeforePenaltyData;
  "on:death:penalty": OnDeathPenaltyData;
  "on:death:after-penalty": OnDeathAfterPenaltyData;
  "on:death:monster": OnDeathMonsterData;
  "on:damage:taken": OnDamageTakenData;
  "on:damage:taken:first-time-each-turn": OnDamageTakenData;
  "on:damage:would-take": OnDamageWouldTakeData;
  "on:combatdamage:dealt:to-monster": OnCombatDamageDealtToMonsterData;
  "on:combatdamage:dealt:to-player": OnCombatDamageDealtToPlayerData;
  "on:combatdamage:dealt": OnCombatDamageDealtData;
  "on:combat:end": OnCombatEndData;
  "on:card:flipped": OnCardFlippedData;
  "on:attack:declared": OnAttackDeclaredData;
  "on:attack:declared:monster": OnAttackDeclaredMonsterData;
  "on:attack:declared:animated": OnAttackDeclaredAnimatedData;
  "on:attack:declared:topdeck": OnAttackDeclaredTopDeckData;
  "on:attack:roll": OnRollData;
  "on:attack:roll:modifier": OnRollData;
  "on:roll:modifier": OnRollData;
  "on:attack:roll:first-time-each-turn": OnRollData;
  "on:attack:roll:failed": OnRollData;
  "on:coin:gained": OnCoinGainedData;
  "on:coin:gained:after": OnCoinGainedData;
  "on:loot:discard:before": OnLootWouldDiscardData;
  "on:coin:lost:before": OnCoinsLostBeforeData;
  "on:coin:lost:after": OnCoinLostAfterData;
  "on:dice:being-rolled": OnDiceBeingRolledData;
  "on:dice:would-roll": OnDiceWouldRollData;
  "on:dice:resolved": OnDiceResolvedData;
  "on:turn:start": OnTurnStartData;
  "on:counter:modified": OnCounterModifiedData;
  "on:turn:start:before:recharge:step": OnBeforeRechargeStepData;
  "on:turn:end": OnTurnEndData;
  "till:turn:end": OnTurnEndData;
  "on:loot:step": OnLootStepData;
  "on:loot:would": OnLootWouldData;
  "on:loot:after": OnLootAfterData;
  "on:loot:added:after": OnLootAddedAfterData;
  "on:loot:removed:after": OnLootRemovedAfterData;
  "on:get:monster:attackPoints": OnGetMonsterAttackPointsData;
  "on:get:monster:evasion": OnGetMonsterEvasionData;
  "on:enter:play:after": OnEnterPlayAfterData;
  "on:item:activated": OnItemActivatedData;
  "on:card:activated": OnItemActivatedData;
  "on:can:declare:attack": OnCanDeclareAttackData;
  "on:priority:passes": OnPriorityPassesData;
  "on:item:destroyed": OnItemDestroyedData;
  "on:enter:play": OnEnterPlayData;
  "on:your:turn": OnYourTurnData;
  "on:death:animated": OnDeathAnimatedData;
  "on:loot:played": OnLootPlayedData;
  "on:game:start:before": OnGameStartBeforeData;
  "on:game:start": OnGameStartData;
  "on:soul:gained": OnSoulGainedOrRemovedData;
  "on:soul:gained:before": OnSoulGainedOrRemovedData;
  "on:soul:removed": OnSoulGainedOrRemovedData;
  "on:coin:given": OnCoinGivenData;
  "on:purchase:success": OnPurchaseSuccessData;
  "on:recharge": OnRechargeData;
  "on:item:gained": OnItemGainedData;
  "on:card:discarded:before": OnCardDiscardBeforeData;
}

export type TriggerEvent = keyof TriggerEventDataMap;