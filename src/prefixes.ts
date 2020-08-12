/**
 * Prefix bytes used across Harbinger.
 */
const prefix = {
  /** Prefix for a secp256k1 public key */
  secp256k1PublicKey: new Uint8Array([3, 254, 226, 86]), // sppk

  /** Prefix for a secp256k1 public key hash */
  secp256k1PublicKeyHash: new Uint8Array([6, 161, 161]), // tz2

  /** Prefix for an ed25519 secret key.  */
  ed25519SecretKey: new Uint8Array([43, 246, 78, 7]), // edsk

  /** Prefix for a smart contract address. */
  smartContractAddress: new Uint8Array([2, 90, 121]), // KT1

  /** Prefix for a secp256k1 signature. */
  secp256k1signature: new Uint8Array([13, 115, 101, 19, 63]), // spsig
}

export default prefix
