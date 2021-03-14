
// Helper functions used throughout the program
module.exports = {

    // Convert binary string to hexadecimal
    bin2hex: function (bin) {
        return parseInt(bin, 2).toString(16);
    },

    // Convert binary string to integer
    bin2int: function (bin) {
        return parseInt(bin, 2);
    },

    // Convert integer to binary string
    int2bin: function (int) {
        return int.toString(2);
    },

    // Pad str with 0s from the left to reach targetLength
    padStringToLength: function (str, targetLength, errorMsg) {
        if (str.length < targetLength) {
            return str.padStart(targetLength, '0');
        } else if (str.length === targetLength) {
            return str;
        } else {
            throw new Error(errorMsg);
        }
    },
};