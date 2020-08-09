import { KeyStore, KeyStoreCurve, KeyStoreType } from 'conseiljs';
import { KMS } from 'aws-sdk'
import ASN1 from './asn1'
import Utils from './utils'

// TODO(keefertaylor): Enforce naming scheme on these files.

// Watermark bytes
// TODO(keefertaylor): Centralize prefixes.
const PUBLIC_KEY_PREFIX = new Uint8Array([3, 254, 226, 86])  // sppk
const PUBLIC_KEY_HASH_PREFIX = new Uint8Array([6, 161, 161]) // tz2

// Length of the public key hash.
const PUBLIC_KEY_HASH_LENGTH = 20

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
    public static async from(kmsKeyId: string, region: string): Promise<AwsKmsKeyStore> {
        // Retrieve key from KMS.
        const kms = new KMS({
            region,
        })
        const publicKeyResponse = await kms.getPublicKey({
            KeyId: kmsKeyId
        }).promise()

        const publicKeyDer = publicKeyResponse.PublicKey
        if (publicKeyDer === undefined) {
            throw new Error("Couldn't retreive key from AWS KMS")
        }

        const decodedPublicKey = ASN1.decode(publicKeyDer)
        const publicKeyHex = decodedPublicKey.sub[1].toHexStringContent()
        const uncompressedPublicKeyBytes = Utils.hexToBytes(publicKeyHex)
        const publicKeyBytes = Utils.compressKey(uncompressedPublicKeyBytes)

        const publicKey = Utils.base58CheckEncode(publicKeyBytes, PUBLIC_KEY_PREFIX)
        const publicKeyHash = Utils.base58CheckEncode(Utils.blake2b(publicKeyBytes, PUBLIC_KEY_HASH_LENGTH), PUBLIC_KEY_HASH_PREFIX)

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
        this.secretKey = "NOT AVAILABLE"
        this.seed = "NOT AVAILABLE"
    }
}


