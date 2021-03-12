
let timer, sequenceNumber;

module.exports = {
    init: function() {

        // Initialize timer and sequenceNumber with a random number between 1 and 999
        timer = Math.floor((Math.random() * 999) + 1);
        sequenceNumber = Math.floor((Math.random() * 999) + 1);

        // Increment timer every 10ms
        setInterval(incrementTimer, 10);
    },

    //--------------------------
    //getSequenceNumber: return the current sequence number + 1
    //--------------------------
    getSequenceNumber: function() {
        ++sequenceNumber;
        return sequenceNumber;
    },

    //--------------------------
    //getTimestamp: return the current timer value
    //--------------------------
    getTimestamp: function() {
        return timer;
    }
};

function incrementTimer() {
    // reset timer after reaching 2^32
    if (timer === Math.pow(2, 32)) {
        timer = 0;
    }
    ++timer;
}