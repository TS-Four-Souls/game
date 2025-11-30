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

const NextTurnRequestSchema = UserProtectedRequestSchema.extend({});

export const schemas = {
  joinRequest: JoinRequestSchema,
  userProtectedRequest: UserProtectedRequestSchema,
  attackRequest: AttackRequestSchema,
  nextTurnRequest: NextTurnRequestSchema,
};

export type Issuer = z.infer<typeof IssuerSchema>;