import type { Player } from '../player';
import type { Monster } from '../monster';
import type { Entity } from '../entity';
import type { DeathOnStack, DiceRoll } from '../player';
import type { ItemCard, Card, LootCard } from '../cards';
import type { DamageSource } from '../game';

// ============================================================================
// Event Data Types
// ============================================================================

/** Data emitted when an entity is about to die (can be prevented) */
export type OnDeathWouldDeathData = {
  eventIssuer: Entity;
  target: Entity;
  source: DamageSource;
  deathOnStack: DeathOnStack;
};

/** Data emitted before death penalty is applied */
export type OnDeathBeforePenaltyData = {
  eventIssuer: Entity;
  target: Entity;
  source: DamageSource;
};

/** Data emitted after death penalty is applied */
export type OnDeathAfterPenaltyData = {
  eventIssuer: Entity;
  target: Entity;
  source: DamageSource;
};

/** Data emitted when a monster dies */
export type OnDeathMonsterData = {
  eventIssuer: Monster;
  target: Entity;
  source: DamageSource;
  ability?: any;
};

/** Data emitted when damage has been taken */
export type OnDamageTakenData = {
  eventIssuer: Entity;
  target: Entity;
  source: DamageSource;
  damage: number;
};

/** Data emitted when an entity is about to take damage (can be modified) */
export type OnDamageWouldTakeData = {
  eventIssuer: Entity;
  target: Entity;
  source: DamageSource;
  damageArray: number[];
};

/** Data emitted when combat damage is dealt to a monster */
export type OnCombatDamageDealtToMonsterData = {
  eventIssuer: Entity;
  target: Monster;
  source: DamageSource;
  damage: number;
};

/** Data emitted when combat damage is dealt to a player */
export type OnCombatDamageDealtToPlayerData = {
  eventIssuer: Entity;
  target: Player;
  source: DamageSource;
  damage: number;
};

/** Data emitted when combat damage is dealt to a player */
export type OnCombatDamageDealtData = {
  eventIssuer: Entity;
  target: Entity;
  source: DamageSource;
  damage: number;
};

/** Data emitted when a player declares an attack */
export type OnAttackDeclaredData = {
  eventIssuer: Player;
};

/** Data emitted when a player declares an attack on a specific monster */
export type OnAttackDeclaredMonsterData = {
  eventIssuer: Player;
  monster: Monster[];
};

/** Data emitted when an attack roll is made */
export type OnAttackRollData = {
  eventIssuer: Player;
  target: Monster;
  dice: DiceRoll;
  damageDealt: number[];
  damageReceived: number[];
  evasion: number[];
};

/** Data emitted when a soul is gained */
export type OnSoulGainedData = {
  eventIssuer: Player;
  soul: Card;
};


/** Data emitted when a player gains coins */
export type OnCoinGainedData = {
  eventIssuer: Player;
  coinGained: number[];
};

/** Data emitted when a player loses coins */
export type OnCoinLostAfterData = {
  eventIssuer: Player;
  coinLost: number;
};

/** Data emitted when a dice is rolled */
export type OnDiceRolledData = {
  diceRoll: DiceRoll;
  eventIssuer?: Player;
  dice?: DiceRoll;
};

/** Data emitted before a dice would be rolled (can be modified) */
export type OnDiceWouldRollData = {
  eventIssuer: Player;
  diceRoll: DiceRoll;
};

/** Data emitted at the start of a player's turn */
export type OnTurnStartData = {
  eventIssuer: Player;
};

/** Data emitted at the end of a player's turn */
export type OnTurnEndData = {
  eventIssuer: Player;
};

/** Data emitted during the loot step */
export type OnLootStepData = {
  eventIssuer: Player;
};

/** Data emitted when a player would loot cards (can be modified) */
export type OnLootWouldData = {
  eventIssuer: Player;
  numberOfCards: number[];
};

/** Data emitted after a player loots cards */
export type OnLootAfterData = {
  eventIssuer: Player;
  numberOfCards: number;
};

/** Data emitted after a loot card is added to a player's hand */
export type OnLootAddedAfterData = {
  eventIssuer: Player;
  card: LootCard;
};

/** Data emitted after a card is removed from a player's hand */
export type OnLootRemovedAfterData = {
  eventIssuer: Player;
  card: Card;
};

/** Data emitted when getting a monster's attack points (can be modified) */
export type OnGetMonsterAttackPointsData = {
  eventIssuer: Monster;
  stat: number[];
};

/** Data emitted when getting a monster's evasion value (can be modified) */
export type OnGetMonsterEvasionData = {
  eventIssuer: Monster;
  stat: number[];
};

/** Data emitted after a card enters play */
export type OnEnterPlayAfterData = {
  eventIssuer: Player;
  card: Card;
};

/** Data emitted when an item is activated */
export type OnItemActivatedData = {
  eventIssuer: Player;
  item: ItemCard;
};

/** Data emitted when priority passes */
export type OnPriorityPassesData = {
  eventIssuer: Player | null;
};

/** Data emitted when an item is purchased */
export type OnItemPurchaseData = {
  eventIssuer: Player;
  cost: number[];
};

/** Data emitted when items are destroyed */
export type OnItemDestroyedData = {
  eventIssuer: Player | null;
  cards: Card[];
};

/** Data emitted when a card enters play */
export type OnEnterPlayData = {
  eventIssuer: Player;
  card: Card;
};

/** Data emitted on a player's turn */
export type OnYourTurnData = {
  eventIssuer: Player;
};

/** Data emitted when a loot card is played */
export type OnLootPlayedData = {
  eventIssuer: Player;
  card: LootCard;
  targets?: any[];
};

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
export type TriggerEventDataMap = {
  "on:death:would-death": OnDeathWouldDeathData;
  "on:death:before-penalty": OnDeathBeforePenaltyData;
  "on:death:after-penalty": OnDeathAfterPenaltyData;
  "on:death:monster": OnDeathMonsterData;
  "on:damage:taken": OnDamageTakenData;
  "on:damage:taken:first-time-each-turn": OnDamageTakenData;
  "on:damage:would-take": OnDamageWouldTakeData;
  "on:combatdamage:dealt:to-monster": OnCombatDamageDealtToMonsterData;
  "on:combatdamage:dealt:to-player": OnCombatDamageDealtToPlayerData;
  "on:combatdamage:dealt": OnCombatDamageDealtData;
  "on:attack:declared": OnAttackDeclaredData;
  "on:attack:declared:monster": OnAttackDeclaredMonsterData;
  "on:attack:roll": OnAttackRollData;
  "on:attack:roll:first-time-each-turn": OnAttackRollData;
  "on:coin:gained": OnCoinGainedData;
  "on:coin:gained:after": OnCoinGainedData;
  "on:coin:lost:after": OnCoinLostAfterData;
  "on:dice:rolled": OnDiceRolledData;
  "on:dice:would-roll": OnDiceWouldRollData;
  "on:turn:start": OnTurnStartData;
  "on:turn:start:before:recharge:step": OnTurnStartData;
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
  "on:priority:passes": OnPriorityPassesData;
  "on:item:purchase": OnItemPurchaseData;
  "on:item:destroyed": OnItemDestroyedData;
  "on:enter:play": OnEnterPlayData;
  "on:your:turn": OnYourTurnData;
  "on:loot:played": OnLootPlayedData;
  "on:game:start:before": OnGameStartBeforeData;
  "on:game:start": OnGameStartData;
  "on:attack:roll:failed": OnAttackRollData;
  "on:soul:gained": OnSoulGainedData;
};

export type TriggerEvent = keyof TriggerEventDataMap;