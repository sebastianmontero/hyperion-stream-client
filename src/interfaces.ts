export interface SavedRequest {
    type: string,
    req: StreamActionsRequest | StreamDeltasRequest
}

/**
 * Original options structure for reference if needed for Omit.
 */
export interface OriginalHyperionClientOptionsBase {
    endpoint?: string; // This is now handled by `endpoints`
    chainApi?: string;
    debug?: boolean;
    libStream?: boolean;
}

/**
 * Options used to configure the streaming client
 */
export interface HyperionClientOptions extends Omit<OriginalHyperionClientOptionsBase, 'endpoint'> {
    /** Hyperion HTTP API endpoint(s) w/ streaming enabled. Can be a single URL or an array for failover. */
    endpoints: string | string[];
    /** Optional: Delay in milliseconds before attempting to reconnect to the next endpoint. Defaults to 3000ms */
    reconnectDelay?: number;
    /** If true, the client will keep trying to connect to endpoints indefinitely. Defaults to false. */
    tryForever?: boolean;
    /** Timeout in ms. If no 'lib_update' is received in this period, the client will attempt to reconnect. Set to 0 to disable. Defaults to 60000 (1 minute). */
    libActivityTimeoutMs?: number;
    /** Enable asynchronous mode for data handlers. Defaults to true. */
    async?: boolean;
}

export interface StreamDeltasRequest {
    code: string;
    table: string;
    scope: string;
    payer: string;
    start_from: number | string;
    read_until: number | string;
}

export interface RequestFilter {
    field: string;
    value: string;
}

export interface StreamActionsRequest {
    contract: string;
    account: string;
    action: string;
    filters: RequestFilter[];
    start_from: number | string;
    read_until: number | string;
}

export interface ActionContent {
    "@timestamp": string;
    global_sequence: number;
    account_ram_deltas: {
        delta: number;
        account: string;
    }
    act: {
        authorization: {
            permission: string;
            actor: string;
        }
        account: string;
        name: string;
        data: any;
    }
    block_num: number;
    action_ordinal: number;
    creator_action_ordinal: number;
    cpu_usage_us: number;
    net_usage_words: number;
    code_sequence: number;
    abi_sequence: number;
    trx_id: string;
    producer: string;
    notified: string;
    [key: string]: any;
}

export interface DeltaContent {
    code: string;
    table: string;
    scope: string;
    payer: string;
    block_num: number;
    data: any;
    [key: string]: any;
}

export interface IncomingData {
    type: "action" | "delta";
    mode: "live" | "history";
    content: ActionContent | DeltaContent
    irreversible: boolean;
}

export interface LIBData {
    chain_id: string;
    block_num: number;
    block_id: string;
}

export interface ForkData {
    chain_id: string;
    starting_block: number;
    ending_block: number;
    new_id: string;
}

export type AsyncHandlerFunction = (data: IncomingData) => Promise<void>;
export type EventData = IncomingData | LIBData | ForkData | void | undefined | { reason?: string, endpoint?: string } | { endpoints?: string[] } | { endpoint?: string };
export type EventListener = (data?: EventData) => void;
