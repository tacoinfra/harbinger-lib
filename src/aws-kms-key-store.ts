/** Disable some linting rules since the ASN1 library is not written in Typescript. */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable  @typescript-eslint/no-unsafe-call */

import { KeyStore, KeyStoreCurve, KeyStoreType } from 'conseiljs'
import { KMS } from 'aws-sdk'
import ASN1 from './asn1'
import Utils from './utils'
import Prefixes from './prefixes'
import Constants from './constants'

export default class AwsKmsKeyStore implements KeyStore {
  /** KeyStore properties. */
  public readonly publicKey: string
  public readonly publicKeyHash: string
  public readonly storeType: KeyStoreType
  public readonly derivationPath = undefined
  public readonly curve: KeyStoreCurve

  /** Do not access these members. Private Keys are stored in AWS KMS and are not accessible. */
  public readonly secretKey: string
  public readonly seed: string

  /**
   * Create a new `KeyStore` which wraps an AWS KMS key.
   *
   * @param kmsKeyId The Key ID in KMS.
   * @param region The AWS region the KMS Key resides in.
   */
  public static async from(
    kmsKeyId: string,
    region: string,
  ): Promise<AwsKmsKeyStore> {
    // Retrieve key from KMS.
    const kms = new KMS({
      region,
    })
    const publicKeyResponse = await kms
      .getPublicKey({
        KeyId: kmsKeyId,
      })
      .promise()

    const publicKeyDer = publicKeyResponse.PublicKey
    if (publicKeyDer === undefined) {
      throw new Error("Couldn't retreive key from AWS KMS")
    }

    const decodedPublicKey = ASN1.decode(publicKeyDer)
    const publicKeyHex = decodedPublicKey.sub[1].toHexStringContent()
    const uncompressedPublicKeyBytes = Utils.hexToBytes(publicKeyHex)
    const publicKeyBytes = Utils.compressKey(uncompressedPublicKeyBytes)

    const publicKey = Utils.base58CheckEncode(
      publicKeyBytes,
      Prefixes.secp256k1PublicKey,
    )
    const publicKeyHash = Utils.base58CheckEncode(
      Utils.blake2b(publicKeyBytes, Constants.publicKeyHashLength),
      Prefixes.secp256k1PublicKeyHash,
    )

    return new AwsKmsKeyStore(publicKey, publicKeyHash)
  }

  /**
   * Create a new keystore.
   *
   * @param publicKey The public key.
   * @param publicKeyHash The public key hash.
   */
  private constructor(publicKey: string, publicKeyHash: string) {
    this.publicKey = publicKey
    this.publicKeyHash = publicKeyHash
    this.curve = KeyStoreCurve.SECP256K1
    this.storeType = KeyStoreType.Hardware

    // Stub out not available properties
    this.secretKey = 'NOT AVAILABLE'
    this.seed = 'NOT AVAILABLE'
  }
}
