import { z } from "zod";

export const IdentifierTypeSchema = z.object({
  name: z.string(),
  slug: z.string(),
});
export type IdentifierType = z.infer<typeof IdentifierTypeSchema>;

export const entityTypeSchema = IdentifierTypeSchema.extend({
  type: z.union([z.literal("player"), z.literal("monster")])
}); 
export type entityType = z.infer<typeof entityTypeSchema>;

const cardSchema = IdentifierTypeSchema;
export type Card = z.infer<typeof cardSchema>;

const activeEffectEntrySchema = z.object({
  index: z.union([z.literal("tap"), z.number()]),
  description: z.string(),
});
export type ActiveEffectEntry = z.infer<typeof activeEffectEntrySchema>;

// Forward declare types for circular references
export type SelectionItem = 
  | {type: "card", payload: Card}
  | {type: "stackElement", payload: StackElement}
  | {type: "player", payload: IdentifierType}
  | {type: "monster", payload: IdentifierType}
  | {type: "number", payload: number}
  | {type: "boolean", payload: boolean}
  | {type: "string", payload: string}
  | {type: "couplePlayerHand", payload: {player: IdentifierType, hand: Card[]}}
  | {type: "array", payload: SelectionItem[]}
  | {type: "object", payload: {[key: string]: SelectionItem}}
  | {type: "null", payload: null}
  | {type: "unknown", payload: null};

export type StackElement = 
  | LootCardOnStackJson
  | DeathOnStackJson
  | DamageOnStackJson
  | DiceRollJson
  | EffectOnStackJson;

const selectionItemSchema: z.ZodType<SelectionItem> = z.lazy(() => z.union([
  z.object({ type: z.literal("card"), payload: cardSchema }),
  z.object({ type: z.literal("stackElement"), payload: stackElementSchema }),
  z.object({ type: z.literal("player"), payload: IdentifierTypeSchema }),
  z.object({ type: z.literal("monster"), payload: IdentifierTypeSchema }),
  z.object({ type: z.literal("number"), payload: z.number() }),
  z.object({ type: z.literal("boolean"), payload: z.boolean() }),
  z.object({ type: z.literal("string"), payload: z.string() }),
  z.object({ type: z.literal("couplePlayerHand"), payload: z.object({ player: IdentifierTypeSchema, hand: z.array(cardSchema) }) }),
  z.object({ type: z.literal("array"), payload: z.array(selectionItemSchema) }),
  z.object({ type: z.literal("object"), payload: z.record(z.string(), selectionItemSchema) }),
  z.object({ type: z.literal("null"), payload: z.null() }),
  z.object({ type: z.literal("unknown"), payload: z.null() }),
]));

const pendingSelectionSchema = z.object({
  requestId: z.string(),
  description: z.string(),
  options: z.array(selectionItemSchema),
  count: z.number(),
  asMany: z.boolean(),
});
export type PendingSelection = z.infer<typeof pendingSelectionSchema>;

const capabilitySchema = z.union([z.literal(true), z.string()]);
export type Capability = z.infer<typeof capabilitySchema>;

const monsterCardSchema = cardSchema.extend({
  stats: z.object({
    healthPoints: z.number(),
    attackPoints: z.number(),
    evasionPoints: z.number(),
    isEngagedInCombat: z.boolean(),
    capabilities: z.object({
      targetable: capabilitySchema,
    }),
  }).optional(),
});
export type MonsterCard = z.infer<typeof monsterCardSchema>;

const inPlayCardSchema = cardSchema.extend({
  charged: z.boolean().optional(),
  capabilities: z.object({
    activate: capabilitySchema,
  }),
});
export type InPlayCard = z.infer<typeof inPlayCardSchema>;

const inPlayMeCardSchema = inPlayCardSchema.extend({
  effects: z.array(activeEffectEntrySchema).optional(),
});
export type InPlayMeCard = z.infer<typeof inPlayMeCardSchema>;

const bonusSoulCardSchema = cardSchema.extend({
  granted: z.boolean(),
});
export type BonusSoulCard = z.infer<typeof bonusSoulCardSchema>;

/**
 * Represents the server's response when building targets progressively
 */
