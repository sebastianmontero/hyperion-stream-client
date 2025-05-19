
console.log('JEST IS USING THE MANUAL MOCK FOR socket.io-client');
// src/__mocks__/socket.io-client.ts
type EventHandler = (...args: any[]) => void;

interface MockSocket {
    on: jest.Mock<any, [string, EventHandler]>;
    off: jest.Mock<any, [string, EventHandler]>;
    emit: jest.Mock<any, [string, ...any[]]>;
    disconnect: jest.Mock<void, []>;
    removeAllListeners: jest.Mock<void, []>;
    connected: boolean;
    _trigger: (event: string, ...args: any[]) => void;
    _simulateConnectError: () => void;
    _simulateSuccessfulConnect: () => void;
    _handlers: Record<string, EventHandler[]>; // <<< ADDED THIS LINE
    hola: string
}

const mockSocketInstance: MockSocket = {
    on: jest.fn((event, handler) => {
        if (!mockSocketInstance._handlers[event]) {
            mockSocketInstance._handlers[event] = [];
        }
        const handlersForEvent = mockSocketInstance._handlers[event];
        if (handlersForEvent) {
            handlersForEvent.push(handler);
        }
        // VERBOSE LOGGING FOR DEBUGGING
        console.log(`MOCK_SOCKET_ON: Registered handler for event "${event}". Total for event: ${handlersForEvent?.length || 0}. Handler: ${handler.name || 'anonymous'}`);
        return mockSocketInstance;
    }),
    off: jest.fn((event, handler) => {
        const handlersForEvent = mockSocketInstance._handlers[event];
        if (handlersForEvent) {
            mockSocketInstance._handlers[event] = handlersForEvent.filter(h => h !== handler);
        }
        return mockSocketInstance; // Allow chaining
    }),
    emit: jest.fn((event, _data, ack) => {
        if (typeof ack === 'function') {
            if (event === 'action_stream_request' || event === 'delta_stream_request') {
                ack({ status: 'OK' });
            } else {
                ack();
            }
        }
    }),
    disconnect: jest.fn(() => {
        if (mockSocketInstance.connected) {
            mockSocketInstance.connected = false;
            // Ensure _trigger uses the instance's _handlers
            mockSocketInstance._trigger('disconnect', 'io client disconnect');
        }
    }),
    removeAllListeners: jest.fn(() => {
        mockSocketInstance._handlers = {}; // Now TypeScript knows _handlers exists
    }),
    connected: false,
    _handlers: {} as Record<string, EventHandler[]>, // Initialized here
    _trigger: (event: string, ...args: any[]) => {
        const handlersForEvent = mockSocketInstance._handlers[event];
        console.log(`MOCK_SOCKET_TRIGGER: Attempting to trigger event "${event}". Found ${handlersForEvent?.length || 0} handlers.`); // Log count
        if (handlersForEvent && handlersForEvent.length > 0) {
            console.log(`MOCK_SOCKET_TRIGGER: Executing ${handlersForEvent.length} handlers for "${event}".`);
            // Iterate over a copy in case a handler modifies the array (e.g., by calling off)
            [...handlersForEvent].forEach((handler, index) => {
                console.log(`MOCK_SOCKET_TRIGGER: Calling handler ${index + 1} for "${event}". Handler: ${handler.name || 'anonymous'}`);
                handler(...args);
            });
        } else {
            console.warn(`MOCK_SOCKET_TRIGGER_WARN: No handlers registered for event "${event}" in mockSocketInstance._handlers to trigger.`);
        }
    },
    _simulateConnectError: () => {
        // mockSocketInstance.connected = false;
        // // Ensure _trigger uses the instance's _handlers
        // mockSocketInstance._trigger('connect_error', new Error('Simulated connection error'));
        // mockSocketInstance._trigger('disconnect', 'transport error');

        console.log('MOCK: _simulateConnectError called');
        mockSocketInstance.connected = false;
        mockSocketInstance._trigger('connect_error', new Error('Simulated connection error'));
        console.log('MOCK: connect_error triggered');
        mockSocketInstance._trigger('disconnect', 'transport error');
        console.log('MOCK: disconnect triggered');
    },
    _simulateSuccessfulConnect: () => {
        mockSocketInstance.connected = true;
        // Ensure _trigger uses the instance's _handlers
        mockSocketInstance._trigger('connect');
    },
    hola: 'hola'
};

export const io = jest.fn(() => mockSocketInstance);

export const getMockSocket = jest.fn(() => mockSocketInstance);

export const resetMockSocket = jest.fn(() => {
    console.log('MOCK_SOCKET_RESET: Clearing all mocks and handlers.');
    mockSocketInstance.on.mockClear();
    mockSocketInstance.off.mockClear();
    mockSocketInstance.emit.mockClear();
    mockSocketInstance.disconnect.mockClear();
    mockSocketInstance.removeAllListeners.mockClear();
    mockSocketInstance.connected = false;
    mockSocketInstance._handlers = {}; // Reset the handlers store
});

// export const getMockSocket = () => {
//     console.log('TEST: getMockSocket called');
//     return mockSocketInstance 
// };
// export const resetMockSocket = () => {
//     console.log('TEST: resetMockSocket called');
//     mockSocketInstance.on.mockClear();
//     mockSocketInstance.off.mockClear();
//     mockSocketInstance.emit.mockClear();
//     mockSocketInstance.disconnect.mockClear();
//     mockSocketInstance.removeAllListeners.mockClear();
//     mockSocketInstance.connected = false;
//     mockSocketInstance._handlers = {}; // Reset the handlers store
// };