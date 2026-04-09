import { describe, it, expect, beforeEach } from "bun:test";
import { Game } from "../models/game";
import { DamageOnStack, DiceRoll, Player } from "../models/player";
import { pl } from "zod/locales";
import type { LootCard, ItemCard, Card } from "@/models/cards";
import { InplayType, MonsterCard, CharacterCard } from "@/models/cards";
import { setupStandardTestGame, dischargeEachItemsAndRemoveCoins, emptyHands, mockGameSelections } from "./testHelpers";

describe("History and targets", () => {
    let game: Game;
    let player1: Player;
    let player2: Player;

    beforeEach(() => {
        const setup = setupStandardTestGame();
        game = setup.game;
        player1 = setup.player1;
        player2 = setup.player2!;
    });

    // 
});