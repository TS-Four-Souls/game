import { z } from "zod";

const issuerSchema = z.object({
  id: z.string(),
  secret: z.string(),
});
export type Issuer = z.infer<typeof issuerSchema>;

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
    gameState: DetailedState;
  }
  | {
    status: 400;
    error: any;
  };

const startRequestSchema = z.object({
  issuer: issuerSchema,
});

type StartResponse =
  | {
    status: 200;
  }
  | {
    status: 400;
    error: any;
  };

const resetRequestSchema = z.void();

type ResetResponse =
  | {
    status: 200;
  }
  | {
    status: 400;
    error: any;
  };


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
  issuer: issuerSchema,
};

export namespace Requests {
  export type Join = z.infer<typeof joinRequestSchema>;
  export type Rejoin = z.infer<typeof rejoinRequestSchema>;
  export type Start = z.infer<typeof startRequestSchema>;
  export type Reset = z.infer<typeof resetRequestSchema>;
}

export namespace Responses {
  export type Join = JoinResponse;
  export type Rejoin = RejoinResponse;
  export type Start = StartResponse;
  export type Reset = ResetResponse;
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
}
