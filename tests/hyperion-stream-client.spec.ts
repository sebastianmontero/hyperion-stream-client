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
import { tryEach } from 'async';

// Type of your mock socket instance, useful for `mockSocket` variable
type MockSocketType = ReturnType<typeof getMockSocket>;

// Typecast the imported mock fetch
const mockedFetch = fetch as jest.MockedFunction<typeof fetch>;
const mockedIo = io as jest.MockedFunction<typeof io>;

interface LocalMockSocket {
    _name: string;
    connected: boolean;
    _handlers: Record<string, EventHandler[] | undefined>; // Allow undefined for non-existent event arrays

    on: jest.Mock<LocalMockSocket, [string, EventHandler]>;
    off: jest.Mock<LocalMockSocket, [string, EventHandler]>;

    // Corrected 'emit' signature:
    // The 'ack' callback is the last optional argument.
    // The '...args: any[]' will capture all arguments between 'event' and 'ack'.
    emit: jest.Mock<void, [event: string, ...args: any[]]>; // The ack is implicitly the last if used
                                                           // Or, more explicitly, but Jest's tuple typing might need care:
                                                           // emit: jest.Mock<void, [event: string, ...dataArgs: any[], ack?: (...ackArgs: any[]) => void]>;
                                                           // Let's try the simpler one first, then refine if needed.

    disconnect: jest.Mock<void, []>;
    removeAllListeners: jest.Mock<void, []>;
    _trigger: jest.Mock<void, [string, ...any[]]>; // _trigger can also take multiple args
    _simulateSuccessfulConnect: jest.Mock<void, []>;
    _simulateConnectError: jest.Mock<void, [Error]>;
}


