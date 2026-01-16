const required = (name: string) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
};

const optional = (name: string) => process.env[name];

export const env = {
  soundcloudClientId: optional("SOUNDCLOUD_CLIENT_ID"),
  soundcloudClientSecret: optional("SOUNDCLOUD_CLIENT_SECRET"),
  soundcloudRedirectUri: optional("SOUNDCLOUD_REDIRECT_URI"),
  soundcloudArtistId: optional("SOUNDCLOUD_ARTIST_ID"),
  s3Endpoint: optional("S3_ENDPOINT"),
  s3Region: optional("S3_REGION"),
  s3AccessKeyId: optional("S3_ACCESS_KEY_ID"),
  s3SecretAccessKey: optional("S3_SECRET_ACCESS_KEY"),
  s3Bucket: optional("S3_BUCKET"),
  s3ObjectKey: optional("S3_OBJECT_KEY"),
  s3ForcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
  downloadFilename: process.env.DOWNLOAD_FILENAME || "track.wav"
};
