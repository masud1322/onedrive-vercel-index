import Redis from 'ioredis'
import siteConfig from '../../config/site.config'

// Persistent key-value store is provided by Redis, hosted on Upstash
// https://vercel.com/integrations/upstash
const kv = new Redis(process.env.REDIS_URL || '')

// MongoDB support as alternative to Redis
let mongoClient: any = null
let mongoDb: any = null

async function getMongoConnection(): Promise<any> {
  if (!mongoDb) {
    const mongoUrl = process.env.MONGODB_URL || process.env.MONGODB_URI
    if (!mongoUrl) {
      throw new Error('MONGODB_URL or MONGODB_URI environment variable is required for MongoDB storage')
    }

    try {
      // Dynamic import of MongoDB to avoid build errors when not installed
      const { MongoClient } = await import('mongodb')
      mongoClient = new MongoClient(mongoUrl)
      await mongoClient.connect()
      mongoDb = mongoClient.db('onedrive_vercel_index')
    } catch (error) {
      throw new Error('MongoDB package not installed. Run: npm install mongodb')
    }
  }
  return mongoDb
}

// Check if we should use MongoDB (when MONGODB_URL is set and REDIS_URL is not set or Redis fails)
const shouldUseMongoDB = () => {
  return (process.env.MONGODB_URL || process.env.MONGODB_URI) && !process.env.REDIS_URL
}

export async function getOdAuthTokens(): Promise<{ accessToken: unknown; refreshToken: unknown }> {
  // Try MongoDB first if configured
  if (shouldUseMongoDB()) {
    try {
      const db = await getMongoConnection()
      const collection = db.collection('auth_tokens')

      const accessTokenDoc = await collection.findOne({ key: `${siteConfig.kvPrefix}access_token` })
      const refreshTokenDoc = await collection.findOne({ key: `${siteConfig.kvPrefix}refresh_token` })

      // Check if access token has expired
      const accessToken = accessTokenDoc && accessTokenDoc.expiresAt > new Date() 
        ? accessTokenDoc.value 
        : null

      return {
        accessToken,
        refreshToken: refreshTokenDoc?.value || null,
      }
    } catch (error) {
      console.error('MongoDB error, falling back to Redis:', error)
    }
  }

  // Fallback to Redis
  const accessToken = await kv.get(`${siteConfig.kvPrefix}access_token`)
  const refreshToken = await kv.get(`${siteConfig.kvPrefix}refresh_token`)

  return {
    accessToken,
    refreshToken,
  }
}

export async function storeOdAuthTokens({
  accessToken,
  accessTokenExpiry,
  refreshToken,
}: {
  accessToken: string
  accessTokenExpiry: number
  refreshToken: string
}): Promise<void> {
  // Try MongoDB first if configured
  if (shouldUseMongoDB()) {
    try {
      const db = await getMongoConnection()
      const collection = db.collection('auth_tokens')

      const expiresAt = new Date(Date.now() + accessTokenExpiry * 1000)

      // Store access token with expiry
      await collection.replaceOne(
        { key: `${siteConfig.kvPrefix}access_token` },
        {
          key: `${siteConfig.kvPrefix}access_token`,
          value: accessToken,
          expiresAt,
          createdAt: new Date(),
        },
        { upsert: true }
      )

      // Store refresh token (no expiry)
      await collection.replaceOne(
        { key: `${siteConfig.kvPrefix}refresh_token` },
        {
          key: `${siteConfig.kvPrefix}refresh_token`,
          value: refreshToken,
          createdAt: new Date(),
        },
        { upsert: true }
      )

      // Create TTL index for automatic cleanup of expired tokens
      await collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
      return
    } catch (error) {
      console.error('MongoDB error, falling back to Redis:', error)
    }
  }

  // Fallback to Redis
  await kv.set(`${siteConfig.kvPrefix}access_token`, accessToken, 'EX', accessTokenExpiry)
  await kv.set(`${siteConfig.kvPrefix}refresh_token`, refreshToken)
}
