import { Game } from "./game";
import type { Player } from "./player";
import type { Entity } from "./entity";
import { TargetBuilder } from "./targetBuilder";
import type { ItemCard } from "./cards";
import { shuffle } from "@/utils/auxiliary";

export enum ActionType {
    ATTACK = "attack",
    DECLARE_ATTACK = "declare_attack",
    PURCHASE = "purchase",
    DECLARE_PURCHASE = "declare_purchase",
    CANCEL_PURCHASE = "cancel_purchase",
    USE_ITEM = "use_item",
    PLAY_LOOT = "play_loot",
    END_TURN = "end_turn",
    ROLL = "roll",
    RESOLVE_STACK = "resolve_stack",
}

abstract class Action {
    type: ActionType;
    execute: (game: Game) => Promise<void> | void;
    me: Player;

    constructor(type: ActionType, execute: (game: Game) => Promise<void> | void, me: Player) {
        this.type = type;
        this.execute = execute;
        this.me = me;
    }

    abstract isFeasible(game: Game): boolean;
}

export class DeclareAttackAction extends Action {
    constructor(me: Player) {
        super(ActionType.DECLARE_ATTACK, (game) => game.declareAttack(me), me);
    }

    isFeasible(game: Game): boolean {
        return game.canDeclareAttack(this.me, false) === true;
    }
}

export class ResolveStackAction extends Action {
    constructor(me: Player) {
        super(ActionType.RESOLVE_STACK, async (game) => await game.resolveStack(), me);
    }

    isFeasible(game: Game): boolean {
        return game.stack.size > 0;
    }
}

export class DeclarePurchaseAction extends Action {
    constructor(me: Player) {
        super(ActionType.DECLARE_PURCHASE, (game) => game.declarePurchase(me), me);
    }

    isFeasible(game: Game): boolean {
        return game.canDeclarePurchase(this.me, false) === true;
    }
}

export class EndTurnAction extends Action {
    constructor(me: Player) {
        super(ActionType.END_TURN, async (game) => await game.nextTurn(me), me);
    }

    isFeasible(game: Game): boolean {
        // console.log("BOT can end turn:", game.canEndTurn(this.me, false));
        return game.canEndTurn(this.me, false) === true;
    }
}

export class RollAction extends Action {
    constructor(me: Player) {
        super(ActionType.ROLL, (game) => game.attackRoll(me), me);
    }

    isFeasible(game: Game): boolean {
        return game.canRollDice(this.me, false) === true;
    }
}

export class PlayLootAction extends Action {
    private _targets: any[] = [];
    private _index: number;
    constructor(me: Player, index: number) {
        super(ActionType.PLAY_LOOT, async (game) => {await game.playCard(me, this._index, this._targets)}, me);
        this._index = index;
    }

    set targets(targets: any[]) {
        this._targets = targets;
    }

    get index(): number {
        return this._index;
    }

    isFeasible(game: Game): boolean {
        const me = this.me;
        if (game.canPlayCard(me, false) !== true) return false;
        const loot = me.hand.cards[this._index];
        if (!loot) return false;
        return TargetBuilder.validTargetExists(game, me, loot, "tap") === true;
    }
}

export class DeclareAttackOnEntityAction extends Action {
    private _target: Entity | "topDeck";
    constructor(me: Player, target: "topDeck" | Entity, drawInIndex: number = 0) {
        if(target === "topDeck") {
            super(ActionType.ATTACK, async (game) => {await game.declareAttackOnEntity(me, "topDeck", drawInIndex)}, me);
        }
        else {
            super(ActionType.ATTACK, async (game) => {await game.declareAttackOnEntity(me, target)}, me);
        }
        this._target = target;
    }
    get target(): Entity | "topDeck" {
        return this._target;
    }

    isFeasible(game: Game): boolean {
        const me = this.me;
        if (!me.isEngagedInCombat) return false;
        return game.canDeclareAttackOnEntity(me, this._target, false) === true;
    }
}

export class PurchaseAction extends Action {
    private _index: number | "top" = 0;
    constructor(me: Player) {
        super(ActionType.PURCHASE, async (game) => {await game.purchase(me, this._index)}, me);
    }

    set index(index: number | "top") {
        this._index = index;
    }

    isFeasible(game: Game): boolean {
        return game.canPurchase(this.me, false) === true;
    }
}

export class UseItemAction extends Action {
    private _targets: any[] = []
    private _index: number | "tap" = 0;
    private _item: ItemCard;
    constructor(me: Player, item: ItemCard) {
        super(ActionType.USE_ITEM, async (game) => {await game.activateItem(me, item, this._targets, this._index)}, me);
        this._item = item;
    }

    set targets(targets: any[]) {
        this._targets = targets;
    }
    set index(index: number | "tap") {
        this._index = index;
    }
    get item(): ItemCard {
        return this._item;
    }

    isFeasible(game: Game): boolean {
        const me = this.me;
        if (!me.canIActivateThisTurn) return false;
        return game.canActivate(this._item, me) === true;
    }
}

export class CancelPurchaseAction extends Action {
    constructor(me: Player) {
        super(ActionType.CANCEL_PURCHASE, async (game) => {await game.cancelPurchase(me)}, me);
    }

    isFeasible(game: Game): boolean {
        const me = this.me;
        return game.canPurchase(me, false) !== true && me.isEngagedInPurchase;
    }
}

// todo: randomize item targets and index.
export class Bot {
    private _game: Game;
    private _me: Player;

    constructor(game: Game, me: Player) {
        this._game = game;
        this._me = me;
    }

    get game(): Game {
        return this._game;
    }

    get me(): Player {
        return this._me;
    }

    get allActions(): Action[] {
        return [
            new DeclareAttackAction(this._me),
            new DeclarePurchaseAction(this._me),
            new EndTurnAction(this._me),
            new RollAction(this._me),
            new ResolveStackAction(this._me),
            ...this._me.hand.cards.map((card, index) => new PlayLootAction(this._me, index)),
            ...this._me.inPlay.filter(card => card.activeEffectList.length > 0).map(card => new UseItemAction(this._me, card as ItemCard)),
            ...(this._me.isEngagedInCombat ? [new DeclareAttackOnEntityAction(this._me, "topDeck"), ...this.game.monsters.map(monster => new DeclareAttackOnEntityAction(this._me, monster))] : []),
            new PurchaseAction(this._me),
            new CancelPurchaseAction(this._me),
        ];
    }  

    get randomFeasibleAction(): Action | null {
        const all = this.allActions;
        shuffle(this._game.random, all);
        for(const action of all) {
            if(action.isFeasible(this.game)) {
                return action;
            }
        }
        return null;
    }

    get playableActions(): Action[] {
        const playableActions: Action[] = [];
        const allActions = this.allActions;
        
        for (const action of allActions) {
            if (action.isFeasible(this.game)) {
                playableActions.push(action);
            }
        }
        
        return playableActions;
    }
}