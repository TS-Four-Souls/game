import { Game } from "../models/game";
import { Player } from "../models/player";
import type { MonsterCard, CharacterCard } from "../models/cards";
import { GameParameters } from "@/models/gameParameters";


export function emptyHands(game: Game): void {
    for (const player of game.players) {
        while (player.hand.length > 0) {
            const card = player.hand.removeFromHandByPos(0);
            game.decks["loot"]?.addRandomPosition(card);
        }
    }
}

export function dischargeEachItemsAndRemoveCoins(game: Game): void {
    for (const player of game.players) {
        for (const item of player.inPlay) {
            item.charged = false;
        }
        player.loseCoins(player.coins, true);
    }
}

/**
 * Configuration options for setting up a test game.
 */
export interface GameSetupConfig {
    /**
     * Array of character slugs to assign to players.
     * If provided, must match the number of players.
     * First character goes to first player, second to second player, etc.
     * @example ["b2-isaac", "b2-judas"]
     */
    characters?: string[];

    /**
     * Array of monster slugs to place in encounter slots.
     * Monsters are placed starting from slot 0.
     * @example ["b2-fly", "b2-fatty"]
     */
    monsters?: string[];

    /**
     * Array of monster slugs to add to the top of the monster deck.
     * Useful for controlling what gets drawn next.
     * Last item in array will be on top of deck.
     * @example ["b2-red_host", "b2-pooter", "b2-gurdy"]
     */
    monsterDeck?: string[];

    /**
     * Array of treasure slugs to add to the top of the treasure deck.
     * Useful for controlling shop draws and treasure gains.
     * Last item in array will be on top of deck.
     * @example ["b2-blank_card", "b2-boomerang", "b2-decoy"]
     */
    treasureDeck?: string[];

    /**
     * Number of players to create.
     * @default 2
     */
    playerCount?: number;
}

/**
 * Result of setting up a test game.
 */
export interface GameSetupResult {
    game: Game;
    players: Player[];
    player1: Player;
    player2?: Player;
    player3?: Player;
    player4?: Player;
}

/**
 * Sets up a game instance with common test configuration.
 * 
 * This helper eliminates boilerplate in test files by providing a single function
 * to handle game creation, player setup, character assignment, monster placement,
 * and deck configuration.
 * 
 * @param config - Configuration options for the game setup
 * @returns An object containing the game instance and player references
 * 
 * @example
 * // Minimal setup with defaults
 * const { game, player1, player2 } = setupTestGame();
 * 
 * @example
 * // Full setup with custom characters and monsters
 * const { game, player1, player2 } = setupTestGame({
 *     characters: ["b2-isaac", "b2-judas"],
 *     monsters: ["b2-fly", "b2-fatty"],
 *     monsterDeck: ["b2-red_host", "b2-pooter", "b2-gurdy"],
 *     treasureDeck: ["b2-blank_card", "b2-boomerang"]
 * });
 * 
 * @example
 * // Three players with custom names
 * const { game, players } = setupTestGame({
 *     playerCount: 3,
 *     playerNames: ["Alice", "Bob", "Charlie"],
 *     characters: ["b2-isaac", "b2-judas", "b2-samson"]
 * });
 */
export function setupTestGame(config: GameSetupConfig = {}): GameSetupResult {
    const {
        characters,
        monsters = [],
        monsterDeck = [],
        treasureDeck = [],
        playerCount = 2,
    } = config;

    // Create game instance
    
    const game = new Game();
    mockGameSelections(game);
    game.gameParameters.nbPlayerCardRestriction.value = false;
    game.gameParameters.lootPlayPerTurn.value = 10;
    // Create players
    const players: Player[] = [];
    for (let i = 0; i < playerCount; i++) {
        const name = `Player ${i + 1}`;
        const player = new Player(name);
        players.push(player);
        game.addPlayer(player);
    }

    // Setup game
    game.setupGame();

    // Assign characters
    let characterCards: CharacterCard[] | null = null;
    if (characters && characters.length > 0) {
        if (characters.length !== playerCount) {
            throw new Error(
                `Number of characters (${characters.length}) must match number of players (${playerCount})`
            );
        }

        characterCards = characters.map(slug => {
            const card = game.decks["character"]!.getCardFromSlug(slug);
            if (!card) {
                throw new Error(`Character card not found: ${slug}`);
            }
            return card as CharacterCard;
        });
    }

    // Start the game
    game.start(players[0]!, characterCards, false);
    dischargeEachItemsAndRemoveCoins(game);
    emptyHands(game);

    // Force specific monsters into slots
    for (let i = 0; i < monsters.length; i++) {
        const slug = monsters[i]!;
        const monsterCard = game.obtainCard(slug);
        if (!monsterCard) {
            throw new Error(`Monster card not found: ${slug}`);
        }
        game.monsterSlots.forceSetMonsterAtSlot(i, monsterCard as MonsterCard);
    }

    // Add monsters to deck top (reverse order so last becomes top)
    for (const slug of monsterDeck) {
        const monsterCard = game.obtainCard(slug);
        if (!monsterCard) {
            throw new Error(`Monster card not found: ${slug}`);
        }
        game.decks["monster"]!.addTopPosition(monsterCard as MonsterCard);
    }

    // Add treasures to deck top (reverse order so last becomes top)
    for (const slug of treasureDeck) {
        const treasureCard = game.shop.obtainCard(slug);
        if (!treasureCard) {
            throw new Error(`Treasure card not found: ${slug}`);
        }
        game.decks["treasure"]?.addTopPosition(treasureCard);
    }

    // Build result object with convenience references
    const result: GameSetupResult = {
        game,
        players,
        player1: players[0]!,
    };

    if (players.length > 1) result.player2 = players[1];
    if (players.length > 2) result.player3 = players[2];
    if (players.length > 3) result.player4 = players[3];

    return result;
}

