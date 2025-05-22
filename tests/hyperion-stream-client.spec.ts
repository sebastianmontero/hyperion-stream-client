// jest.mock('socket.io-client', () => {
//   // Path should be relative from project root if __mocks__ is in root,
//   // or relative from this test file to the mock file.
//   // Let's assume __mocks__ is at the root of your project.
//   // If tests/ is also at root, then '../__mocks__/socket.io-client'
//   return require('../__mocks__/socket.io-client');
// });

// tests/hyperion-stream-client.spec.ts
import {
  HyperionClientOptions,
  StreamActionsRequest,
  LIBData,
  ForkData,
  ActionContent,
  // Import other necessary types like StreamActionsRequest if directly used in tests
} from '../src/interfaces'; // Adjust path as needed
import {
  HyperionStreamClient,
  StreamClientEvents,
  // Import other necessary types like StreamActionsRequest if directly used in tests
} from '../src/hyperion-stream-client'; // Adjust path as needed


// const { getMockSocket, resetMockSocket } = ActualSocketIOMock;
import { io } from 'socket.io-client';
import fetch from 'cross-fetch'; // Wi

jest.mock('socket.io-client');
jest.mock('cross-fetch');

import { getMockSocket, resetMockSocket, EventHandler } from '../__mocks__/socket.io-client';

// Type of your mock socket instance, useful for `mockSocket` variable
type MockSocketType = ReturnType<typeof getMockSocket>;

// Typecast the imported mock fetch
const mockedFetch = fetch as jest.MockedFunction<typeof fetch>;
const mockedIo = io as jest.MockedFunction<typeof io>;

interface LocalMockSocket {
    _name: string;
    connected: boolean;
    _handlers: Record<string, EventHandler[] | undefined>;
    on: jest.Mock<LocalMockSocket, [string, EventHandler]>;
    off: jest.Mock<LocalMockSocket, [string, EventHandler]>;
    emit: jest.Mock<void, [event: string, ...args: any[]]>;
    disconnect: jest.Mock<void, []>;
    removeAllListeners: jest.Mock<void, []>;
    _trigger: jest.Mock<void, [string, ...any[]]>;
    _simulateSuccessfulConnect: jest.Mock<void, []>;
    _simulateConnectError: jest.Mock<void, [Error]>;
}

const createLocalMockSocket = (name: string): LocalMockSocket => {
    const localHandlers: Record<string, EventHandler[]> = {};
    const mockInst: LocalMockSocket = {
        _name: name,
        connected: false,
        _handlers: localHandlers,
        on: jest.fn(function(this: LocalMockSocket, event: string, handler: EventHandler) {
            let handlersForEvent = this._handlers[event];
            if (!handlersForEvent) {
                handlersForEvent = [];
                this._handlers[event] = handlersForEvent;
            }
            handlersForEvent.push(handler);
            return this;
        }),
        off: jest.fn(function(this: LocalMockSocket, event: string, handler: EventHandler) {
            const handlersForEvent = this._handlers[event];
            if (handlersForEvent) {
                this._handlers[event] = handlersForEvent.filter(h => h !== handler);
            }
            return this;
        }),
        emit: jest.fn(function(this: LocalMockSocket, event: string, ...args: any[]) {
            let ack: Function | undefined;
            if (args.length > 0 && typeof args[args.length - 1] === 'function') {
                ack = args.pop() as Function;
            }
            if (ack) {
                if (event === 'action_stream_request' || event === 'delta_stream_request') {
                    ack({ status: "OK" });
                } else {
                    ack();
                }
            }
        }),
        disconnect: jest.fn(function(this: LocalMockSocket) { this.connected = false; }),
        removeAllListeners: jest.fn(function(this: LocalMockSocket) {
            Object.keys(this._handlers).forEach(key => delete this._handlers[key]);
        }),
        _trigger: jest.fn(function(this: LocalMockSocket, event: string, ...args: any[]) {
            const handlersToCall = this._handlers[event];
            if (handlersToCall && handlersToCall.length > 0) {
                [...handlersToCall].forEach((h: Function) => { try { h(...args); } catch (e) { console.error(`MOCK_TRIGGER_ERROR (${this._name}, ${event}):`, e);} });
            }
        }),
        _simulateSuccessfulConnect: jest.fn(function(this: LocalMockSocket) {
            this.connected = true; this._trigger('connect');
        }),
        _simulateConnectError: jest.fn(function(this: LocalMockSocket, err: Error) {
            this.connected = false; this._trigger('connect_error', err); this._trigger('disconnect', 'transport error');
        })
    };
    return mockInst;
};


