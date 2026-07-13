import {
  ItemCard,
  MonsterCard
} from "@/models/cards";
import { Player } from "@/models/entities/player";
import { Game } from "@/models/game";
import { TargetBuilder } from "@/models/targetBuilder";
// import type { DetailedState, IdentifierType, InPlayCard, InPlayMeCard, PendingSelection } from "@/shared/api";
import * as api from "@/shared/api";
import { toSerializedTranslation } from "@/utils/translation";

export class GameStateSerializer {
  private game: Game;

  constructor(game: Game) {
    this.game = game;
  }
  /**
   * Computes the detailed state of the game for a specific player.
   * @param player for whom the state is computed
   * @returns complete state of the game.
   */
  public detailedStateJSON(player: Player): api.DetailedState {
    // Rotate the array until the player is at the front
    const players = [...this.game.players];
    const playerIndex = players.findIndex(p => p.id === player.id);
    for (let i = 0; i < playerIndex; i++) {
      players.push(players.shift()!);
    }
    
    const otherPlayers = players.slice(1);

    return {
      me: this.serializedMePlayer(player),
      players: this.serializedOtherPlayers(player, otherPlayers),
      monsters: this.serializeEncounter(player),
      ...(this.serializedRoom()),
      bonusSouls: this.game.bonusSouls !== undefined ? this.game.bonusSouls.map((c) => c.jsonAPI) : undefined,
      loot: this.serializeLootDeck(),
      treasure: this.serializeShop(player),
      turn: this.game.currentPlayer.id,
      round: this.game.gameParameters.timer.value > 0 ? this.game.gameParameters.timer.value + 1 - this.game.turnHandler.round : this.game.turnHandler.round,
      history: this.game.history,
      stack: this.game.stack.elements.map((el) => el.json).toReversed(),
      animations: player.animations(true)
    };
  }
  /**
   * Computes the serialized state of a specific player, including their hand, in-play cards, capabilities, and pending selection.
   * @param player 
   * @returns 
   */
  private serializedMePlayer(player: Player): api.PlayerMe {
    return {
      name: player.id,
      color: player.color,
      team: player.team,
      character: this.serializedMyInPlayItems(player.character, player),
      handSize: player.hand.cards.length,
      souls: player.totalSouls,
      soulCards: player.souls.map((c) => c.jsonAPI),
      coins: player.coins,
      attackRequirements: player.requirementListJSON(this.game),
      currentAttackPoints: player.attackPoints,
      currentHealthPoints: player.currentHealthPoints,
      remainingLootPlay: player.remainingLootPlay,
      isEngagedInCombat: player.isEngagedInCombat,
      temporaryEffect: player.temporaryEffects,
      isEngagedInPurchase: player.isEngagedInPurchase,
      
      hand: player.hand.cards.map((c) => c.jsonAPI),
      inPlay: player.inPlay.map((c) => this.serializedMyInPlayItems(c, player)).concat(player.curses.map((c) => this.serializeCurse(player, c, player))),
      numberOfCardsOverMaxHandSize: Math.max(0, player.hand.cards.length - this.game.gameParameters.maxHandSize.value),
      pendingSelection: this.serializedPendingSelection(player.id),
      capabilities: {
        endTurn: this.game.actions.canEndTurn(player),
        declareAttack: this.game.actions.canDeclareAttack(player),
        declarePurchase: this.game.actions.canDeclarePurchase(player),
        rollDice: this.game.actions.canRollDice(player),
        buyTreasure: this.game.actions.canPurchase(player),
        useLoot: this.game.actions.canPlayCard(player),
        resolve: this.game.actions.canResolve(),
        canSwitchTo: this.game.actions.canSwitchTo(player, player),
        canDonateCoinsTo: toSerializedTranslation("capability.cannotGiveCoinToSelf"),
      }
    };
  }
 /**
  * Serializes the in-play items of a specific player, including their effects and capabilities.
  * @param item 
  * @param owner 
  * @returns 
  */
  public serializedMyInPlayItems(item: ItemCard, owner: Player): api.InPlayMeCard {
    return {
      ...this.serializeOtherInPlay(owner, item, owner),
      effects: item.activeEffectList,
    };
  }