const targetSelectorResponseSchema = z.object({
  /** Description of what to select */
  description: z.string(),
  /** How many targets to select */
  count: z.number(),
  /** Whether the player can select fewer targets than count (asMany) */
  asMany: z.boolean(),
  /** Available options as string identifiers */
  options: z.array(selectionItemSchema),
  /** Whether target building is complete */
  complete: z.boolean(),
  /** For choose-one selectors: true = picking option description, false = picking actual targets */
  isChooseOne: z.boolean(),
});
export type TargetSelectorResponse = z.infer<typeof targetSelectorResponseSchema>;

const temporaryEffectSchema = z.object({
  card: IdentifierTypeSchema.optional(),
  issuer: z.string(),
  targets: z.array(selectionItemSchema),
  description: z.string(),
});
export type temporaryEffect = z.infer<typeof temporaryEffectSchema>;

const lootCardOnStackJsonSchema = z.object({
  type: z.literal("LootCardEffect"),
  card: IdentifierTypeSchema.optional(),
  targets: z.array(selectionItemSchema),
  issuer: entityTypeSchema,
  id: z.number(),
});
export type LootCardOnStackJson = z.infer<typeof lootCardOnStackJsonSchema>;

const diceRollJsonSchema = z.object({
  type: z.literal("diceRoll"),
  diceRoll: z.number(),
  issuer: entityTypeSchema,
  card: IdentifierTypeSchema.optional(),
  targets: z.array(selectionItemSchema).optional(),
  id: z.number(),
});
export type DiceRollJson = z.infer<typeof diceRollJsonSchema>;

const deathOnStackJsonSchema = z.object({
  type: z.literal("death"),
  receiver: entityTypeSchema,
  from: entityTypeSchema,
  source: z.union([z.lazy(() => diceRollJsonSchema), IdentifierTypeSchema]),
  id: z.number(),
});
export type DeathOnStackJson = z.infer<typeof deathOnStackJsonSchema>;

const damageOnStackJsonSchema = z.object({
  type: z.literal("damage"),
  receiver: entityTypeSchema,
  from: entityTypeSchema,
  damage: z.number(),
  source: z.union([z.lazy(() => diceRollJsonSchema), IdentifierTypeSchema]),
  id: z.number(),
});
export type DamageOnStackJson = z.infer<typeof damageOnStackJsonSchema>;

const effectOnStackJsonSchema = z.object({
  type: z.literal("effect"),
  issuer: entityTypeSchema,
  targets: z.array(selectionItemSchema),
  card: IdentifierTypeSchema,
  effect: z.string(),
  id: z.number(),
});
export type EffectOnStackJson = z.infer<typeof effectOnStackJsonSchema>;

const stackElementSchema: z.ZodType<StackElement> = z.lazy(() => z.union([
  lootCardOnStackJsonSchema,
  deathOnStackJsonSchema,
  damageOnStackJsonSchema,
  diceRollJsonSchema,
  effectOnStackJsonSchema,
]));

const selectionItemTypeSchema = z.union([
  z.literal("card"),
  z.literal("stackElement"),
  z.literal("player"),
  z.literal("monster"),
  z.literal("number"),
  z.literal("boolean"),
  z.literal("string"),
  z.literal("couplePlayerHand"),
  z.literal("array"),
  z.literal("object"),
  z.literal("null"),
  z.literal("unknown"),
]);
export type SelectionItemType = z.infer<typeof selectionItemTypeSchema>;


const issuerSchema = z.object({
  id: z.string(),
  secret: z.string(),
});
export type Issuer = z.infer<typeof issuerSchema>;

const debugLootRequestSchema = issuerSchema.extend({
  slugs: z.array(z.string()).optional(),
});
const debugGainTreasureRequestSchema = issuerSchema.extend({
  slugs: z.array(z.string()).optional(),
});

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

const joinResponseSchema = z.union([
  z.object({
    status: z.literal(200),
    secret: z.string(),
  }),
  z.object({
    status: z.literal(400),
    error: z.string(),
  }),
]);
export type JoinResponse = z.infer<typeof joinResponseSchema>;

const rejoinRequestSchema = issuerSchema;

const rejoinResponseSchema = z.union([
  z.object({
    status: z.literal(200),
    gameState: z.lazy(() => detailedStateSchema).optional(),
  }),
  z.object({
    status: z.literal(400),
    error: z.string(),
  }),
]);
export type RejoinResponse = z.infer<typeof rejoinResponseSchema>;

