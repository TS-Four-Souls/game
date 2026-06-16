import {
  Card,
  ItemCard,
  MonsterCard,
} from "@/models/cards";
import { Entity } from "@/models/entities/entity";
import { Player } from "@/models/entities/player";
import { TargetBuilder } from "@/models/targetBuilder";
import type { DetailedState, InPlayCard, InPlayMeCard, PendingSelection } from "@/shared/api";
import type { Game } from "./game";

export class GameStateSerializer {
  private game: Game;

  constructor(game: Game) {
    this.game = game;
  }

  public detailedStateJSON(player: Player): DetailedState {
    const players = [...this.game.players];

    // Rotate the array until the player is at the front
    const playerIndex = players.findIndex(p => p.id === player.id);
    for (let i = 0; i < playerIndex; i++) {
      players.push(players.shift()!);
    }
    
    const otherPlayers = players.slice(1);

    const getCardCounter = (card: ItemCard | MonsterCard): number | undefined =>
      (card.counters.isDefined("normal") ? card.counters.value("normal") : undefined);

    const getPendingSelectionDetailsForPlayer = (playerId: string): PendingSelection | undefined => {
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
    };

    const mapInPlayItem = (item: ItemCard, owner: Player): InPlayMeCard => ({
      name: item.name,
      slug: item.slug,
      globalId: item.globalId,
      charged: item.charged || !item.activeEffectList.some(e => e.index === "tap"),
      counter: getCardCounter(item),
      eternal: item.eternal,
      effects: item.activeEffectList,
      capabilities: {
        activate: this.game.actions.canActivate(item, owner),
      },
      ...(item.entity ? {
              stats: {
                healthPoints: item.entity.currentHealthPoints,
                attackPoints: this.game.entityHandler.getAttack(item.entity),
                evasionPoints: this.game.entityHandler.getDC(item.entity),
                isEngagedInCombat: item.entity.isEngagedInCombat,
                capabilities: {
                  targetable: this.game.actions.canDeclareAttackOnEntity(player, item.entity, false),
                },
                temporaryEffect: item.entity.temporaryEffects,
              }
            } : {})
    });

    const mapOtherInPlayItem = (item: ItemCard, owner: Player): InPlayCard => ({
      name: item.name,
      slug: item.json.slug,
      globalId: item.globalId,
      charged: item.charged || !item.activeEffectList.some(e => e.index === "tap"),
      capabilities: {
        activate: this.game.actions.canActivate(item, owner),
      },
      counter: getCardCounter(item),
      eternal: item.eternal,
      ...(item.entity ? {
              stats: {
                healthPoints: item.entity.currentHealthPoints,
                attackPoints: this.game.entityHandler.getAttack(item.entity),
                evasionPoints: this.game.entityHandler.getDC(item.entity),
                isEngagedInCombat: item.entity.isEngagedInCombat,
                capabilities: {
                  targetable: this.game.actions.canDeclareAttackOnEntity(player, item.entity, false),
                },
                temporaryEffect: item.entity.temporaryEffects,
              }
            } : {})
    });

    const mapCurse = (curse: MonsterCard, owner: Player): InPlayMeCard => ({
      name: curse.name,
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
                  targetable: this.game.actions.canDeclareAttackOnEntity(player, curse.entity, false),
                },
                temporaryEffect: curse.entity.temporaryEffects,
              }
            } : {})
    });

    return {
      me: {
        name: player.id,
        color: player.color,
        team: player.team,
        hand: player.hand.cards.map((c) => c.jsonAPI),
        inPlay: player.inPlay.map((c) => mapInPlayItem(c, player)).concat(player.curses.map((c) => mapCurse(c, player))),
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
        numberOfCardsOverMaxHandSize: Math.max(0, player.hand.cards.length - this.game.gameParameters.maxHandSize.value),
        pendingSelection: getPendingSelectionDetailsForPlayer(player.id),
        capabilities: {
          endTurn: this.game.actions.canEndTurn(player),
          declareAttack: this.game.actions.canDeclareAttack(player),
          declarePurchase: this.game.actions.canDeclarePurchase(player),
          rollDice: this.game.actions.canRollDice(player),
          buyTreasure: this.game.actions.canPurchase(player),
          useLoot: this.game.actions.canPlayCard(player),
          resolve: this.game.actions.canResolve(),
          canSwitchTo: this.game.actions.canSwitchTo(player, player),
          canDonateCoinsTo: "You cannot donate coins to yourself.",
        }
      },
      players: otherPlayers
        .map((p) => ({
          name: p.id,
          color: p.color,
          team: p.team,
          handSize: p.hand.cards.length,
          hand: p.handRevealed ? p.hand.cards.map((c) => c.jsonAPI) : undefined,
          inPlay: p.inPlay.map((c) => mapOtherInPlayItem(c, p)).concat(p.curses.map((c) => mapCurse(c, p))),
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
          targetable: this.game.actions.canDeclareAttackOnEntity(player, p, false),
          capabilities: {
            canSwitchTo: this.game.actions.canSwitchTo(player, p),
            canDonateCoinsTo: this.game.gameParameters.allowCoinDonation.value ? true : "Giving coins is not allowed in this game.",
          },
        })),
      monsters:
      {
        discard: this.game.decks["monster"]!.discard.map((c) => c.jsonAPI).toReversed(),
        deckSize: this.game.decks["monster"]!.cards.length,
        capabilities: {
          targetableDeck: this.game.actions.canDeclareAttackOnEntity(player, "topDeck", false),
        },
        inPlay: this.game.encounters._slots.map((m, index) => ({ card: m[m.length - 1]!, monster: this.game.encounters.monsterIn(index), covered: this.game.encounters._slots[index]!.slice(0, -1).map(c => c.jsonAPI) })).map((m) => ({

          top: {
            slug: m.card?.slug,
            name: m.card?.name,
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
      },
      ...(this.game.rooms ? { room: {
            discard: this.game.decks["room"]!.discard.map((c) => c.jsonAPI).toReversed(),
            deckSize: this.game.decks["room"]!.cards.length,
            inPlay: this.game.rooms!.activeRooms.map((c) => c!.jsonAPI),
            }
          } : {}),
      bonusSouls: this.game.bonusSouls !== undefined ? this.game.bonusSouls.map((c) => c.jsonAPI) : undefined,
      loot:
      {
        discard: this.game.decks["loot"]!.discard.map((c) => c.jsonAPI).toReversed(),
        deckSize: this.game.decks["loot"]!.cards.length,
      },
      treasure:
      {
        discard: this.game.decks["treasure"]!.discard.map((c) => c.jsonAPI).toReversed(),
        deckSize: this.game.decks["treasure"]!.cards.length,
        inPlay: this.game.shop.itemsInShop.map((c) => ((c === undefined ? undefined : { ...c!.jsonAPI, price: this.game.gameParameters.shopPrice.value + player.priceModifier }))),
        topDeckPrice: this.game.gameParameters.shopPrice.value,
      },
      turn: this.game.currentPlayer.id,
      round: this.game.gameParameters.timer.value > 0 ? this.game.gameParameters.timer.value + 1 - this.game.turnHandler.round : this.game.turnHandler.round,
      history: this.game.history,
      firstCardTreasureDeck: player.canSeeTopOfTreasureDeck ? this.game.decks["treasure"]!.cards[0]!.jsonAPI : undefined,
      stack: this.game.stack.elements.map((el) => el.json).toReversed(),
      animations: player.animations(true)
    };
  }
}
