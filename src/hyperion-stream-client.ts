// noinspection JSUnusedGlobalSymbols

import {queue, QueueObject} from "async";
import {io, Socket, ManagerOptions, SocketOptions} from "socket.io-client";
import type { DefaultEventsMap } from "@socket.io/component-emitter";

import {
    ActionContent,
    AsyncHandlerFunction,
    DeltaContent,
    EventData,
    EventListener,
    ForkData,
    HyperionClientOptions,
    IncomingData,
    LIBData,
    SavedRequest,
    StreamActionsRequest,
    StreamDeltasRequest
} from "./interfaces";

import fetch from "cross-fetch";

export enum StreamClientEvents {
    DATA = 'data',
    LIBUPDATE = 'libUpdate',
    FORK = 'fork',
    EMPTY = 'empty',
    CONNECT = 'connect',
    DISCONNECT = 'disconnect',
    RECONNECT_ATTEMPT = 'reconnectAttempt',
    ALL_ENDPOINTS_FAILED = 'allEndpointsFailed',
    DRAIN = 'drain',
    LIBDATA = 'libData',
    LIBACTIVITY_TIMEOUT = 'libActivityTimeout',
}

// --- HELPERS ---

function trimTrailingSlash(input: string): string {
    if (input.endsWith('/')) {
        return input.slice(0, input.length - 1);
    }
    return input;
}

// --- HyperionStreamClient CLASS ---

export class HyperionStreamClient {

    private socket?: Socket<DefaultEventsMap, DefaultEventsMap>;
    private internalEndpoints: string[] = [];
    private currentEndpointIndex: number = 0;
    private activeEndpointURL?: string;

    private lastReceivedBlock: number = 0;
    private dataQueue: QueueObject<IncomingData> | null = null;
    private options: HyperionClientOptions & Record<string, any>; // Allow other properties for flexibility

    private libDataQueue: QueueObject<IncomingData> | null = null;
    private reversibleBuffer: IncomingData[] = [];

    private onDataAsync?: AsyncHandlerFunction;
    private onLibDataAsync?: AsyncHandlerFunction;

    online: boolean = false;
    private connectionInProgress: boolean = false;
    savedRequests: SavedRequest[] = [];

    eventListeners: Map<string, EventListener[]> = new Map();
    tempEventListeners: Map<string, EventListener[]> = new Map();

    private _currentInitialConnectPromise: Promise<void> | null = null;
    private _initialConnectPromiseCallbacks?: { resolve: () => void; reject: (reason?: any) => void; };
    private _initialConnectionSucceededThisAttempt: boolean = false;

    private libActivityTimer: NodeJS.Timeout | null = null;

    constructor(options: HyperionClientOptions & Record<string, any>) {
        // Initialize with defaults
        this.options = {
            async: true,
            libStream: false,
            reconnectDelay: 3000,
            tryForever: false,
            libActivityTimeoutMs: 60000,
            debug: false,
            ...options // User options override defaults
        };

        if (options && typeof options === 'object') {
            if (options.endpoints) {
                if (typeof options.endpoints === 'string') {
                    this.internalEndpoints = [trimTrailingSlash(options.endpoints)];
                } else if (Array.isArray(options.endpoints) && options.endpoints.every(ep => typeof ep === 'string')) {
                    this.internalEndpoints = options.endpoints.map(ep => trimTrailingSlash(ep));
                } else {
                    throw new Error('Invalid endpoints option: must be a string or an array of strings.');
                }
                if (this.internalEndpoints.length === 0) {
                    throw new Error('Endpoints array cannot be empty.');
                }
                this.options.endpoints = this.internalEndpoints; // Store normalized version
            } else {
                throw new Error('Endpoints option is required.');
            }

            // Normalize other specific options
            if (options.chainApi && typeof options.chainApi === 'string') {
                this.options.chainApi = trimTrailingSlash(options.chainApi);
            }
            if (options.reconnectDelay !== undefined) {
                this.options.reconnectDelay = Number(options.reconnectDelay);
            }
            if (options.libActivityTimeoutMs !== undefined) {
                this.options.libActivityTimeoutMs = Number(options.libActivityTimeoutMs);
            }
            if (options.tryForever !== undefined) {
                this.options.tryForever = !!options.tryForever;
            }
            if (options.async !== undefined) {
                this.options.async = !!options.async;
            }
             if (options.libStream !== undefined) {
                this.options.libStream = !!options.libStream;
            }
            if (options.debug !== undefined) {
                this.options.debug = !!options.debug;
            }

        } else {
            throw new Error('Invalid options: input must be an object.');
        }

        this.setupIncomingQueue();
        this.setupIrreversibleQueue();
    }

