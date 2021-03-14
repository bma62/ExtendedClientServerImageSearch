const net = require('net'),
    path = require('path'),
    yargs = require('yargs');

const PTPpacket = require('./PTPMessage'),
    helpers = require('./helpers'),
    singleton = require('./Singleton'),
    handler = require('./ClientsHandler');

const defaultOption = 'Peer info not provided.',
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

singleton.init(peerTableSize);

// **** CLIENT-SIDE CODE ****
// Check if -p option is provided
if (argv.p !== defaultOption) {
    // Read command line inputs in
    const peer = argv.p.split(':')[0],
        port = Number(argv.p.split(':')[1]);

    const client = new net.Socket();

    let assignedPort;

    // Connect to the designated peer and port
    client.connect(port, peer, () => {
    });

    let peerPacket = Buffer.alloc(0);
    client.on('data', (data) => {

        // Concatenate received data in case the packet is divided into multiple chunks
        peerPacket = Buffer.concat([peerPacket, data]);

        // Check for the delimiter for complete packet
        if (peerPacket.slice(-1).toString() === '\n') {
            // console.log('full packet received');
            // Remove the delimiter
            peerPacket = peerPacket.slice(0, -1);

            decodePacket(peerPacket);
        }
    });

    console.log(`Connected to the peer XXXX at timestamp: ${singleton.getTimestamp()}`);

    assignedPort = client.localPort;

    let peerServer = net.createServer();
    // let OS assign an unused port, use '0.0.0.0' to explicitly accept IPv4 only
    peerServer.listen(assignedPort, '0.0.0.0', () => {
        console.log(`This peer address is ${peerServer.address().address}:${peerServer.address().port} located at ${peerID}`);
    });

    peerServer.on('connection', function (sock) {
        handler.handleClientJoining(sock); //called for each client joining
    });

        // // Send packet through and add a one-byte delimiter for server to concatenate buffer chunks
        // let packet = PTPpacket.getBytePacket(),
        //     delimiter = Buffer.from('\n');
        //
        // packet = Buffer.concat([packet, delimiter]);
        // client.write(packet);
}
else {
    // **** SERVER-SIDE CODE ****
    let peerServer = net.createServer();
    // let OS assign an unused port, use '0.0.0.0' to explicitly accept IPv4 only
    peerServer.listen( 0, '0.0.0.0', () => {
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
    console.log('Server sent:');

    // Read first 4 bytes of the header, convert to binary string, and pad to 32-bit length
    let bufferOffset = 0;
    let header = helpers.padStringToLength(helpers.int2bin(packet.readUInt32BE(bufferOffset)), 32);
    bufferOffset = bufferOffset + 4;

    // First 3 bits is the version
    let version = helpers.bin2int(header.substring(0, 3));
    console.log(`\t--ITP version: ${version}`);

    let isFulfilled = header.substring(3, 4);
    if (isFulfilled === '0') {
        isFulfilled = 'No';
    }
    else {
        isFulfilled = 'Yes';
    }
    console.log(`\t--Fulfilled: ${isFulfilled}`);

    let responseType = helpers.bin2int(header.substring(4, 12));
    switch (responseType) {
        case 0:
            responseType = 'Query';
            break;
        case 1:
            responseType = 'Found';
            break;
        case 2:
            responseType = 'Not Found';
            break;
        case 3:
            responseType = 'Busy';
            break;
        default:
            responseType = 'Not Recognized';
    }
    console.log(`\t--Response Type: ${responseType}`);

    let imageCount = helpers.bin2int(header.substring(12, 17));
    console.log(`\t--Image Count: ${imageCount}`);

    let sequenceNumber = helpers.bin2int(header.substring(17));
    console.log(`\t--Sequence Number: ${sequenceNumber}`);

    // Second 4 bytes of the header is timestamp
    let timestamp = packet.readUInt32BE(bufferOffset);
    bufferOffset = bufferOffset + 4;
    console.log(`\t--Timestamp: ${timestamp}`);

    // Payload section
    let imageType = '',
        fileNameSize = 0,
        imageSize = 0,
        fileName = '',
        promises = [];

    // Repeat payload section reading for each image
    for (let i = 0; i < imageCount; i++) {

        header = helpers.padStringToLength(helpers.int2bin(packet.readUInt16BE(bufferOffset)), 16);
        bufferOffset = bufferOffset + 2;

        imageType = helpers.bin2int(header.substring(0, 4));
        imageType = helpers.getImageExtension(imageType);
        fileNameSize = helpers.bin2int(header.substring(4));

        imageSize = packet.readUInt16BE(bufferOffset);
        bufferOffset = bufferOffset + 2;

        fileName = packet.slice(bufferOffset, bufferOffset + fileNameSize).toString();
        bufferOffset = bufferOffset + fileNameSize;

        let imageData = Buffer.from(packet.slice(bufferOffset, bufferOffset + imageSize));
        bufferOffset = bufferOffset + imageSize;

        // Write the image data to file asynchronously
        promises.push(writeToFile(fileName, imageType, imageData));
    }

    // Wait until all writes are done, then open them
    Promise.all(promises)
        .then((fileNames) => {

            // Clear the promises array and reuse for opening the files asynchronously
            promises = [];
            fileNames.forEach( fileName => {
                promises.push(open(fileName));
            })

            // Wait for all files to be opened
            Promise.all(promises)
                .then( ()=>{
                    // All files are open, close the connection
                    client.end();
                })
                .catch(err => {
                    console.log(err);
                })
        })
        .catch(err => {
            console.log(err);
        })
}
