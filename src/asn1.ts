const ASN1 = require('@lapo/asn1js');

/** Exports ASN1 with additional functionality */

// Add method to change a DER encoded key to a hex string.
ASN1.prototype.toHexStringContent = function () {
    let hex = this.stream.hexDump(this.posContent(), this.posEnd(), true);
    if (hex.startsWith('00')) hex = hex.slice(2);
    return hex;
};

export default ASN1