    public disconnect(clearSavedRequests = true): void {
        this.debugLog('Manual disconnect initiated.');
        this._clearLibActivityTimer();

        const wasConnecting = this.connectionInProgress;
        this.connectionInProgress = false;

        if (this._initialConnectPromiseCallbacks && !this._initialConnectionSucceededThisAttempt) {
            this._initialConnectPromiseCallbacks.reject(new Error('Connection attempt aborted by disconnect.'));
        }
        this._initialConnectPromiseCallbacks = undefined; // Clear them regardless
        // _currentInitialConnectPromise is cleared by its .finally() block

        this._initialConnectionSucceededThisAttempt = false;

        if (this.socket) {
            this.socket.disconnect(); // This will trigger 'disconnect' event on socket
        } else {
            // If socket doesn't exist, ensure online is false.
            // Only emit DISCONNECT if it was trying to connect or was online.
            if (this.online || wasConnecting) {
                this.online = false; // Ensure state consistency
                this.emit(StreamClientEvents.DISCONNECT, { reason: 'manual disconnect, no socket' });
            } else {
                this.online = false;
            }
        }

        if (clearSavedRequests) {
            this.lastReceivedBlock = 0;
            this.savedRequests = [];
        }
    }

    get lastBlockNum(): number {
        return this.lastReceivedBlock;
    }

    private pushToBuffer(task: IncomingData): void {
        if (this.options.libStream) {
            this.reversibleBuffer.push(task);
        }
    }

    private setupIncomingQueue(): void {
        this.dataQueue = queue((task: IncomingData, taskCallback) => {
            task.irreversible = false;
            this.emit(StreamClientEvents.DATA, task);
            this.pushToBuffer(task);
            if (this.options.async && this.onDataAsync) {
                this.onDataAsync(task)
                    .then(() => taskCallback())
                    .catch(err => {
                        console.error('Async data handler error in dataQueue:', err);
                        taskCallback(err);
                    });
            } else {
                // If not async or no handler, still call taskCallback if onDataAsync exists for synchronous case
                if(this.onDataAsync && !this.options.async) {
                     try {
                        (this.onDataAsync(task) as unknown as void); // Synchronous call, ignore promise
                        taskCallback();
                     } catch (err: any) {
                        console.error('Sync data handler error in dataQueue:', err);
                        taskCallback(err);
                     }
                } else {
                    taskCallback();
                }
            }
        }, 1);

        this.dataQueue.error((err, task) => {
            if (err) console.error('Task experienced an error in dataQueue:', err, task);
        });
        this.dataQueue.drain(() => this.emit<void>(StreamClientEvents.DRAIN));
        this.dataQueue.empty(() => this.emit<void>(StreamClientEvents.EMPTY));
    }

    private setupIrreversibleQueue(): void {
        if (this.options.libStream) {
            this.libDataQueue = queue((task: IncomingData, taskCallback) => {
                task.irreversible = true;
                this.emit(StreamClientEvents.LIBDATA, task);
                if (this.options.async && this.onLibDataAsync) {
                    this.onLibDataAsync(task)
                        .then(() => taskCallback())
                        .catch(err => {
                            console.error('Async lib data handler error in libDataQueue:', err);
                            taskCallback(err);
                        });
                } else {
                     if(this.onLibDataAsync && !this.options.async) {
                         try {
                            (this.onLibDataAsync(task) as unknown as void); // Synchronous call
                            taskCallback();
                         } catch (err: any) {
                            console.error('Sync lib data handler error in libDataQueue:', err);
                            taskCallback(err);
                         }
                    } else {
                        taskCallback();
                    }
                }
            }, 1);
            this.libDataQueue.error((err, task) => {
                if (err) console.error('Task experienced an error in libDataQueue:', err, task);
            });
        }
    }

    private _clearLibActivityTimer(): void {
        if (this.libActivityTimer) {
            clearTimeout(this.libActivityTimer);
            this.libActivityTimer = null;
        }
    }

