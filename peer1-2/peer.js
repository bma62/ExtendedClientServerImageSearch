const net = require('net'),
    path = require('path'),
    yargs = require('yargs');

const PTPpacket = require('./PTPMessage'),
    helpers = require('./helpers'),
    singleton = require('./Singleton'),
    handler = require('./ClientsHandler');

const defaultOption = 'Peer info not provided.',
    host = '127.0.0.1',
    peerID = path.basename(process.cwd()).split('-')[0],
    peerTableSize = path.basename(process.cwd()).split('-')[1];

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
            describe: 'The protocol version.',
        }
    })
    .argv;
const version = argv.v;

net.bytesWritten = 300000;
net.bytesRead = 300000;
net.bufferSize = 300000;

singleton.init(peerID, peerTableSize);

// **** CLIENT-SIDE CODE ****
let client = new net.Socket();
let peerPacket = Buffer.alloc(0), peerAddressTable = [], peerPortTable = [], redirectCounter = 0;

// Check if -p option is provided
if (argv.p !== defaultOption) {
    // Read command line inputs in
    const peer = argv.p.split(':')[0],
        port = Number(argv.p.split(':')[1]);

    let assignedPort;

    // Connect to the designated peer and port
    client.connect(port, peer, () => {
    });

    client.on('data', (data) => {

        // Concatenate received data in case the packet is divided into multiple chunks
        peerPacket = Buffer.concat([peerPacket, data]);

        // Check for the delimiter for complete packet
        if (peerPacket.slice(-1).toString() === '\n') {

            // console.log('full packet received');
            // Remove the delimiter
            peerPacket = peerPacket.slice(0, -1);

            // Decode the packet and retrieve peer table received from the peer if any
            const peerResults = decodePacket(peerPacket);
            const redirect = peerResults.redirect;
            peerAddressTable = peerResults.peerAddressTable;
            peerPortTable = peerResults.peerPortTable;

            // If redirect is false and the peer table is null, then the version/messageType is not recognized, so exit
            if (!redirect && peerAddressTable === null) {
                return;
            }
            // Redirect is false but the peer table is not null, then connection is successful, start the server side functionality
            else if (!redirect) {
                // After connecting to a peer, start the server side
                assignedPort = client.localPort;

                let peerServer = net.createServer();
                // let OS assign an unused port, use '0.0.0.0' to explicitly accept IPv4 only
                peerServer.listen(assignedPort, host, () => {
                    console.log(`This peer address is ${peerServer.address().address}:${peerServer.address().port} located at ${peerID}`);
                });

                peerServer.on('connection', function (sock) {
                    handler.handleClientJoining(sock); //called for each client joining
                });
            }
            // If redirect is true, perform redirect by trying to connect to the next peer found in table
            else if (redirect && (peerAddressTable.length == 0 || peerAddressTable.length == redirectCounter)){
                return;
            }
            // Try redirecting to another peer
            else {
                console.log(`Redirecting to ${peerAddressTable[redirectCounter]}:${peerPortTable[redirectCounter]}`);
                // client.connect(peerPortTable[redirectCounter], peerAddressTable[redirectCounter]);
                // ++redirectCounter;
            }

        }
    });

    // Socket fully closed because redirecting has to be performed
    client.on('close', () => {
        peerPacket = Buffer.alloc(0);
        // client.destroy();
        // client = new net.Socket(); // Get a new port for reconnection


        client.connect(peerPortTable[redirectCounter], peerAddressTable[redirectCounter], () => {
            ++redirectCounter;
            // console.log('Reconnection successful');
        });
    });
}
else {
    // **** SERVER-SIDE CODE ****
    let peerServer = net.createServer();
    // let OS assign an unused port, use '0.0.0.0' to explicitly accept IPv4 only
    peerServer.listen( 0, host, () => {
        console.log(`This peer address is ${peerServer.address().address}:${peerServer.address().port} located at ${peerID}`);
    });

    peerServer.on('connection', sock => {
        handler.handleClientJoining(sock); //called for each client joining
    });
}

//
// // Socket half-closed
// client.on('end', () => {
//     console.log('\nDisconnected from the server.');
// });
//
// // Socket fully closed
// client.on('close', () => {
//     console.log('Connection closed.');
// });
//
function decodePacket(packet) {

    // Read first 4 bytes of the header, convert to binary string, and pad to 32-bit length
    let bufferOffset = 0;
    let header = helpers.padStringToLength(helpers.int2bin(packet.readUInt32BE(bufferOffset)), 32);
    bufferOffset = bufferOffset + 4;

    // First 3 bits is the version, if not 7 ignore the packet
    let version = helpers.bin2int(header.substring(0, 3));
    if (version !== 7) {
        return {
            redirect: false,
            peerAddressTable: null,
            peerPortTable: null
        };
    }

    let messageType = helpers.bin2int(header.substring(3, 11));
    let numberOfPeers = helpers.bin2int(header.substring(11, 24));
    let senderIDLength = helpers.bin2int(header.substring(24));
    let senderID = packet.slice(bufferOffset, bufferOffset + senderIDLength).toString();
    bufferOffset = bufferOffset + senderIDLength;

    let peerAddressTable = [], peerPortTable = [];
    for (let i = 0; i < numberOfPeers; i++) {

        // Convert to ipv4
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
            console.log(`Connected to peer ${senderID}:${client.remotePort} at timestamp: ${singleton.getTimestamp()}`);
            console.log(`Received ack from ${senderID}:${client.remotePort}`);
            return {
                redirect: false,
                peerAddressTable: peerAddressTable,
                peerPortTable: peerPortTable
            };
        case 2:
            console.log('The join has been declined; the auto-join process is performing...');
            // TODO: redirect steps
            return {
                redirect: true,
                peerAddressTable: peerAddressTable,
                peerPortTable: peerPortTable
            };
        default:
            //Ignore if message type is not recognized
            return {
                redirect: false,
                peerAddressTable: null,
                peerPortTable: null
            };
    }
}
