import axios from 'axios'
import type { NextApiRequest, NextApiResponse } from 'next'

import { encodePath, getAccessToken } from '.'
import apiConfig from '../../../config/api.config'
import siteConfig from '../../../config/site.config'

/**
 * Sanitize the search query
 *
 * @param query User search query, which may contain special characters
 * @returns Sanitised query string, which:
 * - encodes the '<' and '>' characters,
 * - replaces '?' and '/' characters with ' ',
 * - replaces ''' with ''''
 * Reference: https://stackoverflow.com/questions/41491222/single-quote-escaping-in-microsoft-graph.
 */
function sanitiseQuery(query: string): string {
  const sanitisedQuery = query
    .trim()
    .replace(/'/g, "''")
    .replace('<', ' &lt; ')
    .replace('>', ' &gt; ')
    .replace('?', ' ')
    .replace('/', ' ')
  return encodeURIComponent(sanitisedQuery)
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Set edge function caching for faster load times, check docs:
  // https://vercel.com/docs/concepts/functions/edge-caching
  res.setHeader('Cache-Control', apiConfig.cacheControlHeader)

  // Query parameter from request
  const { q: searchQuery = '' } = req.query

  if (typeof searchQuery !== 'string') {
    res.status(400).json({ error: 'Invalid search query' })
    return
  }

  if (searchQuery.trim() === '') {
    res.status(200).json([])
    return
  }

  try {
    // Get access token from storage
    const accessToken = await getAccessToken()

    // Return error 403 if access_token is empty
    if (!accessToken) {
      res.status(403).json({ 
        error: 'No access token. Please go to /tokenrestore to re-authenticate.',
        tokenExpired: true 
      })
      return
    }

    // Construct Microsoft Graph Search API URL, and perform search only under the base directory
    const searchRootPath = encodePath('/')
    const encodedPath = searchRootPath === '' ? searchRootPath : searchRootPath + ':'

    // Use simple, safe search query
    const searchApi = `${apiConfig.driveApi}/root${encodedPath}/search(q='${sanitiseQuery(searchQuery)}')`
    
    const { data } = await axios.get(searchApi, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: {
        select: 'id,name,file,folder,parentReference',
        top: siteConfig.maxItems,
      },
    })
    
    // Server-side filtering for better partial matches
    let results = data.value || []
    const queryLower = searchQuery.toLowerCase().trim()
    
    // If no results found with exact search, try to find partial matches
    if (results.length === 0) {
      // Get all files first, then filter (for small directories)
      try {
        const { data: allData } = await axios.get(`${apiConfig.driveApi}/root${encodedPath}/children`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          params: {
            select: 'id,name,file,folder,parentReference',
            top: 200, // Limit to prevent timeout
          },
        })
        
        // Filter results that contain the search term (case insensitive)
        results = (allData.value || []).filter((item: any) => 
          item.name.toLowerCase().includes(queryLower)
        )
      } catch (fallbackError) {
        console.log('Fallback search failed:', fallbackError)
      }
    }
    
    res.status(200).json(results)
  } catch (error: any) {
    console.error('Search API error:', error?.response?.data || error.message)
    
    // Handle specific error cases
    if (error?.response?.status === 401) {
      res.status(401).json({ 
        error: 'Access token expired. Please go to /tokenrestore to re-authenticate.',
        tokenExpired: true 
      })
    } else {
      res.status(error?.response?.status ?? 500).json({ 
        error: error?.response?.data?.error?.message || error?.response?.data || 'Internal server error.',
        tokenExpired: false 
      })
    }
  }
}