    private _resetLibActivityTimer(): void {
        this._clearLibActivityTimer();
        if (this.options.libActivityTimeoutMs && this.options.libActivityTimeoutMs > 0 && this.online) {
            this.libActivityTimer = setTimeout(() => {
                this.debugLog(`No 'lib_update' received for ${this.options.libActivityTimeoutMs}ms. Assuming stalled connection. Attempting reconnect.`);
                this.emit(StreamClientEvents.LIBACTIVITY_TIMEOUT);
                if (this.socket) {
                    this.socket.disconnect();
                } else {
                    // This case might occur if the socket was already cleaned up by another process
                    this._handleStalledConnectionFallback();
                }
            }, this.options.libActivityTimeoutMs);
        }
    }

    private _handleStalledConnectionFallback(): void {
        // Fallback if socket.disconnect() couldn't be called or socket was already gone
        const prevEndpoint = this.activeEndpointURL; // Capture before clearing
        this.online = false;
        this.activeEndpointURL = undefined;
        // No need to clean up this.socket here as it should already be undefined or handled by disconnect

        this.emit(StreamClientEvents.DISCONNECT, { reason: 'stalled_fallback', endpoint: prevEndpoint });

        if (this.options.tryForever || this._initialConnectionSucceededThisAttempt) {
            if (!this.connectionInProgress) { // Ensure only one reconnect loop starts
                this.connectionInProgress = true;
                this.currentEndpointIndex = (this.currentEndpointIndex + 1) % this.internalEndpoints.length;
                this._scheduleReconnect();
            }
        } else {
            this.connectionInProgress = false; // Give up if not tryForever and initial connection never happened
        }
    }

    private handleLibUpdate(msg: LIBData): void {
        this._resetLibActivityTimer();

        if (this.options.libStream) {
            while (this.reversibleBuffer.length > 0) {
                const firstInBuffer = this.reversibleBuffer[0];
                if (firstInBuffer && firstInBuffer.content.block_num <= msg.block_num) {
                    if (this.libDataQueue) {
                        const data = this.reversibleBuffer.shift();
                        if (data) this.libDataQueue.push(data).catch(console.error);
                    } else break;
                } else break;
            }
        }

        this.emit<LIBData>(StreamClientEvents.LIBUPDATE, msg);

        for (const request of this.savedRequests) {
            const readUntilNum = Number(request.req.read_until);
            if (request.req.read_until && !isNaN(readUntilNum) && readUntilNum !== 0) {
                if (readUntilNum < msg.block_num) {
                    this.debugLog(`read_until ${readUntilNum} reached at LIB ${msg.block_num}. Disconnecting.`);
                    this.disconnect(); // Disconnect but keep saved requests for potential manual reconnect
                    break;
                }
            }
        }
    }