describe('HyperionStreamClient', () => {
    let client: HyperionStreamClient; // To be instantiated in beforeEach of relevant describe blocks or in tests
    let globalCurrentMockSocket: MockSocketType; // The global mock from __mocks__

    const defaultTestOptions: HyperionClientOptions = {
        endpoints: 'ws://default-test-ep.com',
        async: false,
        debug: false,
        libActivityTimeoutMs: 0,
        reconnectDelay: 0,
        tryForever: false,
    };

    beforeEach(() => {
        jest.useFakeTimers();
        resetMockSocket(); // Resets the state of the global mockSocketInstance from __mocks__
        globalCurrentMockSocket = getMockSocket(); // Get the global instance
        mockedFetch.mockReset();
        mockedIo.mockClear(); // Clear call stats and mockImplementation details for mockedIo itself
    });

    afterEach(async () => {
        if (client) { // client might not be set if a constructor test fails early
            client.disconnect();
        }
        jest.clearAllTimers();
        jest.useRealTimers();
    });

    describe('Constructor and Options', () => {
        it('should throw an error if no endpoints are provided', () => {
            expect(() => new HyperionStreamClient({ ...defaultTestOptions, endpoints: [] }))
                .toThrow('Endpoints array cannot be empty.');
            // @ts-ignore
            expect(() => new HyperionStreamClient({ async: false } as HyperionClientOptions))
                .toThrow('Endpoints option is required.');
        });

        it('should correctly initialize with a single string endpoint and trim slash', () => {
            const localClient = new HyperionStreamClient({ ...defaultTestOptions, endpoints: 'ws://test.com/' });
            // @ts-ignore
            expect(localClient.internalEndpoints).toEqual(['ws://test.com']);
        });

        it('should correctly initialize with an array of endpoints and trim slashes', () => {
            const localClient = new HyperionStreamClient({ ...defaultTestOptions, endpoints: ['ws://test1.com/', 'ws://test2.com'] });
            // @ts-ignore
            expect(localClient.internalEndpoints).toEqual(['ws://test1.com', 'ws://test2.com']);
        });

        it('should set debug option and log messages', () => {
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
            const localClient = new HyperionStreamClient({ ...defaultTestOptions, debug: true });
            // @ts-ignore
            localClient.debugLog('test debug');
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[hyperion:debug'), 'test debug');
            consoleSpy.mockRestore();
        });
    });

    describe('Connection Handling (Single Endpoint)', () => {
        beforeEach(() => {
            client = new HyperionStreamClient(defaultTestOptions);
            // All calls to io() by this client instance will return the globalCurrentMockSocket
            mockedIo.mockReturnValue(globalCurrentMockSocket as any);
        });

        it('should connect to the endpoint successfully', async () => {
            const connectPromise = client.connect();
            globalCurrentMockSocket._simulateSuccessfulConnect();
            await jest.runAllTicks();
            await expect(connectPromise).resolves.toBeUndefined();
            expect(client.online).toBe(true);
            expect(globalCurrentMockSocket.on).toHaveBeenCalledWith('connect', expect.any(Function));
        });

        it('should emit CONNECT event on successful connection', async () => {
            const connectListener = jest.fn();
            client.on(StreamClientEvents.CONNECT, connectListener);
            const connectPromise = client.connect();
            globalCurrentMockSocket._simulateSuccessfulConnect();
            await jest.runAllTicks();
            await connectPromise;
            expect(connectListener).toHaveBeenCalledTimes(1);
        });

        it('ERR should fail to connect if socket emits connect_error', async () => {
            client = new HyperionStreamClient({ ...defaultTestOptions, tryForever: false }); // Re-init for specific option
            mockedIo.mockReturnValue(globalCurrentMockSocket as any); // Ensure this new instance uses the mock

            const connectPromise = client.connect();
            globalCurrentMockSocket._simulateConnectError();
            await jest.runAllTicks();
            await expect(connectPromise).rejects.toThrow('All configured endpoints failed to connect.');
            expect(client.online).toBe(false);
        });

        it('disconnect() should make online false and emit DISCONNECT for a connected client', async () => {
            const connectPromise = client.connect();
            globalCurrentMockSocket._simulateSuccessfulConnect();
            await jest.runAllTicks();
            await connectPromise;

            const disconnectListener = jest.fn();
            client.on(StreamClientEvents.DISCONNECT, disconnectListener);
            client.disconnect();
            await jest.runAllTicks();

            expect(client.online).toBe(false);
            expect(globalCurrentMockSocket.disconnect).toHaveBeenCalled();
            expect(disconnectListener).toHaveBeenCalledWith({ reason: 'io client disconnect', endpoint: defaultTestOptions.endpoints as string });
        });

        it('disconnect() should abort a pending connect() attempt and reject its promise', async () => {
            const connectPromise = client.connect();
            client.disconnect();
            await expect(connectPromise).rejects.toThrow('Connection attempt aborted by disconnect.');
            expect(client.online).toBe(false);
        });

        it('Err disconnect() should abort a pending connect() attempt and reject its promise', async () => {
            console.log('TEST: Starting "disconnect() should abort..." test');
            const connectPromise = client.connect();
            let caughtError: Error | null = null;
            try {
                console.log('TEST: Calling client.disconnect()');
                client.disconnect(); // This will internally call _initialConnectPromiseCallbacks.reject()
                console.log('TEST: client.disconnect() called. Awaiting connectPromise.');
                // await jest.runAllTicks(); // <<< ADD THIS
                await connectPromise; // This line will throw because connectPromise is rejected
                console.log('TEST: connectPromise resolved unexpectedly (SHOULD NOT HAPPEN)');
            } catch (error: any) {
                console.log('TEST: Caught error from awaiting connectPromise:', error.message);
                caughtError = error;
            }
    
            expect(caughtError).toBeInstanceOf(Error);
            expect(caughtError?.message).toBe('Connection attempt aborted by disconnect.');
            expect(client.online).toBe(false);
            console.log('TEST: Finished "disconnect() should abort..." test');
        });
    });

    describe('Connection Handling with Failover', () => {
        it('should connect to the second endpoint if the first one fails (tryForever: false)', async () => {
            const endpoints = ['ws://ep1.com', 'ws://ep2.com'];
            client = new HyperionStreamClient({ ...defaultTestOptions, endpoints, tryForever: false });

            const mockSocketEp1 = createLocalMockSocket('EP1_Socket_Failover1');
            const mockSocketEp2 = createLocalMockSocket('EP2_Socket_Failover1');

            mockedIo
                .mockReturnValueOnce(mockSocketEp1 as any)
                .mockReturnValueOnce(mockSocketEp2 as any);

            const connectPromise = client.connect();

            // Phase 1: EP1 Fails
            await jest.runAllTicks(); // Allow client to call io() for ep1 & attach listeners
            expect(mockedIo).toHaveBeenCalledTimes(1);
            mockSocketEp1._simulateConnectError(new Error('ep1 failed'));

            await jest.runAllTicks(); // Allow client's internal failover logic
            expect(mockedIo).toHaveBeenCalledTimes(2);
            // @ts-ignore
            expect(client.activeEndpointURL).toBe(endpoints[1]);

            // Phase 2: EP2 Succeeds
            mockSocketEp2._simulateSuccessfulConnect();
            await jest.runAllTicks(); // Allow onConnect for ep2 & promise resolution

            await expect(connectPromise).resolves.toBeUndefined();
            expect(client.online).toBe(true);
            // @ts-ignore
            expect(client.activeEndpointURL).toBe(endpoints[1]);
        });

        it('ERR should emit ALL_ENDPOINTS_FAILED if all endpoints fail and not tryForever', async () => {
            const endpoints = ['ws://ep1.com', 'ws://ep2.com'];
            client = new HyperionStreamClient({ ...defaultTestOptions, endpoints, tryForever: false });
            const allFailedListener = jest.fn();
            client.on(StreamClientEvents.ALL_ENDPOINTS_FAILED, allFailedListener);

            const mockSocketEp1 = createLocalMockSocket('EP1_Socket_AllFail');
            const mockSocketEp2 = createLocalMockSocket('EP2_Socket_AllFail');

            mockedIo
                .mockReturnValueOnce(mockSocketEp1 as any)
                .mockReturnValueOnce(mockSocketEp2 as any);

            const connectPromise = client.connect();

            await jest.runAllTicks(); // For ep1 setup
            mockSocketEp1._simulateConnectError(new Error('ep1 failed'));
            await jest.runAllTicks(); // For ep1 failure processing and ep2 setup

            mockSocketEp2._simulateConnectError(new Error('ep2 failed'));
            await jest.runAllTicks(); // For ep2 failure processing

            await expect(connectPromise).rejects.toThrow('All configured endpoints failed to connect.');
            expect(allFailedListener).toHaveBeenCalledWith({ endpoints });
            expect(client.online).toBe(false);
            expect(mockedIo).toHaveBeenCalledTimes(2);
            console.log('End of emit ALL_ENDPOINTS_FAILED test');
        });

        it('should attempt to reconnect on disconnect if tryForever is true', async () => {
            client = new HyperionStreamClient({ ...defaultTestOptions, endpoints: ['ws://ep1.com'], tryForever: true, reconnectDelay: 100 });

            const mockSocket1 = createLocalMockSocket('EP1_Socket_TryForever1');
            const mockSocket2 = createLocalMockSocket('EP1_Socket_TryForever2_Reconnect'); // For reconnect attempt

            mockedIo
                .mockReturnValueOnce(mockSocket1 as any)
                .mockReturnValueOnce(mockSocket2 as any);

            // Initial connection
            const initialConnectPromise = client.connect();
            await jest.runAllTicks(); // io for mockSocket1
            mockSocket1._simulateSuccessfulConnect();
            await jest.runAllTicks(); // Process connect
            await initialConnectPromise;
            expect(client.online).toBe(true);

            // Simulate server/network initiated disconnect
            mockSocket1._trigger('disconnect', 'transport error'); // client was using mockSocket1
            await jest.runAllTicks(); // Process disconnect event
            expect(client.online).toBe(false);

            // Advance timer for reconnectDelay
            jest.advanceTimersByTime(100);
            await jest.runAllTicks(); // Process _scheduleReconnect -> _attemptNextConnection -> io for mockSocket2
            expect(mockedIo).toHaveBeenCalledTimes(2);

            // Simulate reconnect success
            mockSocket2._simulateSuccessfulConnect(); // client now uses mockSocket2
            await jest.runAllTicks(); // Process connect
            expect(client.online).toBe(true);
        });
    });

    describe('Request Handling', () => {
        const actionRequest: StreamActionsRequest = { contract: 'eosio.token', action: 'transfer', account: 'testacc', filters: [], start_from:0, read_until:0 };

        beforeEach(async () => {
            client = new HyperionStreamClient(defaultTestOptions);
            mockedIo.mockReturnValue(globalCurrentMockSocket as any);
            const p = client.connect();
            globalCurrentMockSocket._simulateSuccessfulConnect();
            await jest.runAllTicks();
            await p;
        });

        it('should send streamActions request when connected', async () => {
            globalCurrentMockSocket.emit.mockImplementationOnce((_event, _data, ack) => ack({ status: 'OK' }));
            await client.streamActions(actionRequest);
            expect(globalCurrentMockSocket.emit).toHaveBeenCalledWith('action_stream_request', expect.objectContaining(actionRequest), expect.any(Function));
            // @ts-ignore
            expect(client.savedRequests.length).toBe(1);
        });

        it('should throw and save request if streamActions called after explicit disconnect', async () => {
            client.disconnect();
            await jest.runAllTicks();
            expect(client.online).toBe(false);
            await expect(client.streamActions(actionRequest))
                .rejects.toThrow('Client is not connected! Request saved (if new). Please call connect.');
            // @ts-ignore
            expect(client.savedRequests.length).toBe(1);
        });

        it('should resend saved requests upon reconnection', async () => {
            globalCurrentMockSocket.emit.mockImplementationOnce((_e, _d, ack) => ack({ status: 'OK' }));
            await client.streamActions(actionRequest);
            // @ts-ignore
            expect(client.savedRequests.length).toBe(1);
            globalCurrentMockSocket.emit.mockClear();

            // @ts-ignore Enable auto-reconnect for this test
            client.options.tryForever = true;
            // @ts-ignore
            client.options.reconnectDelay = 50;

            globalCurrentMockSocket._trigger('disconnect', 'transport error');
            await jest.runAllTicks();
            expect(client.online).toBe(false);

            const mockSocketForReconnect = createLocalMockSocket('ReconnectSocket_Req');
            mockedIo.mockReturnValueOnce(mockSocketForReconnect as any);

            jest.advanceTimersByTime(50);
            await jest.runAllTicks();

            expect(mockedIo).toHaveBeenCalledTimes(2);
            mockSocketForReconnect.emit.mockImplementationOnce((_e, _d, ack) => ack({ status: 'OK' }));
            mockSocketForReconnect._simulateSuccessfulConnect();
            await jest.runAllTicks();

            expect(client.online).toBe(true);
            expect(mockSocketForReconnect.emit).toHaveBeenCalledWith('action_stream_request', expect.objectContaining(actionRequest), expect.any(Function));
        });

        it('should handle checkLastBlock with start_from: "LIB"', async () => {
            mockedFetch.mockResolvedValueOnce({
                ok: true, json: async () => ({ last_irreversible_block_num: 12345 }),
            } as Response);
            const libRequest = { ...actionRequest, start_from: 'LIB' };
            globalCurrentMockSocket.emit.mockImplementationOnce((_e, _d, ack) => ack({ status: 'OK' }));
            await client.streamActions(libRequest);
            await jest.runAllTicks();
            expect(mockedFetch).toHaveBeenCalledWith(`${defaultTestOptions.endpoints}/v1/chain/get_info`);
            expect(globalCurrentMockSocket.emit).toHaveBeenCalledWith('action_stream_request', expect.objectContaining({ start_from: 12345 }), expect.any(Function));
        });

        it('should adjust start_from if lower than lastReceivedBlock', async () => {
            // @ts-ignore
            client.lastReceivedBlock = 200;
            const lowStartRequest = { ...actionRequest, start_from: 100 };
            globalCurrentMockSocket.emit.mockImplementationOnce((_e, _d, ack) => ack({ status: 'OK' }));
            await client.streamActions(lowStartRequest);
            await jest.runAllTicks();
            expect(globalCurrentMockSocket.emit).toHaveBeenCalledWith('action_stream_request', expect.objectContaining({ start_from: 200 }), expect.any(Function));
        });

        it('should disconnect if read_until is met by LIB', async () => {
            const disconnectSpy = jest.spyOn(client, 'disconnect');
            const readUntilRequest = { ...actionRequest, read_until: 100 };
            globalCurrentMockSocket.emit.mockImplementationOnce((_e, _d, ack) => ack({ status: 'OK' }));
            await client.streamActions(readUntilRequest);
            await jest.runAllTicks();

            globalCurrentMockSocket._trigger('lib_update', { chain_id: 'test', block_num: 101, block_id: 'abc' } as LIBData);
            await jest.runAllTicks();

            expect(disconnectSpy).toHaveBeenCalled();
            disconnectSpy.mockRestore();
        });
    });

    describe('Data and Event Handling', () => {
        // Define a detailed mockActionPayload based on your ActionContent interface
        // Assuming ActionContent expects act.authorization to be a single object
        const completeMockActionPayload: ActionContent = {
            '@timestamp': new Date('2023-01-01T12:00:00.000Z').toISOString(),
            act: {
                account: 'testcontract',
                name: 'testaction',
                authorization: { actor: 'testuser', permission: 'active' }, // << KEY CHANGE: Now a single object
                data: { memo: 'hello from test', value: 123 },
            },
            block_num: 100,
            global_sequence: 12345,
            // Assuming account_ram_deltas is a single object as per your current ActionContent structure
            account_ram_deltas: { delta: 10, account: 'testuser' },
            action_ordinal: 1,
            creator_action_ordinal: 0,
            cpu_usage_us: 150,
            net_usage_words: 32,
            code_sequence: 1,
            abi_sequence: 1,
            trx_id: 'testtrxid001',
            producer: 'eosproducer',
            // Assuming notified is a single string as per your current ActionContent structure
            notified: 'testcontract',
        };
    
        const anotherMockActionPayload: ActionContent = {
            ...completeMockActionPayload, // Base it on the first one
            block_num: 101, // Different block
            global_sequence: 12346,
            trx_id: 'testtrxid002',
            act: {
                ...completeMockActionPayload.act, // Inherit account, name
                authorization: { actor: 'anotheruser', permission: 'owner' }, // << KEY CHANGE: Single object
                data: { memo: 'another action', value: 456 },
            },
            // Adjust other fields if they should vary for the second payload
            notified: 'anothercontract',
        };
    
    
        beforeEach(async () => {
            // Client for this block will have async: true by default in options
            client = new HyperionStreamClient({ ...defaultTestOptions, async: true });
            mockedIo.mockReturnValue(globalCurrentMockSocket as any);
    
            const p = client.connect();
            globalCurrentMockSocket._simulateSuccessfulConnect();
            await jest.runAllTicks();
            await p;
        });
    
        it('should process a single action trace (from "message" string) and call onDataAsync handler', async () => {
            const dataHandler = jest.fn().mockResolvedValue(undefined);
            client.setAsyncDataHandler(dataHandler);
    
            const serverMessage = {
                type: 'action_trace',
                mode: 'live',
                message: JSON.stringify(completeMockActionPayload)
            };
    
            globalCurrentMockSocket._trigger('message', serverMessage);
            await jest.runAllTicks();
    
            expect(dataHandler).toHaveBeenCalledTimes(1);
            expect(dataHandler).toHaveBeenCalledWith(expect.objectContaining({
                type: 'action',
                mode: 'live',
                content: expect.objectContaining(completeMockActionPayload),
                irreversible: false
            }));
            // @ts-ignore
            expect(client.lastReceivedBlock).toBe(completeMockActionPayload.block_num);
        });
    
        it('should process multiple action traces (from "messages" array) and call onDataAsync handler for each', async () => {
            const dataHandler = jest.fn().mockResolvedValue(undefined);
            client.setAsyncDataHandler(dataHandler);
    
            const serverMessage = {
                type: 'action_trace',
                mode: 'history',
                messages: [completeMockActionPayload, anotherMockActionPayload] // Array of valid ActionContent objects
            };
    
            globalCurrentMockSocket._trigger('message', serverMessage);
            console.log('TEST: Message triggered with 2 actions.');
            await jest.runAllTicks(); // For first item's onDataAsync promise
            console.log('TEST: First runAllTicks done.');
            await jest.runAllTicks(); // For second item's onDataAsync promise, if queue picked it up
            console.log('TEST: Second runAllTicks done.');
    
            expect(dataHandler).toHaveBeenCalledTimes(2);
            expect(dataHandler).toHaveBeenCalledWith(expect.objectContaining({
                type: 'action',
                mode: 'history',
                content: expect.objectContaining(completeMockActionPayload),
            }));
            expect(dataHandler).toHaveBeenCalledWith(expect.objectContaining({
                type: 'action',
                mode: 'history',
                content: expect.objectContaining(anotherMockActionPayload),
            }));
            // @ts-ignore
            expect(client.lastReceivedBlock).toBe(anotherMockActionPayload.block_num);
        });
    
        it('should emit DATA event for a single action trace (from "message" string)', (done) => {
            client.on(StreamClientEvents.DATA, (data) => {
                expect(data).toEqual(expect.objectContaining({
                    type: 'action',
                    mode: 'history',
                    content: expect.objectContaining(completeMockActionPayload)
                }));
                done();
            });
    
            const serverMessage = {
                type: 'action_trace',
                mode: 'history',
                message: JSON.stringify(completeMockActionPayload)
            };
            globalCurrentMockSocket._trigger('message', serverMessage);
        });
    
        it('should emit DATA events for multiple action traces (from "messages" array)', (done) => {
            const expectedPayloads = [completeMockActionPayload, anotherMockActionPayload];
            let receivedCount = 0;
    
            client.on(StreamClientEvents.DATA, (data) => {
                expect(data).toEqual(expect.objectContaining({
                    type: 'action',
                    mode: 'live',
                    content: expect.objectContaining(expectedPayloads[receivedCount]),
                }));
                receivedCount++;
                if (receivedCount === expectedPayloads.length) {
                    done();
                }
            });
    
            const serverMessage = {
                type: 'action_trace',
                mode: 'live',
                messages: expectedPayloads
            };
            globalCurrentMockSocket._trigger('message', serverMessage);
        });
    
    
        it('should handle LIB updates and process reversible buffer if libStream is true', async () => {
            if (client) client.disconnect(); // Disconnect client from outer beforeEach
            await jest.runAllTicks();
    
            client = new HyperionStreamClient({ ...defaultTestOptions, libStream: true, async: true });
            resetMockSocket();
            globalCurrentMockSocket = getMockSocket();
            mockedIo.mockReturnValue(globalCurrentMockSocket as any);
    
            const connectPromise = client.connect();
            globalCurrentMockSocket._simulateSuccessfulConnect();
            await jest.runAllTicks();
            await connectPromise;
    
            const libDataHandler = jest.fn().mockResolvedValue(undefined);
            client.setAsyncLibDataHandler(libDataHandler);
            const dataHandler = jest.fn().mockResolvedValue(undefined);
            client.setAsyncDataHandler(dataHandler);
    
            const reversibleAction = { ...completeMockActionPayload, block_num: 100 }; // Uses updated payload
            globalCurrentMockSocket._trigger('message', {
                type: 'action_trace',
                mode: 'live',
                message: JSON.stringify(reversibleAction)
            });
            await jest.runAllTicks();
    
            expect(dataHandler).toHaveBeenCalledWith(expect.objectContaining({
                content: reversibleAction,
                irreversible: false
            }));
            // @ts-ignore
            expect(client.reversibleBuffer.length).toBe(1);
    
            const libUpdateData: LIBData = { chain_id: 'testchain', block_num: 100, block_id: 'block100id' };
            globalCurrentMockSocket._trigger('lib_update', libUpdateData);
            await jest.runAllTicks();
            await jest.runAllTicks();
    
            expect(libDataHandler).toHaveBeenCalledWith(expect.objectContaining({
                content: reversibleAction,
                irreversible: true
            }));
            // @ts-ignore
            expect(client.reversibleBuffer.length).toBe(0);
        });
    
        it('once listener should only be called once for a triggered event', async () => {
            const onceListener = jest.fn();
            client.once(StreamClientEvents.FORK, onceListener);
            const forkData: ForkData = { chain_id: 'testchain', starting_block: 1, ending_block: 0, new_id: 'new_block_id_b'};
    
            globalCurrentMockSocket._trigger('fork_event', forkData);
            await jest.runAllTicks();
            globalCurrentMockSocket._trigger('fork_event', forkData);
            await jest.runAllTicks();
    
            expect(onceListener).toHaveBeenCalledTimes(1);
            expect(onceListener).toHaveBeenCalledWith(forkData);
        });
    
        it('off should remove a previously registered listener', async () => {
            const listenerToRemove = jest.fn();
            client.on(StreamClientEvents.FORK, listenerToRemove);
            client.off(StreamClientEvents.FORK, listenerToRemove);
    
            const forkData: ForkData = { chain_id: 'testchain', starting_block: 1, ending_block: 0, new_id: 'new_block_id_c'};
            globalCurrentMockSocket._trigger('fork_event', forkData);
            await jest.runAllTicks();
    
            expect(listenerToRemove).not.toHaveBeenCalled();
        });
    
        it('should correctly parse action with metaKey processing when authorization is an object', async () => {
            const dataHandler = jest.fn().mockResolvedValue(undefined);
            client.setAsyncDataHandler(dataHandler);
    
            // Assuming ActionContent expects act.authorization to be a single object
            const actionWithMeta = { // Type as 'any' for test data flexibility if not matching ActionContent exactly before processing
                '@timestamp': new Date('2023-01-01T12:01:00.000Z').toISOString(),
                act: {
                    account: 'test.token',
                    name: 'transfer',
                    authorization: {actor: 'usera', permission: 'active'}, // << KEY CHANGE: Now a single object
                    data: { from_original: 'original_value' }
                },
                block_num: 200,
                global_sequence: 12347,
                // Assuming account_ram_deltas and notified are single objects/strings as per your interface
                account_ram_deltas: {delta:0, account:'usera'},
                action_ordinal: 1,
                creator_action_ordinal: 0,
                cpu_usage_us: 10,
                net_usage_words: 2,
                code_sequence:1,
                abi_sequence:1,
                trx_id: 'testtrxid003',
                producer: 'eosproducer',
                notified: 'test.token',
                '@transfer': { // The special metaKey
                    from: 'userfrom',
                    to: 'userto',
                    quantity: '1.0000 EOS',
                    memo: 'meta memo'
                }
            } as any; // Using 'as any' because @transfer is not part of ActionContent strictly
    
            const serverMessage = {
                type: 'action_trace',
                mode: 'live',
                message: JSON.stringify(actionWithMeta)
            };
    
            globalCurrentMockSocket._trigger('message', serverMessage);
            await jest.runAllTicks();
    
            expect(dataHandler).toHaveBeenCalledTimes(1);
            const expectedProcessedData = {
                from_original: 'original_value',
                from: 'userfrom',
                to: 'userto',
                quantity: '1.0000 EOS',
                memo: 'meta memo'
            };
            expect(dataHandler).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.objectContaining({
                    act: expect.objectContaining({
                        name: 'transfer',
                        account: 'test.token',
                        data: expectedProcessedData,
                        authorization: {actor: 'usera', permission: 'active'} // Verify processed auth
                    }),
                    // Verify other fields if necessary
                    block_num: 200
                })
            }));
        });
    });

    describe('LIB Activity Timeout', () => {
        it('should attempt a reconnect cycle if no lib_update is received (even if tryForever is false)', async () => {
            const endpoints = ['ws://ep1.com', 'ws://ep2.com'];
            // Create client specifically for this test
            client = new HyperionStreamClient({
                ...defaultTestOptions,
                endpoints,
                libActivityTimeoutMs: 1000,
                tryForever: false,
                reconnectDelay: 50,
            });
    
            const mockSocketInitial = createLocalMockSocket('LibTimeout_Initial_Connect_For_Test');
            const mockSocketCycleAttempt = createLocalMockSocket('LibTimeout_Cycle_Attempt_For_Test');
    
            // Clear any previous global io mocks and set for this test
            mockedIo.mockClear().mockReset(); // Full reset of mockedIo
            mockedIo
                .mockReturnValueOnce(mockSocketInitial as any)
                .mockReturnValueOnce(mockSocketCycleAttempt as any);
    
            // 1. Connect successfully
            const connectPromise = client.connect();
            await jest.runAllTicks(); // Allow first io() call
            mockSocketInitial._simulateSuccessfulConnect();
            await jest.runAllTicks();
            await connectPromise;
            expect(client.online).toBe(true);
            console.log('TEST_LIB_TIMEOUT: After initial connect, mockedIo calls:', mockedIo.mock.calls.length);
            const initialIoCallCount = mockedIo.mock.calls.length; // Should be 1
    
            const timeoutListener = jest.fn();
            client.on(StreamClientEvents.LIBACTIVITY_TIMEOUT, timeoutListener);
    
            // 2. Let libActivityTimeoutMs pass
            jest.advanceTimersByTime(1000);
            await jest.runAllTicks(); // Allow timeout cb -> socket.disconnect() -> onSocketDisconnect -> new _attemptNextConnection
    
            expect(timeoutListener).toHaveBeenCalledTimes(1);
            expect(mockSocketInitial.disconnect).toHaveBeenCalled(); // Original socket was told to disconnect
            expect(client.online).toBe(false);
    
            // 3. Assert that a reconnect attempt was made
            console.log('TEST_LIB_TIMEOUT: Before final expect, mockedIo calls:', mockedIo.mock.calls.length);
            expect(mockedIo).toHaveBeenCalledTimes(initialIoCallCount + 1); // Expects 1 + 1 = 2 calls total
    
            // @ts-ignore Determine which endpoint it should try for the reconnect cycle
            const expectedReconnectEndpoint = endpoints[client.currentEndpointIndex];
            // @ts-ignore
            expect(client.activeEndpointURL).toBe(expectedReconnectEndpoint);
    
            // 4. (Optional) Simulate success of this reconnect attempt
            mockSocketCycleAttempt._simulateSuccessfulConnect();
            await jest.runAllTicks();
            expect(client.online).toBe(true);
            // @ts-ignore
            expect(client.activeEndpointURL).toBe(expectedReconnectEndpoint);
        });
    
        it('should reset lib activity timer on lib_update', async () => {
            // Create client specifically for this test
            client = new HyperionStreamClient({ ...defaultTestOptions, libActivityTimeoutMs: 1000 });
            // This test uses the global mock socket for simplicity as it's a single connection
            resetMockSocket(); // Ensure global mock is clean
            const libTestSocket = getMockSocket();
            mockedIo.mockClear().mockReset().mockReturnValue(libTestSocket as any);
    
    
            const connectPromise = client.connect();
            await jest.runAllTicks();
            libTestSocket._simulateSuccessfulConnect();
            await jest.runAllTicks();
            await connectPromise;
    
            const disconnectSpy = jest.spyOn(libTestSocket, 'disconnect');
    
            jest.advanceTimersByTime(500);
            libTestSocket._trigger('lib_update', { chain_id: 'test', block_num: 10, block_id: 'def' } as LIBData);
            await jest.runAllTicks();
    
            jest.advanceTimersByTime(500);
            expect(disconnectSpy).not.toHaveBeenCalled();
    
            jest.advanceTimersByTime(500);
            await jest.runAllTicks();
            expect(disconnectSpy).toHaveBeenCalled();
        });
    });
});