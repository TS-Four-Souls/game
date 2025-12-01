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
  asMany: z.boolean()
});

const discardLootSchema = UserProtectedRequestSchema.extend({
  position: z.number(),
});

const NextTurnRequestSchema = UserProtectedRequestSchema.extend({});

export const schemas = {
  joinRequest: JoinRequestSchema,
  userProtectedRequest: UserProtectedRequestSchema,
  attackRequest: AttackRequestSchema,
  nextTurnRequest: NextTurnRequestSchema,
  gainCoinsRequest: gainCoinsSchema,
  loseCoinsRequest: loseCoinsSchema,
  discardLootRequest: discardLootSchema
};

export type Issuer = z.infer<typeof IssuerSchema>;