    private _createSocketConnection(endpointUrl: string): Promise<void> { // endpointUrl is available here
        return new Promise((resolve, reject) => {
            if (this.socket) {
                this.socket.disconnect();
                this.socket.removeAllListeners();
                this.socket = undefined;
            }

            // Assign activeEndpointURL for the current attempt *before* creating the socket.
            // Note: If _createSocketConnection is called rapidly for different endpoints in a failover,
            // this.activeEndpointURL will reflect the *latest* one being attempted.
            this.activeEndpointURL = endpointUrl; // Set it here for the current attempt

            this.debugLog(`Attempting to connect to ${endpointUrl}...`); // Use endpointUrl for logging
            this.emit(StreamClientEvents.RECONNECT_ATTEMPT, { endpoint: endpointUrl });

            const socketIoOptions: Partial<ManagerOptions & SocketOptions> = {
                transports: ["websocket"],
                path: '/stream',
                reconnection: false,
            };

            const currentAttemptSocket = io(endpointUrl, socketIoOptions); // Use endpointUrl
            this.socket = currentAttemptSocket;

            const onConnect = () => {
                currentAttemptSocket.off('connect', onConnect);
                currentAttemptSocket.off('connect_error', onError);

                // Use endpointUrl for logging successful connection
                this.debugLog(`Successfully connected to ${endpointUrl}`);
                this.online = true;
                // this.activeEndpointURL should already be endpointUrl from above.
                this.emit<void>(StreamClientEvents.CONNECT);
                this._resetLibActivityTimer();
                this.resendRequests().catch(e => console.error(`HSC: Error in resendRequests from onConnect to ${endpointUrl}`, e));

                if (this._initialConnectPromiseCallbacks && !this._initialConnectionSucceededThisAttempt) {
                    console.log(`HSC: In onConnect for ${endpointUrl}, condition met to resolve initial promise.`);
                    this._initialConnectionSucceededThisAttempt = true;
                    this._initialConnectPromiseCallbacks.resolve();
                } else {
                    console.log(`HSC: In onConnect for ${endpointUrl}, condition NOT met. _initialCbs defined: ${!!this._initialConnectPromiseCallbacks}, _initialSuccess: ${this._initialConnectionSucceededThisAttempt}`);
                }
                resolve();
            };

            const onSocketDisconnect = (reason: Socket.DisconnectReason) => {
                // Use endpointUrl (captured by this closure) as the identifier for the socket that disconnected.
                console.log(`HSC: onSocketDisconnect handler entered for ${endpointUrl}, reason: ${reason}, current this.connectionInProgress: ${this.connectionInProgress}`);
                this._clearLibActivityTimer();
                currentAttemptSocket.removeAllListeners();

                const previouslyOnline = this.online;
                // Use endpointUrl for debug logging. If this.activeEndpointURL was cleared by another path, endpointUrl is more reliable here.
                this.debugLog(`Socket disconnected from ${endpointUrl}: ${reason}`);

                if (this.socket === currentAttemptSocket) {
                    this.online = false;
                    this.activeEndpointURL = undefined; // Safe to clear as it was this socket's URL
                    this.socket = undefined;
                }

                if (previouslyOnline || this.connectionInProgress) {
                    this.emit(StreamClientEvents.DISCONNECT, { reason, endpoint: endpointUrl }); // Use endpointUrl for event
                }

                if (reason === 'io client disconnect') {
                    // this.connectionInProgress is already (or will be) handled by the public disconnect() method
                } else if (this.options.tryForever && this.connectionInProgress) {
                    if (previouslyOnline) { // If an established, online connection dropped
                        this.debugLog(`Established connection to ${endpointUrl} dropped. Scheduling reconnect (tryForever).`);
                        this.currentEndpointIndex = (this.currentEndpointIndex + 1) % this.internalEndpoints.length;
                        this._scheduleReconnect();
                    }
                    // If it's during initial connect() with tryForever, _attemptNextConnection handles retries without this _scheduleReconnect.
                }
                // No "else" here that sets connectionInProgress = false for intermediate failures.
                // _attemptNextConnection handles that for non-tryForever initial cycles.
            };

            const onError = (error: any) => {
                // Use endpointUrl for logging
                console.log(`HSC: onError handler for ${endpointUrl} entered`, error.message || error);
                currentAttemptSocket.off('connect', onConnect);
                currentAttemptSocket.off('connect_error', onError);
                reject(error); // Reject this specific connection attempt's promise
            };

            currentAttemptSocket.on('connect', onConnect);
            currentAttemptSocket.on('connect_error', onError);
            currentAttemptSocket.on('error', onError); // General errors can also occur
            currentAttemptSocket.on('disconnect', onSocketDisconnect);

            currentAttemptSocket.on('lib_update', this.handleLibUpdate.bind(this));
            currentAttemptSocket.on('fork_event', (msg: ForkData) => this.emit<ForkData>(StreamClientEvents.FORK, msg));
            currentAttemptSocket.on('message', (msg: any) => this._handleIncomingMessage(msg));
            currentAttemptSocket.on('status', (status: string) => this._handleStatusUpdate(status));
        });
    }

    private _scheduleReconnect(): void {
        if (!this.connectionInProgress) {
            this.debugLog("Reconnection process not active, _scheduleReconnect will not proceed.");
            return;
        }
        // currentEndpointIndex should have been advanced by the caller before calling _scheduleReconnect
        const nextEndpoint = this.internalEndpoints[this.currentEndpointIndex];
        this.debugLog(`Scheduling reconnect attempt in ${this.options.reconnectDelay}ms to endpoint index ${this.currentEndpointIndex} (${nextEndpoint || 'N/A'})`);

        setTimeout(() => {
            if (this.connectionInProgress) { // Check again, in case disconnect() was called during timeout
                 this._attemptNextConnection(0).catch(err => {
                    // This catch is for the case where _attemptNextConnection itself throws an unhandled error
                    console.error("Scheduled reconnect attempt cycle encountered an unhandled error:", err);
                    // If tryForever, and even the attempt to start a cycle fails, schedule another.
                    if (this.options.tryForever && this.connectionInProgress) {
                        this.currentEndpointIndex = (this.currentEndpointIndex + 1) % this.internalEndpoints.length; // Advance for next try
                        this._scheduleReconnect();
                    } else {
                        this.connectionInProgress = false; // Give up if not tryForever
                         if(this._initialConnectPromiseCallbacks && !this._initialConnectionSucceededThisAttempt){
                            this._initialConnectPromiseCallbacks.reject(new Error("Reconnect cycle failed to start and not trying forever."));
                            // _initialConnectPromiseCallbacks cleared by connect() promise settlement
                        }
                    }
                 });
            } else {
                this.debugLog("Reconnection aborted as client is no longer in a connection process.");
            }
        }, this.options.reconnectDelay);
    }