const startRequestSchema = z.object({
  issuer: issuerSchema,
});

const resetRequestSchema = z.literal(null);

const basicResponseSchema = z.union([
  z.object({
    status: z.literal(200),
  }),
  z.object({
    status: z.literal(400),
    error: z.string(),
  }),
]);
export type BasicResponse = z.infer<typeof basicResponseSchema>;

const stringResponseSchema = z.union([
  z.object({
    status: z.literal(200),
    response: z.string(),
  }),
  z.object({
    status: z.literal(400),
    error: z.string(),
  }),
]);
export type StringResponse = z.infer<typeof stringResponseSchema>;

const debugListLootResponseSchema = z.union([
  z.object({
    status: z.literal(200),
    cards: z.array(cardSchema),
  }),
  z.object({
    status: z.literal(400),
    error: z.string(),
  }),
]);
export type DebugListLootResponse = z.infer<typeof debugListLootResponseSchema>;

const debugListTreasureResponseSchema = z.union([
  z.object({
    status: z.literal(200),
    cards: z.array(cardSchema),
  }),
  z.object({
    status: z.literal(400),
    error: z.string(),
  }),
]);
export type DebugListTreasureResponse = z.infer<typeof debugListTreasureResponseSchema>;

const nextTargetSelectorResponseSchema = z.union([
  z.object({
    response: z.lazy(() => targetSelectorResponseSchema),
    status: z.literal(200),
  }),
  z.object({
    status: z.literal(400),
    error: z.string(),
  }),
]);
export type NextTargetSelectorResponse = z.infer<typeof nextTargetSelectorResponseSchema>;

const resolveRequestSchema = startRequestSchema

const declareAttackRequestSchema = startRequestSchema;
const declarePurchaseRequestSchema = startRequestSchema;
const cancelPurchaseRequestSchema = startRequestSchema;

const declareAttackResponseSchema = basicResponseSchema;
export type DeclareAttackResponse = z.infer<typeof declareAttackResponseSchema>;
const submitSelectionSchema = z.object({
  issuer: issuerSchema,
  requestId: z.string(),
  selections: z.array(selectionItemSchema),
})

const purchaseSchema = z.object({
  issuer: issuerSchema,
  index: z.union([z.number(), z.literal("top")])
});


const cardActivationSchema = z.object({
  issuer: issuerSchema,
  index: z.number(),
  effectIndex: z.union([z.number(), z.literal("tap")]),
  targetChoices: z.array(selectionItemSchema).optional(),
});

const NextTurnRequestSchema = startRequestSchema;

const playerSchema = z.object({
  name: z.string(),
  handSize: z.number(),
  inPlay: z.array(inPlayCardSchema),
  souls: z.number(),
  soulCards: z.array(cardSchema),
  coins: z.number(),
  currentHealthPoints: z.number(),
  currentAttackPoints: z.number(),
  remainingLootPlay: z.number(),
  isEngagedInCombat: z.boolean(),
  isEngagedInPurchase: z.boolean(),
  pendingSelection: z.boolean(),
});
export type Player = z.infer<typeof playerSchema>;

const playerMeSchema = playerSchema.extend({
  hand: z.array(cardSchema),
  inPlay: z.array(inPlayMeCardSchema),
  capabilities: z.object({
    endTurn: capabilitySchema,
    declareAttack: capabilitySchema,
    declarePurchase: capabilitySchema,
    rollDice: capabilitySchema,
    buyTreasure: capabilitySchema,
    useLoot: capabilitySchema,
    resolve: capabilitySchema,
  }),
  pendingSelection: pendingSelectionSchema.optional(),
});
export type PlayerMe = z.infer<typeof playerMeSchema>;

const detailedStateSchema = z.object({
  me: playerMeSchema,
  players: z.array(playerSchema),
  monsters: z.object({
    discard: z.array(cardSchema),
    deckSize: z.number(),
    capabilities: z.object({
      targetableDeck: z.union([z.literal(true), z.string()]),
    }),
    inPlay: z.array(z.object({
      top: monsterCardSchema,
      covered: z.array(cardSchema),
    })),
  }),
  treasure: z.object({
    discard: z.array(cardSchema),
    deckSize: z.number(),
    inPlay: z.array(cardSchema),
  }),
  loot: z.object({
    discard: z.array(cardSchema),
    deckSize: z.number(),
  }),
  bonusSouls: z.array(bonusSoulCardSchema),
  turn: z.string(),
  stack: z.array(z.lazy(() => stackElementSchema)),
  firstCardTreasureDeck: cardSchema.optional(),
});
export type DetailedState = z.infer<typeof detailedStateSchema>;

