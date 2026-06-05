import { Game } from "../game";
import { Player } from "../entities/player";
import type { Capability } from "@/shared/api";
import type { Entity } from "../entities/entity";
import { Monster } from "../entities/monster";
import { Animated } from "../entities/animated";
import { getAttackRollEffect } from "../effects/activeEffect";
import { DiceRoll } from "../stackElement";
import { Card, ItemCard, LootCard, LootCardEffect, MonsterCard, MonsterType, RoomCard, TreasureCard } from "../cards";
import { TargetBuilder } from "../targetBuilder";

export class ActionHandler {
  private _game: Game;

  constructor(game: Game) {
    this._game = game;
  }

  get game() {
    return this._game;
  }
    /**
     * Validates whether a player can declare an attack right now.
     */
    canDeclareAttack(player: Player, shouldThrow: boolean = false): Capability {
      try {
        this.game.assert.currentTurnIsPlayerTurn(player);
        this.game.assert.noOngoingAttack();
        this.game.assert.currentPlayerIsNotEngagedInPurchase();
        this.game.assert.currentPlayerIsNotEngagedInCombat();
        this.game.assert.isAlive(player);
        this.game.assert.emptyStack();
        this.game.assert.noPendingSelection();
  
        if (player.isEngagedInCombat) {
          throw new Error("You are already engaged in combat.");
        }
        if (player.attackThisTurn <= 0 && !player.hasAttackRequirement && !player.hasFreeAttackRemaining)
          throw new Error("You have no remaining attacks this turn.");
        // if(player.hasAttackRequirement)
        //   console.log("Player has attack requirement.");
        // if(player.hasFreeAttackRemaining)
        //   console.log("Player has free attack remaining.");
        // if(player.attackThisTurn > 0)
        //   console.log("Player has attacks remaining this turn.", player.attackThisTurn);
        const canDeclareAttackData = {
          eventIssuer: player,
          canDeclare: [true],
          reason: [""],
        };
        this.game.emit("on:can:declare:attack", canDeclareAttackData, false);
        if (!canDeclareAttackData.canDeclare[0]) {
          throw new Error(canDeclareAttackData.reason[0]);
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
     * Declares combat intent for the current player.
     * Note that the player first declare an attack, and then select what to attack.
     * This let other players react to the attack declaration before the target is selected.
     */
    declareAttack(player: Player): void {
      this.canDeclareAttack(player, true);
      player.clearOutdatedAttackRequirements(this.game.attackableEntities);
      player.engageInCombat();
      this.game.addEntityInCombat(player);
      this.game.emit("on:attack:declared", { eventIssuer: player });
      this.game.dispatch();
    }
  
    /**
     * Validates whether a specific monster/top-deck can be attacked.
     */
    canDeclareAttackOnEntity(player: Player,
      entity: Entity | "topDeck", shouldThrow: boolean = false): Capability {
      try {
        this.game.endCombatIfInvalid(player);
        this.game.assert.emptyStack();
        if (entity !== "topDeck" && !entity.attackable) {
          throw new Error("This entity cannot be attacked.");
        }
        this.game.assert.currentTurnIsPlayerTurn(player);
        this.game.assert.noOngoingAttack();
        this.game.assert.isAlive(player);
        this.game.assert.emptyStack();
        if (!player.isEngagedInCombat) {
          throw new Error("You have not declared an attack.");
        }
        const isCombatOngoing = this.game.entitiesInCombat.length >= 2;
        if (isCombatOngoing) {
          throw new Error("Another entity is already engaged in combat.");
        }
        if(entity !== "topDeck" && this.game.attackableEntities.includes(entity) === false)
        {
          throw new Error("This entity cannot be attacked.");
        }
        const playerCanAttackData = player.canAttackThisEntity(entity);
        if (playerCanAttackData !== true) {
          throw new Error(playerCanAttackData);
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
      async declareAttackOnEntity(
        player: Player,
        target: Entity | "topDeck",
        drawInIndex: number = -1
      ): Promise<void> {
        this.canDeclareAttackOnEntity(player, target, true);
        const attackTopDeck = target === "topDeck";
        const attacked = [target];
        if(target instanceof Monster)
          this.game.emit("on:attack:declared:monster", { eventIssuer: player, monster:attacked });
        if(target instanceof Animated)
          this.game.emit("on:attack:declared:animated", { eventIssuer: player, animated:attacked });
        await this.game.executeWhenStackEmpty(() => {
          target = attacked[0]!; // in case the monster is modified by the event.
          if (drawInIndex !== -1 && target !== "topDeck")
            throw new Error(
              "drawInIndex can only be specified when drawing from topDeck"
            );
          if (drawInIndex === -1 && target === "topDeck")
            throw new Error(
              "drawInIndex must be specified when drawing from topDeck"
            );
          if(this.game.actions.canDeclareAttackOnEntity(player, target, false) !== true)
            return; // if the target is no longer valid, do nothing.
          player.registerAttackDeclaration(target);
          if (target === "topDeck") {
            this.game.drawMonster(player, drawInIndex);
            if (
              this.game.encounters.monsterIn(drawInIndex) === undefined ||
              !this.game.encounters.monsterIn(drawInIndex)!.attackable
            ) {
              player.clearAttackRequirement(target);
              player.clearAttackRequirement("any");
              this.game.endCombat();
              return; // drawn event.
            }
            target = this.game.encounters.monsterIn(drawInIndex)!;
          }
          player.clearAttackRequirement(target);
          player.clearAttackRequirement("any");
          if(target.isDead)
          {
            return; // if the target is already dead, do nothing.
          }
          target.engageInCombat();
          this.game.addEntityInCombat(target);
          if (target.isEngagedInCombat === false)
            throw new Error("Monster should be engaged in combat now.");
          
          if(attackTopDeck)
            this.game.emit("on:attack:declared:topdeck", { eventIssuer: player, drawInIndex });
          this.game.dispatch();
        });
      }
  

  /**
   * Validates whether the player can perform a combat attack roll.
   */
  canRollDice(player: Player, shouldThrow: boolean = false): Capability {
    try {
      this.game.assert.currentTurnIsPlayerTurn(player);
      this.game.assert.isAlive(player);
      this.game.assert.noPendingSelection();
      this.game.assert.currentPlayerIsEngagedInCombat();
      this.game.assert.emptyStack();
      
      const entity = [...this.game.entitiesInCombat].find(
        (e) => e !== player
      );
      if (!entity) {
        throw new Error("No entity is currently engaged in combat.");
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
  attackRoll(player: Player, target: Entity | undefined = undefined): void {
    if(target === undefined)
      this.canRollDice(player, true);
    
    if(target === undefined)
      target = [...this.game.entitiesInCombat].find(
        (m) => m !== player
      );
    if (!target) {
      throw new Error("No monster is currently engaged in combat.");
    }
    if(!target.isEngagedInCombat)
    {
      throw new Error(`${player.id}The selected target (${target.id}) is not engaged in combat.`);
    }
    // damageDealt and damageReceived will be increased by the attack
    // of the dealer and receiver respectively in getAttackRollEffect.
    const damageDealtAdditional = [0];
    const damageDealtMultiplier = [1];
    const damageReceivedAdditional = [0];
    const damageReceivedMultiplier = [1];
    const evasion = [this.game.getDC(target)];
    const dice = this.game.rollDice(player, true);

    this.game.emit("on:attack:roll", {
      eventIssuer: player,
      target: target,
      dice,
      damageDealtAdd: damageDealtAdditional,
      damageDealtMult: damageDealtMultiplier,
      damageReceivedAdd: damageReceivedAdditional,
      damageReceivedMult: damageReceivedMultiplier,
      evasion,
    });
    if (player.attackRollThisTurn === 1)
      this.game.emit("on:attack:roll:first-time-each-turn", {
        eventIssuer: player,
        target: target,
        dice,
        damageDealtAdd: damageDealtAdditional,
        damageDealtMult: damageDealtMultiplier,
        damageReceivedAdd: damageReceivedAdditional,
        damageReceivedMult: damageReceivedMultiplier,
        evasion,
      });

    dice.attachEffect(
      getAttackRollEffect(
        damageDealtAdditional[0]!,
        damageDealtMultiplier[0]!,
        damageReceivedAdditional[0]!,
        damageReceivedMultiplier[0]!,
        evasion[0]!,
        this.game
      ),
      target.card,
      [target]
    );
  }

  /**
   * Resolves the top stack element, then triggers follow-up callbacks.
   */
  async resolveStack(): Promise<void> {
    // Keep resolveStack() idempotent: resolving an empty stack is a no-op.
    if (this.game.stack.isEmpty()) return;

    // Some unit tests resolve stack elements before the game is formally started.
    // In that case, enforce only the safety invariants that still make sense.
    if (this.game.isStarted) {
      this.canResolve(true);
    } else {
      this.game.assert.stackNotEmpty();
      this.game.assert.noPendingSelection();
    }
    if(this.game.stack.peek() instanceof DiceRoll)
      return this.game.resolveDiceRoll();
    const elem = this.game.stack.resolve();
    if (!elem) return;

    await elem.onResolve();
    // Add to history
    this.game.addToHistory(elem.json);
    if (elem instanceof LootCardEffect && elem.card instanceof LootCard)
      this.game.handleLootCardEffectResolution(elem);
    this.game.dispatch();
    await this.game.resolveCallbacks();
  }

  async activateRoom(player: Player,
    room: RoomCard,
    targets: any[] = [],
    effectId: number | "tap" = "tap"
  ): Promise<boolean> {
    if(!this.game.rooms || !(room instanceof RoomCard) || (player !== this.game.currentPlayer))
      return false;
    if (!room.targetStillValid(player, effectId, targets))
      throw new Error("Targets are not valid for this effect.");

    const effectOnStack = await room.tryActivateEffect(targets, effectId);
    this.game.addToStack(effectOnStack);
    return true;
  }

    /**
     * End the turn of the current player if issuer is the current player and all conditions are satisfied.
     */
    async nextTurn(player: Player): Promise<void> {
      this.canEndTurn(player, true);
      await this.game.endTurn();
    }
  
    /**
     * Validates if the active player can legally end the turn.
     */
    canEndTurn(player: Player, shouldThrow: boolean = false): Capability {
      try {
        this.game.assert.gameStarted();
        this.game.assert.currentTurnIsPlayerTurn(player);
        this.game.assert.currentPlayerIsNotEngagedInPurchase();
        this.game.assert.currentPlayerIsNotEngagedInCombat();
        this.game.assert.emptyStack();
        this.game.assert.noOngoingAttack();
        this.game.assert.noEntityIsEngagedInCombat();
        this.game.assert.noPendingSelection();
        this.game.forcedAttackSatisfied(player);
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
  
    /**
     * Validates whether issuer can play a loot card.
     */
    canPlayCard(player: Player, shouldThrow: boolean = false): Capability {
      try {
        this.game.assert.gameStarted();
        this.game.assert.noPendingSelection();
        if (!player.canIUseLootThisTurn) {
          throw new Error(`You cannot play loot cards during ${this.game.currentPlayer.id}'s turn.`);
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
        this.game.assert.gameStarted();
        this.game.assert.stackNotEmpty();
        this.game.assert.noPendingSelection();
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
    playCard(player: Player, index: number, targets: any[] = []): string {
      this.canPlayCard(player, true);
      this.game.assert.positiveNumber(index);
      if (index < 0 || index > player.hand.cards.length) {
        return "Invalid card position.";
      }
      const playedCard: LootCard = player.hand.playCard(index);
  
      if (targets.length === 0) {
        if (playedCard.getTargetSelectors().length === 1)
          if (playedCard.getTargetSelectors()[0]?.selector(player, playedCard).length === 1)
            targets = playedCard.getTargetSelectors()[0]!.selector(player, playedCard)[0];
      }
      const lootCardEffect = new LootCardEffect(player, playedCard, targets);
      this.game.addAnimation({
        id: this.game.nextAnimationId,
        type: "playLoot",
        card: playedCard.jsonAPI,
        player: player.id,
      });
      const idx = this.game.addToStack(lootCardEffect);
      player.remainingLootPlay -= 1;
      this.game.emit("on:loot:played", {
        eventIssuer: player,
        card: playedCard,
        targets: targets,
        stackId: idx
      });
      return `You have played the card: ${playedCard.name} to your in-play area.\n`;
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
    this.game.assert.noPendingSelection();
    const item = player.inPlay[index];
    if (!item || !(item instanceof ItemCard)) {
      throw new Error("Player does not own the specified item.");
    }
    if (!item.activeEffectList.map((e) => e.index).includes(effectId))
      throw new Error("Item does not have the specified effect ID.");

    return await this.game.activateItem(player, item, choices, effectId);
  }


  /** Validates whether a card can currently be activated by its owner. */
  canActivate(card: Card, owner: Player): Capability {
    // Ensure the owner actually has the item in-play (prevents bots/actions from trying to activate
    // items they no longer own because the game state changed between action selection and execution).
    if (card instanceof ItemCard && !owner.inPlay.includes(card)) {
      return `You do not own the specified item.`;
    }
    if(card.type === "loot" && !card.canBeActivated)
      return "You cannot activate this card.";
    if (card instanceof ItemCard && card.activeEffectList.length === 0) {
      return "This card has no active effects, there is nothing to activate.";
    }
    if(card instanceof MonsterCard && card.encounterType === MonsterType.EVENT) {
      return "You can not activate monster cards.";
    }
    if (!owner.canIActivateThisTurn) {
      return `You cannot activate cards this turn.`;
    }
    // Either card is not charged and has a tap effect, or card does not have a tap effect,
    if (((card.charged === false && card.hasTapEffect()) || !card.hasTapEffect()) && (
      // And all paid effect are not valid
      !(card instanceof ItemCard) || !card.activeEffectList.some(e => 
          (e.index !== "tap" && 
            TargetBuilder.verifyPaiementCanBeMade(this.game, owner, card, e.description) === true) && 
              TargetBuilder.validTargetExists(this.game, owner, card, e.index) === true)
    )) {
      if(card.activeEffectList.length === 1 && card.activeEffectList[0]!.index === "tap" && !card.charged)
        return "This card is not charged.";
      return "This card has no effects usable now.";
    }
    if(card instanceof ItemCard)
      {
        if(card.activeEffectList.length === 1){
          return TargetBuilder.validTargetExists(this.game, owner, card, card.activeEffectList[0]!.index);
        }
        else if(!card.activeEffectList.some(e => TargetBuilder.validTargetExists(this.game, owner, card, e.index) === true && (card.charged || e.index !== "tap")))
          return "No valid target for this card's effects, it cannot be activated.";
      }
    return true;
  }


  /** Validates whether current player can declare purchase mode. */
  canDeclarePurchase(player: Player, shouldThrow: boolean = false): Capability {
    try {
      this.game.assert.gameStarted();
      this.game.assert.currentTurnIsPlayerTurn(player);
      this.game.assert.isAlive(player);
      this.game.assert.currentPlayerIsNotEngagedInCombat();
      this.game.assert.currentPlayerIsNotEngagedInPurchase();
      this.game.assert.emptyStack();
      this.game.assert.noPendingSelection();
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
    this.game.dispatch();
  }

  /** Cancels purchase mode when purchasing is no longer valid.
   * Checks if the first item in the shop can not be purchased.
   * It assumes that: all shop items have the same price, and that the top deck item is not cheaper.
   */
  cancelPurchase(player: Player, force: boolean = false): void {
    if(force || this.canPurchase(player) !== true)
      {
        player.purchaseEnded();
        this.game.dispatch();
      }
    else 
      throw new Error("You have to purchase an item.");
  }

  // We should implement declaring a purchase
  /** Validates whether the active player can buy from the shop now.
   *  By default checks if the first item in the shop can not be purchased.
   * It assumes that: all shop items have the same price, and that the top deck item is not cheaper.
   */
  canPurchase(player: Player, index: number | "top" = 0, shouldThrow: boolean = false): Capability {
    try {
      this.game.assert.gameStarted();
      this.game.assert.currentTurnIsPlayerTurn(player);
      this.game.assert.isAlive(player);
      this.game.assert.currentPlayerIsEngagedInPurchase();
      this.game.assert.noPendingSelection();
      this.game.assert.emptyStack();
      const price = this.game.gameParameters.shopPrice.value + (index !== "top" ? player.priceModifier : 0);
      if (player.coins < price!) {
        throw new Error(
          `Purchase failed. You need ${price! - player.coins} more coins.\n`
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
  purchase(player: Player, index: number | "top"): string {
    this.canPurchase(player, index, true);
    if (index !== "top" && (index < 0 || index >= this.game.shop.itemsInShop.length))
      throw new Error("Invalid shop index.");
    const price = Math.max(0, this.game.gameParameters.shopPrice.value + (index !== "top" ? player.priceModifier : 0));
      if (player.coins < price!) {
        throw new Error(
          `Purchase failed. You need ${price! - player.coins} more coins.\n`
        );
      }
    if (this.game.shop.purchase(player, index, price, this.game)) {
      const purchasedCard = player.inPlay[player.inPlay.length - 1]!;
      this.game.addAnimation({
        id: this.game.nextAnimationId,
        type: index === "top" ? "buyTopDeckTreasure" : "buyShopTreasure",
        player: player.id,
        card: purchasedCard.jsonAPI,
      })
      this.game.emit("on:purchase:success", {
        eventIssuer: player,
        price: price,
        index: index,
      });
      player.purchaseEnded();
      this.game.dispatch();
      return `Purchase successful. You have now ${player.coins} coins.\n`;
    } else {
      throw new Error(
        `Purchase failed. You need ${price - player.coins} more coins.\n`
      );
    }
  }

   /**
   * This function allows a player to discard a card. 
   * It is not part of the game, but can be used to debug situations.
   * A player can discard: any card owned by the game (shop and encounters) and any card that he owns (hand and inPlay).
   */
  debugRemoveCards(player: Player, cards: Card[]): void {
    if(!this.game.gameParameters.allowCheatOptions.value)
      throw new Error("Cheat options are not allowed in this game.");
    // verify that the cards are actually owned by the player or in the shop/encounters.
    for (const card of cards) {
      if (!this.game.playerCardsAndGameOwnedCards(player).some(c => c === card)) {
        throw new Error(`Card ${card.name} is not owned by player ${player.id}`);
      }
    }
    for (const card of cards) {
      switch(card.type)
      {
        case "loot":
          const loot = card as LootCard;
          if(!loot)
            throw new Error(`Card ${card.name} is not a LootCard.`);
          this.game.removeCardFromHand(player, loot);
          if(loot.trinket)
            this.game.removeInPlay(player, loot);
          this.game.discard(loot);
          break;
        case "treasure":
          const treasure = card as TreasureCard;
          if(!treasure)
            throw new Error(`Card ${card.name} is not a TreasureCard.`);
          if(this.game.shop.itemsInShop.includes(treasure))
            this.game.shop.removeCard(treasure);
          else
            this.game.removeInPlay(player, treasure);
          this.game.discard(treasure);
          break;
        case "monster":
          const monster = card as MonsterCard;
          if(!monster)            
            throw new Error(`Card ${card.name} is not a MonsterCard.`);
          if(monster.isCurse)
            this.game.removeCurse(player, monster);
          else
          {
            const toDiscard = this.game.encounters.obtainCard(monster.slug, monster.globalId);
            if(toDiscard)
              this.game.discard(toDiscard);
          }
          break;
        default:
          throw new Error(`Card ${card.name} is of type ${card.type} which cannot be removed with debugRemoveCards.`);
      }
    }
    this.game.dispatch();
    this.game.toast({
      type: "warning",
      title: `${player.id} used a cheat to discard ${cards.length} card(s).`,
      message: `They discarded ${cards.map((c) => c.name).join(", ")}.`,
      players: this.game.players.map((p) => p.id),
    });
  }

  debugGainTreasures(player: Player, treasures: ItemCard[]): void {
    if(!this.game.gameParameters.allowCheatOptions.value)
      throw new Error("Cheat options are not allowed in this game.");
    for (const card of treasures) {
      const targetCard = this.game.obtainCard(card.slug, card.globalId, "treasure")!;
      if (targetCard instanceof ItemCard === false)
        throw new Error(`Card ${targetCard.name} is not an ItemCard`);
      this.game.addInPlay(player, targetCard);
    }
    this.game.toast({
      type: "warning",
      title: `${player.id} used a cheat to gain ${treasures.length} treasure(s).`,
      message: `They obtained ${treasures.map((t) => t.name).join(", ")}.`,
      players: this.game.players.map((p) => p.id),
    });
  }

  debugGainCoins(player: Player, coins: number): void {
    if(!this.game.gameParameters.allowCheatOptions.value)
      throw new Error("Cheat options are not allowed in this game.");
    this.game.gainCoins(player, coins, "gift");
    this.game.toast({
      type: "warning",
      title: `${player.id} used a cheat to gain ${coins} coin(s).`,
      message: `They obtained ${coins} coin(s).`,
      players: this.game.players.map((p) => p.id),
    });
  }

  debugLoot(player: Player, lootCards: LootCard[]): void {
    if(!this.game.gameParameters.allowCheatOptions.value)
      throw new Error("Cheat options are not allowed in this game.");
    for (const card of lootCards) {
      const targetCard = this.game.obtainCard(card.slug, card.globalId, "loot")! as LootCard;
      this.game.addCardToHand(player, targetCard);
    }
    this.game.toast({
      type: "warning",
      title: `${player.id} used a cheat to loot ${lootCards.length} loot card(s).`,
      message: `They obtained ${lootCards.map((c) => c.name).join(", ")}.`,
      players: this.game.players.map((p) => p.id),
    });
  }
  debugPutMonsterCardInSlot(player: Player, card: MonsterCard, index: number): void {
    if (!card) {
      throw new Error("Card not found in the game.");
    }
    this.game.addTopPosition("monster", card);
    this.game.encounters.draw(index);
    this.game.dispatch();
    this.game.toast({
      type: "warning",
      title: `${player.id} used a cheat to summon a monster card.`,
      message: `They put ${card.name} in the monster slot ${index + 1}.`,
      players: this.game.players.map((p) => p.id),
    });
  }
}