    private async _attemptNextConnection(attemptCycleCount: number): Promise<void> {
        console.log(`HSC: _attemptNextConnection, attemptCycleCount: ${attemptCycleCount}, endpoint: ${this.internalEndpoints[this.currentEndpointIndex]}`);
        if (!this.connectionInProgress) {
            this.debugLog("Connection process aborted during _attemptNextConnection.");
            // If there's a pending connect() promise, it should be rejected by disconnect() or by this path if not tryForever
            if (!this.options.tryForever && this._initialConnectPromiseCallbacks && !this._initialConnectionSucceededThisAttempt) {
                 this._initialConnectPromiseCallbacks.reject(new Error("Connection process aborted."));
            }
            return;
        }

        if (this.internalEndpoints.length === 0) {
            this.debugLog("No endpoints to attempt connection.");
            if (this._initialConnectPromiseCallbacks && !this._initialConnectionSucceededThisAttempt) {
                this._initialConnectPromiseCallbacks.reject(new Error("No endpoints configured."));
            }
            this.connectionInProgress = false; // Stop attempts
            return;
        }

        const endpointToTry = this.internalEndpoints[this.currentEndpointIndex];
        if (!endpointToTry) { // Should not happen if internalEndpoints is not empty and index is managed
            this.debugLog(`Error: Endpoint at index ${this.currentEndpointIndex} is undefined. Resetting index.`);
            this.currentEndpointIndex = 0; // Reset index to prevent endless loop on bad index
            // If we are trying forever, schedule a new cycle. Otherwise, fail the initial connect.
            if (this.options.tryForever) {
                this._scheduleReconnect(); // Will use the reset index
            } else {
                if (this._initialConnectPromiseCallbacks && !this._initialConnectionSucceededThisAttempt) {
                    this._initialConnectPromiseCallbacks.reject(new Error("Internal error: Invalid endpoint index during connection attempt."));
                }
                this.connectionInProgress = false; // Stop attempts
            }
            return;
        }

        try {
            await this._createSocketConnection(endpointToTry);
            // Successful connection to 'endpointToTry'!
            // onConnect in _createSocketConnection handles resolving _initialConnectPromiseCallbacks.
            this.connectionInProgress = false; // This *cycle* of connection attempts is now complete (successfully).
                                             // If it disconnects later, onSocketDisconnect will set connectionInProgress = true for retries.
        } catch (error) {
            console.log(`HSC: _attemptNextConnection failed for ${endpointToTry}. Cycling to next.`);
            // Connection to current endpoint (endpointToTry) failed
            this.debugLog(`Failed to connect to ${endpointToTry}. Attempt in cycle: ${attemptCycleCount + 1}/${this.internalEndpoints.length}. Error: ${error}`);
            
            if (attemptCycleCount + 1 >= this.internalEndpoints.length) {
                // All endpoints in the current list have been tried in this cycle
                this.debugLog(`All ${this.internalEndpoints.length} endpoints failed in this connection cycle. Last attempt: ${endpointToTry}.`);
                this.emit(StreamClientEvents.ALL_ENDPOINTS_FAILED, { endpoints: this.internalEndpoints });

                if (this.options.tryForever) {
                    this.currentEndpointIndex = (this.currentEndpointIndex + 1) % this.internalEndpoints.length; // Prepare for next cycle
                    // connectionInProgress remains true
                    this._scheduleReconnect(); // Schedule a full new cycle of attempts
                    // The connect() promise remains pending if tryForever
                } else {
                    // Not trying forever, and all endpoints in the initial cycle failed
                    if (this._initialConnectPromiseCallbacks && !this._initialConnectionSucceededThisAttempt) {
                        console.log('HSC: _attemptNextConnection REJECTING initial promise.');
                        this._initialConnectPromiseCallbacks.reject(new Error('All configured endpoints failed to connect.'));
                    }
                    this.connectionInProgress = false; // Stop connection attempts
                }
            } else {
                // More endpoints to try in this current cycle
                this.currentEndpointIndex = (this.currentEndpointIndex + 1) % this.internalEndpoints.length;
                // connectionInProgress remains true; try next endpoint immediately (recursive call)
                await this._attemptNextConnection(attemptCycleCount + 1);
            }
        }
    }