  /**
   * Serializes the pending selection for a specific player, if any, including the request ID, options, and selection requirements.
   * @param playerId 
   * @returns 
   */
  public serializedPendingSelection(playerId: string): api.PendingSelection | undefined {
    for (const sel of this.game.pendingMultipleSelections.values()) {
      if (sel.playerId === playerId) {
        return {
          requestId: sel.requestId,
          options: TargetBuilder.convertToSelectionItems(sel.options),
          min: sel.min,
          max: sel.max,
          description: sel.description,
          canUseOnBoardSelection: sel.canUseOnBoardSelection,
        };
      }
    }
    return undefined;
  }

  /**
   * Serializes the state of other players in the game, including the number of cards in their hands, in-play cards, and capabilities.
   * @param me player who will receive the serialized state
   * @param otherPlayers 
   * @returns 
   */
  public serializedOtherPlayers(me: Player, otherPlayers: Player[]): api.Player[] {
    return otherPlayers
        .map((p) => ({
          name: p.id,
          color: p.color,
          team: p.team,
          character: this.serializeOtherInPlay(me, p.character, p),
          handSize: p.hand.cards.length,
          hand: p.handRevealed ? p.hand.cards.map((c) => c.jsonAPI) : undefined,
          inPlay: p.inPlay.map((c) => this.serializeOtherInPlay(me, c, p)).concat(p.curses.map((c) => this.serializeCurse(me, c, p))),
          souls: p.totalSouls,
          soulCards: p.souls.map((c) => c.jsonAPI),
          coins: p.coins,
          currentAttackPoints: p.attackPoints,
          currentHealthPoints: p.currentHealthPoints,
          temporaryEffect: p.temporaryEffects,
          remainingLootPlay: p.remainingLootPlay,
          isEngagedInCombat: p.isEngagedInCombat,
          isEngagedInPurchase: p.isEngagedInPurchase,
          attackRequirements: p.requirementListJSON(this.game),
          pendingSelection: this.game.pendingMultipleSelections.values().some(sel => sel.playerId === p.id),
          targetable: this.game.actions.canDeclareAttackOnEntity(me, p, false),
          capabilities: {
            canSwitchTo: this.game.actions.canSwitchTo(me, p),
            canDonateCoinsTo: this.game.gameParameters.allowCoinDonation.value ? true : toSerializedTranslation("capability.forbidenBartering"),
          },
        }));
  }

  /**
   * Serializes in-play items. It exludes the effects list of the item.
   * @param me 
   * @param item 
   * @param owner 
   * @returns 
   */
  public serializeOtherInPlay(me: Player, item: ItemCard, owner: Player): api.InPlayCard {
    return {
      nameKey: item.nameKey,
      slug: item.slug,
      globalId: item.globalId,
      charged: item.charged || !item.activeEffectList.some(e => e.index === "tap"),
      capabilities: {
        activate: this.game.actions.canActivate(item, owner),
      },
      counter: item.counters.getIfDefined("normal"),
      eternal: item.eternal,
      ...(item.entity ? {
        stats: {
          healthPoints: item.entity.currentHealthPoints,
          attackPoints: this.game.entityHandler.getAttack(item.entity),
          evasionPoints: this.game.entityHandler.getDC(item.entity),
          isEngagedInCombat: item.entity.isEngagedInCombat,
          capabilities: {
            targetable: this.game.actions.canDeclareAttackOnEntity(me, item.entity, false),
          },
          temporaryEffect: item.entity.temporaryEffects,
        }
      } : {})
    };
  }

