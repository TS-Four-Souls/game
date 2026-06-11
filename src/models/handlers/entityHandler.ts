import {
  Card,
  Hand,
  ItemCard,
  LootCard
} from "@/models/cards";
import {
  targetGetCoinRollEffect,
  targetGetLootRollEffect,
  targetGetTreasureRollEffect
} from "@/models/effects/activeEffect";
import { Animated } from "@/models/entities/animated";
import { Entity } from "@/models/entities/entity";
import { Monster } from "@/models/entities/monster";
import { Player } from "@/models/entities/player";
import { DamageOnStack, DeathOnStack, DiceRoll } from "@/models/stackElement";
import { EffectData } from "@/models/types/cardTypes";
import { AnimatedList } from "../entities/animated";
import { Game } from "../game";
import { DeathPenaltyValues } from "../handlers/deathHandler";
import { Encounters } from "../slots/encounters";

// Type representing sources of damage - either a card ability or a dice roll
export type DamageSource = Card | DiceRoll;

export class EntityHandler {
  private _game: Game;
  private _players: Player[] = [];
  private _animatedList: AnimatedList = new AnimatedList();
  private _monsterDiedThisTurn: boolean = false;
  private _entitiesInCombat: Entity[] = [];

  constructor(game: Game) {
    this._game = game;
  }

  get game() {
    return this._game;
  }

  /**
   * Returns the list of entities currently engaged in combat. 
   * CAREFULL IT ALSO INCLUDES ANIMATED ENTITIES.
   */
  get entitiesInCombat(): ReadonlyArray<Entity> {
    // Return a defensive copy so external code cannot mutate combat state.
    return [...this._entitiesInCombat];
  }