    public connect(): Promise<void> {
        if (this.online) {
            this.debugLog('Already connected and online.');
            return Promise.resolve();
        }

        if (this.connectionInProgress && this._currentInitialConnectPromise) {
            this.debugLog('Connection attempt already in progress, returning existing promise.');
            return this._currentInitialConnectPromise;
        }

        // Create a new promise for this connect() call
        this._currentInitialConnectPromise = new Promise<void>((resolve, reject) => {
            this.connectionInProgress = true;
            this._initialConnectionSucceededThisAttempt = false; // Reset for this new connect() call
            this.currentEndpointIndex = 0; // Start with the first endpoint for a new connect sequence

            if (this.internalEndpoints.length === 0) {
                this.connectionInProgress = false;
                reject(new Error('No endpoints configured.')); // Reject the new promise
                return; // Important to return after reject
            }

            // Store callbacks for this specific connect() promise
            this._initialConnectPromiseCallbacks = {
                resolve: () => {
                    console.log(`HSC: _initialConnectPromiseCallbacks.resolve() called. Current _initialConnectionSucceededThisAttempt: ${this._initialConnectionSucceededThisAttempt}`);
                    this._initialConnectPromiseCallbacks = undefined; // Clear callbacks for this promise
                    resolve();
                },
                reject: (err) => {
                    console.log(`HSC: _initialConnectPromiseCallbacks.reject() called. Error: ${err.message}`);
                    this._initialConnectPromiseCallbacks = undefined; // Clear callbacks for this promise
                    reject(err);
                }
            };

            this.debugLog(`Initiating connection sequence with ${this.internalEndpoints.length} endpoint(s). tryForever: ${this.options.tryForever}`);
            // Start the connection attempt cycle
            this._attemptNextConnection(0).catch(errorFromOuterAttempt => {
                // This catch is a safeguard if _attemptNextConnection itself throws an unexpected error
                // before it gets a chance to call the reject callback.
                console.log('HSC: Outer catch from _attemptNextConnection in connect(), this indicates an issue if promise not already settled:', errorFromOuterAttempt);
                this.debugLog("Outer catch from _attemptNextConnection in connect(), this indicates an issue if promise not already settled:", errorFromOuterAttempt);
                if (this._initialConnectPromiseCallbacks && !this._initialConnectionSucceededThisAttempt) {
                    // If the promise wasn't settled by _attemptNextConnection (e.g. unexpected throw)
                    this._initialConnectPromiseCallbacks.reject(errorFromOuterAttempt);
                }
            });
        });
        
        // Clear the stored promise once it's settled to allow new connect calls to generate new promises
        this._currentInitialConnectPromise.finally(() => {
            this._currentInitialConnectPromise = null;
        });

        return this._currentInitialConnectPromise;
    }

    private processActionTrace(action: ActionContent, mode: "live" | "history"): void {
        const metaKey = '@' + action['act'].name;
        if (action[metaKey]) {
            const parsedData = action[metaKey];
            Object.keys(parsedData).forEach((key) => {
                if (!action['act']['data']) action['act']['data'] = {};
                action['act']['data'][key] = parsedData[key];
            });
            delete action[metaKey];
        }
        if (this.dataQueue) {
            this.dataQueue.push({ type: 'action', mode: mode, content: action, irreversible: false }).catch(console.error);
            this.lastReceivedBlock = action['block_num'];
        }
    }

    private processDeltaTrace(delta: DeltaContent, mode: "live" | "history"): void {
        let metaKey = '@' + delta['table'];
        if (delta[metaKey + '.data']) metaKey = metaKey + '.data';
        if (delta[metaKey]) {
            const parsedData = delta[metaKey];
            Object.keys(parsedData).forEach((key) => {
                if (!delta['data']) delta['data'] = {};
                delta['data'][key] = parsedData[key];
            });
            delete delta[metaKey];
        }
        if (this.dataQueue) {
            this.dataQueue.push({ type: 'delta', mode: mode, content: delta, irreversible: false }).catch(console.error);
            this.lastReceivedBlock = delta['block_num'];
        }
    }

