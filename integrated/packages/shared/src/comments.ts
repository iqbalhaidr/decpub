/**
 * Komentar pembaca (P08). Isi komentar tidak masuk chain: hanya `bytes32` hash-nya yang dikirim ke
 * `DOIToken.postComment` (event `CommentPosted`), isinya disimpan server. Siapa pun dengan isi, nama
 * tampilan, dan nonce dapat menghitung ulang hash dan mencocokkannya dengan event.
 *
 * Pola sama dengan Roihan (`repository/comment.go`: hash on-chain + isi off-chain). Bedanya: yang memosting
 * ke chain adalah relayer (operator), sehingga `reader` di event selalu operator dan tidak menaut komentar
 * ke dompet pembaca; atribusi pembaca hanya lewat nama tampilan (`handle`) yang hanya berlaku per artikel.
 */
import { keccak256, toBytes, type Hex } from "viem";

export const MAX_COMMENT_CHARS = 2_000;

export function commentHash(doiTokenId: bigint | number, handle: string, body: string, nonce: Hex): Hex {
  return keccak256(toBytes(JSON.stringify(["decpub.comment.v1", String(doiTokenId), handle, body, nonce.toLowerCase()])));
}
