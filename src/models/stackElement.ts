import type { StackReorderingInfo as ApiStackReorderingInfo, DamageOnStackJson, DeathOnStackJson, DiceRollJson, StackElementJson, LootStepJson, EffectOnStackJson, LootCardOnStackJson, VisualEffectBox } from "@/shared/api";
import type { Entity } from "./entities/entity";
import type { Game } from "./game";
import { EffectData, LootCard, type Card, type EffectFunction } from "./cards";
import { Player } from "./entities/player";
import { TargetBuilder } from "./targetBuilder";
import { trueEffect } from "./effects/activeEffect";

interface StackElementJsonBase {
  id: number;
  reordering?: StackReorderingInfo;
}

export abstract class StackElement {
  private _stackId: number = -1;
  private _reordering: StackReorderingInfo | null = null;
  
  set stackId(id: number) {
    this._stackId = id;
  }

  get stackId(): number {
    return this._stackId;
  }

  set reordering(info: StackReorderingInfo | null) {
    this._reordering = info;
  }

  get reordering(): StackReorderingInfo | null {
    return this._reordering;
  }

  get isReorderable(): boolean {
    return this._reordering !== null;
  }

  protected get baseJson(): StackElementJsonBase {
    return {
      id: this.stackId,
      ...(this.reordering ? { reordering: this.reordering } : {}),
    };
  }

  abstract get json(): StackElementJson;
  abstract get debugLogs(): string;

  abstract onResolve(): Promise<void | boolean>;
}

export type StackReorderingInfo = ApiStackReorderingInfo;


export class DiceRoll extends StackElement {
  private _value: number;
  private _issuer: Player;
  private _effectIssuer: Entity | null = null;
  private _attackRoll;
  private _effect: EffectFunction[] | null = null;
  private _card: Card | null = null;
  private _visualEffectBox: VisualEffectBox | null = null;
  private _targets: any[] = [];
  private _random: () => number;
  private _readyToResolve: boolean = false;

  constructor(random: () => number, issuer: Player, attackRoll: boolean = false, card: Card | null = null) {
    super();
    if(!attackRoll && !card) {
      throw new Error("Non-attack dice rolls must be associated with a card.");
    }
    this._random = random;
    this._issuer = issuer;
    this._attackRoll = attackRoll;
    this._card = card;
    this._value = this.roll();
  }
  set targets(targets: any[]) {
    this._targets = targets;
  }

  get attackRoll(): boolean {
    return this._attackRoll;
  }
  get issuer(): Player {
    return this._issuer;
  }
  get value(): number {
    return this._value;
  }
  set value(v: number) {
    const prev = this._value;
    this._value = Math.max(1, Math.min(6, v));
    if (prev !== this._value)
      this.readyToResolve = false;
  }
  get card(): Card | null {
    return this._card;
  }

  get readyToResolve(): boolean {
    return this._readyToResolve;
  }

  set readyToResolve(value: boolean) {
    this._readyToResolve = value;
  }

  add(modifier: number): void {
    if(modifier < 0){
      throw new Error("Modifier must be positive");
    }
    this.value = this.value + modifier;
  }
  subtract(modifier: number): void {
    if (modifier < 0) {
      throw new Error("Modifier must be positive");
    }
    this.value = this.value - modifier;
  }
  override get json(): DiceRollJson {
    return { 
      type: "diceRoll",
      diceRoll: this.value, 
      issuer: this.issuer.json, 
      card: !this._attackRoll ? this._card!.jsonAPI : undefined,
      visualEffectBox: this.obtainVisualBox(),
      targets: !this._attackRoll ? TargetBuilder.convertToSelectionItems(this._targets) : undefined,
      ...super.baseJson,
      modifier: (this._attackRoll ? this._issuer.attackDiceModifier : 0) + this._issuer.diceModifier,
    }
  }

  /**
   * provide the visual effect box associated with this dice roll.
   */
  private obtainVisualBox(): VisualEffectBox | undefined {
    if(!this._effect || this._effect.length !== 6)
      return undefined;
    if(!this.card)
      return undefined;
    if(!this._visualEffectBox)
      return undefined;
    if(this._effect[this.value - 1] == trueEffect())
      return undefined;
    const range = this._visualEffectBox.endIndex - this._visualEffectBox.startIndex + 1;
    if(range === 1)
      return this._visualEffectBox;
    const step = 6 / range;
    const boxIndex = Math.floor(this.value / step);
    return {startIndex: this._visualEffectBox.startIndex + boxIndex, endIndex: this._visualEffectBox.startIndex + boxIndex};
  }

