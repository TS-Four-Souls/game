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

const NextTurnRequestSchema = UserProtectedRequestSchema.extend({});

const ImageRequestSchema = UserProtectedRequestSchema.extend({
  path: z.string(),
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
  playCardRequest: indexSchema,
  imageRequest: ImageRequestSchema,
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
    hand: { slug: string }[];
    inPlay: { slug: string }[];
  },
  players: {
    name: string;
    hand: number;
    inPlay: { slug: string }[];
  }[];
};