// const net = require('net');

const PTPpacket = require('./PTPMessage'),
    singleton = require('./Singleton');

module.exports = {

    handleClientJoining: function (sock) {

        const peerAddress = sock.remoteAddress,
            peerPort = sock.remotePort;

        // Check if the peer table is full
        if (singleton.isPeerTableFull()) {

            console.log(`Peer table full: ${peerAddress}:${peerPort} redirected`)

            // Form re-direct packet
            PTPpacket.init(7, 2, singleton.getSenderID(),
                singleton.getPeerAddressTable(), singleton.getPeerPortTable());
            let packet = PTPpacket.getPacket();

            // Add a one-byte delimiter for client to concatenate buffer chunks
            let delimiter = Buffer.from('\n');
            packet = Buffer.concat([packet, delimiter])

            // Send to client and close the connection
            sock.write(packet);
            sock.end();
        }
        else {
            console.log(`Connected from peer: ${peerAddress}:${peerPort}`);
            // Form welcome packet
            PTPpacket.init(7, 1, singleton.getSenderID(),
                singleton.getPeerAddressTable(), singleton.getPeerPortTable());
            let packet = PTPpacket.getPacket();

            // Add a one-byte delimiter for client to concatenate buffer chunks
            let delimiter = Buffer.from('\n');
            packet = Buffer.concat([packet, delimiter])

            // Send to client and add peer info to table
            sock.write(packet);
            singleton.addPeer(peerAddress, peerPort);
        }

        sock.on('close', () => {
            console.log(`\nPeer ${peerAddress}:${peerPort} closed the connection.\n`);
        });

        sock.on('error', (err) => {
            console.log(`Error: ${err}`);
        });
    }
};