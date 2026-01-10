import { z } from "zod";
import type { GenericCardType } from "@/types/cardTypes";

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

export type State = {
  players: {
    name: string;
    inPlay: { slug: string }[];
  }[];
};

export type DetailedState = {
  me: {
    name: string;
    hand: GenericCardType[];
    inPlay: (GenericCardType & { charged: boolean } & { effects: {
        index: "tap" | number;
        description: string;
      }[] })[];
    souls: GenericCardType[];
    coins: number;
    currentHealthPoints: number;
    currentAttackPoints: number;
    remainingLootPlay: number;
  };
  players: {
    name: string;
    handSize: number;
    inPlay: (GenericCardType & { charged: boolean })[];
    souls: GenericCardType[];
    coins: number;
    currentHealthPoints: number;
    currentAttackPoints: number;
    remainingLootPlay: number;
  }[];
  topDiscards: {
    loot?: GenericCardType;
    treasure?: GenericCardType;
    monster?: GenericCardType;
  };
  monsters: MonsterCardType[];
  shop: GenericCardType[];
  turn: string;
  stack: string[];
  firstCardTreasureDeck?: GenericCardType;
  pendingSelection?: {
    requestId: string;
    options: string[];
    count: number;
    asMany: boolean;
  };
};


type MonsterCardType = {
  slug: string;
  stats?: {
    healthPoints: number;
    attackPoints: number;
    evasionPoints: number;
  }
}

export type DiscardCards = {
  cards: GenericCardType[];
};

export type MonsterPiles = {
  cards: GenericCardType[][];
};
