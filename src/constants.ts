/**
 * Constants used across Harbinger.
 */
const constants = {
  /** The cost per byte of storage used, in nanotez. */
  feePerByteNanotez: 1000,

  /** The cost per gas unit used, in nanotez. */
  feePerGasUnitNanotez: 100,

  /** The maximum amount of gas that can be used in an operation. */
  gasLimit: 1_040_000,

  /** The minimum fee for an operation, in nanotez. */
  minimumFeeNanotez: 100_000,

  /** The number of nanotez per mutez. */
  nanotezPerMutez: 1000,

  /** The maximum amount of storage that can be added in an operation. */
  storageLimit: 60_000,

  /** The length of a signature in bytes. */
  signatureSizeBytes: 64,

  /** The cost of the burn when a contract is originated */
  originationBurnCost: 257,

  /** A safety margin to apply to gas estimates. */
  gasSafetyMargin: 100,

  /** A safety margin to apply to storage estimates. */
  storageSafetyMargin: 20,

  /** The length of a public key hash in bytes. */
  publicKeyHashLength: 20,
}

export default constants