export const schemas = {
  joinRequest: joinRequestSchema,
  rejoinRequest: rejoinRequestSchema,
  startRequest: startRequestSchema,
  resetRequest: resetRequestSchema,
  declareAttackRequest: declareAttackRequestSchema,
  declarePurchaseRequest: declarePurchaseRequestSchema,
  cancelPurchaseRequest: cancelPurchaseRequestSchema,
  attackMonsterRequest: AttackMonsterSchema,
  attackRollRequest: issuerSchema,
  debugLootRequest: debugLootRequestSchema,
  debugListLootRequest: issuerSchema,
  debugListTreasureRequest: issuerSchema,
  debugGainTreasureRequest: debugGainTreasureRequestSchema,
  debugResetRequest: startRequestSchema,
  resolveRequest: resolveRequestSchema,
  submitSelectionRequest: submitSelectionSchema,
  playCardRequest: cardActivationSchema,
  endTurnRequest: NextTurnRequestSchema,
  activateRequest: cardActivationSchema,
  purchaseRequest: purchaseSchema,
  giveCoinsRequest: giveCoinsSchema,
  issuer: issuerSchema,
};

export namespace Requests {
  export type Join = z.infer<typeof joinRequestSchema>;
  export type Rejoin = z.infer<typeof rejoinRequestSchema>;
  export type Start = z.infer<typeof startRequestSchema>;
  export type Reset = z.infer<typeof resetRequestSchema>;
  export type DeclareAttack = z.infer<typeof declareAttackRequestSchema>;
  export type DeclarePurchase = z.infer<typeof declarePurchaseRequestSchema>;
  export type CancelPurchase = z.infer<typeof cancelPurchaseRequestSchema>;
  export type resolve = z.infer<typeof resolveRequestSchema>;
  export type submitSelection = z.infer<typeof submitSelectionSchema>;
  export type PlayCard = z.infer<typeof cardActivationSchema>;
  export type EndTurn = z.infer<typeof NextTurnRequestSchema>;
  export type Activate = z.infer<typeof cardActivationSchema>;
  export type Purchase = z.infer<typeof purchaseSchema>;
  export type GiveCoins = z.infer<typeof giveCoinsSchema>;
  export type AttackMonster = z.infer<typeof AttackMonsterSchema>;
  export type AttackRoll = z.infer<typeof issuerSchema>;
  export type DebugLoot = z.infer<typeof debugLootRequestSchema>;
  export type DebugListLoot = z.infer<typeof issuerSchema>;
  export type DebugListTreasure = z.infer<typeof issuerSchema>;
  export type DebugGainTreasure = z.infer<typeof debugGainTreasureRequestSchema>;
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
  export type DeclarePurchase = BasicResponse;
  export type CancelPurchase = BasicResponse;
  export type AttackMonster = BasicResponse;
  export type AttackRoll = BasicResponse;
  export type DebugLoot = StringResponse;
  export type DebugListLoot = DebugListLootResponse;
  export type DebugListTreasure = DebugListTreasureResponse;
  export type DebugGainTreasure = StringResponse;
  export type DebugReset = BasicResponse;
  export type GiveCoins = BasicResponse;
}

export interface ServerToClientEvents {
  "on:game:start": () => void;
  "on:game:reset": () => void;
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

  debugListLoot: (
    request: Requests.DebugListLoot,
    callback: (response: Responses.DebugListLoot) => void,
  ) => void;

  debugListTreasure: (
    request: Requests.DebugListTreasure,
    callback: (response: Responses.DebugListTreasure) => void,
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

  declarePurchase: (
    request: Requests.DeclarePurchase,
    callback: (response: Responses.DeclarePurchase) => void,
  ) => void;

  cancelPurchase: (
    request: Requests.CancelPurchase,
    callback: (response: Responses.CancelPurchase) => void,
  ) => void;
}