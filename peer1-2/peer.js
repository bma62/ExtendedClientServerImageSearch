// Import modules
const net = require('net'),
    path = require('path'),
    yargs = require('yargs'),
    helpers = require('./helpers'),
    singleton = require('./Singleton'),
    handler = require('./ClientsHandler');

// Declare constants
const defaultOption = 'Peer info not provided.',
    host = '127.0.0.1',
    // Get this peer's info from the current folder's name
    peerID = path.basename(process.cwd()).split('-')[0],
    peerTableSize = Number(path.basename(process.cwd()).split('-')[1]);

// Set up command line options
const argv = yargs
    .usage('Usage: $0 -p [Peer IP:Port] -v [Version]')
    .options({
        'p': {
            demandOption: true,
            default: defaultOption,
            type: 'string',
            describe: 'The initial peer IP and port to connect to.',
        },
        'v': {
            demandOption: true,
            default: 7,
            type: 'number',
            describe: 'The PTP protocol version.',
        }
    })
    .argv;
const version = argv.v;

net.bytesWritten = 300000;
net.bytesRead = 300000;
net.bufferSize = 300000;
singleton.init(version, peerID, peerTableSize);

// Check if -p option is provided
if (argv.p !== defaultOption) {
    StartPTPClient(argv.p);
}
// If the -p option is not provided, start server right away
else {
    // Use 0 for port to let OS assign an unused port
    StartPTPServer(0, host, peerID);
}

// **** CLIENT-SIDE CODE ****
function StartPTPClient(peerOption){

    // Read command line inputs in
    const peerAddress = peerOption.split(':')[0],
        peerPort = Number(peerOption.split(':')[1]);

    // Create socket
    let client = new net.Socket();
    let peerPacket = Buffer.alloc(0), peerAddressTable = [], peerPortTable = [], redirectCounter = 0;

    // Connect to the designated peer and port
    client.connect(peerPort, peerAddress);

    // Handle PTP packet received from the peer
    client.on('data', (data) => {

        // Concatenate received data in case the packet is divided into multiple chunks
        peerPacket = Buffer.concat([peerPacket, data]);

        // Check the delimiter for complete packet
        if (peerPacket.slice(-1).toString() === '\n') {

            // console.log('full packet received');
            // Remove the delimiter
            peerPacket = peerPacket.slice(0, -1);

            // Decode the packet and retrieve peer table received from the peer if any
            const peerResults = decodePacket(peerPacket, client.remotePort);
            const redirect = peerResults.redirect;
            // If the peer table is not empty, then we are doing reconnections and the table should not be overwritten
            if (peerAddressTable.length === 0) {
                peerAddressTable = peerResults.peerAddressTable;
                peerPortTable = peerResults.peerPortTable;
            }

            // If redirect is false and the peer table is null, then the version/messageType is not recognized, so exit
            if (!redirect && peerAddressTable === null) {
                console.log(`Unrecognized PTP version or message type from ${peerAddress}:${peerPort}; the program will exit...`);
                return;
            }
            // If redirect is false but the peer table is not null, then connection is successful - start the server side functionality
            else if (!redirect) {
                // Get OS assigned port to start server
                const assignedPort = client.localPort;
                StartPTPServer(assignedPort, host, peerID);
                return;
            }
            // If redirect is true, but the peer table is empty or we have reached the bottom of the table - exit the program
            else if (redirect && (peerAddressTable.length === 0 || peerAddressTable.length === redirectCounter)){
                return;
            }
            // Try to go down the peer table and redirect to another peer
            else {
                console.log(`Redirecting to ${peerAddressTable[redirectCounter]}:${peerPortTable[redirectCounter]}`);
                peerPacket = Buffer.alloc(0); // Clear the buffer used for previous packet
                client = new net.Socket(); // Get a new port for reconnection
                client.connect(peerPortTable[redirectCounter], peerAddressTable[redirectCounter], () => {
                    ++redirectCounter;
                });
            }

        }
    });

    // If a peer left, no need to handle
    client.on('close', () => {
        console.log(`\n`);
    });

    // client.on('error', (err) => {
    //     console.log(`Error: ${err}`);
    // });

    // // Socket fully closed because redirecting has to be performed
    // client.on('close', () => {
    //     peerPacket = Buffer.alloc(0); // Clear the buffer used for previous packet
    //     // client.destroy();
    //     // client = new net.Socket(); // Get a new port for reconnection
    //
    //     client.connect(peerPortTable[redirectCounter], peerAddressTable[redirectCounter], () => {
    //         ++redirectCounter;
    //         // console.log('Reconnection successful');
    //     });
    // });
}

// **** SERVER-SIDE FUNCTIONALITY ****
function StartPTPServer(serverPort, serverHost, peerID) {

    const peerServer = net.createServer();

    peerServer.listen( serverPort, serverHost, () => {
        console.log(`This peer address is ${peerServer.address().address}:${peerServer.address().port} located at ${peerID}`);
    });

    peerServer.on('connection', sock => {
        handler.handleClientJoining(sock); //called for each client joining
    });
}

// Decode PTP packet
function decodePacket(packet, senderPort) {

    // Read first 4 bytes of the header, convert to binary string, and pad to 32-bit length
    let bufferOffset = 0;
    const header = helpers.padStringToLength(helpers.int2bin(packet.readUInt32BE(bufferOffset)), 32);
    bufferOffset = bufferOffset + 4;

    // First 3 bits is the version, if it's not 7 - the packet should be ignored
    const version = helpers.bin2int(header.substring(0, 3));
    if (version !== 7) {
        return {
            redirect: false,
            peerAddressTable: null,
            peerPortTable: null
        };
    }

    const messageType = helpers.bin2int(header.substring(3, 11)),
        numberOfPeers = helpers.bin2int(header.substring(11, 24)),
        senderIDLength = helpers.bin2int(header.substring(24)),
        senderID = packet.slice(bufferOffset, bufferOffset + senderIDLength).toString();
    bufferOffset = bufferOffset + senderIDLength;

    // Decode the peer table received
    let peerAddressTable = [], peerPortTable = [];
    for (let i = 0; i < numberOfPeers; i++) {

        // Convert 32-bit IP string to proper format
        let IPString = helpers.padStringToLength(helpers.int2bin(packet.readUInt32BE(bufferOffset)), 32);
        bufferOffset = bufferOffset + 4;

        IPString = helpers.bin2int(IPString.substring(0,8)) + '.' +
            helpers.bin2int(IPString.substring(8,16)) + '.' +
            helpers.bin2int(IPString.substring(16,24)) + '.' +
            helpers.bin2int(IPString.substring(24,32));
        peerAddressTable.push(IPString);

        peerPortTable.push(packet.readUInt16BE(bufferOffset));
        bufferOffset = bufferOffset + 2;
    }

    switch (messageType) {
        case 1:
            // Message type 1 = connection successful
            console.log(`Connected to peer ${senderID}:${senderPort} at timestamp: ${singleton.getTimestamp()}`);
            console.log(`Received ack from ${senderID}:${senderPort}`);
            return {
                redirect: false,
                peerAddressTable: peerAddressTable,
                peerPortTable: peerPortTable
            };

        case 2:
            // Message type 2 = redirect
            console.log('The join has been declined; the auto-join process is performing...');
            return {
                redirect: true,
                peerAddressTable: peerAddressTable,
                peerPortTable: peerPortTable
            };

        default:
            // If message type is not recognized, the packet should be ignored
            return {
                redirect: false,
                peerAddressTable: null,
                peerPortTable: null
            };
    }
}