describe('HyperionStreamClient', () => {
    let client: HyperionStreamClient; // Type is now non-null within describe blocks that init it
    let currentMockSocket: MockSocketType; // Holds the global mock socket instance

    const defaultTestOptions: HyperionClientOptions = {
        endpoints: 'ws://default-test-ep.com',
        async: false,
        debug: false,
        libActivityTimeoutMs: 0,
        reconnectDelay: 0,
        tryForever: false,
    };

    // General beforeEach for things common to ALL tests
    beforeEach(() => {
        jest.useFakeTimers();
        resetMockSocket(); // Resets the state of the global mockSocketInstance
        currentMockSocket = getMockSocket(); // Get the global instance for general use
        mockedFetch.mockReset();
        mockedIo.mockClear(); // Clear call stats and mockImplementation details for io
    });

    afterEach(async () => {
        // client might have been created in a test or a describe-level beforeEach
        if (client) {
            client.disconnect();
        }
        jest.clearAllTimers();
        jest.useRealTimers();
    });

    // describe('Constructor and Options', () => {
    //     it('should throw an error if no endpoints are provided', () => {
    //         expect(() => new HyperionStreamClient({ ...defaultTestOptions, endpoints: [] }))
    //             .toThrow('Endpoints array cannot be empty.');
    //         // @ts-ignore testing invalid options
    //         expect(() => new HyperionStreamClient({ async: false } as HyperionClientOptions)) // Provide a minimal valid-ish structure
    //             .toThrow('Endpoints option is required.');
    //     });

    //     it('should correctly initialize with a single string endpoint and trim slash', () => {
    //         const localClient = new HyperionStreamClient({ ...defaultTestOptions, endpoints: 'ws://test.com/' });
    //         // @ts-ignore
    //         expect(localClient.internalEndpoints).toEqual(['ws://test.com']);
    //     });

    //     it('should correctly initialize with an array of endpoints and trim slashes', () => {
    //         const localClient = new HyperionStreamClient({ ...defaultTestOptions, endpoints: ['ws://test1.com/', 'ws://test2.com'] });
    //         // @ts-ignore
    //         expect(localClient.internalEndpoints).toEqual(['ws://test1.com', 'ws://test2.com']);
    //     });

    //     it('should set debug option and log messages', () => {
    //         const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    //         const localClient = new HyperionStreamClient({ ...defaultTestOptions, debug: true });
    //         // @ts-ignore
    //         localClient.debugLog('test debug');
    //         expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[hyperion:debug'), 'test debug');
    //         consoleSpy.mockRestore();
    //     });
    // });

    // describe('Connection Handling (Single Endpoint)', () => {
    //     beforeEach(() => {
    //         // Client is instantiated here, so it's non-null for tests in this block
    //         client = new HyperionStreamClient(defaultTestOptions);
    //         // All calls to io() by this client instance will return the global currentMockSocket
    //         mockedIo.mockReturnValue(currentMockSocket as any);
    //     });

    //     it('should connect to the endpoint successfully', async () => {
    //         const connectPromise = client.connect();
    //         currentMockSocket._simulateSuccessfulConnect();
    //         await jest.runAllTicks();
    //         await expect(connectPromise).resolves.toBeUndefined();
    //         expect(client.online).toBe(true);
    //         expect(currentMockSocket.on).toHaveBeenCalledWith('connect', expect.any(Function));
    //     });

    //     it('should emit CONNECT event on successful connection', async () => {
    //         const connectListener = jest.fn();
    //         client.on(StreamClientEvents.CONNECT, connectListener);
    //         const connectPromise = client.connect();
    //         currentMockSocket._simulateSuccessfulConnect();
    //         await jest.runAllTicks();
    //         await connectPromise;
    //         expect(connectListener).toHaveBeenCalledTimes(1);
    //     });

    //     it('ERR should fail to connect if socket emits connect_error', async () => {
    //         // Override client for this specific test condition
    //         client = new HyperionStreamClient({ ...defaultTestOptions, tryForever: false });
    //         mockedIo.mockReturnValue(currentMockSocket as any); // Ensure this new client also uses the mock

    //         const connectPromise = client.connect();
    //         currentMockSocket._simulateConnectError();
    //         await jest.runAllTicks();
    //         await expect(connectPromise).rejects.toThrow('All configured endpoints failed to connect.');
    //         expect(client.online).toBe(false);
    //     });

    //     it('disconnect() should make online false and emit DISCONNECT for a connected client', async () => {
    //         const connectPromise = client.connect();
    //         currentMockSocket._simulateSuccessfulConnect();
    //         await jest.runAllTicks();
    //         await connectPromise;

    //         const disconnectListener = jest.fn();
    //         client.on(StreamClientEvents.DISCONNECT, disconnectListener);
    //         client.disconnect();
    //         await jest.runAllTicks(); // Allow disconnect operations to settle

    //         expect(client.online).toBe(false);
    //         expect(currentMockSocket.disconnect).toHaveBeenCalled();
    //         expect(disconnectListener).toHaveBeenCalledWith({ reason: 'io client disconnect', endpoint: defaultTestOptions.endpoints as string });
    //     });

    //     it('ERR disconnect() should abort a pending connect() attempt and reject its promise', async () => {
    //         const connectPromise = client.connect(); // Don't await, don't simulate connect
    //         client.disconnect(); // Call disconnect while connect is "pending"
    //         await expect(connectPromise).rejects.toThrow('Connection attempt aborted by disconnect.');
    //         expect(client.online).toBe(false);
    //         console.log('client.online', client.online);
    //     });
    // });

    describe('Connection Handling with Failover', () => {
        // client is instantiated within each test for this block due to complex io mocking

        // it.only('should connect to the second endpoint if the first one fails (tryForever: false)', async () => {
        //     const endpoints = ['ws://ep1.com', 'ws://ep2.com'];
        //     client = new HyperionStreamClient({ ...defaultTestOptions, endpoints, tryForever: false });

        //     // Create distinct mock objects for each socket "instance" returned by io()
        //     const mockSocketEp1 = { ...getMockSocket(), _handlers: {}, on: jest.fn().mockReturnThis(), emit: jest.fn(), disconnect: jest.fn(), removeAllListeners: jest.fn(), _trigger: jest.fn(), connected: false, _simulateConnectError: jest.fn(function(this:any,e:Error){this.connected=false; this._trigger('connect_error',e); this._trigger('disconnect','transport error');}) };
        //     const mockSocketEp2 = { ...getMockSocket(), _handlers: {}, on: jest.fn().mockReturnThis(), emit: jest.fn(), disconnect: jest.fn(), removeAllListeners: jest.fn(), _trigger: jest.fn(), connected: false, _simulateSuccessfulConnect: jest.fn(function(this:any){this.connected=true; this._trigger('connect');}) };
        //     // Reset handlers on the mock objects themselves if _handlers is shared from getMockSocket()
        //     mockSocketEp1._handlers = {};
        //     mockSocketEp2._handlers = {};


        //     mockedIo
        //         .mockReturnValueOnce(mockSocketEp1 as any)
        //         .mockReturnValueOnce(mockSocketEp2 as any);

        //     const connectPromise = client.connect();

        //     // Phase 1: EP1 Fails
        //     await jest.runAllTicks(); // Allow client.connect() to call io() for ep1 & attach listeners
        //     expect(mockedIo).toHaveBeenCalledTimes(1);
        //     mockSocketEp1._simulateConnectError(new Error('ep1 failed'));

        //     // Allow client's internal failover logic
        //     await jest.runAllTicks();
        //     expect(mockedIo).toHaveBeenCalledTimes(2); // io() called for ep2
        //     // @ts-ignore
        //     expect(client.activeEndpointURL).toBe(endpoints[1]);

        //     // Phase 2: EP2 Succeeds
        //     mockSocketEp2._simulateSuccessfulConnect();
        //     await jest.runAllTicks(); // Allow onConnect for ep2 & promise resolution

        //     await expect(connectPromise).resolves.toBeUndefined();
        //     expect(client.online).toBe(true);
        //     // @ts-ignore
        //     expect(client.activeEndpointURL).toBe(endpoints[1]);
        // });

        it('should connect to the second endpoint if the first one fails (tryForever: false)', async () => {
            const endpoints = ['ws://ep1.com', 'ws://ep2.com'];
            client = new HyperionStreamClient({ ...defaultTestOptions, endpoints, tryForever: false });
        
            // Create truly distinct mock objects for each socket "instance"
            const createLocalMockSocket = (): LocalMockSocket => {
                const localHandlers: Record<string, EventHandler[]> = {};
                // The object literal will be checked against LocalMockSocket implicitly by the return type.
                // Or, you can explicitly type mockInst: LocalMockSocket = { ... }
                const mockInst = {
                    _name: '',
                    connected: false,
                    _handlers: localHandlers,
            
                    // Now 'this' can be typed as LocalMockSocket
                    on: jest.fn(function(this: LocalMockSocket, event: string, handler: EventHandler) {
                        let handlersForEvent = this._handlers[event]; // Use this._handlers
                        if (!handlersForEvent) {
                            handlersForEvent = [];
                            this._handlers[event] = handlersForEvent;
                        }
                        handlersForEvent.push(handler);
                        console.log(`TEST_MOCK_ON (${this._name}): Registered for '${event}', total now: ${handlersForEvent.length}`);
                        return this;
                    }),
                    off: jest.fn(function(this: LocalMockSocket, event: string, handler: EventHandler) {
                        const handlersForEvent = this._handlers[event]; // Use this._handlers
                        if (handlersForEvent) {
                            this._handlers[event] = handlersForEvent.filter(h => h !== handler);
                        }
                        console.log(`TEST_MOCK_OFF (${this._name}): Deregistered for '${event}', total now: ${this._handlers[event]?.length || 0}`);
                        return this;
                    }),
                    emit: jest.fn(function(this: LocalMockSocket, _event: string, _data: any, ack?: Function) {
                        console.log(`TEST_MOCK_EMIT (${this._name}): Event '${_event}' with ack: ${!!ack}`);
                        if (ack) ack({status: "OK"});
                    }),
                    disconnect: jest.fn(function(this: LocalMockSocket) {
                        console.log(`TEST_MOCK_DISCONNECT (${this._name}) called`);
                        this.connected = false;
                    }),
                    removeAllListeners: jest.fn(function(this: LocalMockSocket) {
                        console.log(`TEST_MOCK_REMOVEALLLISTENERS (${this._name}) called`);
                        // Reset this instance's handlers
                        Object.keys(this._handlers).forEach(key => delete this._handlers[key]);
                    }),
                    _trigger: jest.fn(function(this: LocalMockSocket, event: string, ...args: any[]) {
                        const handlersToCall = this._handlers[event]; // Use this._handlers
                        console.log(`TEST_MOCK_TRIGGER (${this._name}): Triggering '${event}'. Handlers: ${handlersToCall?.length || 0}`);
                        if (handlersToCall && handlersToCall.length > 0) {
                            console.log(`TEST_MOCK_TRIGGER (${this._name}): Executing ${handlersToCall.length} handlers for "${event}".`);
                            [...handlersToCall].forEach((h: Function, index: number) => {
                                console.log(`TEST_MOCK_TRIGGER (${this._name}): Calling handler ${index + 1} for "${event}". Handler: ${h.name || 'anonymous'}`);
                                try {
                                    h(...args);
                                } catch (e) {
                                    console.error(`TEST_MOCK_TRIGGER_HANDLER_ERROR (${this._name}) during event ${event}:`, e)
                                }
                            });
                        } else {
                            console.warn(`TEST_MOCK_TRIGGER_WARN (${this._name}): No handlers registered for event "${event}" to trigger.`);
                        }
                    }),
                    _simulateSuccessfulConnect: jest.fn(function(this: LocalMockSocket) {
                        console.log(`TEST_MOCK_SIM_CONNECT (${this._name})`);
                        this.connected = true; this._trigger('connect');
                    }),
                    _simulateConnectError: jest.fn(function(this: LocalMockSocket, err: Error) {
                        console.log(`TEST_MOCK_SIM_ERROR (${this._name})`);
                        this.connected = false; this._trigger('connect_error', err); this._trigger('disconnect', 'transport error');
                    })
                };
                // Ensure the returned object matches the LocalMockSocket interface.
                // TypeScript will check this implicitly due to the return type annotation on createLocalMockSocket.
                return mockInst as LocalMockSocket; // Cast if needed, but implicit should work.
                                                   // More accurately, let the object conform:
                                                   // const typedMockInst: LocalMockSocket = mockInst; return typedMockInst;
            };
        
            const mockSocketEp1 = createLocalMockSocket();
            (mockSocketEp1 as any)._name = 'EP1_Socket';
            const mockSocketEp2 = createLocalMockSocket();
            (mockSocketEp2 as any)._name = 'EP2_Socket';
        
            mockedIo
                .mockReturnValueOnce(mockSocketEp1 as any)
                .mockReturnValueOnce(mockSocketEp2 as any);
        
            console.log('TEST: Calling client.connect()');
            const connectPromise = client.connect();
        
            // Phase 1: EP1 Fails
            console.log('TEST: Allowing initial client.connect() activities (ep1 setup)');
            await jest.runAllTicks();
            expect(mockedIo).toHaveBeenCalledTimes(1);
            // @ts-ignore
            console.log(`TEST: Client state before EP1 fail: online=${client.online}, activeEP=${client.activeEndpointURL}, connectionInProgress=${client.connectionInProgress}`);
        
            console.log('TEST: Simulating EP1 failure on mockSocketEp1');
            mockSocketEp1._simulateConnectError(new Error('ep1 failed'));
        
            console.log('TEST: Running ticks after EP1 failure to allow client to switch to EP2');
            await jest.runAllTicks();
            // @ts-ignore
            console.log(`TEST: Client state after EP1 fail ticks: online=${client.online}, activeEP=${client.activeEndpointURL}, connectionInProgress=${client.connectionInProgress}`);
        
            expect(mockedIo).toHaveBeenCalledTimes(2); // Expect io() called for ep2
            // @ts-ignore
            expect(client.activeEndpointURL).toBe(endpoints[1]);
        
            // Phase 2: EP2 Succeeds
            console.log('TEST: Simulating EP2 success on mockSocketEp2');
            mockSocketEp2._simulateSuccessfulConnect();
        
            console.log('TEST: Running ticks after EP2 success');
            await jest.runAllTicks();
            // @ts-ignore
            console.log(`TEST: Client state after EP2 success ticks: online=${client.online}, activeEP=${client.activeEndpointURL}, connectionInProgress=${client.connectionInProgress}`);
        
            console.log('TEST: Awaiting connectPromise resolution');
            await expect(connectPromise).resolves.toBeUndefined();
        
            console.log('TEST: connectPromise resolved.');
            expect(client.online).toBe(true);
            // @ts-ignore
            expect(client.activeEndpointURL).toBe(endpoints[1]);
        });

        // it('should emit ALL_ENDPOINTS_FAILED if all endpoints fail and not tryForever', async () => {
        //     const endpoints = ['ws://ep1.com', 'ws://ep2.com'];
        //     client = new HyperionStreamClient({ ...defaultTestOptions, endpoints, tryForever: false });
        //     const allFailedListener = jest.fn();
        //     client.on(StreamClientEvents.ALL_ENDPOINTS_FAILED, allFailedListener);

        //     const mockSocketEp1 = { ...getMockSocket(), _handlers: {}, on: jest.fn().mockReturnThis(), emit: jest.fn(), disconnect: jest.fn(), removeAllListeners: jest.fn(), _trigger: jest.fn(), connected: false, _simulateConnectError: jest.fn(function(this:any,e:Error){this.connected=false; this._trigger('connect_error',e);this._trigger('disconnect','transport error');}) };
        //     const mockSocketEp2 = { ...getMockSocket(), _handlers: {}, on: jest.fn().mockReturnThis(), emit: jest.fn(), disconnect: jest.fn(), removeAllListeners: jest.fn(), _trigger: jest.fn(), connected: false, _simulateConnectError: jest.fn(function(this:any,e:Error){this.connected=false; this._trigger('connect_error',e);this._trigger('disconnect','transport error');}) };
        //     mockSocketEp1._handlers = {}; // Ensure clean handlers
        //     mockSocketEp2._handlers = {};

        //     mockedIo
        //         .mockReturnValueOnce(mockSocketEp1 as any)
        //         .mockReturnValueOnce(mockSocketEp2 as any);

        //     const connectPromise = client.connect();

        //     await jest.runAllTicks(); // For ep1 setup
        //     mockSocketEp1._simulateConnectError(new Error('ep1 failed'));
        //     await jest.runAllTicks(); // For ep1 failure processing and ep2 setup

        //     mockSocketEp2._simulateConnectError(new Error('ep2 failed'));
        //     await jest.runAllTicks(); // For ep2 failure processing

        //     await expect(connectPromise).rejects.toThrow('All configured endpoints failed to connect.');
        //     expect(allFailedListener).toHaveBeenCalledWith({ endpoints });
        //     expect(client.online).toBe(false);
        // });

        // it('should attempt to reconnect on disconnect if tryForever is true', async () => {
        //     client = new HyperionStreamClient({ ...defaultTestOptions, endpoints: ['ws://ep1.com'], tryForever: true, reconnectDelay: 100 });

        //     const mockSocket1 = { ...getMockSocket(), _handlers: {}, on: jest.fn().mockReturnThis(), emit: jest.fn(), disconnect: jest.fn(), removeAllListeners: jest.fn(), _trigger: jest.fn(), connected: false, _simulateSuccessfulConnect: jest.fn(function(this:any){this.connected=true; this._trigger('connect');}) };
        //     const mockSocket2 = { ...getMockSocket(), _handlers: {}, on: jest.fn().mockReturnThis(), emit: jest.fn(), disconnect: jest.fn(), removeAllListeners: jest.fn(), _trigger: jest.fn(), connected: false, _simulateSuccessfulConnect: jest.fn(function(this:any){this.connected=true; this._trigger('connect');}) };
        //     mockSocket1._handlers = {}; // Ensure clean handlers
        //     mockSocket2._handlers = {};

        //     mockedIo
        //         .mockReturnValueOnce(mockSocket1 as any) // For initial connect
        //         .mockReturnValueOnce(mockSocket2 as any); // For reconnect attempt

        //     const initialConnectPromise = client.connect();
        //     await jest.runAllTicks(); // io for ep1
        //     mockSocket1._simulateSuccessfulConnect();
        //     await jest.runAllTicks(); // Process connect
        //     await initialConnectPromise;
        //     expect(client.online).toBe(true);

        //     mockSocket1._trigger('disconnect', 'transport error'); // client uses mockSocket1
        //     await jest.runAllTicks(); // Process disconnect event
        //     expect(client.online).toBe(false);

        //     jest.advanceTimersByTime(100); // For reconnectDelay
        //     await jest.runAllTicks(); // Process _scheduleReconnect -> _attemptNextConnection -> io for ep2
        //     expect(mockedIo).toHaveBeenCalledTimes(2);

        //     mockSocket2._simulateSuccessfulConnect(); // client now uses mockSocket2
        //     await jest.runAllTicks(); // Process connect
        //     expect(client.online).toBe(true);
        // });
    });


    // describe('Request Handling', () => {
    //     const actionRequest: StreamActionsRequest = { contract: 'eosio.token', action: 'transfer', account: 'testacc', filters: [], start_from:0, read_until:0 };

    //     beforeEach(async () => {
    //         client = new HyperionStreamClient(defaultTestOptions);
    //         // Ensure this client uses the global currentMockSocket for its single connection
    //         mockedIo.mockReturnValue(currentMockSocket as any);
    //         const p = client.connect();
    //         currentMockSocket._simulateSuccessfulConnect();
    //         await jest.runAllTicks();
    //         await p;
    //     });

    //     it('should send streamActions request when connected', async () => {
    //         currentMockSocket.emit.mockImplementationOnce((_event, _data, ack) => ack({ status: 'OK' }));
    //         await client.streamActions(actionRequest);
    //         expect(currentMockSocket.emit).toHaveBeenCalledWith('action_stream_request', expect.objectContaining(actionRequest), expect.any(Function));
    //         // @ts-ignore
    //         expect(client.savedRequests.length).toBe(1);
    //     });

    //     it('should throw and save request if streamActions called after explicit disconnect', async () => {
    //         client.disconnect();
    //         await jest.runAllTicks();
    //         expect(client.online).toBe(false);
    //         await expect(client.streamActions(actionRequest))
    //             .rejects.toThrow('Client is not connected! Request saved (if new). Please call connect.');
    //         // @ts-ignore
    //         expect(client.savedRequests.length).toBe(1);
    //     });

    //     it('should resend saved requests upon reconnection', async () => {
    //         currentMockSocket.emit.mockImplementationOnce((_e, _d, ack) => ack({ status: 'OK' }));
    //         await client.streamActions(actionRequest);
    //         // @ts-ignore
    //         expect(client.savedRequests.length).toBe(1);
    //         currentMockSocket.emit.mockClear();

    //         // @ts-ignore Enable auto-reconnect for this test
    //         client.options.tryForever = true;
    //         // @ts-ignore
    //         client.options.reconnectDelay = 50;

    //         currentMockSocket._trigger('disconnect', 'transport error');
    //         await jest.runAllTicks();
    //         expect(client.online).toBe(false);

    //         // Setup for the io() call during reconnect
    //         const mockSocketForReconnect = { ...getMockSocket(), _handlers: {}, on: jest.fn().mockReturnThis(), emit: jest.fn(), _simulateSuccessfulConnect: jest.fn(function(this:any){this.connected=true; this._trigger('connect');}) };
    //         mockSocketForReconnect._handlers = {}; // Ensure clean handlers
    //         mockedIo.mockReturnValueOnce(mockSocketForReconnect as any); // Next call to io() gets this

    //         jest.advanceTimersByTime(50);
    //         await jest.runAllTicks(); // For _scheduleReconnect -> _attemptNextConnection -> io()

    //         expect(mockedIo).toHaveBeenCalledTimes(2); // Initial connect + 1 reconnect attempt
    //         mockSocketForReconnect.emit.mockImplementationOnce((_e, _d, ack) => ack({ status: 'OK' }));
    //         mockSocketForReconnect._simulateSuccessfulConnect();
    //         await jest.runAllTicks(); // For onConnect + resendRequests

    //         expect(client.online).toBe(true);
    //         expect(mockSocketForReconnect.emit).toHaveBeenCalledWith('action_stream_request', expect.objectContaining(actionRequest), expect.any(Function));
    //     });

    //     it('should handle checkLastBlock with start_from: "LIB"', async () => {
    //         mockedFetch.mockResolvedValueOnce({
    //             ok: true, json: async () => ({ last_irreversible_block_num: 12345 }),
    //         } as Response);
    //         const libRequest = { ...actionRequest, start_from: 'LIB' };
    //         currentMockSocket.emit.mockImplementationOnce((_e, _d, ack) => ack({ status: 'OK' }));
    //         await client.streamActions(libRequest);
    //         await jest.runAllTicks();
    //         expect(mockedFetch).toHaveBeenCalledWith(`${defaultTestOptions.endpoints}/v1/chain/get_info`);
    //         expect(currentMockSocket.emit).toHaveBeenCalledWith('action_stream_request', expect.objectContaining({ start_from: 12345 }), expect.any(Function));
    //     });

    //     it('should adjust start_from if lower than lastReceivedBlock', async () => {
    //         // @ts-ignore
    //         client.lastReceivedBlock = 200;
    //         const lowStartRequest = { ...actionRequest, start_from: 100 };
    //         currentMockSocket.emit.mockImplementationOnce((_e, _d, ack) => ack({ status: 'OK' }));
    //         await client.streamActions(lowStartRequest);
    //         await jest.runAllTicks();
    //         expect(currentMockSocket.emit).toHaveBeenCalledWith('action_stream_request', expect.objectContaining({ start_from: 200 }), expect.any(Function));
    //     });

    //     it('should disconnect if read_until is met by LIB', async () => {
    //         const disconnectSpy = jest.spyOn(client, 'disconnect');
    //         const readUntilRequest = { ...actionRequest, read_until: 100 };
    //         currentMockSocket.emit.mockImplementationOnce((_e, _d, ack) => ack({ status: 'OK' }));
    //         await client.streamActions(readUntilRequest);
    //         await jest.runAllTicks();

    //         currentMockSocket._trigger('lib_update', { chain_id: 'test', block_num: 101, block_id: 'abc' } as LIBData);
    //         await jest.runAllTicks();

    //         expect(disconnectSpy).toHaveBeenCalled();
    //         disconnectSpy.mockRestore();
    //     });
    // });

    // describe('Data and Event Handling', () => {
    //     const mockActionPayload: any = {
    //         '@timestamp': new Date().toISOString(),
    //         act: { name: 'testaction', account: 'testcontract', data: { memo: 'hello' } },
    //         block_num: 100, global_sequence: 1, account_ram_deltas: {}, action_ordinal: 1,
    //         creator_action_ordinal: 0, cpu_usage_us: 0, net_usage_words: 0,
    //         code_sequence:1, abi_sequence:1, trx_id: 'testtrx', producer: 'testprod', notified: 'testacc'
    //     };

    //     beforeEach(async () => {
    //         client = new HyperionStreamClient({ ...defaultTestOptions, async: true });
    //         mockedIo.mockReturnValue(currentMockSocket as any);
    //         const p = client.connect();
    //         currentMockSocket._simulateSuccessfulConnect();
    //         await jest.runAllTicks();
    //         await p;
    //     });

    //     it('should process action trace and call onDataAsync handler', async () => {
    //         const dataHandler = jest.fn().mockResolvedValue(undefined);
    //         client.setAsyncDataHandler(dataHandler);

    //         currentMockSocket._trigger('message', { type: 'action_trace', mode: 'live', content: mockActionPayload });
    //         await jest.runAllTicks();

    //         expect(dataHandler).toHaveBeenCalledTimes(1);
    //         expect(dataHandler).toHaveBeenCalledWith(expect.objectContaining({
    //             type: 'action', content: expect.objectContaining(mockActionPayload), irreversible: false
    //         }));
    //         // @ts-ignore
    //         expect(client.lastReceivedBlock).toBe(100);
    //     });

    //     it('should emit DATA event for action trace', (done) => {
    //         client.on(StreamClientEvents.DATA, (data) => {
    //             expect(data).toEqual(expect.objectContaining({
    //                 type: 'action', content: expect.objectContaining(mockActionPayload)
    //             }));
    //             done();
    //         });
    //         currentMockSocket._trigger('message', { type: 'action_trace', mode: 'history', content: mockActionPayload });
    //     });

    //     it('should handle LIB updates and process reversible buffer if libStream is true', async () => {
    //         client.disconnect(); // Disconnect previous client
    //         await jest.runAllTicks();

    //         client = new HyperionStreamClient({ ...defaultTestOptions, libStream: true, async: true });
    //         resetMockSocket(); // Reset global mock state for the new client
    //         currentMockSocket = getMockSocket(); // Get the fresh mock
    //         mockedIo.mockReturnValue(currentMockSocket as any); // New client uses this fresh mock

    //         const p = client.connect();
    //         currentMockSocket._simulateSuccessfulConnect();
    //         await jest.runAllTicks();
    //         await p;

    //         const libDataHandler = jest.fn().mockResolvedValue(undefined);
    //         client.setAsyncLibDataHandler(libDataHandler);
    //         const dataHandler = jest.fn().mockResolvedValue(undefined);
    //         client.setAsyncDataHandler(dataHandler);

    //         const reversibleAction = { ...mockActionPayload, block_num: 100 };
    //         currentMockSocket._trigger('message', { type: 'action_trace', mode: 'live', content: reversibleAction });
    //         await jest.runAllTicks(); // Process dataQueue

    //         expect(dataHandler).toHaveBeenCalledWith(expect.objectContaining({ content: reversibleAction, irreversible: false }));
    //         // @ts-ignore
    //         expect(client.reversibleBuffer.length).toBe(1);

    //         currentMockSocket._trigger('lib_update', { chain_id: 'test', block_num: 100, block_id: 'abc' } as LIBData);
    //         await jest.runAllTicks(); // Process libDataQueue
    //         await jest.runAllTicks(); // Extra tick

    //         expect(libDataHandler).toHaveBeenCalledWith(expect.objectContaining({ content: reversibleAction, irreversible: true }));
    //         // @ts-ignore
    //         expect(client.reversibleBuffer.length).toBe(0);
    //     });

    //     it('once listener should only be called once', async () => {
    //         const onceListener = jest.fn();
    //         client.once(StreamClientEvents.FORK, onceListener);
    //         const forkData: ForkData = { chain_id: 't', starting_block: 1, ending_block: 0, new_id: 'b'};

    //         currentMockSocket._trigger('fork_event', forkData);
    //         await jest.runAllTicks();
    //         currentMockSocket._trigger('fork_event', forkData);
    //         await jest.runAllTicks();

    //         expect(onceListener).toHaveBeenCalledTimes(1);
    //         expect(onceListener).toHaveBeenCalledWith(forkData);
    //     });

    //     it('off should remove listener', async () => {
    //         const listener = jest.fn();
    //         client.on(StreamClientEvents.FORK, listener);
    //         client.off(StreamClientEvents.FORK, listener);

    //         currentMockSocket._trigger('fork_event', { chain_id: 't', starting_block: 1, ending_block: 0, new_id: 'b'} as ForkData);
    //         await jest.runAllTicks();
    //         expect(listener).not.toHaveBeenCalled();
    //     });
    // });

    // describe('LIB Activity Timeout', () => {
    //     beforeEach(async () => {
    //         client = new HyperionStreamClient({
    //             ...defaultTestOptions,
    //             libActivityTimeoutMs: 1000,
    //         });
    //         mockedIo.mockReturnValue(currentMockSocket as any);
    //         const connectPromise = client.connect();
    //         currentMockSocket._simulateSuccessfulConnect();
    //         await jest.runAllTicks();
    //         await connectPromise;
    //     });

    //     it('should disconnect if no lib_update is received', async () => {
    //         const disconnectSpy = jest.spyOn(currentMockSocket, 'disconnect');
    //         const timeoutListener = jest.fn();
    //         client.on(StreamClientEvents.LIBACTIVITY_TIMEOUT, timeoutListener);

    //         jest.advanceTimersByTime(1000);
    //         await jest.runAllTicks();

    //         expect(timeoutListener).toHaveBeenCalledTimes(1);
    //         expect(disconnectSpy).toHaveBeenCalled();
    //     });

    //     it('should reset lib activity timer on lib_update', async () => {
    //         const disconnectSpy = jest.spyOn(currentMockSocket, 'disconnect');

    //         jest.advanceTimersByTime(500);
    //         currentMockSocket._trigger('lib_update', { chain_id: 'test', block_num: 10, block_id: 'def' } as LIBData);
    //         await jest.runAllTicks();

    //         jest.advanceTimersByTime(500);
    //         expect(disconnectSpy).not.toHaveBeenCalled();

    //         jest.advanceTimersByTime(500);
    //         await jest.runAllTicks();
    //         expect(disconnectSpy).toHaveBeenCalled();
    //     });
    // });
});