  resetEntitiesInCombat(): void {
    this._entitiesInCombat = [];
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
  get monsters(): Monster[] {
    return this.game.encounters.monsters;
  }
  get monsterDiedThisTurn(): boolean {
    return this._monsterDiedThisTurn;
  }
  set monsterDiedThisTurn(value: boolean) {
    this._monsterDiedThisTurn = value;
  }
  get Entities(): Entity[] {
    return [
      ...this.players,
      ...this.monsters.filter((m): m is Monster => m !== undefined),
    ];
  }


  get EntitiesAndAnimated(): Entity[] {
    return [
      ...this.Entities,
      ...this.animatedList.all
    ];
  }

  get animatedList(): AnimatedList {
    return this._animatedList;
  }
  addAnimated(animated: Animated): void {
    this._animatedList.add(animated);
  }
  removeAnimated(animated: Animated): void {
    this._animatedList.remove(animated);
    if(animated !== undefined && animated.isEngagedInCombat)
      this.endCombat();
  }

  get attackableEntities(): Entity[] {
    return [...this.Entities.filter(e => e.attackable === true), ...this.animatedList.all.filter(e => e.attackable)];
  }
  
  /** Shortcut to queue death for an entity from a given source. */
  kill(killer: Entity, entity: Entity, source: DamageSource): void {
    this.game.assert.gameStarted();
    try{
      this.game.assert.isAlive(entity);
      this.game.assert.entityIsInPlay(entity);
    }catch{
      return; // if the receiver is not alive or not in play anymore, do nothing.
    }
    this.death(entity, killer, source);
  }
  /**
   * Applies all death penalties configured for a player.
   * It can be override by a specific passive effect.
   */
  async deathPenalty(player: Player, values: DeathPenaltyValues): Promise<void> {
    // remove coins.
    // obtain set of items that can be lost.
    
    const lostCoins = this.game.loseCoins(player, values.nbCoinsToLose, true, "death");
    let lootCardsToLose: LootCard[] = [];
    let itemsToLose: ItemCard[] = await this.game.deathPenaltyItems(player, values.nbItemsToLose);
    // If at least one item can be lost, ask the player to select one.
    
    // lose loot cards
    if (values.nbLootCardsToLose > 0 && player.hand.cards.length > 0) {
      lootCardsToLose = (
        await this.game.select(player, values.nbLootCardsToLose, values.nbLootCardsToLose, player.hand.cards, values.nbLootCardsToLose > 1
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
    this.game.emit("on:death:penalty", deathPenaltyData);

    // Replacement effects may alter the effective penalties during on:death:penalty emission.
    itemsToLose = deathPenaltyData.itemsLost;
    lootCardsToLose = deathPenaltyData.lootCardsLost;
    
    if (itemsToLose && itemsToLose.length > 0) {
      for (const item of itemsToLose) {
        if(!(item instanceof ItemCard))
          throw new Error("Selected card is not an ItemCard.");
        this.game.destroyCardsOrSouls([item]);
      }
    }
    if (lootCardsToLose && lootCardsToLose.length > 0) {
      for (const loot of lootCardsToLose) {
        this.game.discardFromHandAtIndex(player, player.hand._hand.indexOf(loot), "death");
      }
    }
    this.game.dispatch();
  }

  /**
   * Queues a death resolution sequence for an entity.
   */
  death(receiver: Entity, from: Entity, source: DamageSource): void {
    this.game.assert.gameStarted();
    this.game.assert.entityIsInPlay(receiver);
    if (receiver.isDead) return;

    const deathOnStack = new DeathOnStack(receiver, from, source, this.game);
    this.game.addToStack(deathOnStack);
    this.game.emit("on:death:would-death", {
      eventIssuer: receiver,
      target: from,
      source: source,
      deathOnStack: deathOnStack,
    });
  }
  /** Cancels previous death entry for a player and stabilizes at 1 HP if needed. */
  preventDeath(entity: Entity): void {
    this.game.stack.cancelPreviousDeath(entity);
    if (entity.currentHealthPoints === 0) this.heal(entity, 1);
  }
  /**
   * Grants coin/loot/treasure rewards when a monster dies to the current player.
   */
  entityRewards(entity: Monster | Animated, player: Player | null = null): void {
    if(player === null)
      player = this.game.currentPlayer;
    const rewards = entity.rewards;
    if(rewards === undefined)
      return;

    const adders =  {
      "coin": (player: Player, amount: number) => this.game.gainCoins(player, amount, entity.card),
      "loot": (player: Player, amount: number) => this.game.loot(player, amount),
      "treasure": (player: Player, amount: number) => this.game.gainTreasure(player, amount),
    }
    const onDice = {
      "coin": targetGetCoinRollEffect(this.game),
      "loot": targetGetLootRollEffect(this.game),
      "treasure": targetGetTreasureRollEffect(this.game),
    }
    for(const rewardType of ["coin", "loot", "treasure"] as const)
      if(rewards[rewardType] !== undefined)
      {
        const allPlayers = rewards[rewardType] instanceof Object && "all" in rewards[rewardType] && rewards[rewardType].all
        const amount = (rewards[rewardType] instanceof Object && "all" in rewards[rewardType]) ? rewards[rewardType].count : rewards[rewardType] as number | "roll";
        const receivers = allPlayers ? this.game.players : [player];
        for(const receiver of receivers)
        {
          if (amount === "roll") {
            const roll = this.game.rollDice(receiver, false, entity.card);
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
    if(card.afterEffect === "handled" || card.afterEffect === "nothing")
      return; // Card is already handled by its afterEffect, so do nothing here.
    if (card.rewards?.soul !== undefined) {
      if (typeof card.rewards?.soul !== "number")
        throw new Error("Monster soul reward must be a number.");
      card.soul = card.rewards?.soul;
      this.game.addAnimation({
        id: this.game.nextAnimationId,
        type: "obtainMonsterSoul",
        card: card.jsonAPI,
        player: this.game.currentPlayer.id,
      });
      this.game.addSoul(this.game.currentPlayer, card);
    } else this.game.discard(card);
    this.game.dispatch();
  }

  /**
   * Resolves a pending death and its before/after trigger windows.
   * Should only be called by DeathOnStack objects.
   */
  async resolveDeath(receiver: Entity, from: Entity, source: DamageSource): Promise<void> {
    try{
      this.game.assert.isAlive(receiver);
      this.game.assert.entityIsInPlay(receiver);
    }catch{
      return; // if the receiver is not alive or not in play anymore, do nothing.
    }
    const stackIds = this.game.stack.elements.map(e => e.stackId);
    const values: DeathPenaltyValues = new DeathPenaltyValues(this.game.gameParameters);

    this.game.emit("on:death:before-penalty", {
      eventIssuer: receiver,
      target: from,
      source: source,
      values: values,
    });
    
    receiver.die();
    await this.game.executeWhenStackSubset(stackIds, async () => {
      const stackIds = this.game.stack.elements.map(e => e.stackId);
      if (receiver.isEngagedInCombat) {
        this.endCombat();
      }
      for (const player of this.game.players) {
        player.clearAttackRequirement(receiver);
      }
      if (receiver instanceof Player) {
        receiver.clearAttackRequirement(); // clear any forced attack constraints on this.game player.
        await this.deathPenalty(receiver, values);
      } else if (receiver instanceof Monster) {
        // Clear any forced attack constraints on this.game monster
        const eventData = {
          eventIssuer: receiver,
          target: from,
          source: source,
          rewardGainer: this.game.currentPlayer
        };
        this.game.emit("on:death:monster", eventData);
        this.monsterDiedThisTurn = true;
        this.game.entityRewards(receiver, eventData.rewardGainer);
        void this.game.executeWhenStackSubset(stackIds, async () => {
          this.game.encounters.kill(receiver); // should only kill once its effects are resolved: should be moved in the resolvewhenstackempty
          this.game.obtainMonsterSoulOrDiscard(receiver);
          this.game.resolveCallbacks();
        }).catch((error) => {
          console.error("Failed to finish monster death resolution", error);
        });
      }else if (receiver instanceof Animated) {
        this.game.emit("on:death:animated", {
          eventIssuer: receiver,
          target: from,
          source: source,
        });
        this.game.entityRewards(receiver);
        if(!receiver.card.eternal)
          this.game.destroyCardsOrSouls([receiver.card]);
      }
      this.game.emit("on:death:after-penalty", {
        eventIssuer: receiver,
        target: from,
        source: source,
      });
      this.game.dispatch();
      // if(receiver instanceof Player && this.game.currentPlayer === receiver)
      //   this.game.executeWhenStackEmpty(() => {this.game.endTurn();});
    }).catch((error) => {
      console.error("Failed to resolve death follow-up", error);
    });
    this.game.resolveCallbacks();
  }


  /**
   * Ends combat for all currently engaged entities.
   */
  endCombat(): void {
    // console.log("Ending combat for entities:", this.game.entitiesInCombat.map(e => e instanceof Player ? `Player ${e.id}` : e instanceof Monster ? `Monster ${e.card.name}` : "Animated"));
    const engagedEntities = this.game.entitiesInCombat;
    for (const entity of engagedEntities) {
      if (entity.isEngagedInCombat) {
        entity.combatEnded();
      }
    }
    this._entitiesInCombat = [];
    this.game.emit("on:combat:end", { eventIssuer: engagedEntities.filter(e => e instanceof Player)[0] });
    this.game.dispatch();
  }


  endCombatIfInvalid(player: Player): void
  {
    if(player.isEngagedInCombat && player.clearOutdatedAttackRequirements(this.game.attackableEntities) && this.game.entitiesInCombat.length === 1)
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
      this.game.emit(
        "on:get:monster:attackPoints",
        {
          eventIssuer: entity,
          stat: baseStat,
        },
        false
      );
    return baseStat[0]!;
  }

  /**
   * Computes current monster evasion/DC clamped to [1, 6].
   */
  getDC(entity: Entity): number {
    let baseStat = [entity.evasion];
    if(entity instanceof Monster)
      this.game.emit(
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
   * Routes combat damage through triggers then queues stack damage.
   */
  dealCombatDamage(
    dealer: Entity,
    receiver: Entity,
    source: DamageSource,
    damage: number
  ): void {
    if (damage <= 0 || receiver.isDead) return;
    if(this.game.EntitiesAndAnimated.includes(receiver) === false || this.game.EntitiesAndAnimated.includes(dealer) === false)
    {
      this.endCombat();
      return;
    }
    const content = {
        eventIssuer: dealer, // The dealer is the one dealing combat damage
        target: receiver,
        source: source,
        damage,
      }
    this.dealDamage(dealer, receiver, source, damage);
    this.game.emit("on:combatdamage:dealt", content);
    if (receiver instanceof Player) {
      this.game.emit("on:combatdamage:dealt:to-player", content);
    } else if (receiver instanceof Monster) {
      this.game.emit("on:combatdamage:dealt:to-monster", content);
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
    if(!this.game.EntitiesAndAnimated.includes(receiver))
      return;

    this.healthLoss(dealer, receiver, source, damage);
    if(damage > 0){
        if (receiver.damageTakenThisTurn.length === 1)
          this.game.emit("on:damage:taken:first-time-each-turn", {
        eventIssuer: receiver,
          target: dealer,
          source: source,
          damage: damage,
        });
        
        this.game.emit("on:damage:taken", {
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
  heal(receiver: Entity, amount: number | "full" = "full"): void {
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
      this.game
    );
    if (callback) {
      damageOnStack.attachEffect(callback, source, callbackTargets);
    }
    this.game.addToStack(damageOnStack);
    this.game.emit("on:damage:would-take", {
      eventIssuer: receiver,
      target: dealer,
      source: source,
      damageArray: damageArray,
    });
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
    this.game.assert.playerIdAvailable(newPlayer.id);
    this.game.assert.gameNotStarted();
    this.game.players.push(newPlayer);
    this.game.dispatch();
  }

  get monsterSlots(): Encounters {
    return this.game.encounters;
  }
  get playersWithMostSouls(): Player[] {
    let maxSouls = Math.max(...this.game.players.map((player) => player.totalSouls));
    return this.game.players.filter((player) => player.totalSouls === maxSouls);
  }

  /** Adds a temporary/permanent attack modifier to an entity. */
  addAttack(e: Entity, value: number, source: Card | "flip" | "other" = "other"): void {
    // console.log(`Adding ${value} attack points to entity ${e.id}. Current attack points: ${e.attackPoints}. source is ${source instanceof Card ? source.jsonAPI.name : source}, id ${source instanceof Card ? source.jsonAPI.globalId : "N/A"}.`);
    if(source instanceof Card && source.name === "Diplopia")
      throw new Error("Diplopia should not call addAttack, as it does not directly modify attack points.");
    if(e.attackPoints + value < 0)
      throw new Error(`Cannot reduce attack points of entity ${e.id} below 0.`);
    e.addAttackPoints(value);
  }

  /** Increases the number of attacks available this.game turn for a player. 
   * If the player is engaged in combat, but has not yet chosen a target, and this.game would set its remaining attacks to 0, it will be set to 1 instead.
  */
  addAttackThisTurn(e: Entity, value: number = 1, source: Card | "flip" | "other" = "other"): void {
    if (e instanceof Player) {
      if(e.attackThisTurn + value === 0 && e.isEngagedInCombat && this.EntitiesAndAnimated.every((entity) => entity === e || entity.isEngagedInCombat === false))
      {
        e.addAttackThisTurn(value + 1);
      }
      else
        e.addAttackThisTurn(value);
      this.game.dispatch();
    }
  }

  /** Adds max/current health points to an entity according to entity logic. */
  addHealth(e: Entity, value: number, source: Card | "flip" | "other" = "other"): void {
    e.addHealthPoints(value);
  }

  /** Applies a global attack modifier to encounter monsters. */
  addAttackToEachMonster(e: Entity, value: number, source: Card | "flip" | "other" = "other"): void {
    this.game.encounters.addAttackModifier(value);
  }

  /** Applies a global evasion/DC modifier to encounter monsters. */
  addDCToEachMonster(e: Entity, value: number, source: Card | "flip" | "other" = "other"): void {
    this.game.encounters.addDCModifier(value);
  }

  /** Adds an evasion/DC modifier to a monster entity. */
  addDC(e: Entity, value: number, source: Card | "flip" | "other" = "other"): void {
    if (!(e instanceof Monster))
      throw new Error("DC modifier can only be added to monsters.");
    e.addEvasion(value);
  }

  /** Grants extra loot plays this.game turn. */
  addLootPlay(e: Entity, value: number, source: Card | "flip" | "other" = "other"): void {
    if(!(e instanceof Player))
      throw new Error("Loot play modifier can only be added to players.");
    e.addLootPlay(value);
  }

  /** Toggles/updates permission to see the treasure deck top card. */
  addCanSeeTopOfTreasureDeck(e: Player, value: number, source: Card | "flip" | "other" = "other"): void {
    e.addCanSeeTopOfTreasureDeck(value);
  }

  /** Applies attack-roll specific dice modifier to an entity. */
  addAttackDiceModifier(e: Entity, value: number, source: Card | "flip" | "other" = "other"): void {
    e.addAttackDiceModifier(value);
  }

  /** Applies generic dice modifier to a player. */
  addDiceModifier(e: Entity, value: number, source: Card | "flip" | "other" = "other"): void {
    if (!(e instanceof Player))
      throw new Error("Dice modifier can only be added to players.");
    e.addDiceModifier(value);
  }

  /** Grants additional purchases for the current turn. */
  addPurchaseThisTurn(p: Player, value: number, source: Card | "flip" | "other" = "other"): void {
    p.remainingPurchaseThisTurn += value;
  }

  /** Schedules an extra turn for a player. */
  addExtraTurn(player: Player): void {
    this.game.turnHandler.InsertPlayerAtNextTurn(player);
  }
  /** Replaces a player's hand and returns the previous one. */
  setHand(player: Player, hand: Hand): Hand {
    return player.setHand(hand);
  }

  /** Adds or refreshes a forced-attack requirement for a player. */
  playerMustAttack(player: Player, target: (Entity[] | "topDeck" | "any"), source: Card): void {
    // Check if player is dead - constraint doesn't apply
    if (player.isDead) {
      player.clearAttackRequirement();
      return;
    }

    const mustAttackEntity = player.mustAttackEntity;

    for (const req of mustAttackEntity) {
      if (req.target === "topDeck") continue;
      if (req.target === "any") continue;
      if(req.target.every(m => !(this.game.attackableEntities.includes(m)) || m.attackable === false)) {
        player.clearAttackRequirement(req.target[0]);
      }
    }
    player.mustAttack(target, source);
    this.game.dispatch();
  }

  /** Marks a player to skip their next turn. */
  playerSkipNextTurn(player: Player): void {
    this.game.turnHandler.skipNextTurn(player);
  }

  forcedAttackSatisfied(player: Player): void {
    this.game.actions.canDeclareAttack(player, false);
    // Check if there's a forced attack constraint
    if (!player.hasAttackRequirement) {
      return; // No constraint, all good
    }

    // Check if player is dead - constraint doesn't apply
    if (player.isDead) {
      player.clearAttackRequirement();
      return;
    }

    const requirement = player.mustAttackEntity!;

    // Filter monsters that are still in play
    const validMonsters = requirement.filter(
      (req) => req.target === "topDeck" || req.target === "any" || req.target.some(target => this.game.attackableEntities.includes(target))
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

  /** Applies the current turn player's loot/activation restriction to all other players. */
  applyLootOrActivateRestrictionForCurrentTurn(player: Player, value: number = 1): void {
    for (const p of this.game.players) {
      if(p !== player)
      {
        p.addToCanIActivateThisTurn(value);
        p.addToCanIUseLootThisTurn(value);
      }
    }
    this.game.dispatch();
  }

  /** Finds a player by id or throws. */
  getPlayerById(id: string): Player {
    for (const p of this.game.players) {
      if (p.id === id) {
        return p;
      }
    }
    throw new Error("Player not found");
  }

  healEveryone(): void {
    this.game.players.forEach((p) => this.heal(p));
    this.game.monsters.forEach((m) => this.heal(m));
  }
}