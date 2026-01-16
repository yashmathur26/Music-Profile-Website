import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@/utils/env";

const buildClient = () => {
  if (!env.s3Region || !env.s3AccessKeyId || !env.s3SecretAccessKey) {
    throw new Error("S3 storage not configured.");
  }
  return new S3Client({
    region: env.s3Region,
    endpoint: env.s3Endpoint,
    forcePathStyle: env.s3ForcePathStyle,
    credentials: {
      accessKeyId: env.s3AccessKeyId,
      secretAccessKey: env.s3SecretAccessKey
    }
  });
};

export const createSignedDownloadUrl = async (params: {
  objectKey: string;
  filename?: string;
}) => {
  if (!env.s3Bucket) {
    throw new Error("S3 bucket not configured.");
  }
  const client = buildClient();
  const command = new GetObjectCommand({
    Bucket: env.s3Bucket,
    Key: params.objectKey,
    ResponseContentDisposition: `attachment; filename="${params.filename || env.downloadFilename}"`,
    ResponseContentType: "audio/wav"
  });
  return getSignedUrl(client, command, { expiresIn: 180 });
};
