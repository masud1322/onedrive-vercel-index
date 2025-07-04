import Redis from 'ioredis'
import siteConfig from '../../config/site.config'

// Persistent key-value store is provided by Redis, hosted on Upstash
// https://vercel.com/integrations/upstash
let kv: Redis | null = null

// Initialize Redis connection with proper error handling
try {
  if (process.env.REDIS_URL) {
    kv = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
    })
    
    // Handle connection errors
    kv.on('error', (error) => {
      console.log('Redis connection error:', error.message)
    })
  }
} catch (error) {
  console.log('Failed to initialize Redis:', error)
  kv = null
}

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

// Check if we should use MongoDB (when MONGODB_URL is set or Redis fails)
const shouldUseMongoDB = () => {
  return (process.env.MONGODB_URL || process.env.MONGODB_URI) && (!process.env.REDIS_URL || !kv)
}

export async function getOdAuthTokens(): Promise<{ accessToken: unknown; refreshToken: unknown }> {
  // Try MongoDB first if configured or Redis is not available
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
      console.error('MongoDB error:', error)
    }
  }

  // Try Redis if available
  if (kv) {
    try {
      const accessToken = await kv.get(`${siteConfig.kvPrefix}access_token`)
      const refreshToken = await kv.get(`${siteConfig.kvPrefix}refresh_token`)

      return {
        accessToken,
        refreshToken,
      }
    } catch (error) {
      console.error('Redis error:', error)
    }
  }

  // Return empty tokens if both fail
  return {
    accessToken: null,
    refreshToken: null,
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
  let mongoSuccess = false
  let redisSuccess = false

  // Try MongoDB first if configured or Redis is not available
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
      mongoSuccess = true
      console.log('Tokens stored in MongoDB successfully')
    } catch (error) {
      console.error('MongoDB error:', error)
    }
  }

  // Try Redis if available and MongoDB didn't succeed
  if (kv && !mongoSuccess) {
    try {
      await kv.set(`${siteConfig.kvPrefix}access_token`, accessToken, 'EX', accessTokenExpiry)
      await kv.set(`${siteConfig.kvPrefix}refresh_token`, refreshToken)
      redisSuccess = true
      console.log('Tokens stored in Redis successfully')
    } catch (error) {
      console.error('Redis error:', error)
    }
  }

  if (!mongoSuccess && !redisSuccess) {
    throw new Error('Failed to store tokens in both MongoDB and Redis')
  }
}
