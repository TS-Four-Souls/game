/* Utils */

type PartialRequired<T, K extends keyof T> = Partial<T> & Required<Pick<T, K>>;

/* Enums */

export enum CardType {
  Character = "character",
  Eternal = "eternal",
  Treasure = "treasure",
  Monster = "monster",
  Loot = "loot",
  BonusSoul = "bsoul",
}

export enum CardOrigin {
  BaseGameV2 = "b2",
}

export enum TreasureCardSubtype {
  PassiveTreasure = "ptreasure",
  ActiveTreasure = "atreasure",
  PaidTreasure = "paidtreasure",
  OneUseTreasure = "otreasure",
  SoulTreasure = "streasure",
}

export enum MonsterCardSubtype {
  BasicMonster = "bmonster",
  CursedMonster = "cmonster",
  HolyMonster = "hmonster",
  GoodEvent = "gevent",
  BadEvent = "bevent",
  Curse = "curse",
  Boss = "boss",
  EpicBoss = "epic",
}

const attackableMonsterSubtypes = [
  MonsterCardSubtype.BasicMonster,
  MonsterCardSubtype.CursedMonster,
  MonsterCardSubtype.HolyMonster,
  MonsterCardSubtype.Boss,
  MonsterCardSubtype.EpicBoss,
] as const;

type AttackableMonsterSubtype = (typeof attackableMonsterSubtypes)[number];

export const isAttackableMonsterSubtype = (subtype: MonsterCardSubtype): subtype is AttackableMonsterSubtype => {
  return attackableMonsterSubtypes.includes(subtype as AttackableMonsterSubtype);
};

/* Parts */

export type CardRewards = {
  soul?: number | "roll" | "?";
  coin?: number | "roll" | "?";
  loot?: number | "roll" | "?";
  treasure?: number | "roll" | "?";
};

export type GuppyCard = {
  guppy?: true;
};

type TrinketCard = {
  trinket?: true;
};

type CurseCard = {
  curse?: true;
};

export type CardMeta = {
  type: CardType;
  origin: CardOrigin;
  slug: string;
};

export type CardStats = {
  healthPoints?: number;
  attackPoints?: number;
  evasionPoints?: number;
};

/* Card */

export type Card = CardMeta & {
  front: string;
  back: string;
  name: string;
  effectOutcome?: string[];
  rewards?: CardRewards;
  stats?: CardStats;
  quote?: string;
  minimumPlayers: number;
};

/* Card types */

export type CharacterCardType = Card & 
GuppyCard & {
  type: CardType.Character;
  eternalCard?: CardMeta;
  stats: PartialRequired<CardStats, "healthPoints" | "attackPoints">;
};

export type EternalCardType = Card &
GuppyCard & {
  type: CardType.Eternal;
};

export type TreasureCardType = Card &
  GuppyCard & {
    type: CardType.Treasure;
    subtype: TreasureCardSubtype;
  };

export type MonsterCardType = Card &
  CurseCard & {
    type: CardType.Monster;
    subtype: MonsterCardSubtype;
  };

export type AttackableMonsterCardType = MonsterCardType & {
  stats: PartialRequired<
    CardStats,
    "healthPoints" | "attackPoints" | "evasionPoints"
  >;
  subtype: AttackableMonsterSubtype;
};

export type LootCardType = Card &
  GuppyCard &
  TrinketCard & {
    type: CardType.Loot;
  };

export type BonusSoulCardType = Card & {
  type: CardType.BonusSoul;
  rewards: PartialRequired<CardRewards, "soul">;
};

export type GenericCardType = LootCardType | BonusSoulCardType | EternalCardType | TreasureCardType | MonsterCardType | CharacterCardType;
export type InPlayCardType = EternalCardType | TreasureCardType | LootCardType | CharacterCardType;