  /**
   * Serializes a curse card in play.
   * @param me 
   * @param curse 
   * @param owner 
   * @returns 
   */
  public serializeCurse(me: Player, curse: MonsterCard, owner: Player): api.InPlayMeCard {
    return {
      nameKey: curse.nameKey,
      slug: curse.slug,
      globalId: curse.globalId,
      charged: true,
      counter: undefined,
      eternal: false,
      effects: curse.activeEffectList,
      capabilities: {
        activate: this.game.actions.canActivate(curse, owner),
      },
      ...(curse.entity ? {
              stats: {
                healthPoints: curse.entity.currentHealthPoints,
                attackPoints: this.game.entityHandler.getAttack(curse.entity),
                evasionPoints: this.game.entityHandler.getDC(curse.entity),
                isEngagedInCombat: curse.entity.isEngagedInCombat,
                capabilities: {
                  targetable: this.game.actions.canDeclareAttackOnEntity(me, curse.entity, false),
                },
                temporaryEffect: curse.entity.temporaryEffects,
              }
            } : {})
    };
  }
  /**
   * Serializes the state of the shop, including the discard pile, deck size, items in play, and the top deck and shop price.
   * @param player is required to compute their shop price.
   * @returns 
   */
  public serializeShop(player: Player): api.Shop {
    return {
      discard: this.game.decks["treasure"]!.discard.map((c) => c.jsonAPI).toReversed(),
      deckSize: this.game.decks["treasure"]!.cards.length,
      inPlay: this.game.shop.itemsInShop.flatMap((c) => c ? [{ ...c.jsonAPI, price: this.game.gameParameters.shopPrice.value + player.priceModifier }] : []),
      topDeckPrice: this.game.gameParameters.shopPrice.value,
      firstCardTreasureDeck: player.canSeeTopOfTreasureDeck && this.game.decks["treasure"]!.cards[0] !== undefined ? this.game.decks["treasure"]!.cards[0]!.jsonAPI : undefined,
    };
  }

  /**
   * @returns Serializes the Loot deck.
   */
  public serializeLootDeck(): api.LootDeck {
    return {
      discard: this.game.decks["loot"]!.discard.map((c) => c.jsonAPI).toReversed(),
      deckSize: this.game.decks["loot"]!.cards.length,
    };
  }

  /**
   * @returns Serializes the Room slots.
   */
  public serializedRoom(): api.RoomSlot | {} {
  return this.game.rooms ? { room: {
      discard: this.game.decks["room"]!.discard.map((c) => c.jsonAPI).toReversed(),
      deckSize: this.game.decks["room"]!.cards.length,
      inPlay: this.game.rooms!.activeRooms.map((c) => c!.jsonAPI),
      }
    } : {}
  }

  /**
   * Serializes the state of the encounter, including the discard pile, deck size, and monsters in play with their stats and capabilities.
   * @param player 
   * @returns 
   */
  public serializeEncounter(player: Player): api.Encounter {
    return {
        discard: this.game.decks["monster"]!.discard.map((c) => c.jsonAPI).toReversed(),
        deckSize: this.game.decks["monster"]!.cards.length,
        capabilities: {
          targetableDeck: this.game.actions.canDeclareAttackOnEntity(player, "topDeck", false),
        },
        inPlay: this.game.encounters._slots.map((m, index) => ({ card: m[m.length - 1]!, monster: this.game.encounters.monsterIn(index), covered: this.game.encounters._slots[index]!.slice(0, -1).map(c => c.jsonAPI) })).map((m) => ({

          top: {
            slug: m.card?.slug,
            nameKey: m.card?.nameKey,
            globalId: m.card?.globalId,
            ...(m.monster ? {
              stats: {
                healthPoints: m.monster.currentHealthPoints,
                attackPoints: this.game.entityHandler.getAttack(m.monster),
                evasionPoints: this.game.entityHandler.getDC(m.monster),
                isEngagedInCombat: m.monster.isEngagedInCombat,
                capabilities: {
                  targetable: this.game.actions.canDeclareAttackOnEntity(player, m.monster, false),
                },
                temporaryEffect: m.monster.temporaryEffects,
              }

            } : {})
          },
          covered: m.covered,
        })),
      };
    }


}