    private _handleIncomingMessage(msg: any): void {
        const hasDataSubscribers = this.onDataAsync || this.onLibDataAsync ||
                               (this.eventListeners.get(StreamClientEvents.DATA)?.length || 0) > 0 ||
                               (this.tempEventListeners.get(StreamClientEvents.DATA)?.length || 0) > 0;

        if (hasDataSubscribers && (msg.message || msg['messages'])) {
            try {
                const messages = msg['messages'] || [JSON.parse(msg.message)];
                messages.forEach((messageContent: ActionContent | DeltaContent) => {
                    if (msg.type === 'action_trace') {
                        this.processActionTrace(messageContent as ActionContent, msg.mode);
                    } else if (msg.type === 'delta_trace') {
                        this.processDeltaTrace(messageContent as DeltaContent, msg.mode);
                    }
                });
            } catch (parseError) {
                console.error("Error parsing incoming message:", parseError, msg.message || msg.messages);
            }
        }
    }

    private _handleStatusUpdate(status: string): void {
        switch (status) {
            case 'relay_restored':
                if (!this.online) {
                    this.online = true;
                    this.debugLog('Relay restored, ensuring requests are active.');
                    this.resendRequests().catch(console.error);
                }
                break;
            case 'relay_down':
                this.debugLog('Relay down. Stream may be interrupted. Client remains connected.');
                break;
            default:
                this.debugLog('Received status:', status);
        }
    }

    async resendRequests(): Promise<void> {
        if (!this.socket || !this.socket.connected || !this.online) {
            this.debugLog('Cannot resend requests: socket not connected or client not online.');
            return;
        }
        if (this.savedRequests.length === 0) return;

        this.debugLog(`Resending ${this.savedRequests.length} saved requests to ${this.activeEndpointURL}`);
        const tempSavedRequests = [...this.savedRequests]; // Operate on a copy
        this.savedRequests = []; // Clear original; successful sends re-add

        for (const r of tempSavedRequests) {
            try {
                let response;
                if (r.type === 'action') {
                    response = await this.streamActions(r.req as StreamActionsRequest, true); // isResend = true
                } else if (r.type === 'delta') {
                    response = await this.streamDeltas(r.req as StreamDeltasRequest, true); // isResend = true
                }
                this.debugLog(`Request resent successfully: ${r.type}`, response);
                // streamActions/Deltas will re-add to savedRequests if successful
            } catch (error) {
                this.debugLog(`Failed to resend request ${r.type}. It will be re-added to queue for next connection. Error:`, error);
                // Add back if failed, so it's not lost, ensuring no duplicates
                if (!this.savedRequests.find(sr => sr.req === r.req && sr.type === r.type)) {
                    this.savedRequests.push(r);
                }
            }
        }
    }

    async streamActions(request: StreamActionsRequest, isResend: boolean = false): Promise<any> {
        if (!this.socket || !this.socket.connected) {
            // Save request only if it's a new one and not already in the queue to avoid duplicates
            if (!isResend && !this.savedRequests.find(sr => sr.req === request && sr.type === 'action')) {
                 this.savedRequests.push({ type: 'action', req: request });
            }
            throw new Error('Client is not connected! Request saved (if new). Please call connect.');
        }
        try {
            if (!isResend) await this.checkLastBlock(request); // Only check/modify if it's a brand new request
        } catch (e: any) {
            return { status: 'ERROR', error: e.message };
        }
        return new Promise((resolve, reject) => {
            if (!this.socket) return reject({ status: false, error: 'socket was not created (should not happen here)' });
            this.socket.emit('action_stream_request', request, (response: any) => {
                this.debugLog('action_stream_request response:', response);
                if (response.status === 'OK') {
                    // Add to savedRequests if this is the first time it's successfully sent
                    if (!this.savedRequests.find(sr => sr.req === request && sr.type === 'action')) {
                        this.savedRequests.push({ type: 'action', req: request });
                    }
                    response['startingBlock'] = request.start_from; // Add original start_from for user info
                    resolve(response);
                } else {
                    reject(response);
                }
            });
        });
    }

    async streamDeltas(request: StreamDeltasRequest, isResend: boolean = false): Promise<any> {
        if (!this.socket || !this.socket.connected) {
             if (!isResend && !this.savedRequests.find(sr => sr.req === request && sr.type === 'delta')) {
                this.savedRequests.push({ type: 'delta', req: request });
            }
            throw new Error('Client is not connected! Request saved (if new). Please call connect.');
        }
        try {
            if (!isResend) await this.checkLastBlock(request);
        } catch (e: any) {
            return { status: 'ERROR', error: e.message };
        }
        return new Promise((resolve, reject) => {
            if (!this.socket) return reject({ status: false, error: 'socket was not created (should not happen here)' });
            this.socket.emit('delta_stream_request', request, (response: any) => {
                this.debugLog('delta_stream_request response:', response);
                if (response.status === 'OK') {
                     if (!this.savedRequests.find(sr => sr.req === request && sr.type === 'delta')) {
                        this.savedRequests.push({ type: 'delta', req: request });
                    }
                    response['startingBlock'] = request.start_from;
                    resolve(response);
                } else {
                    reject(response);
                }
            });
        });
    }

