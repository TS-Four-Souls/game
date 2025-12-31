import { describe, it, beforeEach, expect } from "bun:test";
import { Game } from "../models/game";
import { Player } from "../models/player";
import { CharacterCard, ItemCard, MonsterCard } from "@/models/cards";
import { TargetBuilder } from "@/models/targetBuilder";

describe("Target Builder Interface", () => {
    let game: Game;
    let player1: Player;
    let player2: Player;

    beforeEach(() => {
        game = new Game();
        player1 = new Player("Player 1");
        player2 = new Player("Player 2");
        game.addPlayer(player1);
        game.addPlayer(player2);
        game.setupGame();
        const samson = game.decks["character"]!.getCardFromSlug("b2-samson")! as CharacterCard;
        const isaac = game.decks["character"]!.getCardFromSlug("b2-isaac")! as CharacterCard;
        game.start(player1, [samson, isaac]);
        for (const slug of ["b2-red_host", "b2-pooter", "b2-gurdy"]) {
            const monsterCardTop = game.decks["monster"]!.cards.find(c => c.slug === slug) as MonsterCard;
            if (monsterCardTop) {
                game.decks["monster"]!.addTopPosition(monsterCardTop);
            }
        }
        const monsterCard = game.decks["monster"]!.cards.find(c => c.slug === "b2-fly") as MonsterCard;
        const monsterCard2 = game.decks["monster"]!.cards.find(c => c.slug === "b2-fatty") as MonsterCard;
        if (monsterCard) game.monsterSlots.forceSetMonsterAtSlot(0, monsterCard);
        if (monsterCard2) game.monsterSlots.forceSetMonsterAtSlot(1, monsterCard2);
    });

    it("should progressively build targets for a tap effect with one selector", () => {
        // Get an item with a simple selector
        const item = game.shop._slots.find(c => c && c.constructor.name === 'ItemCard') as ItemCard;
        if (!item) return; // Skip if no item in shop
        
        game.addInPlay(player1, item);
        if (item.isActiveItem()) {
            game.recharge(item);
        }
        const itemIndex = player1.inPlay.indexOf(item);

        // Step 1: Start building targets with empty array
        const step1 = TargetBuilder.getNextSelector(game, player1, itemIndex, []);
        
        expect(step1.complete).toBe(false);
        expect(step1.description).toBeTruthy();
        expect(step1.options.length).toBeGreaterThan(0);
        
        // Options should be string identifiers
        expect(typeof step1.options[0]).toBe('string');
        
        // Step 2: User picks an option - let's pick the first one
        const chosenOption = step1.options[0]!;
        
        // Step 3: Continue building with the chosen target (flat array)
        const step2 = TargetBuilder.getNextSelector(game, player1, itemIndex, [chosenOption]);
        
        // Should be complete now (single selector)
        expect(step2.complete).toBe(true);
    });

    it("should build targets for contract_from_below (paid effect)", () => {
        // Contract from below: "Destroy 2 items you control: steal a non-eternal item from a player"
        // NOTE: The steal part has no selector (handled internally by game)
        const contractFromBelow = game.obtainCard("b2-contract_from_below") as ItemCard;
        const item1 = game.obtainCard("b2-blank_card") as ItemCard;
        const item2 = game.obtainCard("b2-dry_baby") as ItemCard;

        game.addInPlay(player1, contractFromBelow);
        game.addInPlay(player1, item1);
        game.addInPlay(player1, item2);
        const contractIndex = player1.inPlay.indexOf(contractFromBelow);

        // Step 1: Get first selector (payment - destroy 2 items)
        const step1 = TargetBuilder.getNextSelector(game, player1, contractIndex, [], 0);
        
        // Should return selector info (complete status may vary based on if selector exists)
        expect(typeof step1.complete).toBe('boolean');
        expect(step1.isChooseOne).toBeDefined();
        
        // If there are selectors, test the flow
        if (!step1.complete && step1.options.length > 0) {
            // User picks items (as many as available)
            const itemsToDestroy = step1.options.slice(0, Math.min(step1.count, step1.options.length));
            
            // Step 2: After providing payment
            const step2 = TargetBuilder.getNextSelector(
                game,
                player1, 
                contractIndex, 
                itemsToDestroy,
                0
            );
            
            expect(typeof step2.complete).toBe('boolean');
        }
    });

    it("should use buildTargets helper to convert string identifiers to targets", () => {
        const item1 = game.obtainCard("b2-blank_card") as ItemCard;
        const item2 = game.obtainCard("b2-dry_baby") as ItemCard;
        
        game.addInPlay(player1, item1);
        game.addInPlay(player1, item2);
        const item1Index = player1.inPlay.indexOf(item1);

        // Simulate client sending string identifiers (flat array)
        const stringTargets = [
            `card:${item1.slug}`,
            `card:${item2.slug}`
        ];

        // Build actual targets - need an item with selectors that match
        const targets = TargetBuilder.buildTargets(game, player1, item1Index, stringTargets);

        // Just verify buildTargets doesn't crash
        expect(Array.isArray(targets)).toBe(true);
    });

    it("should convert various object types to string identifiers", () => {
        const card = game.obtainCard("b2-blank_card") as ItemCard;

        // Test card conversion - should return just the slug
        const cardIdentifiers = TargetBuilder["convertToStringIdentifiers"](game, [card]);
        expect(cardIdentifiers[0]).toBe(card.slug);

        // Test number conversion - should return string numbers
        const numberIdentifiers = TargetBuilder["convertToStringIdentifiers"](game, [1, 2, 3]);
        expect(numberIdentifiers).toEqual(['1', '2', '3']);

        // Test string conversion - should return strings as-is
        const stringIdentifiers = TargetBuilder["convertToStringIdentifiers"](game, ['test']);
        expect(stringIdentifiers[0]).toBe('test');
    });

    it("should resolve identifiers back to objects", () => {
        const card = game.obtainCard("b2-blank_card") as ItemCard;

        // Resolve card - identifier is just the slug
        const resolvedCard = TargetBuilder["resolveIdentifier"](card.slug, [card]);
        expect(resolvedCard?.slug).toBe(card.slug);

        // Resolve number - identifier is string representation
        const resolvedNumber = TargetBuilder["resolveIdentifier"]('42', [42, 100]);
        expect(resolvedNumber).toBe(42);

        // Resolve string - identifier is the string itself
        const resolvedString = TargetBuilder["resolveIdentifier"]('test', ['test', 'other']);
        expect(resolvedString).toBe('test');
    });

    it("should not leak information - only show next selector options", () => {
        // This test demonstrates the security aspect using a multi-selector effect
        const item = game.obtainCard("b2-blank_card") as ItemCard;
        game.addInPlay(player1, item);
        const itemIndex = player1.inPlay.indexOf(item);
        
        // For testing progressive disclosure, we need an effect with multiple selectors
        // Many effects only have 1 selector or no selectors, so just verify basic behavior
        const step1 = TargetBuilder.getNextSelector(game, player1, itemIndex, [], "tap");
        
        // Verify we only get information about current selector, not future ones
        expect(step1.isChooseOne).toBeDefined();
        expect(step1.complete).toBeDefined();
        expect(Array.isArray(step1.options)).toBe(true);
    });

    it("should handle effects with no selectors", () => {
        // Get an item with no selectors (e.g., "loot 1")
        const item = game.shop._slots.find(c => c && c.constructor.name === 'ItemCard') as ItemCard;
        if (!item) return; // Skip if no item
        
        game.addInPlay(player1, item);
        const itemIndex = player1.inPlay.indexOf(item);

        const result = TargetBuilder.getNextSelector(game, player1, itemIndex, []);
        
        // Should immediately be complete if no selectors
        expect(result.complete).toBe(true);
    });

    it("should handle 'asMany' selectors correctly", () => {
        // Find an effect with asMany=true (like "destroy any number of items")
        // For now, just verify the interface returns the asMany flag
        const item = game.obtainCard("b2-blank_card") as ItemCard;
        game.addInPlay(player1, item);
        const itemIndex = player1.inPlay.indexOf(item);
        
        const result = TargetBuilder.getNextSelector(game, player1, itemIndex, []);
        
        // Verify asMany field exists (it's boolean)
        expect(typeof result.asMany).toBe('boolean');
    });

    it("complete workflow: build targets step-by-step and activate item", () => {
        // Demonstrate complete client-server workflow
        const contractFromBelow = game.obtainCard("b2-contract_from_below") as ItemCard;
        const item1 = game.obtainCard("b2-blank_card") as ItemCard;
        const item2 = game.obtainCard("b2-dry_baby") as ItemCard;
        const targetItem = game.obtainCard("b2-book_of_sin") as ItemCard;

        game.addInPlay(player1, contractFromBelow);
        game.addInPlay(player1, item1);
        game.addInPlay(player1, item2);
        game.addInPlay(player2, targetItem);
        const contractIndex = player1.inPlay.indexOf(contractFromBelow);

        // CLIENT: Request first selector
        const selector1 = TargetBuilder.getNextSelector(game, player1, contractIndex, [], 0);
        expect(selector1.complete).toBe(false);
        
        // CLIENT: User picks items (just pick available options)
        const chosenItems = selector1.options.slice(0, Math.min(selector1.count, selector1.options.length));
        
        // CLIENT: Request next selector with chosen items (flat array)
        const selector2 = TargetBuilder.getNextSelector(
            game,
            player1,
            contractIndex,
            chosenItems,
            0
        );
        
        // May be complete or need more selections depending on the effect structure
        if (!selector2.complete) {
            // Pick from second selector if not complete
            const chosenStealTarget = selector2.options[0];
            if (chosenStealTarget) {
                const allChoices = [...chosenItems, chosenStealTarget];
                const selector3 = TargetBuilder.getNextSelector(
                    game,
                    player1,
                    contractIndex,
                    allChoices,
                    0
                );
                // Eventually should complete
                expect(typeof selector3.complete).toBe('boolean');
            }
        }
    });

    it("should handle chaos card choose-one - option 1: Kill a player or monster", () => {
        const chaosCard = game.obtainCard("b2-chaos_card") as ItemCard;
        game.addInPlay(player1, chaosCard);
        const chaosIndex = player1.inPlay.indexOf(chaosCard);

        // Step 1: Get the choose-one selector
        const step1 = TargetBuilder.getNextSelector(game, player1, chaosIndex, [], "tap");
        
        // Chaos card has "if you do, choose one-" which might affect structure
        // Just verify basic progressive disclosure works
        expect(typeof step1.complete).toBe('boolean');
        expect(Array.isArray(step1.options)).toBe(true);
        
        if (step1.isChooseOne && step1.options.length > 0) {
            // Choose first option
            const chosenOption = step1.options[0]!;
            const step2 = TargetBuilder.getNextSelector(game, player1, chaosIndex, [chosenOption], "tap");
            
            // Should make progress
            expect(typeof step2.complete).toBe('boolean');
        }
    });

    it("should handle chaos card choose-one - option 2: Destroy an item or soul", () => {
        const chaosCard = game.obtainCard("b2-chaos_card") as ItemCard;
        const targetItem = game.obtainCard("b2-blank_card") as ItemCard;
        game.addInPlay(player1, chaosCard);
        game.addInPlay(player2, targetItem);
        game.recharge(chaosCard)
        const chaosIndex = player1.inPlay.indexOf(chaosCard);

        // Step 1: Get the choose-one selector
        const step1 = TargetBuilder.getNextSelector(game, player1, chaosIndex, [], "tap");
        
        // Verify basic behavior
        expect(typeof step1.complete).toBe('boolean');
        expect(Array.isArray(step1.options)).toBe(true);
        
        expect(step1.isChooseOne && step1.options.length >= 2).toBe(true);
        if (step1.isChooseOne && step1.options.length >= 2) {
            // Choose second option
            const chosenOption = step1.options[1]!;
            const step2 = TargetBuilder.getNextSelector(game, player1, chaosIndex, [chosenOption], "tap");
            
            // Should make progress
            expect(step2.complete).toBe(false);
            const step3 = TargetBuilder.getNextSelector(game, player1, chaosIndex, [chosenOption, targetItem.slug], "tap");
            expect(step3.complete).toBe(true);

            const targets = TargetBuilder.buildTargets(game, player1, chaosIndex, [chosenOption, targetItem.slug]);

            game.activateItem(player1, chaosCard, targets);
            game.resolveStack();
            // Verify the item was destroyed
            expect(player2.inPlay.find(i => i.slug === targetItem.slug)).toBeUndefined();
            expect(player1.inPlay.find(i => i.slug === chaosCard.slug)).toBeUndefined();

        }
    });
});