  override get debugLogs(): string {
    return `${this.attackRoll ? "Attack" : "Dice"} Roll: ${this.value} (Issuer: ${this.issuer.id}, Card: ${this._card ? this._card.name : "N/A"}, Targets: ${!this._attackRoll ? TargetBuilder.convertToSelectionItems(this._targets) : "N/A"}, Modifier: ${(this._attackRoll ? this._issuer.attackDiceModifier : 0) + this._issuer.diceModifier})`;
  }
  
  roll(): number {
    const old = this._value;
    this.value = Math.floor(this._random() * 6) + 1;
    return this._value;
  }
  /**
   * Modify the random function used for this dice roll (for testing purposes only)
   */
  _TEST_setRandom(random: () => number): void {
    this._random = random;
  }
  attachEffect(effect: EffectFunction[], card: Card, targets: any[]=[], effectIssuer: Entity | null = null): void {
    if(effect.length != 6)
      throw new Error("Effect must have 6 outcomes, one for each dice face.");
    this._effect = effect;
    this._card = card;
    this._targets = targets;
    this._effectIssuer = effectIssuer;
  }
  async onResolve(): Promise<void> {
    if(this.attackRoll)
      if(this._issuer.isDead || this._targets.length === 0 || this._targets[0].isDead)
        return; // No effect if attacker or target is dead
    this.value += (this._attackRoll ? this._issuer.attackDiceModifier : 0) + this._issuer.diceModifier;
    if (this._effect?.length === 6) {
      const effectIssuer = this._effectIssuer ?? this._issuer;
      // For attack rolls, prepend the dice roll itself to targets so effects can use it as the damage source
      const targetsWithDiceRoll = this._attackRoll ? [this, ...this._targets] : this._targets;
      await this._effect[this._value - 1]!(new EffectData(this._card!, () => effectIssuer, targetsWithDiceRoll));
    }
  }
}

export class DamageOnStack extends StackElement {

  from: Entity;
  receiver: Entity;
  damage: number[];
  _source: Card | DiceRoll;
  _targets: any[] = [];
  _effect: EffectFunction | null = null;
  game: Game;

  constructor(
    from: Entity,
    receiver: Entity,
    damage: number[],
    source: Card | DiceRoll,
    game: Game
  ) {
    super();
    this.receiver = receiver;
    this.from = from;
    this.damage = damage;
    this._source = source;
    this.game = game;
  }
  attachEffect(effect: EffectFunction, source: Card | DiceRoll, targets: any[] = []): void {
    this._effect = effect;
    this._source = source;
    this._targets = targets;
  }

  async onResolve(): Promise<void> {
    this.game.entityHandler.resolveDamage(this.from, this.receiver, this._source, this.damage[0]!);
    if(this._effect) {
      const card = this._source instanceof DiceRoll ? this._source.card! : this._source;
      if(this.from instanceof Player === false)
        throw new Error("Damage effect issuer is not a player");
      await this._effect(new EffectData(card, () => this.from, [this, this._targets]));
    }
  }
  override get json(): DamageOnStackJson {
    const sourceName = this._source instanceof DiceRoll ? this._source.json : this._source.jsonAPI;
    return {
      type: "damage",
      from: this.from.json, 
      receiver: this.receiver.json, 
      damage: this.damage[0]!, 
      source: sourceName,
      ...super.baseJson,
    };
  }
  override get debugLogs(): string {
    return `${this.from.id} deals ${this.damage[0]} damage to ${this.receiver.id} (${this.receiver.currentHealthPoints})HP with source ${this._source instanceof DiceRoll ? "Dice Roll" : this._source.name} (Targets: ${TargetBuilder.convertToSelectionItems(this._targets)})`;
  }
};

export class DeathOnStack extends StackElement {

  receiver: Entity;
  from: Entity;
  source: Card | DiceRoll; 
  game: Game;

  constructor(
    receiver: Entity,
    from: Entity,
    source: Card | DiceRoll,
    game: Game
  ) {
    super();
    this.receiver = receiver;
    this.from = from;
    this.source = source;
    this.game = game;
  }
  async onResolve(): Promise<void> {
    await this.game.entityHandler.resolveDeath(this.receiver, this.from, this.source);
  }

