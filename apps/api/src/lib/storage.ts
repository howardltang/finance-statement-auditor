import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { env } from "../env.js";
import { s3 } from "./s3.js";

/**
 * Abstraction over "where uploaded document bytes live". Local disk for
 * dev, S3 in production, selected by `STORAGE_DRIVER`. Only `read` is used
 * on the S3 path in practice — production uploads go straight from the
 * browser to S3 via a presigned URL (see routes/documents.ts `/presign`),
 * never through `save`.
 */
export interface StorageAdapter {
  save(key: string, data: Buffer): Promise<void>;
  read(key: string): Promise<Buffer>;
}

class LocalDiskStorageAdapter implements StorageAdapter {
  private root = env.UPLOAD_DIR;

  async save(key: string, data: Buffer): Promise<void> {
    const path = join(this.root, key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data);
  }

  async read(key: string): Promise<Buffer> {
    return readFile(join(this.root, key));
  }
}

class S3StorageAdapter implements StorageAdapter {
  constructor(private bucket: string) {}

  async save(key: string, data: Buffer): Promise<void> {
    await s3.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: data }));
  }

  async read(key: string): Promise<Buffer> {
    const result = await s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const bytes = await result.Body?.transformToByteArray();
    if (!bytes) throw new Error(`S3 object ${key} had no body`);
    return Buffer.from(bytes);
  }
}

export const storage: StorageAdapter =
  env.STORAGE_DRIVER === "s3" && env.UPLOADS_BUCKET
    ? new S3StorageAdapter(env.UPLOADS_BUCKET)
    : new LocalDiskStorageAdapter();
