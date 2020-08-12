/**
 * Constants used across the tezos-oracle CLI.
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
}

export default constants
