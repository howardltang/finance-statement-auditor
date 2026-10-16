import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const s3 = new S3Client({});

const PRESIGNED_URL_TTL_SECONDS = 5 * 60;

/**
 * A presigned PUT URL lets the browser upload directly to S3 — the file's
 * bytes never pass through the API at all, which matters on Lambda (payload
 * size limits) and is generally the point of presigned URLs: the server
 * hands out permission to write one object, not a route to shovel bytes
 * through.
 */
export async function createPresignedUploadUrl(
  bucket: string,
  key: string,
  contentType: string,
): Promise<string> {
  const command = new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType });
  return getSignedUrl(s3, command, { expiresIn: PRESIGNED_URL_TTL_SECONDS });
}
