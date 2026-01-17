import { z } from "zod";

const issuerSchema = z.object({
  id: z.string(),
  secret: z.string(),
});
export type Issuer = z.infer<typeof issuerSchema>;

const indexSchema = z.object({
  issuer: issuerSchema,
  index: z.number(),
});

const giveCoinsSchema = z.object({
  issuer: issuerSchema,
  target: z.string(),
  coins: z.number(),
});

const AttackMonsterSchema = z.union([
  z.object({
    issuer: issuerSchema,
    index: z.number(),
  }),
  z.object({
    issuer: issuerSchema,
    index: z.literal("top"),
    replaceIndex: z.number(),
  }),
]);



const joinRequestSchema = z.string();

type JoinResponse =
  | {
    status: 200;
    secret: string;
  }
  | {
    status: 400;
    error: any;
  };

const rejoinRequestSchema = issuerSchema;

type RejoinResponse =
  | {
    status: 200;
    gameState?: DetailedState;
  }
  | {
    status: 400;
    error: any;
  };

const startRequestSchema = z.object({
  issuer: issuerSchema,
});

const resetRequestSchema = z.void();

type BasicResponse =
  | {
    status: 200;
  }
  | {
    status: 400;
    error: any;
  };

  type StringResponse =
  | {
    status: 200;
    response: string;
  }
  | {
    status: 400;
    error: any;
  };

  type NextTargetSelectorResponse =
  | {
    response: TargetSelectorResponse;
    status: 200;
  }
  | {
    status: 400;
    error: any;
  };

const resolveRequestSchema = startRequestSchema

const declareAttackRequestSchema = startRequestSchema;
type DeclareAttackResponse = BasicResponse
const submitSelectionSchema = z.object({
  issuer: issuerSchema,
  requestId: z.string(),
  selections: z.array(z.string()),
})


const cardActivationSchema = z.object({
  issuer: issuerSchema,
  index: z.number(),
  effectIndex: z.union([z.number(), z.literal("tap")]),
  targetChoices: z.array(z.string()).optional(),
});

const NextTurnRequestSchema = startRequestSchema;

export type DetailedState = {
  me: PlayerMe;
  players: Player[];

  monsters: {
    discard: Card[];
    deckSize: number;
    inPlay: { top: MonsterCard; covered: Card[] }[];
  };

  treasure: {
    discard: Card[];
    deckSize: number;
    inPlay: Card[];
  };

  loot: {
    discard: Card[];
    deckSize: number;
  };

  bonusSouls: BonusSoulCard[];

  turn: string;
  stack: string[];

  firstCardTreasureDeck?: Card;
  pendingSelection?: PendingSelection;
};

export type Player = {
  name: string;
  handSize: number;
  inPlay: InPlayCard[];
  souls: number;
  soulCards: Card[];
  coins: number;
  currentHealthPoints: number;
  currentAttackPoints: number;
  remainingLootPlay: number;
  isEngagedInCombat: boolean;
};

export type PlayerMe = Player & {
  hand: Card[];
  inPlay: InPlayMeCard[];
  canEndTurn: boolean;
};

export type Card = {
  slug: string;
};

export type MonsterCard = Card & {
  stats?: {
    healthPoints: number;
    attackPoints: number;
    evasionPoints: number;
    isEngagedInCombat: boolean;
  };
};

export type InPlayCard = Card & {
  charged?: boolean;
};

export type InPlayMeCard = InPlayCard & {
  effects?: ActiveEffectEntry[];
};

export type BonusSoulCard = Card & {
  granted: boolean;
};

export type PendingSelection = {
  requestId: string;
  description: string;
  options: string[];
  count: number;
  asMany: boolean;
};

export type ActiveEffectEntry = {
  index: "tap" | number;
  description: string;
};

export const schemas = {
  joinRequest: joinRequestSchema,
  rejoinRequest: rejoinRequestSchema,
  startRequest: startRequestSchema,
  resetRequest: resetRequestSchema,
  declareAttackRequest: declareAttackRequestSchema,
  attackMonsterRequest: AttackMonsterSchema,
  attackRollRequest: issuerSchema,
  debugLootRequest: issuerSchema,
  debugGainTreasureRequest: issuerSchema,
  debugResetRequest: startRequestSchema,
  resolveRequest: resolveRequestSchema,
  submitSelectionRequest: submitSelectionSchema,
  playCardRequest: cardActivationSchema,
  endTurnRequest: NextTurnRequestSchema,
  activateRequest: cardActivationSchema,
  purchaseRequest: indexSchema,
  giveCoinsRequest: giveCoinsSchema,
  issuer: issuerSchema,
};

