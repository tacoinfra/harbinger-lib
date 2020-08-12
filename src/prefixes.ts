/**
 * Prefix bytes used across Harbinger.
 */
const prefix = {
  /** Prefix for a secp256k1 public key */
  secp256k1PublicKey: new Uint8Array([3, 254, 226, 86]), // sppk

  /** Prefix for a secp256k1 public key hash */
  secp256k1PublicKeyHash: new Uint8Array([6, 161, 161]), // tz2
}

export default prefix