  override get json(): DeathOnStackJson {
    const sourceName = this.source instanceof DiceRoll ? this.source.json : this.source.jsonAPI;
    this.receiver.json;
    return {
      type: "death",
      receiver: this.receiver.json,
      from: this.from.json,
      source: sourceName,
      ...super.baseJson,
    };
  }
  override get debugLogs(): string {
    const sourceName = this.source instanceof DiceRoll ? "Dice Roll" : this.source.name;
    return `${this.from.id} kills ${this.receiver.id} with source ${sourceName}`;
  }
};

export class LootStepOnStack extends StackElement {
  
  player: Player
  nbLoots: number;
  game: Game;
  
  constructor(player: Player, nbLoots: number, game: Game) {
    super();
    this.player = player;
    this.nbLoots = nbLoots;
    this.game = game;
  }
  override get json(): LootStepJson {
    return {
      type: "lootStep",
      player: this.player.json,
      nbLoots: this.nbLoots,
      ...super.baseJson,
    };
  }
  override get debugLogs(): string {
    return `LootStep: ${this.player.id} loots ${this.nbLoots} card(s)`;
  }
  override async onResolve(): Promise<void> {
    this.game.lootStep(this.player, this.nbLoots);
    return new Promise(resolve => setTimeout(resolve, 0));
  }
}

export class LootCardEffect extends StackElement {
    private _card: LootCard;
    private _targets: any[];
    private _issuer: Player;

    constructor(issuer: Player, card: LootCard, targets: any[]) {
        super();
        this._card = card;
        this._targets = targets;
        this._issuer = issuer;
    }

    get card(): LootCard {
        return this._card;
    }

    get issuer(): Player {
        return this._issuer;
    }

    async onResolve(): Promise<void> {
        await this._card.onPlay(this.issuer, this.targets)();
    }

    override get json(): LootCardOnStackJson {
        return {
            type: "LootCardEffect",
            card: this.card.jsonAPI,
            targets: TargetBuilder.convertToSelectionItems(this.targets),
            issuer: this.issuer.json,
            ...super.baseJson,
        };
    }
    override get debugLogs(): string {
        return `LootCardEffect from ${this.issuer.id} for card ${this.card.name} with targets: ${JSON.stringify(TargetBuilder.convertToSelectionItems(this.targets))}`;
    }

    get targets(): any[] {
        return this._targets;
    }
}
function prepareEffectString(s: string): string {
    s = s.replace("[Tap Effect]", ""); // remove tap effect marker
    s = s.replace("[Paid Effect]", ""); // remove paid effect marker
    s = s.replace("[Curse Effect] ", ""); // remove curse effect marker
    s = s.trim();
    return s;
}
export type EffectTypeOnStack = "active" | "paid" | "passive" | "event";
export class EffectOnStack extends StackElement {
    protected _effectFunction: EffectFunction;
    protected _data: EffectData;
    protected _description: string;
    protected _type: EffectTypeOnStack;
    protected _visualEffectBox: VisualEffectBox | undefined;

    constructor(effectFunction: EffectFunction, data: EffectData, description: string, type: EffectTypeOnStack, visualEffectBox?: VisualEffectBox) {
        super();
        // if(!data)
        //     throw new Error("EffectOnStack constructor: data is undefined or null.");
        this._effectFunction = effectFunction;
        this._data = data;
        this._description = prepareEffectString(description);
        this._type = type;
        this._visualEffectBox = visualEffectBox;
    }
    async onResolve(): Promise<boolean> {
        return await this._effectFunction(this._data);
    }

    get data(): EffectData {
        return this._data;
    }
    get type(): EffectTypeOnStack {
        return this._type;
    }
    set targets(targets: any[]) {
        this._data.targets = targets;
        // Reset the consumption index when targets are set externally
        (this._data as any)._nextIndex = 0;
    }
    override get json(): EffectOnStackJson {
        return {
            type: "effect",
            issuer: this._data.issuer.json,
            targets: TargetBuilder.convertToSelectionItems([...this._data.targets, ...this._data.selectedOnResolve]),
            card: this.data.it.jsonAPI,
            effect: this._description,
            visualEffectBox: this._visualEffectBox,
            ...super.baseJson,
        };
    }

    override get debugLogs(): string {
        return `card effect ${this.data.it.name} ${this.data.it.globalId} ISSUER ${this._data.issuer.id} EFFECT "${this._description}" TARGETS: ${JSON.stringify(TargetBuilder.convertToSelectionItems(this._data.targets))}`;
    }
}
