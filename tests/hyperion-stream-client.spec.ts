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

import { getMockSocket, resetMockSocket } from '../__mocks__/socket.io-client';
import { tryEach } from 'async';

// Typecast the imported mock fetch
const mockedFetch = fetch as jest.MockedFunction<typeof fetch>;
const mockedIo = io as jest.MockedFunction<typeof io>;


describe('HyperionStreamClient', () => {
    let client: HyperionStreamClient; // Keep client declaration here
    let mockSocket: ReturnType<typeof getMockSocket>;

    const defaultBasicOptions: HyperionClientOptions = {
        endpoints: 'ws://mock-endpoint.com',
        async: false,
        debug: false,
        libActivityTimeoutMs: 0,
        reconnectDelay: 0, // Make reconnect delay 0 for faster tests unless testing delay
    };

    beforeEach(() => {
        jest.useFakeTimers();
        resetMockSocket();          // resetMockSocket is SocketIOMockModule.resetMockSocket
        mockSocket = getMockSocket(); // mockSocket is an instance of your MockSocketInstanceType
        // console.log('TEST: beforeEach, mockSocket.connected:', mockSocket);
        mockedFetch.mockReset();
        // `mockedIo` (which is SocketIOMockModule.io) is already a jest.fn()
        // that returns the `mockSocketInstance` as per your mock's definition.
    });

    afterEach(async () => {
        if (client) {
            // @ts-ignore Access private members for logging before disconnect
            // console.log('TEST: In afterEach, _initialConnectPromiseCallbacks is defined:', !!client._initialConnectPromiseCallbacks);
            // @ts-ignore
            // console.log('TEST: In afterEach, _initialConnectionSucceededThisAttempt:', client._initialConnectionSucceededThisAttempt);
            client.disconnect();
        }
        jest.clearAllTimers();
        jest.useRealTimers();
    });

    // describe('Constructor and Options', () => {
    //     it('should throw an error if no endpoints are provided', () => {
    //         expect(() => new HyperionStreamClient({ ...defaultBasicOptions, endpoints: [] }))
    //             .toThrow('Endpoints array cannot be empty.');
    //         // @ts-ignore testing invalid options
    //         expect(() => new HyperionStreamClient({} as HyperionClientOptions))
    //             .toThrow('Endpoints option is required.');
    //     });

    //     it('should correctly initialize with a single string endpoint', () => {
    //         client = new HyperionStreamClient({ ...defaultBasicOptions, endpoints: 'ws://test.com/' });
    //         // @ts-ignore access private member for test
    //         expect(client.internalEndpoints).toEqual(['ws://test.com']);
    //     });

    //     it('should correctly initialize with an array of endpoints and trim slashes', () => {
    //         client = new HyperionStreamClient({ ...defaultBasicOptions, endpoints: ['ws://test1.com/', 'ws://test2.com'] });
    //         // @ts-ignore
    //         expect(client.internalEndpoints).toEqual(['ws://test1.com', 'ws://test2.com']);
    //     });

    //     it('should set debug option and log messages', () => {
    //         const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    //         client = new HyperionStreamClient({ ...defaultBasicOptions, debug: true });
    //         // @ts-ignore
    //         client.debugLog('test debug');
    //         expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[hyperion:debug'), 'test debug');
    //         consoleSpy.mockRestore();
    //     });
    // });

    describe('Connection Handling', () => {
        // it('should connect to the first endpoint successfully', async () => {
        //   client = new HyperionStreamClient(defaultBasicOptions);
        //   const connectPromise = client.connect();
        //   mockSocket._simulateSuccessfulConnect(); // Simulate success from the mock socket
        //   await expect(connectPromise).resolves.toBeUndefined();
        //   expect(client.online).toBe(true);
        //   expect(mockSocket.on).toHaveBeenCalledWith('connect', expect.any(Function));
        // });

        // it('should emit CONNECT event on successful connection', async () => {
        //     client = new HyperionStreamClient(defaultBasicOptions);
        //     const connectListener = jest.fn();
        //     client.on(StreamClientEvents.CONNECT, connectListener);
        //     const connectPromise = client.connect();
        //     mockSocket._simulateSuccessfulConnect();
        //     await connectPromise; // Wait for connect to resolve
        //     expect(connectListener).toHaveBeenCalledTimes(1);
        // });

        // it('should fail to connect if socket emits connect_error and not tryForever', async () => {
        //     client = new HyperionStreamClient({ ...defaultBasicOptions, tryForever: false });
        //     const connectPromise = client.connect();
        
        //     mockSocket._simulateConnectError(); // Simulate connection error
        
        //     // Optional: await jest.runAllTicks(); // Keep if it seemed to help other tests, may not be needed here.
        //     await jest.runAllTicks();
        //     try {
        //         console.log('TEST: Awaiting connectPromise in try block...');
        //         await connectPromise;
        //         // If it resolves, the test should fail because we expect a rejection.
        //         throw new Error('connectPromise should have rejected but it resolved.');
        //     } catch (e:any) {
        //         console.log('TEST: connectPromise rejected with error:', e.message);
        //         // Check the error message
        //         expect(e.message).toBe('All configured endpoints failed to connect.');
        //     }
        
        //     // Ensure the client state is as expected after the failed connection attempt
        //     expect(client.online).toBe(false);
        //     // @ts-ignore check internal state
        //     expect(client.connectionInProgress).toBe(false); // Should be false after failure and not tryForever
        //     console.log('TEST: After try/catch block');
        // });
        // it('should attempt to reconnect on disconnect if tryForever is true', async () => {
        //     client = new HyperionStreamClient({ ...defaultBasicOptions, tryForever: true, reconnectDelay: 100 });
        //     const initialConnectPromise = client.connect();
        //     mockSocket._simulateSuccessfulConnect();
        //     await initialConnectPromise;
        //     expect(client.online).toBe(true);
        //     const initialMockIoCalls = mockedIo.mock.calls.length;
        
        //     // Simulate server/network initiated disconnect
        //     // mockSocket.connected = false; // This line mostly affects the mock's state, client.online is set by the event handler
        //     console.log('TEST: Triggering disconnect event');
        //     mockSocket._trigger('disconnect', 'transport error');
        //     console.log('TEST: Disconnect event triggered');
        
        //     expect(client.online).toBe(false); // Check after ticks have run
        
        //     // Advance timer for reconnectDelay
        //     console.log('TEST: Advancing timers for reconnectDelay');
        //     jest.advanceTimersByTime(100);
        //     expect(mockedIo).toHaveBeenCalledTimes(initialMockIoCalls + 1);
        //     console.log('TEST: Reconnect attempt should have been made');
        
        //     // Optional: Simulate successful reconnect if needed for further assertions
        //     const newMockSocket = getMockSocket();
        //     newMockSocket._simulateSuccessfulConnect();
        //     // await jest.runAllTicks();
        //     expect(client.online).toBe(true);
        // });


        it('should try next endpoint on failure if multiple endpoints provided and not tryForever', async () => {
            const endpoints = ['ws://ep1.com', 'ws://ep2.com'];
            client = new HyperionStreamClient({ ...defaultBasicOptions, endpoints, tryForever: false, reconnectDelay: 0 }); // reconnectDelay: 0 for clarity
        
            // Create truly distinct mock objects for each socket if they aren't already
            // This ensures no state leakage between mockSocket1 and mockSocket2 if getMockSocket() was returning a shared instance
            // that wasn't fully reset for its new role.
            let mockSocket1Handlers: Record<string, any[]> = {};
            const mockSocket1: any = {
                on: jest.fn((event, handler) => { mockSocket1Handlers[event] = [...(mockSocket1Handlers[event] || []), handler]; return mockSocket1; }),
                emit: jest.fn(), disconnect: jest.fn(), removeAllListeners: jest.fn(() => mockSocket1Handlers = {}),
                _trigger: jest.fn((event, ...args) => { (mockSocket1Handlers[event] || []).forEach(h => h(...args)); }),
                connected: false, _handlers: mockSocket1Handlers, // ensure _handlers is part of the object for your mock's internal logic if used
                _simulateSuccessfulConnect: jest.fn(function() { this.connected = true; this._trigger('connect'); }),
                _simulateConnectError: jest.fn(function(err) { this.connected = false; this._trigger('connect_error', err); this._trigger('disconnect', 'transport error'); }),
            };
        
            let mockSocket2Handlers: Record<string, any[]> = {};
            const mockSocket2: any = {
                on: jest.fn((event, handler) => { mockSocket2Handlers[event] = [...(mockSocket2Handlers[event] || []), handler]; return mockSocket2; }),
                emit: jest.fn(), disconnect: jest.fn(), removeAllListeners: jest.fn(() => mockSocket2Handlers = {}),
                _trigger: jest.fn((event, ...args) => { (mockSocket2Handlers[event] || []).forEach(h => h(...args)); }),
                connected: false, _handlers: mockSocket2Handlers,
                _simulateSuccessfulConnect: jest.fn(function() { this.connected = true; this._trigger('connect'); }),
                _simulateConnectError: jest.fn(function(err) { this.connected = false; this._trigger('connect_error', err); this._trigger('disconnect', 'transport error'); }),
            };
        
        
            mockedIo
            .mockReturnValueOnce(mockSocket1 as any)
            .mockReturnValueOnce(mockSocket2 as any);
    
            const connectPromise = client.connect(); // This is the promise we care about
        
            // Fail EP1
            console.log('TEST: Simulating EP1 failure');
            // Client will synchronously try to connect to ep1, attach listeners.
            // Then we trigger its failure.
            mockSocket1._simulateConnectError(new Error('ep1 failed'));
            // After this, client should synchronously attempt ep2 and attach listeners to mockSocket2.
        
            // Allow any microtasks from ep1 failure processing to run
            await jest.runAllTicks();
            console.log('TEST: After EP1 failure and ticks. Client trying EP2.');
        
            // Succeed EP2
            console.log('TEST: Simulating EP2 success');
            mockSocket2._simulateSuccessfulConnect();
        
            // Allow any microtasks from ep2 success processing to run, which should resolve connectPromise
            await jest.runAllTicks();
            console.log('TEST: After EP2 success and ticks.');
        
            // Check the state BEFORE awaiting the promise, for debugging
            // @ts-ignore
            console.log('TEST: Before await connectPromise - _initialCbs:', !!client._initialConnectPromiseCallbacks, '_initialSuccess:', client._initialConnectionSucceededThisAttempt, 'online:', client.online);
        
            await expect(connectPromise).resolves.toBeUndefined(); // This specific promise should resolve
        
            // @ts-ignore
            console.log('TEST: After await connectPromise - _initialCbs:', !!client._initialConnectPromiseCallbacks, '_initialSuccess:', client._initialConnectionSucceededThisAttempt, 'online:', client.online);
        
            expect(client.online).toBe(true);
            // @ts-ignore
            expect(client.activeEndpointURL).toBe('ws://ep2.com');
        });

        it.only('TEMP: should connect to EP2 if EP1 fails', async () => {
            const endpoints = ['ws://ep1.com', 'ws://ep2.com'];
            client = new HyperionStreamClient({ ...defaultBasicOptions, endpoints, tryForever: false, reconnectDelay: 0 });
        
            const mockSocket1Handlers: Record<string, any[]> = {};
            const mockSocket1Object = {
                _handlers: mockSocket1Handlers,
                on: jest.fn(function(this: any, event, handler) { if (!this._handlers[event]) this._handlers[event] = []; this._handlers[event].push(handler); return this; }),
                off: jest.fn(function(this: any, event, handler) { // <<< ADDED 'off' METHOD
                    if (this._handlers[event]) {
                        this._handlers[event] = this._handlers[event].filter((h: Function) => h !== handler);
                    }
                    return this;
                }),
                emit: jest.fn(),
                disconnect: jest.fn(),
                removeAllListeners: jest.fn(function(this:any) { this._handlers = {}; }),
                _trigger: jest.fn(function(this: any, event, ...args) { (this._handlers[event] || []).forEach((h: Function) => h(...args)); }),
                connected: false,
                _simulateSuccessfulConnect: jest.fn(function(this: any) { this.connected = true; this._trigger('connect'); }),
                _simulateConnectError: jest.fn(function(this: any, err: Error) { this.connected = false; this._trigger('connect_error', err); this._trigger('disconnect', 'transport error'); })
            };
        
            const mockSocket2Handlers: Record<string, any[]> = {};
            const mockSocket2Object = {
                _handlers: mockSocket2Handlers,
                on: jest.fn(function(this: any, event, handler) { if (!this._handlers[event]) this._handlers[event] = []; this._handlers[event].push(handler); return this; }),
                off: jest.fn(function(this: any, event, handler) { // <<< ADDED 'off' METHOD
                    if (this._handlers[event]) {
                        this._handlers[event] = this._handlers[event].filter((h: Function) => h !== handler);
                    }
                    return this;
                }),
                emit: jest.fn(),
                disconnect: jest.fn(),
                removeAllListeners: jest.fn(function(this:any) { this._handlers = {}; }),
                _trigger: jest.fn(function(this: any, event, ...args) { (this._handlers[event] || []).forEach((h: Function) => h(...args)); }),
                connected: false,
                _simulateSuccessfulConnect: jest.fn(function(this: any) { this.connected = true; this._trigger('connect'); }),
                _simulateConnectError: jest.fn(function(this: any, err: Error) { this.connected = false; this._trigger('connect_error', err); this._trigger('disconnect', 'transport error'); })
            };
        
            mockedIo
                .mockReturnValueOnce(mockSocket1Object as any)
                .mockReturnValueOnce(mockSocket2Object as any);
        
            console.log('TEST: Calling client.connect()');
            const connectPromise = client.connect();
        
            // --- First Attempt (ep1 fails) ---
            console.log('TEST: Simulating EP1 failure');
            mockSocket1Object._simulateConnectError(new Error('ep1 failed'));
            
            await jest.runAllTicks(); // Allow client's internal async failover to proceed
            console.log('TEST: After EP1 failure and ticks. Client trying EP2.');
            // @ts-ignore
            // expect(client.activeEndpointURL).toBe('ws://ep2.com'); // This assertion can be added back
        
            // --- Second Attempt (ep2 succeeds) ---
            console.log('TEST: Simulating EP2 success');
            mockSocket2Object._simulateSuccessfulConnect();
            
            await jest.runAllTicks(); // Allow promise microtasks from ep2 success
            console.log('TEST: After EP2 success and ticks.');
        
            console.log('TEST: Awaiting connectPromise resolution');
            await expect(connectPromise).resolves.toBeUndefined();
        
            console.log('TEST: connectPromise resolved.');
            expect(client.online).toBe(true);
            // @ts-ignore
            expect(client.activeEndpointURL).toBe('ws://ep2.com');
            expect(mockedIo).toHaveBeenCalledTimes(2);
        });

        // it('should emit ALL_ENDPOINTS_FAILED if all endpoints fail and not tryForever', async () => {
        //     const endpoints = ['ws://ep1.com', 'ws://ep2.com'];
        //     client = new HyperionStreamClient({ ...defaultBasicOptions, endpoints, tryForever: false });
        //     const allFailedListener = jest.fn();
        //     client.on(StreamClientEvents.ALL_ENDPOINTS_FAILED, allFailedListener);

        //     const mockSocket1 = { ...getMockSocket(), _handlers: {}, on: jest.fn(), disconnect: jest.fn(), removeAllListeners: jest.fn(), _trigger: jest.fn() };
        //     const mockSocket2 = { ...getMockSocket(), _handlers: {}, on: jest.fn(), disconnect: jest.fn(), removeAllListeners: jest.fn(), _trigger: jest.fn() };


        //     mockedIo
        //         .mockReturnValueOnce(mockSocket1 as any)
        //         .mockReturnValueOnce(mockSocket2 as any);

        //     const connectPromise = client.connect();

        //     setTimeout(() => mockSocket1._trigger('connect_error', new Error('ep1 failed')), 0);
        //     setTimeout(() => mockSocket2._trigger('connect_error', new Error('ep2 failed')), 10);


        //     await expect(connectPromise).rejects.toThrow('All configured endpoints failed to connect.');
        //     expect(allFailedListener).toHaveBeenCalledWith({ endpoints });
        //     expect(client.online).toBe(false);
        // });

        // it('disconnect() should make online false and emit DISCONNECT for a connected client', async () => {
        //     client = new HyperionStreamClient(defaultBasicOptions);
        //     const connectPromise = client.connect();
        //     mockSocket._simulateSuccessfulConnect();
        //     await connectPromise; // Ensure connection completes

        //     const disconnectListener = jest.fn();
        //     client.on(StreamClientEvents.DISCONNECT, disconnectListener);

        //     client.disconnect(); // Call disconnect

        //     expect(client.online).toBe(false);
        //     expect(mockSocket.disconnect).toHaveBeenCalled();
        //     // The endpoint in the disconnect event data should be the one it was connected to
        //     expect(disconnectListener).toHaveBeenCalledWith({ reason: 'io client disconnect', endpoint: defaultBasicOptions.endpoints as string });
        // });

        // it('disconnect() should abort a pending connect() attempt and reject its promise', async () => {
        //     client = new HyperionStreamClient(defaultBasicOptions);
        //     const connectPromise = client.connect(); // Don't await, don't simulate connect

        //     client.disconnect(); // Call disconnect while connect is "pending"

        //     // The connectPromise should be rejected by the disconnect logic
        //     await expect(connectPromise).rejects.toThrow('Connection attempt aborted by disconnect.');
        //     expect(client.online).toBe(false);
        // });
    });

    // describe('Request Handling', () => {
    //     const actionRequest: StreamActionsRequest = { contract: 'eosio.token', action: 'transfer', account: 'testacc', filters: [], start_from:0, read_until:0 };

    //     beforeEach(async () => {
    //         // Each test in this block will start with a fresh, connected client
    //         client = new HyperionStreamClient(defaultBasicOptions);
    //         const p = client.connect();
    //         mockSocket._simulateSuccessfulConnect();
    //         await p; // Ensure client is connected
    //     });

    //     it('should send streamActions request when connected', async () => {
    //         // Mock the socket's ack for this specific emit
    //         mockSocket.emit.mockImplementationOnce((_event, _data, ack) => ack({ status: 'OK' }));
    //         await client.streamActions(actionRequest);
    //         expect(mockSocket.emit).toHaveBeenCalledWith('action_stream_request', expect.objectContaining(actionRequest), expect.any(Function));
    //         // @ts-ignore
    //         expect(client.savedRequests.length).toBe(1);
    //     });

    //     it('should throw and save request if streamActions called when disconnected (after initial connect)', async () => {
    //         client.disconnect(); // Disconnect the already connected client
    //         expect(client.online).toBe(false);

    //         // Attempt to stream actions
    //         await expect(client.streamActions(actionRequest))
    //             .rejects.toThrow('Client is not connected! Request saved (if new). Please call connect.');
    //         // @ts-ignore
    //         expect(client.savedRequests.length).toBe(1);
    //         // @ts-ignore
    //         expect(client.savedRequests[0].req).toEqual(actionRequest);
    //     });

    //     it('should resend saved requests upon reconnection', async () => {
    //         // 1. Make a request while client is connected (it will be "sent" and saved)
    //         mockSocket.emit.mockImplementationOnce((_event, _data, ack) => ack({ status: 'OK' }));
    //         await client.streamActions(actionRequest);
    //         // @ts-ignore
    //         expect(client.savedRequests.length).toBe(1); // Saved because it was successfully sent once

    //         // 2. Disconnect the client
    //         mockSocket.connected = false; // Simulate socket state change
    //         mockSocket._trigger('disconnect', 'transport error'); // Simulate a server/network disconnect
    //         expect(client.online).toBe(false);

    //         // 3. Reconnect the client (assuming tryForever or manual call)
    //         //    The mock for `io` needs to be set up if `client.connect()` creates a new socket.
    //         //    Our current mock `io` returns the same global `mockSocketInstance`.
    //         //    So, `getMockSocket()` will refer to that instance.
    //         const reconnectPromise = client.connect(); // This will use the same mockSocket if io is not called again.
    //                                                 // For a robust test, ensure io is called and returns a "new" mockSocket.
    //                                                 // Let's assume our mock `io` is called again for a new connection.
    //         const newMockSocketInstance = getMockSocket(); // Get the mock that will be used for reconnection
    //         newMockSocketInstance.emit.mockImplementationOnce((_event, _data, ack) => ack({ status: 'OK' })); // Mock for the resend
    //         newMockSocketInstance._simulateSuccessfulConnect(); // Simulate reconnection
    //         await reconnectPromise;

    //         expect(client.online).toBe(true);
    //         expect(newMockSocketInstance.emit).toHaveBeenCalledWith('action_stream_request', expect.objectContaining(actionRequest), expect.any(Function));
    //         // @ts-ignore Check that the request is still in savedRequests because it was successfully resent
    //         expect(client.savedRequests.find(r => r.req === actionRequest)).toBeDefined();
    //     });


    //     it('should handle checkLastBlock with start_from: "LIB"', async () => {
    //         mockedFetch.mockResolvedValueOnce({
    //             ok: true,
    //             json: async () => ({ last_irreversible_block_num: 12345 }),
    //         } as Response);

    //         const libRequest = { ...actionRequest, start_from: 'LIB' };
    //         mockSocket.emit.mockImplementationOnce((_event, _data, ack) => ack({ status: 'OK' }));
    //         await client.streamActions(libRequest);

    //         expect(mockedFetch).toHaveBeenCalledWith(`${defaultBasicOptions.endpoints}/v1/chain/get_info`);
    //         expect(mockSocket.emit).toHaveBeenCalledWith('action_stream_request', expect.objectContaining({ start_from: 12345 }), expect.any(Function));
    //     });

    //     it('should adjust start_from if lower than lastReceivedBlock', async () => {
    //         // @ts-ignore
    //         client.lastReceivedBlock = 200;
    //         const lowStartRequest = { ...actionRequest, start_from: 100 };
    //         mockSocket.emit.mockImplementationOnce((_event, _data, ack) => ack({ status: 'OK' }));
    //         await client.streamActions(lowStartRequest);
    //         expect(mockSocket.emit).toHaveBeenCalledWith('action_stream_request', expect.objectContaining({ start_from: 200 }), expect.any(Function));
    //     });

    //     it('should disconnect if read_until is met by LIB', async () => {
    //         const disconnectSpy = jest.spyOn(client, 'disconnect');
    //         const readUntilRequest = { ...actionRequest, read_until: 100 };
    //         mockSocket.emit.mockImplementationOnce((_event, _data, ack) => ack({ status: 'OK' }));
    //         await client.streamActions(readUntilRequest);

    //         mockSocket._trigger('lib_update', { chain_id: 'test', block_num: 101, block_id: 'abc' });

    //         expect(disconnectSpy).toHaveBeenCalled();
    //         disconnectSpy.mockRestore();
    //     });
    // });

    // describe('Data and Event Handling', () => {
    //     const mockActionPayload: any = { // Use a more specific type if ActionContent is defined
    //         '@timestamp': new Date().toISOString(),
    //         act: { name: 'testaction', account: 'testcontract', data: { memo: 'hello' } },
    //         block_num: 100,
    //         // Add other required fields from ActionContent if strict
    //         global_sequence: 1, account_ram_deltas: {}, action_ordinal: 1, creator_action_ordinal: 0,
    //         cpu_usage_us: 0, net_usage_words: 0, code_sequence:1, abi_sequence:1, trx_id: 'testtrx',
    //         producer: 'testprod', notified: 'testacc'
    //     };

    //     beforeEach(async () => {
    //         client = new HyperionStreamClient({ ...defaultBasicOptions, async: true });
    //         const p = client.connect();
    //         mockSocket._simulateSuccessfulConnect();
    //         await p;
    //     });

    //     it('should process action trace and call onDataAsync handler', async () => {
    //         const dataHandler = jest.fn().mockResolvedValue(undefined);
    //         client.setAsyncDataHandler(dataHandler);

    //         mockSocket._trigger('message', {
    //             type: 'action_trace',
    //             mode: 'live',
    //             content: mockActionPayload // Assuming content is the direct payload for processActionTrace
    //         });
    //         await new Promise(process.nextTick); // Allow async queue to process

    //         expect(dataHandler).toHaveBeenCalledTimes(1);
    //         expect(dataHandler).toHaveBeenCalledWith(expect.objectContaining({
    //             type: 'action',
    //             mode: 'live',
    //             content: expect.objectContaining(mockActionPayload),
    //             irreversible: false
    //         }));
    //         // @ts-ignore
    //         expect(client.lastReceivedBlock).toBe(100);
    //     });

    //     it('should emit DATA event for action trace', (done) => {
    //         client.on(StreamClientEvents.DATA, (data) => {
    //             expect(data).toEqual(expect.objectContaining({
    //                 type: 'action',
    //                 content: expect.objectContaining(mockActionPayload)
    //             }));
    //             done(); // Call done for async test
    //         });
    //         mockSocket._trigger('message', { type: 'action_trace', mode: 'history', content: mockActionPayload });
    //     });

    //     it('should handle LIB updates and process reversible buffer if libStream is true', async () => {
    //         // Re-initialize client with libStream: true for this specific test
    //         client.disconnect(); // Disconnect previous client
    //         client = new HyperionStreamClient({ ...defaultBasicOptions, libStream: true, async: true });
    //         const p = client.connect();
    //         // Ensure mockedIo returns the global mockSocket or a fresh one for this new client
    //         const currentMockSocket = getMockSocket(); // Get the mock socket associated with this client
    //         currentMockSocket._simulateSuccessfulConnect();
    //         await p;


    //         const libDataHandler = jest.fn().mockResolvedValue(undefined);
    //         client.setAsyncLibDataHandler(libDataHandler);
    //         const dataHandler = jest.fn().mockResolvedValue(undefined);
    //         client.setAsyncDataHandler(dataHandler);

    //         const reversibleAction = { ...mockActionPayload, block_num: 100 };
    //         currentMockSocket._trigger('message', { type: 'action_trace', mode: 'live', content: reversibleAction });
    //         await new Promise(process.nextTick); // Process dataQueue

    //         expect(dataHandler).toHaveBeenCalledWith(expect.objectContaining({ content: reversibleAction, irreversible: false }));
    //         // @ts-ignore
    //         expect(client.reversibleBuffer.length).toBe(1);

    //         currentMockSocket._trigger('lib_update', { chain_id: 'test', block_num: 100, block_id: 'abc' });
    //         await new Promise(process.nextTick); // Process libDataQueue (and dataQueue if any remaining)
    //         await new Promise(process.nextTick); // Extra tick just in case for nested queue processing

    //         expect(libDataHandler).toHaveBeenCalledWith(expect.objectContaining({ content: reversibleAction, irreversible: true }));
    //          // @ts-ignore
    //         expect(client.reversibleBuffer.length).toBe(0);
    //     });

    //     it('once listener should only be called once', () => {
    //         const onceListener = jest.fn();
    //         client.once(StreamClientEvents.FORK, onceListener);

    //         const forkData = { chain_id: 't', starting_block: 1, ending_block: 0, new_id: 'b'};
    //         mockSocket._trigger('fork_event', forkData);
    //         mockSocket._trigger('fork_event', forkData);

    //         expect(onceListener).toHaveBeenCalledTimes(1);
    //         expect(onceListener).toHaveBeenCalledWith(forkData);
    //     });

    //     it('off should remove listener', () => {
    //         const listener = jest.fn();
    //         client.on(StreamClientEvents.FORK, listener); // Use an event we can trigger
    //         client.off(StreamClientEvents.FORK, listener);

    //         mockSocket._trigger('fork_event', { chain_id: 't', starting_block: 1, ending_block: 0, new_id: 'b'});
    //         expect(listener).not.toHaveBeenCalled();
    //     });
    // });

    // describe('LIB Activity Timeout', () => {
    //     it('should disconnect if no lib_update is received within libActivityTimeoutMs', async () => {
    //         client = new HyperionStreamClient({
    //             ...defaultBasicOptions,
    //             libActivityTimeoutMs: 1000,
    //         });
    //         const connectPromise = client.connect();
    //         mockSocket._simulateSuccessfulConnect();
    //         await connectPromise;

    //         const disconnectSpy = jest.spyOn(mockSocket, 'disconnect'); // Spy on the mock socket's disconnect
    //         const timeoutListener = jest.fn();
    //         client.on(StreamClientEvents.LIBACTIVITY_TIMEOUT, timeoutListener);

    //         jest.advanceTimersByTime(1000);

    //         expect(timeoutListener).toHaveBeenCalledTimes(1);
    //         expect(disconnectSpy).toHaveBeenCalled();
    //         disconnectSpy.mockRestore();
    //     });

    //     it('should reset lib activity timer on lib_update', async () => {
    //         client = new HyperionStreamClient({
    //             ...defaultBasicOptions,
    //             libActivityTimeoutMs: 1000,
    //         });
    //         const connectPromise = client.connect();
    //         mockSocket._simulateSuccessfulConnect();
    //         await connectPromise;

    //         const disconnectSpy = jest.spyOn(mockSocket, 'disconnect');

    //         jest.advanceTimersByTime(500);
    //         mockSocket._trigger('lib_update', { chain_id: 'test', block_num: 10, block_id: 'def' });
    //         jest.advanceTimersByTime(500);

    //         expect(disconnectSpy).not.toHaveBeenCalled();

    //         jest.advanceTimersByTime(500);
    //         expect(disconnectSpy).toHaveBeenCalled();
    //         disconnectSpy.mockRestore();
    //     });
    // });
});