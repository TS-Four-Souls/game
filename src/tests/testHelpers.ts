import { bundlerModuleNameResolver } from "typescript";
import type { BsoulCard, CharacterCard, MonsterCard, RoomCard, TreasureCard } from "../models/cards";
import { Game } from "../models/game";
import { Player } from "../models/entities/player";
import { shuffle } from "@/utils/auxiliary";
import { GameParameters } from "@/models/gameParameters";
import type { DeckConfigPatch } from "@/shared/api";


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

export async function randomSelect<T>(
        player: Player,
        min: number,
        max: number,
        Options: T[],
        description: string = "UNDEFINED SHOULD NOT HAPPEN",
        skippable: boolean = true,
        canUseOnBoardSelection: boolean = true,
    ): Promise<{ selected: T[]; remaining: T[] }> {
    if (min < 0 || min > max) {
        throw new Error(`Invalid selection bounds: min (${min}) must be between 0 and max (${max}).`);
    }

    if ((min === max && Options.length === max && skippable) || Options.length < min) {
        return {
        selected: Options,
        remaining: [],
        };
    }
    if (Options.length === 0) return { selected: [], remaining: [] };

    const nbToSelect = Math.floor(Math.random() * ((Math.min(max, Options.length) - min + 1)) + min);
    const shuffledOptions = [...Options];
    shuffle(Math.random, shuffledOptions);
    const selected = shuffledOptions.slice(0, nbToSelect);
    const remaining = shuffledOptions.slice(nbToSelect);
    return { selected: selected, remaining: remaining };
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

    /**
     * Array of bonus soul slugs to add to the game.
     * @example ["r-soul_of_envy", "r-soul_of_lust"]
     */
    bonusSouls?: string[] | "random";

    /**
     * Whether to use rooms in the game.
     */
    rooms?: boolean | "random";

    /**
     * Optional random seed for deterministic setups.
     * If provided, will be used to seed the game's random number generator.
     */
    randomSeed?: string;
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
        bonusSouls = [],
        rooms = false,
        randomSeed = ""
    } = config;

    // Create game instance
    const params = new GameParameters(() => {});
    params.setParameterByKey("decksConfig", {nbPlayerCardRestriction: {text: "", value: false}} as DeckConfigPatch);
    params.setParameterByKey("lootPlayPerTurn", 10);
    if(rooms !== false)
        params.setParameterByKey("decksConfig", {useRooms: {text: "", value: true}} as DeckConfigPatch);
    else
        params.setParameterByKey("decksConfig", {useRooms: {text: "", value: false}} as DeckConfigPatch);
    const game = new Game(randomSeed, params);
    mockGameSelections(game);
    
    // Setup game
    game.setupGame();
    if(rooms === true)
    {
        for(const slug of ["r-bomb_bum", "r-devil_beggar", "r-blood_donation", "r-beggar"]) {
            const roomCard = game.obtainCard(slug) ! as RoomCard;// default room.
            game.decks.room.addTopPosition(roomCard);
        }    
    }
    if(bonusSouls !== "random"){

        if(bonusSouls.length === 0) {
            bonusSouls.push("b2-soul_of_guppy"); // Add a default bonus soul if none provided, to test bonus soul mechanics in most tests
            bonusSouls.push("b2-soul_of_gluttony"); // Add a default bonus soul if none provided, to test bonus soul mechanics in most tests
            bonusSouls.push("b2-soul_of_greed"); // Add a default bonus soul if none provided, to test bonus soul mechanics in most tests
        }
        for(const soulSlug of bonusSouls) {
            const soulCard = game.decks.bsoul.getCardFromSlug(soulSlug) as BsoulCard;
            if(!soulCard) {
                throw new Error(`Bonus soul card not found: ${soulSlug}`);
            }
            game.decks.bsoul.addTopPosition(soulCard);
        }
    }

    // Assign characters
    const charactersFull = characters ? characters :
    game.decks.character.cards.splice(0, playerCount).map(c => c.slug);
    // Start the game
    const charas = charactersFull?.map((slug, index) => ({issuer: `Player ${index + 1}`, character: slug}));
    game.start(charas, false);
    const players = game.players;
    dischargeEachItemsAndRemoveCoins(game);
    emptyHands(game);
    
    const originalStack = [...game.stack._stack];

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

    game.stack._stack = originalStack;
    // Add treasures to deck top (reverse order so last becomes top)
    for (const slug of treasureDeck) {
        let treasureCard: TreasureCard | undefined;

        try {
            treasureCard = game.shop.obtainCard(slug) as TreasureCard | undefined;
        } catch {
            treasureCard = undefined;
        }

        if (!treasureCard) {
            for (const player of game.players) {
                const inPlayTreasure = player.inPlay.find((card): card is TreasureCard => card.type === "treasure" && card.slug === slug);
                if (inPlayTreasure) {
                    game.removeInPlay(player, inPlayTreasure);
                    treasureCard = inPlayTreasure;
                    break;
                }
            }
        }

        if (!treasureCard) {
            const template = (game.decks["treasure"] as any)?._set?.cards?.find((card: TreasureCard) => card.slug === slug) as TreasureCard | undefined;
            if (template) {
                treasureCard = game.copyCard(template) as TreasureCard;
            }
        }

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
    game.select = async (player: Player, min: number, max: number, Options: any[]) => {
        if (max === 1 && min === max && Options.length === 1) {
            return {
                selected: Options,
                remaining: []
            };
            }
        if(Options.length === 0)
            return {selected: [], remaining: []};
        return { selected: Options.slice(0, max), remaining: Options.slice(max) };
    };

    // Mock multiple player selection
    game.selectMultiple = async (selections: Array<{
        player: Player;
        min: number;
        max: number;
        options: any[];
        asMany?: boolean;
    }>) => {
        return selections.map(sel => ({
            playerId: sel.player.id,
            selected: sel.options.slice(0, sel.max),
            remaining: sel.options.slice(sel.max)
        }));
    };
}
