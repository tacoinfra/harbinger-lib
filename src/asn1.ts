/** Disable some linting rules since the ASN1 library is not written in Typescript. */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-var-requires */
const ASN1 = require('@lapo/asn1js')

/** Exports ASN1 with additional functionality */

// Add method to change a DER encoded key to a hex string.
ASN1.prototype.toHexStringContent = function (): string {
  const hex = this.stream.hexDump(this.posContent(), this.posEnd(), true)
  return hex.startsWith('00') ? hex.slice(2) : hex
}

export default ASN1