/**
 * Quick setup for the most common test scenario: 2 players with Isaac and Judas.
 * Includes standard monster deck setup and two monsters in play.
 * 
 * @returns Game setup result with player1 and player2
 * 
 * @example
 * const { game, player1, player2 } = setupStandardTestGame();
 */
export function setupStandardTestGame(): GameSetupResult {
    return setupTestGame({
        characters: ["b2-isaac", "b2-judas"],
        monsters: ["b2-fly", "b2-fatty"],
        monsterDeck: ["b2-red_host", "b2-pooter", "b2-gurdy"],
        treasureDeck: ["b2-blank_card", "b2-boomerang", "b2-decoy", "b2-crystal_ball"],
    });
}

/**
 * Setup with Samson and Isaac characters (common alternative setup).
 * 
 * @returns Game setup result with player1 and player2
 */
export function setupSamsonIsaacGame(): GameSetupResult {
    return setupTestGame({
        characters: ["b2-samson", "b2-isaac"],
        monsters: ["b2-fly", "b2-fatty"],
        monsterDeck: ["b2-red_host", "b2-pooter", "b2-gurdy"],
        treasureDeck: ["b2-blank_card", "b2-placebo", "b2-tech_x", "b2-crystal_ball", "b2-boomerang"],
    });
}

/**
 * Minimal setup for tests that need custom configuration.
 * No monsters or characters assigned - perfect for unique test scenarios.
 * 
 * @param playerCount - Number of players (default: 2)
 * @returns Game setup result with clean slate
 * 
 * @example
 * const { game, player1, player2 } = setupMinimalGame();
 * // Add your own specific cards and setup
 */
export function setupMinimalGame(playerCount: number = 2): GameSetupResult {
    return setupTestGame({ playerCount });
}

/**
 * Setup for 3-player tests with common configuration.
 * 
 * @returns Game setup result with player1, player2, and player3
 */
export function setupThreePlayerGame(): GameSetupResult {
    return setupTestGame({
        playerCount: 3,
        characters: ["b2-isaac", "b2-judas", "b2-samson"],
        monsters: ["b2-fly", "b2-fatty"],
        monsterDeck: ["b2-red_host", "b2-pooter", "b2-gurdy"],
    });
}

/**
 * Setup for 4-player tests with common configuration.
 * 
 * @returns Game setup result with player1, player2, player3, and player4
 */
export function setupFourPlayerGame(): GameSetupResult {
    return setupTestGame({
        playerCount: 4,
        characters: ["b2-isaac", "b2-judas", "b2-samson", "b2-cain"],
        monsters: ["b2-fly", "b2-fatty"],
        monsterDeck: ["b2-red_host", "b2-pooter", "b2-gurdy"],
    });
}

/**
 * Mocks the game.select and game.selectMultiple methods for testing.
 * This replaces the multiplayer implementations with synchronous test versions
 * that immediately return mock selections.
 * 
 * Call this in beforeEach() to ensure tests don't wait for client responses.
 * 
 * @param game - The game instance to mock
 * @example
 * beforeEach(() => {
 *   game = new Game();
 *   mockGameSelections(game);
 *   // ... rest of setup
 * });
 */
export function mockGameSelections(game: Game): void {
    // Mock single player selection
    game.select = async (player: Player, n: number, Options: any[], anyNumber: boolean = false) => {
        if (n === 1 && !anyNumber && Options.length === 1) {
            return {
                selected: Options,
                remaining: []
            };
            }
        if(Options.length === 0)
            return {selected: [], remaining: []};
        return { selected: Options.slice(0, n), remaining: Options.slice(n) };
    };

    // Mock multiple player selection
    game.selectMultiple = async (selections: Array<{
        player: Player;
        count: number;
        options: any[];
        asMany?: boolean;
    }>) => {
        return selections.map(sel => ({
            playerId: sel.player.id,
            selected: sel.options.slice(0, sel.count),
            remaining: sel.options.slice(sel.count)
        }));
    };
}