    private async checkLastBlock(request: StreamActionsRequest | StreamDeltasRequest): Promise<void> {
        let currentStartFrom = request.start_from; // Work with a local copy to avoid confusion
        if (String(currentStartFrom).toUpperCase() === 'LIB') {
            let url = this.options.chainApi ? this.options.chainApi : this.activeEndpointURL;
            if (!url) throw new Error('Cannot determine chain API URL to fetch LIB while not connected.'); // Should have activeEndpointURL if trying to send
            url += '/v1/chain/get_info';
            try {
                const getInfoResponse = await fetch(url);
                if (!getInfoResponse.ok) {
                    throw new Error(`Failed to fetch get_info from ${url}: ${getInfoResponse.status} ${getInfoResponse.statusText}`);
                }
                const json = await getInfoResponse.json() as any;
                if (json && typeof json['last_irreversible_block_num'] === 'number') {
                    currentStartFrom = json['last_irreversible_block_num'];
                    this.debugLog(`Stream starting at LIB (block ${currentStartFrom}) fetched from ${url}`);
                } else {
                    throw new Error(`Invalid response from get_info or missing last_irreversible_block_num from ${url}`);
                }
            } catch (e: any) {
                throw new Error(`get_info call failed on: ${url} | error: ${e.message || String(e)}`);
            }
        } else if (currentStartFrom !== 0 && this.lastReceivedBlock > 0) {
            // Ensure currentStartFrom is numeric for comparison if it's not 'LIB'
            const numericStartFrom = Number(currentStartFrom);
            if (!isNaN(numericStartFrom) && numericStartFrom < this.lastReceivedBlock) {
                this.debugLog(`Adjusting start_from from ${currentStartFrom} to lastReceivedBlock ${this.lastReceivedBlock}`);
                currentStartFrom = this.lastReceivedBlock;
            }
        }
        request.start_from = currentStartFrom; // Update the original request object's property
    }

    private debugLog(...args: any[]): void {
        if (this.options.debug) {
            const timestamp = new Date().toISOString();
            console.log(`[hyperion:debug ${timestamp}]`, ...args);
        }
    }

    public setAsyncDataHandler(handler: AsyncHandlerFunction): void {
        this.onDataAsync = handler;
    }

    public setAsyncLibDataHandler(handler: AsyncHandlerFunction): void {
        this.onLibDataAsync = handler;
    }

    private emit<T extends EventData>(event: StreamClientEvents | string, data?: T): void {
        const listeners = this.eventListeners.get(event);
        if (listeners) {
            [...listeners].forEach((l: EventListener) => { // Iterate over a copy
                try { l(data); } catch (e) { console.error(`Error in 'on' event listener for ${event}:`, e); }
            });
        }

        const tempListeners = this.tempEventListeners.get(event);
        if (tempListeners && tempListeners.length > 0) {
            const listenersToCall = [...tempListeners]; // Iterate over a copy
            this.tempEventListeners.set(event, []); // Clear immediately before calling
            listenersToCall.forEach(listener => {
                 try { listener(data); } catch (e) { console.error(`Error in 'once' event listener for ${event}:`, e); }
            });
        }
    }

    public once(event: StreamClientEvents | string, listener: EventListener): void {
        if (typeof listener !== 'function') throw new Error('Event listener must be a function');
        if (!this.tempEventListeners.has(event)) {
            this.tempEventListeners.set(event, []);
        }
        this.tempEventListeners.get(event)?.push(listener);
    }

    public on(event: StreamClientEvents | string, listener: EventListener): void {
        if (typeof listener !== 'function') throw new Error('Event listener must be a function');
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, []);
        }
        this.eventListeners.get(event)?.push(listener);
    }

    public off(event: StreamClientEvents | string, listener: EventListener): void {
        const listeners = this.eventListeners.get(event);
        if (listeners) {
            const idx = listeners.findIndex(l => l === listener);
            if (idx > -1) listeners.splice(idx, 1);
        }
        const tempListeners = this.tempEventListeners.get(event);
        if (tempListeners) {
            const idx = tempListeners.findIndex(l => l === listener);
            if (idx > -1) tempListeners.splice(idx, 1);
        }
    }
}