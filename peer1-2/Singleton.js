
let timer, senderID, peerAddressTable, peerPortTable, peerTableSize;

module.exports = {
    init: function(peerID, tableSize) {

        // Initialize timer and sequenceNumber with a random number between 1 and 999
        timer = Math.floor((Math.random() * 999) + 1);

        // Increment timer every 10ms
        setInterval(incrementTimer, 10);

        senderID = peerID;
        peerAddressTable = [];
        peerPortTable = [];
        peerTableSize = tableSize;
    },

    //--------------------------
    //getTimestamp: return the current timer value
    //--------------------------
    getTimestamp: function() {
        return timer;
    },

    // Return the sender ID of this peer
    getSenderID: function () {
        return senderID;
    },

    // Check if the peer table is full before inserting more peers
    isPeerTableFull: function() {
        return peerAddressTable.length == peerTableSize;
    },

    // Insert a new peer into the peer table
    addPeer: function(peerAddress, peerPort) {
        peerAddressTable.push(peerAddress);
        peerPortTable.push(peerPort);
    },

    // Return the peer IP address table
    getPeerAddressTable: function () {
        return peerAddressTable;
    },

    // Return the peer port table
    getPeerPortTable: function () {
        return peerPortTable;
    }
};

function incrementTimer() {
    // reset timer after reaching 2^32
    if (timer === Math.pow(2, 32)) {
        timer = 0;
    }
    ++timer;
}