export namespace Requests {
  export type Join = z.infer<typeof joinRequestSchema>;
  export type Rejoin = z.infer<typeof rejoinRequestSchema>;
  export type Start = z.infer<typeof startRequestSchema>;
  export type Reset = z.infer<typeof resetRequestSchema>;
  export type DeclareAttack = z.infer<typeof declareAttackRequestSchema>;
  export type resolve = z.infer<typeof resolveRequestSchema>;
  export type submitSelection = z.infer<typeof submitSelectionSchema>;
  export type PlayCard = z.infer<typeof cardActivationSchema>;
  export type EndTurn = z.infer<typeof NextTurnRequestSchema>;
  export type Activate = z.infer<typeof cardActivationSchema>;
  export type Purchase = z.infer<typeof indexSchema>;
  export type GiveCoins = z.infer<typeof giveCoinsSchema>;
  export type AttackMonster = z.infer<typeof AttackMonsterSchema>;
  export type AttackRoll = z.infer<typeof issuerSchema>;
  export type DebugLoot = z.infer<typeof issuerSchema>;
  export type DebugGainTreasure = z.infer<typeof issuerSchema>;
  export type DebugReset = z.infer<typeof startRequestSchema>;
}

export namespace Responses {
  export type Join = JoinResponse;
  export type Rejoin = RejoinResponse;
  export type Start = BasicResponse;
  export type Reset = BasicResponse;
  export type DeclareAttack = DeclareAttackResponse;
  export type resolve = BasicResponse;
  export type submitSelection = BasicResponse;
  export type PlayCard = NextTargetSelectorResponse;
  export type EndTurn = StringResponse;
  export type Activate = NextTargetSelectorResponse;
  export type Purchase = BasicResponse;
  export type AttackMonster = BasicResponse;
  export type AttackRoll = BasicResponse;
  export type DebugLoot = StringResponse;
  export type DebugGainTreasure = StringResponse;
  export type DebugReset = BasicResponse;
  export type GiveCoins = BasicResponse;
}

export interface ServerToClientEvents {
  "on:game:start": () => void;
  "on:game:changed": (state: DetailedState) => void;
}

export interface ClientToServerEvents {
  join: (
    request: Requests.Join,
    callback: (response: Responses.Join) => void,
  ) => void;
  rejoin: (
    request: Requests.Rejoin,
    callback: (response: Responses.Rejoin) => void,
  ) => void;
  start: (
    request: Requests.Start,
    callback: (response: Responses.Start) => void,
  ) => void;
  reset: (
    request: Requests.Reset,
    callback: (response: Responses.Reset) => void,
  ) => void;

  declareAttack: (
    request: Requests.DeclareAttack,
    callback: (response: Responses.DeclareAttack) => void,
  ) => void;

  resolve: (
    request: Requests.resolve,
    callback: (response: Responses.resolve) => void,
  ) => void;

  submitSelection: (
    request: Requests.submitSelection,
    callback: (response: Responses.submitSelection) => void,
  ) => void;

  playCard: (
    request: Requests.PlayCard,
    callback: (response: Responses.PlayCard) => void,
  ) => void;

  endTurn: (
    request: Requests.EndTurn,
    callback: (response: Responses.EndTurn) => void,
  ) => void;

  activate: (
    request: Requests.Activate,
    callback: (response: Responses.Activate) => void,
  ) => void;

  purchase: (
    request: Requests.Purchase,
    callback: (response: Responses.Purchase) => void,
  ) => void;

  attackMonster: (
    request: Requests.AttackMonster,
    callback: (response: Responses.AttackMonster) => void,
  ) => void;

  attackRoll: (
    request: Requests.AttackRoll,
    callback: (response: Responses.AttackRoll) => void,
  ) => void;

  debugLoot: (
    request: Requests.DebugLoot,
    callback: (response: Responses.DebugLoot) => void,
  ) => void;

  debugGainTreasure: (
    request: Requests.DebugGainTreasure,
    callback: (response: Responses.DebugGainTreasure) => void,
  ) => void;

  debugReset: (
    request: Requests.DebugReset,
    callback: (response: Responses.DebugReset) => void,
  ) => void;

  giveCoins: (
    request: Requests.GiveCoins,
    callback: (response: Responses.GiveCoins) => void,
  ) => void;
}

/**
 * Represents the server's response when building targets progressively
 */
export interface TargetSelectorResponse {
    /** Description of what to select */
    description: string;
    /** How many targets to select */
    count: number;
    /** Whether the player can select fewer targets than count (asMany) */
    asMany: boolean;
    /** Available options as string identifiers */
    options: string[];
    /** Whether target building is complete */
    complete: boolean;
    /** For choose-one selectors: true = picking option description, false = picking actual targets */
    isChooseOne: boolean;
}

export type temporaryEffect =
{
    slug: string,
    issuer: string,
    targets: string[],
    description: string
}

export type LootCardOnStackJson = 
{
    type: "LootCardEffect",
    slug: string,
    targets: string[],
    issuer: string
}

export type DiceRollJson = {
  diceRoll: number;
  issuer: string;
  card?: string;
  targets?: string[];
};

export type DeathOnStackJson = {
  receiver: string, 
  from: string, 
  source: DiceRollJson | string
};

export type DamageOnStackJson = {
  receiver: string, 
  from: string, 
  damage: number,
  source: DiceRollJson | string
};

export type EffectOnStackJson = { 
  issuer: string, 
  targets: string[], 
  card: string, 
  effect: string 
};