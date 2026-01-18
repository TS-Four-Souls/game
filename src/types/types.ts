import { z } from "zod";

const IssuerSchema = z.object({
  id: z.string(),
  secret: z.string(),
});

const UserProtectedRequestSchema = z.object({
  issuer: IssuerSchema,
});

const JoinRequestSchema = z.object({
  id: z.string(),
});

const AttackRequestSchema = UserProtectedRequestSchema.extend({
  monsterId: z.string(),
});

const gainCoinsSchema = UserProtectedRequestSchema.extend({
  coins: z.number(),
});

const loseCoinsSchema = UserProtectedRequestSchema.extend({
  coins: z.number(),
  asMany: z.boolean(),
});

const discardLootSchema = UserProtectedRequestSchema.extend({
  position: z.number(),
});

const indexSchema = UserProtectedRequestSchema.extend({
  index: z.number(),
});

const attackMonsterSchema = z.union([
  UserProtectedRequestSchema.extend({
    index: z.number(),
  }),
  UserProtectedRequestSchema.extend({
    index: z.literal("top"),
    replaceIndex: z.number(),
  }),
]);

const cardActivationSchema = UserProtectedRequestSchema.extend({

  index: z.number(),
  effectIndex: z.union([z.number(), z.literal("tap")]),
  targetChoices: z.array(z.string()).optional(),
});

const NextTurnRequestSchema = UserProtectedRequestSchema.extend({});

const ImageRequestSchema = UserProtectedRequestSchema.extend({
  path: z.string(),
});

const SubmitSelectionSchema = UserProtectedRequestSchema.extend({
  requestId: z.string(),
  selectedOptions: z.array(z.string()),
});


export const schemas = {
  joinRequest: JoinRequestSchema,
  userProtectedRequest: UserProtectedRequestSchema,
  attackRequest: AttackRequestSchema,
  nextTurnRequest: NextTurnRequestSchema,
  gainCoinsRequest: gainCoinsSchema,
  loseCoinsRequest: loseCoinsSchema,
  discardLootRequest: discardLootSchema,
  purchaseRequest: indexSchema,
  discardMonsterRequest: indexSchema,
  killMonsterRequest: indexSchema,
  drawMonsterRequest: indexSchema,
  discardInPlayRequest: indexSchema,
  playCardRequest: cardActivationSchema,
  attackMonsterRequest: attackMonsterSchema,
  imageRequest: ImageRequestSchema,
  activateRequest: cardActivationSchema,
  issuerRequest: IssuerSchema,
  submitSelectionRequest: SubmitSelectionSchema,
};

export type Issuer = z.infer<typeof IssuerSchema>;

// export type State = {
//   players: {
//     name: string;
//     inPlay: { slug: string }[];
//   }[];
// };


// export type DetailedState = {
//   me: PlayerMe;
//   players: Player[];

//   monsters: {
//     discard: Card[];
//     deckSize: number;
//     inPlay: { top: MonsterCard; covered: Card[] }[];
//   };

//   treasure: {
//     discard: Card[];
//     deckSize: number;
//     inPlay: Card[];
//   };

//   loot: {
//     discard: Card[];
//     deckSize: number;
//   };

//   bonusSouls: BonusSoulCard[];

//   turn: string;
//   stack: string[];
//   pendingSelection?: PendingSelection;
// };

// export type Player = {
//   name: string;
//   handSize: number;
//   inPlay: InPlayCard[];
//   souls: number;
//   soulCards: Card[];
//   coins: number;
//   currentHealthPoints: number;
//   currentAttackPoints: number;
//   remainingLootPlay: number;
//   isEngagedInCombat: boolean;
// };

// export type PlayerMe = Player & {
//   hand: Card[];
//   inPlay: InPlayMeCard[];
// };

// export type Card = {
//   slug: string;
// };

// export type MonsterCard = Card & {
//   stats?: {
//     healthPoints: number;
//     attackPoints: number;
//     evasionPoints: number;
//     isEngagedInCombat: boolean;
//   };
// };

// export type InPlayCard = Card & {
//   charged?: boolean;
// };

// export type InPlayMeCard = InPlayCard & {
//   effects?: ActiveEffectEntry[];
// };

// export type BonusSoulCard = Card & {
//   granted: boolean;
// };

// export type PendingSelection = {
//   requestId: string;
//   description: string;
//   options: string[];
//   count: number;
//   asMany: boolean;
// };

// export type ActiveEffectEntry = {
//   index: "tap" | number;
//   description: string;
// };