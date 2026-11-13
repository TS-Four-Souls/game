import { Game } from "../../models/game";
import type { ItemCard, LootCard, TreasureCard } from "@/models/cards";
import { MonsterCard } from "@/models/cards";
import { beforeEach, describe, expect, it } from "bun:test";
import { Player } from "../../models/entities/player";
import { setupTestGame } from "../testHelpers";
import { DamageOnStack, AttackRollData, DiceRoll } from "../../models/stackElement";
import { TargetBuilder } from "@/models/targetBuilder";

describe("Warp Zone Treasures", () => {
    let game: Game;
    let player1: Player;
    let player2: Player;

    beforeEach(async () => {
        const setup = await setupTestGame({
                    characters: ["fsp2-guppy", "b2-samson"],
                    monsters: ["b2-fly", "b2-fatty"],
                    monsterDeck: ["b2-red_host", "b2-pooter","b2-cod_worm","b2-spider","b2-conjoined_fatty", "b2-dip","b2-leech","b2-gurdy"],
                    treasureDeck: ["b2-boomerang", "b2-guppys_head", "b2-no", "b2-blank_card"],
                    rooms: true,
                    playerCount: 2
                });
        game = setup.game;
        player1 = setup.player1;
        player2 = setup.player2!;
    });


 
    // it("rwz-the_crowdfunder", async () => {
    //     const card1 = game.obtainCard("rwz-the_crowdfunder") as TreasureCard;
    //     game.cardHandler.addInPlay(player1, card1);
    // });
 
    it("rwz-water_bottle", async () => {
        const card1 = game.obtainCard("rwz-water_bottle") as TreasureCard;
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();

        game.cardHandler.addInPlay(player2, card1);
        await game.activateItem(player2, card1, [], "tap");
        game.random = () => 0.1;
        for (let i = 0; i < 4; i++) {
            await game.actions.resolveStack();
        }
        expect(game.stack.size).toBe(1);
        game.random = () => 0.6;
        for (let i = 0; i < 2; i++) {
            await game.actions.resolveStack();
            await game.actions.resolveStack();
        }
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.stack.size).toBe(1);
        expect(player1.isDead).toBe(true);
        game.random = () => 0.99;
        // Samson's end-of-turn trigger (b2-blood_lust) also goes on the stack: resolve until it is empty.
        while (!game.stack.isEmpty()) await game.actions.resolveStack();
        expect(game.stack.size).toBe(0);
        expect(game.currentPlayer === player1).toBe(true);
    });

    it("rwz-water_bottle 6 on another player's turn cancels everything without ending the turn", async () => {
        const card1 = game.obtainCard("rwz-water_bottle") as TreasureCard;
        game.cardHandler.addInPlay(player2, card1);
        // Player1 starts an attack on their turn, then player2 uses Water Bottle in response to the roll.
        game.actions.declareAttack(player1);
        await game.actions.declareAttackOnEntity(player1, game.monsters[0]!);
        game.random = () => 0.1;
        await game.actions.attackRoll(player1);
        expect(game.stack.isEmpty()).toBe(false);
        await game.activateItem(player2, card1, [], "tap");
        game.random = () => 0.99;
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.stack.isEmpty()).toBe(true);
        expect(game.currentPlayer).toBe(player1);
        expect(game.monsters[0]!.currentHealthPoints).toBe(game.monsters[0]!.healthPoints);
    });
 
    it("rwz-hitops 2", async () => {
        const card1 = game.obtainCard("rwz-hitops") as TreasureCard;
        game.cardHandler.addInPlay(player1, card1);
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        game.actions.declareAttack(player2);
        game.entityHandler.addDC(game.monsters[0]!, 6, card1);
        await game.actions.declareAttackOnEntity(player2, game.monsters[0]!);
        game.random = () => 4/6-0.01;
        await game.actions.attackRoll(player2);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player2.currentHealthPoints).toBe(player2.healthPoints);
        expect(player2.currentHealthPoints).toBe(player2.healthPoints);
         game.random = () => 5/6-0.01;
        await game.actions.attackRoll(player2);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player2.currentHealthPoints).toBe(player2.healthPoints);
        expect(player2.currentHealthPoints).toBe(player2.healthPoints);
    });

    const resolveAll = async () => {
        while (!game.stack.isEmpty()) await game.actions.resolveStack();
    };

    // Player2 attacks a 6 DC monster and rolls a 4: a miss, so player2 takes combat damage unless protected.
    const missAttackRollOf4 = async (attacker: Player) => {
        game.actions.declareAttack(attacker);
        game.entityHandler.addDC(game.monsters[0]!, 6, game.monsters[0]!.card);
        await game.actions.declareAttackOnEntity(attacker, game.monsters[0]!);
        game.random = () => 4/6-0.01;
        await game.actions.attackRoll(attacker);
        await resolveAll();
    };

    it("rwz-hitops high-five protection ends at end of turn", async () => {
        const card1 = game.obtainCard("rwz-hitops") as TreasureCard;
        game.cardHandler.addInPlay(player1, card1);
        let acceptHighFive = true;
        const select = game.select.bind(game);
        game.select = async (player: Player, min: number, max: number, options: any[], ...rest: any[]) => {
            if (options[0]?.key === "common.highfive" && !acceptHighFive)
                return { selected: [options[1]], remaining: [options[0]] };
            return (select as any)(player, min, max, options, ...rest);
        };
        await game.endTurn();
        await resolveAll();
        expect(game.currentPlayer).toBe(player2);
        // Player2 accepts the high-five for this turn only.
        acceptHighFive = false;
        await game.endTurn();
        await resolveAll();
        expect(game.currentPlayer).toBe(player1);
        await game.endTurn();
        await resolveAll();
        expect(game.currentPlayer).toBe(player2);
        await missAttackRollOf4(player2);
        expect(player2.currentHealthPoints).toBeLessThan(player2.healthPoints);
    });

    it("rwz-hitops stops offering high-fives once destroyed", async () => {
        const card1 = game.obtainCard("rwz-hitops") as TreasureCard;
        game.cardHandler.addInPlay(player1, card1);
        game.cardHandler.destroyCardsOrSouls([card1]);
        let offers = 0;
        const select = game.select.bind(game);
        game.select = async (player: Player, min: number, max: number, options: any[], ...rest: any[]) => {
            if (rest[0]?.key === "pending.highFiveOffer")
                offers++;
            return (select as any)(player, min, max, options, ...rest);
        };
        await game.endTurn();
        await resolveAll();
        expect(game.currentPlayer).toBe(player2);
        expect(offers).toBe(0);
        await missAttackRollOf4(player2);
        expect(player2.currentHealthPoints).toBeLessThan(player2.healthPoints);
    });

    it("rwz-hitops", async () => {
        const card1 = game.obtainCard("rwz-hitops") as TreasureCard;
        game.cardHandler.addInPlay(player1, card1);
        game.actions.declareAttack(player1);
        game.entityHandler.addDC(game.monsters[0]!, 6, card1);
        await game.actions.declareAttackOnEntity(player1, game.monsters[0]!);
        game.random = () => 4/6-0.01;
        await game.actions.attackRoll(player1);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.currentHealthPoints).toBe(player1.healthPoints);
        expect(player1.currentHealthPoints).toBe(player1.healthPoints);
         game.random = () => 5/6-0.01;
        await game.actions.attackRoll(player1);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.currentHealthPoints).toBe(player1.healthPoints);
        expect(player1.currentHealthPoints).toBe(player1.healthPoints);
    });
 
    it("rwz-tony", async () => {
        const card1 = game.obtainCard("rwz-tony") as TreasureCard;
        game.cardHandler.addInPlay(player1, card1);
        expect(player1.attackPoints).toBe(3);
        game.gainTreasure(player1, 1);
        expect(player1.attackPoints).toBe(2);
    });

    it("rwz-tony: other item leaves play", async () => {
        const card1 = game.obtainCard("rwz-tony") as TreasureCard;
        game.cardHandler.addInPlay(player1, card1);
        expect(player1.attackPoints).toBe(3);
        const blank = game.obtainCard("b2-blank_card") as TreasureCard;
        game.cardHandler.addInPlay(player1, blank);
        expect(player1.attackPoints).toBe(2);
        game.cardHandler.destroyCardsOrSouls([blank]);
        expect(player1.attackPoints).toBe(3);
    });
 
    it("rwz-the_crowdfunder", async () => {
        const card1 = game.obtainCard("rwz-the_crowdfunder") as TreasureCard;
        game.cardHandler.addInPlay(player1, card1);
    });
 
    it("rwz-spewer", async () => {
        const card1 = game.obtainCard("rwz-spewer") as TreasureCard;
        game.cardHandler.addInPlay(player1, card1);
    });
 
    it("rwz-ser_junkan", async () => {
        const card1 = game.obtainCard("rwz-ser_junkan") as TreasureCard;
        game.cardHandler.addInPlay(player1, card1);
    });
 
 
    it("rwz-newgrounds_tank", async () => {
        const card1 = game.obtainCard("rwz-newgrounds_tank") as TreasureCard;
        const evasions = game.monsters.map(m => game.entityHandler.getDC(m));
        expect(player1.healthPoints).toBe(2);
        expect(player1.attackPoints).toBe(1);
        game.cardHandler.addInPlay(player1, card1);
        expect(player1.healthPoints).toBe(3);
        expect(player1.attackPoints).toBe(2);
        expect(game.monsters.map(m => game.entityHandler.getDC(m) - 1)).toEqual(evasions);
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.monsters.map(m => game.entityHandler.getDC(m))).toEqual(evasions);
    });
 
    it("rwz-gun_that_can_kill_the_past", async () => {
        const card1 = game.obtainCard("rwz-gun_that_can_kill_the_past") as TreasureCard;
        game.cardHandler.addInPlay(player2, card1);
        game.activateItem(player1, player1.character, [], "tap");
        game.entityHandler.addLootPlay(player2, 1);
        await game.activateItem(player2, card1, [], "tap");
        await game.actions.resolveStack();
        expect(game.stack.isEmpty()).toBe(true);
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.stack.isEmpty()).toBe(true);
        expect(game.currentPlayer).toBe(player2);
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.stack.isEmpty()).toBe(true);
        expect(game.currentPlayer).toBe(player2);
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.stack.isEmpty()).toBe(true);
        expect(game.currentPlayer).toBe(player1);
    });
    
    it("rwz-george", async () => {
        const card1 = game.obtainCard("rwz-george") as TreasureCard;
        game.cardHandler.addInPlay(player1, card1);
        game.select = async (player: Player, min: number, max: number, Options: any[]) => {
            return {
                selected: Options.toReversed(),
                remaining: []
            };
        };

        const monsterCards = game.decks.monster.cards.slice(0, 5).toReversed().map(c => c.slug);
        game.actions.declareAttack(player1);
        expect(game.stack.isEmpty()).toBe(false);
        await game.actions.resolveStack();
        expect(game.decks.monster.cards.slice(0, 5).map(c => c.slug)).toEqual(monsterCards);
    });
    
    it("rwz-doorway rooms", async () => {
        const card1 = game.obtainCard("rwz-doorway") as TreasureCard;
        game.cardHandler.addInPlay(player1, card1);

        const room = game.rooms?.activeRooms[0]!;
        await game.activateItem(player1, card1, ["Put each room into discard."], "tap");
        await game.actions.resolveStack();
        expect(game.rooms?.activeRooms[0]!).not.toBe(room);
    });
 
 
    it("rwz-diogenes_pot", async () => {
        const card1 = game.obtainCard("rwz-diogenes_pot") as TreasureCard;
        game.cardHandler.addInPlay(player1, card1);
        const mob = game.monsters[0]!;
        game.entityHandler.addDC(mob, 4, card1);
        game.actions.declareAttack(player1);
        await game.actions.declareAttackOnEntity(player1, mob);
        game.random = () => 3/6-0.01;
        game.actions.attackRoll(player1);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(mob.currentHealthPoints).toBe(mob.healthPoints);
        expect(player1.currentHealthPoints).toBe(player1.healthPoints);

        game.random = () => 2/6-0.01;
        game.actions.attackRoll(player1);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(mob.currentHealthPoints).toBe(mob.healthPoints);
        expect(player1.currentHealthPoints).toBe(player1.healthPoints);

        game.random = () => 1/6-0.01;
        game.actions.attackRoll(player1);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(mob.currentHealthPoints).toBe(mob.healthPoints);
        expect(player1.isDead).toBe(true);
    });
 
    it("rwz-boxing_glove", async () => {
        const card1 = game.obtainCard("rwz-boxing_glove") as TreasureCard;
        game.cardHandler.addInPlay(player1, card1);
        const mob = game.monsters[0]!;
        await game.activateItem(player1, card1, [mob], "tap");
        expect(card1.charged).toBe(false);
        await game.actions.resolveStack();
        expect(mob).not.toBe(game.monsters[0]);
        expect(game.decks.monster.cards.at(-1)?.slug).toBe(mob.card.slug);
        game.entityHandler.kill(player1, game.monsters[1]!, {card: card1, visualEffectBox: null as any});
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(card1.charged).toBe(true);
    });
 
    it("rwz-birthday_cake 2", async () => {
        const card1 = game.obtainCard("rwz-birthday_cake") as TreasureCard;
        game.cardHandler.addInPlay(player2, card1);
        await game.endTurn();
        game.select = async (player: Player, min: number, max: number, Options: any[]) => {
                return {
                    selected: [],
                    remaining: []
                };
        };
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.stack.isEmpty()).toBe(true);
        expect(player1.hand.length).toBe(0);
        expect(player2.hand.length).toBe(1);
    });
 
    it("rwz-birthday_cake", async () => {
        const card1 = game.obtainCard("rwz-birthday_cake") as TreasureCard;
        game.cardHandler.addInPlay(player2, card1);
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.stack.isEmpty()).toBe(true);
        expect(player1.hand.length).toBe(1);
        expect(player2.hand.length).toBe(2);
    });

    it("rwz-aubrey", async () => {
        const card1 = game.obtainCard("rwz-aubrey") as TreasureCard;
        game.cardHandler.addInPlay(player1, card1);
        game.gainCoins(player1, 11, card1);
        game.actions.declarePurchase(player1);
        game.actions.purchase(player1, 0);
        await game.actions.resolveStack();
        expect(player1.coins).toBe(1);
        expect(player1.hand.length).toBe(3);
    });
});